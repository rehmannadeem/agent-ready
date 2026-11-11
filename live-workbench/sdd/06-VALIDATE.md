# Stage 6 — Validate

**IN PROGRESS. Gate 6 has not passed. Stop before Ship.**

| Check | Measured result | Evidence / remaining work |
|---|---|---|
| Deterministic code tests | 162/162 passed after simulation cleanup guard patch | Agent verified current 162; Windows focused checks pending. Prior [157-test checkpoint](evidence/deterministic-checkpoint-2026-11-10.json) retained |
| Prior syntax checks | 32 files passed | evidence/deterministic-tests-2026-11-10.json |
| Actual local Cloudflare runtime | 11/11 passed | evidence/local-runtime-2026-11-10.json; outbound fetch blocked in this test |
| Private evaluation entry | 8/8 passed after interoperability fix | evidence/eval-private-runtime-2026-11-10.json; initial failure retained |
| Windows runtime readiness | 10/10 passed | Sanitized evidence import in progress |
| Live read-only commerce smoke | 3/3 passed: Admin catalogue, UCP search, exact product lookup | Runner Pro, USD79; no mutation/model call |
| Browser cart lifecycle | PASS: create/get/cancel/verified absence; p001 Black/10, quantity1, USD79 | [Evidence](evidence/windows-browser-cart-smoke-2026-11-10.json); separate from75-scenario suite, no model/payment/order |
| Runtime credential isolation | Exact read_products/read_publications; customer and order reads ACCESS_DENIED | evidence/runtime-isolation-2026-11-10.json |
| Seed preflight | Correct development store, USD, unchanged18/27 baseline, approved scopes; all20 pinned operations valid; query cost102 | Completed before first write; fresh UI evidence supplements location IDs without adding location scope |
| Generated catalogue | 318 products /3266 variants;300 intended eligible /3248 variants | ../catalogue/seed-v1.sha256.json |
| Live seed | 318 products / 3,266 variants verified; store totals 336 / 3,293 | [Final verification](../catalogue/evidence/seed-final-verification-2026-11-10.json): rerun skipped 318, zero Admin mutation requests |
| Baseline preservation |18 original products and27 variants unchanged; exact IDs/handles/updatedAt match | Final seed evidence; no pending mutation |
| Dry-run teardown |318 selected,18 refused,0 deleted | [Preview](../catalogue/evidence/teardown-preview-summary-2026-11-10.json); no live deletion |
| Scenario plan | 25×3=75, five iterations | Owner USD10 ceiling; secondary funded ceiling USD1.90 |
| Live scenarios | 0/75 run at this checkpoint | Verified seed ready; bounded load and remaining controller checks precede full suite |
| Safety-critical scenarios | NOT RUN | S05/S19/S20/S21 require3/3 |
| Twenty-session commerce load | NOT RUN | No latency/error metrics claimed |
| Live simulations/restoration | NOT RUN | Separate controller preparation in progress |
| Model transport | One successful smoke, execution592;51 input+18 output tokens;USD0.0000141 | [Native usage](../evals/helper-smoke-evidence.json) reconciled into canonical ledger; no retry |

Both Shopify apps are installed. The shared SupportOps app remains unchanged; its abandoned permission draft was discarded. Cloudflare credentials now reference Armans Shopping Runtime v1; candidate source has not been deployed. No customer/order data was read.

The location API exposes IDs under the approved seed scopes but restricts additional fields. Fresh read-only Shopify Admin UI observations are matched to those exact IDs and store. Toronto's shipping remains Off with zero rates; this limitation is recorded rather than silently changed. GraphQL16.15.0 is pinned after17.1.0 rejected unrelated schema deprecation metadata; all20 operations then validated without bypassing schema validation.

The first seed write was followed by a Shopify timestamp change. The guard stopped. Read-only reconciliation verified every expected draft field, all16 variant IDs/options/prices, both-location inventory and no publications. The narrowly guarded created-phase reconciliation passed regression tests and seeding resumed; actual content drift must still stop execution.

A completed mechanical scenario remains PENDING_REVIEW until its transcript/tool evidence is reviewed. All first attempts remain in the75-run denominator. Final acceptance requires at least68/75 and every safety-critical repetition, plus restoration, bounded-load and security evidence. Do not increase iterations, reset the ledger, retry an unknown model/mutation outcome, merge, or ship.

Independent code review found no blocking issue in the reviewed changes. The production Wrangler configuration still lacks SESSION_STATE; this is a known Gate7 deployment blocker, not authorization to alter or deploy production.
