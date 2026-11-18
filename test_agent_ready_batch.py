"""Offline batch, escaping, scoring and exact CLI regression tests."""
import csv
import io
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from html.parser import HTMLParser
from pathlib import Path
from unittest.mock import Mock, patch

import agent_ready as ar
import agent_ready_batch as batch
from test_agent_ready import perfect

ROOT = Path(__file__).resolve().parent


def complete(store="https://shop.example.com"):
    result = perfect()
    result.update(store=store, tool=f"agent-ready-audit {ar.VERSION}",
                  audited_at="2026-11-15 10:00 UTC", requests=[])
    result["score"], result["grade"], result["findings"] = ar.score_and_findings(result)
    return result


class Domains(unittest.TestCase):
    def test_comments_bom_case_and_duplicates(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "domains.txt"
            path.write_text('\ufeff# A comment\n\nExample.com\nhttps://EXAMPLE.COM/\nhttp://example.com\nshop.example.com\n', encoding="utf-8")
            self.assertEqual(batch.load_domains(path), ["https://example.com", "https://shop.example.com"])

    def test_fifty_accepted_fifty_one_rejected_before_work(self):
        stores = [f"shop{i}.example.com" for i in range(50)]
        self.assertEqual(len(batch.validate_domains(stores)), 50)
        audit = Mock()
        with self.assertRaises(ValueError):
            batch.run_batch(stores + ["extra.example.com"], audit)
        audit.assert_not_called()

    def test_empty_and_invalid_inputs(self):
        for stores in ([], ["localhost"], ["127.0.0.1"], ["file:///etc/passwd"],
                       ["https://u:p@example.com"], ["example.com/products/x"],
                       ["https://example.com?q=secret"], ["example.com:8080"]):
            with self.subTest(stores=stores), self.assertRaises(ValueError):
                batch.validate_domains(stores)

    def test_invalid_line_number(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "domains.txt"
            path.write_text("# list\nvalid.example.com\nlocalhost\n", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "Line 3"):
                batch.load_domains(path)


class Runner(unittest.TestCase):
    def test_concurrency_order_shared_pacer_and_exception_isolation(self):
        barrier = threading.Barrier(3)
        lock = threading.Lock()
        pacers, active, peak = [], 0, 0

        def audit(store, pacer):
            nonlocal active, peak
            with lock:
                pacers.append(pacer)
                active += 1
                peak = max(peak, active)
            barrier.wait(timeout=5)
            # Deliberately finish the last item first.
            time.sleep({"a": .03, "b": .01, "c": 0}[store.split("//")[1][0]])
            with lock:
                active -= 1
            if "b.example" in store:
                raise RuntimeError("response containing a secret must not enter the report")
            return complete(store)

        rows = batch.run_batch(["a.example.com", "b.example.com", "c.example.com"], audit, 3)
        self.assertEqual([r["store"] for r in rows], [f"https://{x}.example.com" for x in "abc"])
        self.assertEqual(peak, 3)
        self.assertEqual(len({id(p) for p in pacers}), 1)
        self.assertNotIn("score", rows[1])
        self.assertNotIn("secret", rows[1]["error"])

    def test_concurrency_validation(self):
        for workers in (0, 6, True, 2.5):
            with self.subTest(workers=workers), self.assertRaises(ValueError):
                batch.run_batch(["example.com"], Mock(), workers)


class NeutralScoring(unittest.TestCase):
    def test_mcp_unavailable_not_penalized(self):
        for status in (0, 401, 403, 429, 500, 503):
            with self.subTest(status=status):
                result = complete()
                fetch = Mock()
                fetch.request.return_value = (status, {}, "", "https://example.com/mcp")
                result["mcp"] = ar.check_mcp(fetch, "https://example.com/mcp")
                score, grade, findings = ar.score_and_findings(result)
                self.assertEqual((score, grade, result["coverage"]), (100, "A", 85))
                self.assertTrue(all(f["severity"] == "INFO" for f in findings))

    def test_tools_list_blocked_preserves_initialize_credit(self):
        fetch = Mock()
        fetch.request.side_effect = [(200, {}, '{"result":{}}', ""), (429, {}, "", "")]
        result = complete()
        result["mcp"] = ar.check_mcp(fetch, "https://example.com/mcp")
        self.assertEqual(ar.score_and_findings(result)[0], 100)
        self.assertEqual(result["coverage"], 95)
        self.assertEqual(batch.summary_row(result)["mcp_tools"], "Not checked")

    def test_mcp_missing_is_observed_failure(self):
        fetch = Mock()
        fetch.request.return_value = (404, {}, "", "")
        result = complete()
        result["mcp"] = ar.check_mcp(fetch, "https://example.com/mcp")
        self.assertEqual(ar.score_and_findings(result)[0], 85)
        self.assertEqual(result["coverage"], 100)

    def test_robots_blocked_excluded_but_missing_means_no_rules(self):
        for status, coverage in ((0, 90), (403, 90), (429, 90), (503, 90), (404, 100), (410, 100)):
            with self.subTest(status=status):
                result = complete()
                result["robots"]["status"] = status
                self.assertEqual(ar.score_and_findings(result)[0], 100)
                self.assertEqual(result["coverage"], coverage)

    def test_all_optional_checks_unreadable_remain_neutral(self):
        result = complete()
        result["mcp"] = {"live": False, "tools": [], "inconclusive": True}
        result["robots"]["status"] = 503
        result["policies"].update({k: None for k in ar.POLICY_PATHS})
        result["product"]["inconclusive"] = True
        result["score"], result["grade"], result["findings"] = ar.score_and_findings(result)
        self.assertEqual((result["score"], result["coverage"]), (100, 45))
        row = batch.summary_row(result)
        self.assertTrue(all(row[k] == "Not checked" for k in ("mcp", "robots", "product_data", "refund_policy")))
        self.assertEqual(row["high_issues"], 0)

    def test_unreadable_homepage_or_manifest_never_graded(self):
        for replies in ([(403, {}, "", "")], [(200, {}, "", ""), (429, {}, "", "")]):
            with self.subTest(replies=replies), patch.object(ar, "Fetcher") as factory:
                factory.return_value.request.side_effect = replies
                factory.return_value.log = []
                result = ar.audit("example.com")
                self.assertIn("error", result)
                self.assertNotIn("score", result)

    def test_malformed_manifest_does_not_crash(self):
        for body in ('{"ucp":null}', '{"ucp":[]}', '{"ucp":{"services":[]}}'):
            with self.subTest(body=body):
                fetch = Mock()
                fetch.request.return_value = (200, {}, body, "")
                self.assertFalse(ar.check_ucp(fetch, "https://example.com")["present"])

    def test_unfound_product_is_labeled_not_checked_in_markdown(self):
        result = complete()
        result["product"]["product_url"] = None
        result["score"], result["grade"], result["findings"] = ar.score_and_findings(result)
        self.assertIn("Product structured data (JSON-LD) | Not checked", ar.render_markdown(result))


class Exports(unittest.TestCase):
    def test_incomplete_is_blank_not_zero_or_f(self):
        result = {"store": "https://blocked.example.com", "error": "HTTP 429", "requests": []}
        row = next(csv.DictReader(io.StringIO(batch.render_csv([result]))))
        self.assertEqual((row["score"], row["grade"], row["coverage_pct"], row["high_issues"]), ("", "", "", ""))
        self.assertEqual(row["status"], "Not checked")
        self.assertIn("HTTP 429", batch.render_html([result]))

    def test_csv_roundtrip_commas_quotes_newlines_and_formula_guard(self):
        result = complete()
        result["mcp"]["tools"] = ['=HYPERLINK("evil")']
        result["findings"] = [{"severity": "LOW", "area": "Policy", "finding": 'Comma, "quote"\nnew line', "fix": "Read it"}]
        row = next(csv.DictReader(io.StringIO(batch.render_csv([result]))))
        self.assertTrue(row["mcp_tools"].startswith("'="))
        self.assertIn('Comma, "quote"\nnew line', row["findings"])
        for text in ("=1+1", " +1", "\t@SUM(1)", "-1", "\r=1"):
            self.assertTrue(batch.csv_cell(text).startswith("'"))
        self.assertEqual(batch.csv_cell(100), 100)

    def test_html_escapes_all_remote_text_and_has_no_external_assets(self):
        result = complete()
        payload = '<script src="https://evil.example/x">alert(1)</script>'
        result["mcp"]["tools"] = [payload]
        result["findings"] = [{"severity": "INFO", "area": payload, "finding": payload, "fix": payload}]
        result["requests"] = [{"method": "GET", "url": payload, "status": 200}]
        html = batch.render_html([result])
        self.assertNotIn("<script", html)
        self.assertIn("&lt;script", html)
        self.assertIn("Content-Security-Policy", html)
        class Assets(HTMLParser):
            def handle_starttag(self, tag, attrs):
                self.assert_no_asset(tag, attrs)
        parser = Assets()
        parser.assert_no_asset = lambda tag, attrs: self.assertFalse(
            tag in ("script", "link", "img", "iframe") or any(k == "src" for k, _ in attrs))
        parser.feed(html)

    def test_exactly_two_outputs_and_repeat_overwrite(self):
        with tempfile.TemporaryDirectory() as folder:
            paths = batch.write_reports([complete()], Path(folder))
            self.assertEqual({p.name for p in paths}, {"batch-audit.csv", "batch-audit.html"})
            batch.write_reports([complete("https://second.example.com")], Path(folder))
            self.assertEqual(len(list(Path(folder).iterdir())), 2)
            self.assertIn("second.example.com", paths[0].read_text(encoding="utf-8"))


class CLI(unittest.TestCase):
    def test_invalid_arguments_do_not_start_audit(self):
        with patch.object(ar, "audit") as audit, patch("sys.stderr", new_callable=io.StringIO):
            for args in ([], ["--batch", "x", "example.com"], ["--batch", "missing-file.txt"],
                         ["--batch", "x", "--concurrency", "6"]):
                with self.subTest(args=args), self.assertRaises(SystemExit) as exc:
                    ar.main(args)
                self.assertEqual(exc.exception.code, 2)
            audit.assert_not_called()

    def test_exact_batch_command_offline_50_domains(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for name in ("agent_ready.py", "agent_ready_batch.py", "agent_ready_http.py"):
                shutil.copy(ROOT / name, root / name)
            shutil.copy(ROOT / "tests/fixtures/offline_sitecustomize.py", root / "sitecustomize.py")
            names = ["blocked.example.com", "partial.example.com"] + [f"shop{i}.example.com" for i in range(48)]
            (root / "domains.txt").write_text("\n".join(names), encoding="utf-8")
            env = dict(os.environ, PYTHONPATH=str(root), PYTHONIOENCODING="utf-8")
            run = subprocess.run([sys.executable, "agent_ready.py", "--batch", "domains.txt"], cwd=root,
                                 env=env, text=True, capture_output=True, timeout=30)
            self.assertEqual(run.returncode, 0, run.stderr)
            self.assertIn("Graded: 49; not checked: 1", run.stdout)
            with (root / "reports/batch-audit.csv").open(encoding="utf-8", newline="") as stream:
                rows = list(csv.DictReader(stream))
            self.assertEqual(len(rows), 50)
            self.assertEqual((rows[0]["score"], rows[0]["status"]), ("", "Not checked"))
            self.assertEqual((rows[1]["score"], rows[1]["coverage_pct"]), ("100", "90"))
            self.assertTrue(all(r["score"] == "100" and r["coverage_pct"] == "100" for r in rows[2:]))
            self.assertEqual(len(list((root / "reports").iterdir())), 2)
            self.assertIn("shop47.example.com", (root / "reports/batch-audit.html").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
