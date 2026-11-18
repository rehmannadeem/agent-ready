"""Offline transport tests: retry timing, concurrency, redirects and public IP pinning."""
import io
import json
import socket
import threading
import time
import unittest
import urllib.error
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from unittest.mock import Mock, patch

import agent_ready as ar
import agent_ready_http as http


class Clock:
    def __init__(self):
        self.now = 100.0
        self.sleeps = []

    def time(self):
        return self.now

    def sleep(self, seconds):
        self.sleeps.append(seconds)
        self.now += seconds


class Response(io.BytesIO):
    def __init__(self, code=200, text="ok", headers=None):
        super().__init__(text.encode())
        self.code, self.headers = code, headers or {}


class Transport(unittest.TestCase):
    def setUp(self):
        self.clock = Clock()
        self.pacer = http.HostPacer(clock=self.clock.time, sleep=self.clock.sleep)
        self.fetch = ar.Fetcher(pacer=self.pacer)
        self.fetch.opener = Mock()

    def test_429_retry_after_and_all_attempts_logged(self):
        self.fetch.opener.open.side_effect = [Response(429, headers={"retry-after": "7"}), Response()]
        self.assertEqual(self.fetch.request("https://example.com")[0], 200)
        self.assertEqual(self.clock.sleeps, [7])
        self.assertEqual([r["status"] for r in self.fetch.log], [429, 200])

    def test_bounded_exponential_backoff_and_final_cooldown(self):
        self.fetch.opener.open.side_effect = [Response(429), Response(429), Response(429), Response()]
        self.assertEqual(self.fetch.request("https://example.com")[0], 429)
        self.assertEqual(self.clock.sleeps, [2, 4])
        self.fetch.request("https://example.com/next")
        self.assertEqual(self.clock.sleeps, [2, 4, 8])

    def test_long_retry_after_skips_later_requests_to_host(self):
        self.fetch.opener.open.return_value = Response(429, headers={"Retry-After": "3600"})
        self.assertEqual(self.fetch.request("https://example.com")[0], 429)
        self.assertEqual(self.fetch.request("https://example.com/policy")[0], 429)
        self.fetch.opener.open.assert_called_once()
        self.assertEqual(self.clock.sleeps, [])
        self.assertIn("skipped", self.fetch.log[-1])

    def test_shared_host_delay_does_not_delay_different_host(self):
        other = ar.Fetcher(pacer=self.pacer)
        other.opener = Mock()
        self.fetch.opener.open.side_effect = [Response(), Response()]
        other.opener.open.side_effect = [Response(), Response()]
        self.fetch.request("https://example.com/a")
        other.request("https://other.example.com")
        self.assertEqual(self.clock.sleeps, [])
        other.request("https://example.com/b")
        self.assertEqual(self.clock.sleeps, [1])

    def test_shared_429_cooldown_applies_to_other_worker(self):
        other = ar.Fetcher(pacer=self.pacer)
        other.opener = Mock()
        self.fetch.opener.open.return_value = Response(429, headers={"Retry-After": "10"})
        other.opener.open.return_value = Response()
        self.fetch.request("https://example.com/a", retries=0)
        other.request("https://example.com/b")
        self.assertEqual(self.clock.sleeps, [10])

    def test_http_error_is_closed_and_retried(self):
        body = io.BytesIO(b"limited")
        error = urllib.error.HTTPError("https://example.com", 429, "limited", {"Retry-After": "3"}, body)
        self.fetch.opener.open.side_effect = [error, Response()]
        self.assertEqual(self.fetch.request("https://example.com")[0], 200)
        self.assertTrue(body.closed)
        self.assertEqual(self.clock.sleeps, [3])

    def test_redirect_is_paced_validated_and_logged(self):
        self.fetch.opener.open.side_effect = [Response(302, headers={"Location": "/new"}), Response()]
        result = self.fetch.request("https://example.com/old")
        self.assertEqual(result[3], "https://example.com/new")
        self.assertEqual(self.clock.sleeps, [1])
        self.assertEqual(len(self.fetch.log), 2)

    def test_redirect_to_private_or_downgrade_is_not_followed(self):
        for target in ("http://example.com/plain", "https://127.0.0.1/", "file:///etc/passwd"):
            with self.subTest(target=target):
                self.fetch.opener.open.reset_mock()
                self.fetch.opener.open.return_value = Response(302, headers={"Location": target})
                self.assertEqual(self.fetch.request("https://example.com")[0], 0)
                self.fetch.opener.open.assert_called_once()

    def test_cross_origin_mcp_redirect_does_not_leak_session(self):
        self.fetch.opener.open.return_value = Response(307, headers={"Location": "https://other.example.com/mcp"})
        self.assertEqual(self.fetch.request("https://example.com/mcp", "POST", "{}", {"Mcp-Session-Id": "secret"})[0], 0)
        self.fetch.opener.open.assert_called_once()
        self.assertNotIn("secret", json.dumps(self.fetch.log))

    def test_redirect_loop_is_bounded(self):
        self.fetch.opener.open.side_effect = lambda *a, **kw: Response(302, headers={"Location": "/again"})
        self.assertEqual(self.fetch.request("https://example.com")[0], 302)
        self.assertEqual(self.fetch.opener.open.call_count, 6)

    def test_private_url_and_oversize_response_are_not_checked(self):
        self.assertEqual(self.fetch.request("https://192.168.1.10")[0], 0)
        self.fetch.opener.open.assert_not_called()
        self.fetch.opener.open.return_value = Response(text="x" * (http.MAX_BODY + 1))
        self.assertEqual(self.fetch.request("https://example.com")[0], 0)

    def test_request_timeout_and_tls_errors_are_ungraded_transport_results(self):
        self.fetch.opener.open.side_effect = TimeoutError("test timeout")
        self.assertEqual(self.fetch.request("https://example.com")[0], 0)
        self.assertIn("TimeoutError", self.fetch.log[-1]["error"])


