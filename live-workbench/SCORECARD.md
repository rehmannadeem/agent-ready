# Agent Shopping Readiness Scorecard

**FOR CLAUDE REVIEW — 11 November 2026 — Gate 6 BLOCKED by renewed provider throttling; not passed.**

Store: Karachi Kicks SupportOps Lab. Synthetic catalogue on a real Shopify development store; no production client, orders, payments or customer-data handling.

| Evidence | Result |
|---|---|
| Seeded catalogue | 318 products / 3,266 variants; 300 eligible products / 3,248 eligible variants |
| Collections and discounts | 15 collections and four discounts verified |
| Idempotent seed rerun | 318 skipped unchanged; zero Shopify Admin mutation requests |
| Original catalogue | All 18 products / 27 variants unchanged |
| Teardown preview | 318 owned products selected; 18 originals refused; zero deletions |
| Deterministic code tests | 173/173 passed on 11 November; prior Windows simulation focused checks 34/34 passed |
| Runtime readiness | Local 11/11 baseline + 8/8 inspection; Windows 10/10 passed |
| Live read-only commerce | 3/3 catalogue/search/lookup smoke checks passed |
| Runtime least privilege | Only `read_products` and `read_publications`; customer/order access denied |
| Browser cart smoke | p001 Black/10, quantity 1, USD 79: create/get/cancel/absence passed |
| First load attempt, 10 November | **Failed: 1/20 passed**; 19 search business-postcondition failures; no HTTP/tool errors or throttles |
| Load recovery, 11 November | All 20 old carts confirmed absent; 25/25 diagnostic searches passed |
| Load retest | Stopped after 76/80 requests: all 20 search/create/cancel acknowledgements passed; 14 cart absences verified, six pending |
| Retest outcome | 14 full sessions passed, two failed verification reads, four incomplete; upstream HTTP 429 / `RATE_LIMITED` |
| Recovery after cooldown | First of six absence reads returned HTTP 429 at 13:00:51.304 UTC; other five NOT_RUN; all six absences remain unconfirmed |
| Latest provider cooldown | `Retry-After: 3550` seconds; conservative next retry 19:00:06.304 PKT on 11 November; no automatic retry scheduled |
| AI scenario suite | **0/75 attempted**; pass rate unavailable |
| Safety-critical S05/S19/S20/S21 | Not run live |
| Model spend | USD 0.0000141 transport smoke; funded stop USD 1.90; owner ceiling USD 10 |
| Candidate source deployment | None; only the authorized Cloudflare credential change |

The earlier load failure remains part of the evidence. Its historical cause is unproven; a later pass must not erase it. No functional search fix or production-reliability claim is made from the successful diagnostics.

Revised owner scope: no further load run. After the recorded provider cooldown, verify absence for the six pending carts using read-only checks, then execute the 75 first attempts at five iterations. Run S05, S19, S20 and S21 with all three repetitions first (12 attempts), then the other 63 attempts. Recovery was attempted after the prior cooldown but blocked on its first read; all 75 scenario attempts remain NOT_RUN because absence confirmation is a prerequisite; verify simulation restoration and review every transcript. Shared evaluator request pacing was reduced to one request per 3,000 ms; 44 focused tests passed locally and on Windows. Full code suite: 173/173 passed after priority ordering; the earlier 172/172 result remains historical evidence. A persistent throttle stop now blocks subsequent model/tool calls and restart until operator recovery. Mechanical successes remain **PENDING_REVIEW** until human acceptance. The controlled local evaluator is distinct from the unchanged published hosted-chat workflow. Shared Armans SupportOps Connector is unchanged. PR #1 remains open and unmerged; stop at Gate 6.

UCP merchant requests currently use anonymous access; the isolated Shopify Admin credential is a separate authentication path. The three-second evaluator spacing is a precaution, not a merchant-quota guarantee.

The live load finding is **anonymous UCP throttled during the 20-overlapping-session test**. HTTP requests were serialized, not 20 simultaneous network calls. This remains an unresolved production risk; a further load pass is not a criterion to rerun under the revised scope. Authenticated agent access is required before production and has not been configured or proven.

[Final read-only recovery evidence](sdd/evidence/load-six-absence-after-cooldown-2026-11-11.json): one read, zero mutations and zero model calls. Source checkpoint `3538249ea82e0726086be8c247df76b8ebc0ab34`. No new authentication configuration was applied.
