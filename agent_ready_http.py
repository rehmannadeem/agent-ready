"""Public-only HTTP transport and shared per-host request pacing (stdlib only)."""
import http.client
import ipaddress
import math
import re
import socket
import threading
import time
import urllib.request
from contextlib import contextmanager
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import urlsplit

MAX_BACKOFF = 30.0
MAX_BODY = 5 * 1024 * 1024


def public_url(url):
    """Validate an HTTP(S) URL before any connection, including redirects."""
    if not isinstance(url, str) or re.search(r"[\s\\\x00-\x1f\x7f]", url):
        raise ValueError("Expected an HTTP(S) URL without whitespace or backslashes")
    parsed = urlsplit(url)
    if parsed.scheme not in ("https", "http") or not parsed.hostname:
        raise ValueError("Only public HTTP(S) endpoints are allowed")
    if parsed.username is not None or parsed.password is not None or parsed.fragment:
        raise ValueError("Credentials and fragments are not allowed in audit URLs")
    if parsed.port not in (None, 80, 443):
        raise ValueError("Only public HTTP ports 80 and 443 are allowed")
    host = parsed.hostname.rstrip(".").encode("idna").decode("ascii").lower()
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        if ("." not in host or host.endswith((".localhost", ".local", ".internal", ".home.arpa"))
                or len(host) > 253 or any(not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", p)
                                         for p in host.split("."))):
            raise ValueError("Expected a public domain name") from None
    else:
        if not address.is_global or address.is_multicast:
            raise ValueError("Private, local and reserved IP addresses are not allowed")
    return parsed, host


def normalize_store(store):
    value = store.strip()
    if "://" not in value:
        value = "https://" + value
    parsed, host = public_url(value)
    if parsed.path not in ("", "/") or parsed.query:
        raise ValueError("Use a domain or root URL, without a path or query")
    host = f"[{host}]" if ":" in host else host
    default_port = 443 if parsed.scheme == "https" else 80
    port = f":{parsed.port}" if parsed.port and parsed.port != default_port else ""
    return f"{parsed.scheme}://{host}{port}"


def public_connection(address, timeout=socket._GLOBAL_DEFAULT_TIMEOUT, source_address=None):
    """Resolve once, reject any nonpublic answer, and connect to that exact IP.

    The HTTPS connection still uses the original hostname for SNI/certificate
    validation. No second hostname lookup is allowed between validation/connect.
    """
    host, port = address
    answers = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    if not answers:
        raise OSError("No public address found")
    for _, _, _, _, sockaddr in answers:
        ip = ipaddress.ip_address(sockaddr[0])
        if not ip.is_global or ip.is_multicast:
            raise ValueError("Endpoint resolves to a private, local or reserved address")
    last_error = None
    for family, socktype, proto, _, sockaddr in answers:
        sock = socket.socket(family, socktype, proto)
        try:
            if timeout is not socket._GLOBAL_DEFAULT_TIMEOUT:
                sock.settimeout(timeout)
            if source_address:
                sock.bind(source_address)
            sock.connect(sockaddr)
            return sock
        except OSError as exc:
            last_error = exc
            sock.close()
    raise last_error


class PublicHTTPConnection(http.client.HTTPConnection):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._create_connection = public_connection


class PublicHTTPSConnection(http.client.HTTPSConnection):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._create_connection = public_connection


class PublicHTTPHandler(urllib.request.HTTPHandler):
    def http_open(self, req):
        return self.do_open(PublicHTTPConnection, req)


class PublicHTTPSHandler(urllib.request.HTTPSHandler):
    def https_open(self, req):
        return self.do_open(PublicHTTPSConnection, req, context=self._context)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None  # Fetcher validates, paces and records each redirect itself.


def build_opener(context):
    # Environment proxies could bypass the destination-address check.
    return urllib.request.build_opener(urllib.request.ProxyHandler({}),
                                      PublicHTTPHandler(), PublicHTTPSHandler(context=context),
                                      NoRedirect())


def retry_delay(headers, attempt, now=None):
    value = next((str(v).strip() for k, v in headers.items() if k.lower() == "retry-after"), "")
    fallback = min(2.0 * 2 ** attempt, MAX_BACKOFF)
    if value.isdigit():
        try:
            delay = float(value)
        except (ValueError, OverflowError):
            return float("inf")  # Decline retries rather than shorten a huge server wait.
        return max(fallback, delay)
    try:
        target = parsedate_to_datetime(value)
        if target.tzinfo is None:
            target = target.replace(tzinfo=timezone.utc)
        delay = (target - (now or datetime.now(timezone.utc))).total_seconds()
        return max(fallback, delay) if math.isfinite(delay) else fallback
    except (ValueError, TypeError, OverflowError):
        return fallback


class HostPacer:
    """One in-flight request per hostname, shared by all batch workers."""
    def __init__(self, delay=1.0, clock=time.monotonic, sleep=time.sleep):
        self.delay, self.clock, self.sleep = delay, clock, sleep
        self._guard = threading.Lock()
        self._locks, self._ready, self._cooldown = {}, {}, {}

    @contextmanager
    def slot(self, host):
        with self._guard:
            lock = self._locks.setdefault(host, threading.Lock())
        with lock:
            wait = max(self._ready.get(host, 0), self._cooldown.get(host, 0)) - self.clock()
            if wait > MAX_BACKOFF:
                yield False  # Do not retry sooner than a long Retry-After requests.
                return
            if wait > 0:
                self.sleep(wait)
            try:
                yield True
            finally:
                self._ready[host] = self.clock() + self.delay

    def backoff(self, host, delay):
        # Called while holding this host's slot, including on the final 429.
        self._cooldown[host] = max(self._cooldown.get(host, 0), self.clock() + delay)
