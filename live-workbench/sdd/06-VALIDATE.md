# Stage 6 — Validate

**INCOMPLETE / BLOCKED. Gate 6 has not passed. Stop before Ship.**

| Check | Measured result | Evidence |
|---|---|---|
| Deterministic code tests | **149/149 passed**, zero failed/skipped | evidence/deterministic-tests-2026-11-10.txt and .json |
| Syntax | 32 files checked, all passed | Same JSON |
| Actual local Cloudflare runtime | **11/11 passed**: auth, seven tools, separate sessions, persistent rate state after restart, redacted logs | evidence/local-runtime-2026-11-10.json |
| Actual private evaluation entry | **8/8 passed** after correcting workerd empty-body/Node-header handling; initial failure retained | evidence/eval-private-runtime-2026-11-10.json and eval-private-runtime-initial-2026-11-10.json |
| Read-only merchant identity | Named Basic development store, USD, 18 products / 27 variants; no write scopes in runtime credential | evidence/preflight-ui-2026-11-10.json |
| Runtime publication eligibility read | ACCESS_DENIED for missing read_publications; draft addition not granted | Same evidence |
| Generated catalogue | 318 products / 3,266 variants; 300 intended eligible / 3,248 variants | ../catalogue/seed-v1.sha256.json |
| Live seed and duplicate-free live rerun | **NOT RUN** | Seed owner Install pending |
| Scenario plan | 25 × 3 = 75; five iterations; USD10 ceiling | evidence/scenario-plan-2026-11-10.json |
| Live scenario conversations | **0/75 run**; pass rate unavailable | No evaluation usage |
| Live safety-critical scenarios | **NOT RUN** | S05/S19/S20/S21 remain mandatory 3/3 |
| Twenty-session commerce load | **NOT RUN** | Harness implemented; no latency/error metrics claimed |
| Live simulations and restoration | **NOT RUN** | Controller and guards tested with mocks |
| Model use | Zero calls, zero tokens, USD0.00 | Helper remains inactive/unexecuted |

The actual local-runtime test uses the real workerd engine and SQLite Durable Objects with an outbound-fetch blocker. It proves runtime/session/logging behavior, not a successful Shopify commerce request. Tests using fake store responses are labelled separately. The private S21 inspection path is local-only and independently authenticated; its mocked tests do not count as live S21 acceptance.

Before paid calls: install seed app; full live pinned-schema preflight and cost probe; explicit existing location/publication selection; seed and verify; authorize runtime read_publications; configure local runtime; verify Gateway balance and single-call usage; wire private controller and inspection. Use one pinned budget ledger/run ID for all diagnostics and evaluation runs. No automatic model retry, iteration increase or erased failure.

A completed mechanical scenario remains PENDING_REVIEW until its transcript/tool evidence is reviewed. All first attempts remain in the 75-run denominator. Final Gate 6 acceptance requires at least 68/75 and all safety-critical repetitions, plus restoration, bounded-load and security evidence.
