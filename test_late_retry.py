"""Late cooldown retry: unread policy/robots checks get one patient second attempt."""
import unittest

import agent_ready as ar
import agent_ready_http as http


class FakeFetcher:
    """Answers from a script of statuses per path; records the max_wait used."""
    def __init__(self, first, second):
        self.first, self.second, self.calls, self.max_wait = first, second, [], None

    def request(self, url, **_):
        path = url.split(".test", 1)[1]
        table = self.first if self.max_wait is None else self.second
        self.calls.append((path, self.max_wait))
        status = table.get(path, 404)
        body = '<div class="shopify-policy__body">' + "x " * 200 + "</div></div>"
        return status, {}, body if status == 200 else "", url


class LateRetry(unittest.TestCase):
    base = "https://shop.test"

    def run_checks(self, f):
        r = {"policies": ar.check_policies(f, self.base), "robots": ar.check_robots(f, self.base)}
        ar.retry_after_cooldown(f, r, self.base)
        return r

    def test_cooldown_skipped_checks_are_retried_once_with_patience(self):
        first = {p: 429 for p in ar.POLICY_PATHS.values()}
        first["/policies/privacy-policy"] = 200
        first["/robots.txt"] = 429
        second = {p: 200 for p in ar.POLICY_PATHS.values()}
        second["/robots.txt"] = 200
        f = FakeFetcher(first, second)
        r = self.run_checks(f)
        self.assertTrue(all(r["policies"][k] for k in ar.POLICY_PATHS))
        self.assertEqual(r["robots"]["status"], 200)
        late = [p for p, wait in f.calls if wait == ar.LATE_RETRY_WAIT]
        # Only the three unread policies and robots are fetched again; privacy is not.
        self.assertEqual(sorted(late), sorted(["/policies/refund-policy", "/policies/shipping-policy",
                                               "/policies/terms-of-service", "/robots.txt"]))
        self.assertIsNone(f.max_wait)  # patience is reset after the retry pass

    def test_still_unreadable_stays_not_checked_never_failed(self):
        first = {p: 429 for p in ar.POLICY_PATHS.values()}
        f = FakeFetcher(first, dict(first))
        r = self.run_checks(f)
        self.assertTrue(all(r["policies"][k] is None for k in ar.POLICY_PATHS))

    def test_no_retry_when_everything_was_read(self):
        ok = {p: 200 for p in ar.POLICY_PATHS.values()}
        ok["/robots.txt"] = 200
        f = FakeFetcher(ok, ok)
        self.run_checks(f)
        self.assertFalse(any(wait for _, wait in f.calls))


class PacerPatience(unittest.TestCase):
    def test_slot_waits_longer_only_when_asked(self):
        now = [0.0]
        slept = []
        pacer = http.HostPacer(delay=0, clock=lambda: now[0], sleep=slept.append)
        pacer.backoff("h", 90)
        with pacer.slot("h") as allowed:
            self.assertFalse(allowed)            # default: 90 s > 30 s, skip
        with pacer.slot("h", max_wait=120) as allowed:
            self.assertTrue(allowed)             # late retry: waits the 90 s out
        self.assertEqual(slept, [90])


if __name__ == "__main__":
    unittest.main()
