# Agent Shopping Readiness Scorecard

**FOR CLAUDE REVIEW — 11 November 2026 — Gate 6 pending the revised critical-only evaluation; not passed.**

Store: Karachi Kicks SupportOps Lab. Synthetic catalogue on a real Shopify development store; no production client, orders, payments or customer-data handling.

| Evidence | Result |
|---|---|
| Seeded catalogue | 318 products / 3,266 variants; 300 eligible products / 3,248 eligible variants |
| Collections and discounts | 15 collections and four discounts verified |
| Idempotent seed rerun | 318 skipped unchanged; zero Shopify Admin mutation requests |
| Original catalogue | All 18 products / 27 variants unchanged |
| Teardown preview | 318 owned products selected; 18 originals refused; zero deletions |
| Deterministic code tests | 176/176 passed on 11 November; prior Windows simulation focused checks 34/34 passed |
| Runtime readiness | Local 11/11 baseline + 8/8 inspection; Windows 10/10 passed |
| Live read-only commerce | 3/3 catalogue/search/lookup smoke checks passed |
| Runtime least privilege | Only `read_products` and `read_publications`; customer/order access denied |
| Browser cart smoke | p001 Black/10, quantity 1, USD 79: create/get/cancel/absence passed |
| First load attempt, 10 November | **Failed: 1/20 passed**; 19 search business-postcondition failures; no HTTP/tool errors or throttles |
| Load recovery, 11 November | All 20 old carts confirmed absent; 25/25 diagnostic searches passed |
| Load retest | Stopped after 76/80 requests: all 20 search/create/cancel acknowledgements passed; 14 cart absences verified, six pending |
| Retest outcome | 14 full sessions passed, two failed verification reads, four incomplete; upstream HTTP 429 / `RATE_LIMITED` |
| Recovery after cooldown | First of six absence reads returned HTTP 429 at 13:00:51.304 UTC; other five NOT_RUN; all six absences remain unconfirmed |
| Latest provider cooldown | Recorded 3550s; owner now forbids store requests before 19:15 PKT on 11 November |
| Revised selected evaluation | **0/12 attempted**; S05/S19/S20/S21 ×3 only; other 63 out of scope |
| Safety-critical S05/S19/S20/S21 | Not run live; earliest start19:15 PKT, five iterations, ten-second pacing |
| Model spend | USD 0.0000141 transport smoke; funded stop USD 1.90; owner ceiling USD 10 |
| Candidate source deployment | None; only the authorized Cloudflare credential change |

The earlier load failure remains part of the evidence. Its historical cause is unproven; a later pass must not erase it. No functional search fix or production-reliability claim is made from the successful diagnostics.

Revised owner scope: run only S05, S19, S20 and S21, three repetitions each (12 attempts), no earlier than 19:15 PKT on 11 November. Use five iterations and ten-second shared pacing; stop at the first 429. Do not run the other 63 attempts or another load test.

The six old cart absence checks are removed as a prerequisite. Record: **cancellation acknowledged, absence unconfirmed; carts expire**. No expiry or absence is claimed as independently verified. Do not read or cancel those six carts again for this run.

All 176 offline code tests passed, including the restricted launch policy. Mechanical success remains PENDING_REVIEW until human acceptance. The critical subset cannot establish full 75-case acceptance. No merge, production deployment, authentication change, order or payment is authorized. PR #1 remains open.

UCP merchant requests currently use anonymous access; the isolated Shopify Admin credential is a separate authentication path. The three-second evaluator spacing is a precaution, not a merchant-quota guarantee.

The live load finding is **anonymous UCP throttled during the 20-overlapping-session test**. HTTP requests were serialized, not 20 simultaneous network calls. This remains an unresolved production risk; a further load pass is not a criterion to rerun under the revised scope. Authenticated agent access is required before production and has not been configured or proven.

[Final read-only recovery evidence](sdd/evidence/load-six-absence-after-cooldown-2026-11-11.json): one read, zero mutations and zero model calls. Source checkpoint `3538249ea82e0726086be8c247df76b8ebc0ab34`. No new authentication configuration was applied.