class HostConcurrency(unittest.TestCase):
    def test_same_host_serialized_while_different_hosts_overlap(self):
        pacer = http.HostPacer(delay=0)
        barrier = threading.Barrier(2)
        lock = threading.Lock()
        active = {}
        peaks = {}
        total_peak = 0

        def visit(host, rendezvous=False):
            nonlocal total_peak
            with pacer.slot(host) as allowed:
                self.assertTrue(allowed)
                with lock:
                    active[host] = active.get(host, 0) + 1
                    peaks[host] = max(peaks.get(host, 0), active[host])
                    total_peak = max(total_peak, sum(active.values()))
                if rendezvous:
                    barrier.wait(timeout=5)
                time.sleep(.01)
                with lock:
                    active[host] -= 1

        with ThreadPoolExecutor(max_workers=4) as executor:
            futures = [executor.submit(visit, "a", True), executor.submit(visit, "b", True),
                       executor.submit(visit, "a"), executor.submit(visit, "a")]
            for future in futures:
                future.result(timeout=5)
        self.assertEqual(peaks["a"], 1)
        self.assertEqual(total_peak, 2)


class PublicEndpoints(unittest.TestCase):
    def test_unsafe_urls_rejected(self):
        for url in ("ftp://example.com", "https://10.0.0.1", "http://[::1]", "http://169.254.169.254",
                    "https://localhost", "https://service.local", "https://example.com:8080",
                    "https://user:pass@example.com", "https://example.com\\@127.0.0.1", "https://example.com\n"):
            with self.subTest(url=url), self.assertRaises(ValueError):
                http.public_url(url)

    def test_normalize_idna_and_canonical_root(self):
        self.assertEqual(http.normalize_store("HTTPS://EXAMPLE.COM.:443/"), "https://example.com")
        self.assertEqual(http.normalize_store("bücher.example"), "https://xn--bcher-kva.example")

    def test_private_dns_or_mixed_answers_never_connect(self):
        public = (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))
        private = (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 443))
        with patch.object(socket, "getaddrinfo", return_value=[public, private]), patch.object(socket, "socket") as sock:
            with self.assertRaises(ValueError):
                http.public_connection(("example.com", 443), 20)
            sock.assert_not_called()

    def test_connection_is_pinned_to_validated_ip(self):
        answer = (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))
        with patch.object(socket, "getaddrinfo", return_value=[answer]) as dns, patch.object(socket, "socket") as factory:
            result = http.public_connection(("example.com", 443), 20)
            self.assertIs(result, factory.return_value)
            dns.assert_called_once()
            result.connect.assert_called_once_with(("93.184.216.34", 443))
            result.settimeout.assert_called_once_with(20)

    def test_both_http_connection_types_use_public_resolver(self):
        for connection in (http.PublicHTTPConnection("example.com"), http.PublicHTTPSConnection("example.com")):
            self.assertIs(connection._create_connection, http.public_connection)

    def test_retry_after_seconds_date_invalid_and_huge(self):
        now = datetime(2026, 11, 15, 10, 0, tzinfo=timezone.utc)
        self.assertEqual(http.retry_delay({"Retry-After": "Sun, 15 Nov 2026 10:00:12 GMT"}, 0, now), 12)
        self.assertEqual(http.retry_delay({"retry-after": "8"}, 0), 8)
        self.assertEqual(http.retry_delay({"Retry-After": "bad"}, 1), 4)
        self.assertEqual(http.retry_delay({"Retry-After": "-3"}, 0), 2)
        self.assertGreater(http.retry_delay({"Retry-After": "9" * 400}, 0), http.MAX_BACKOFF)


if __name__ == "__main__":
    unittest.main()
