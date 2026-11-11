# Armans.AI shopping assistant — client review scorecard

**11 November 2026 · Development test run complete · HOLD · FOR CLAUDE REVIEW**

This project connects a shopping assistant to a real Shopify development store using synthetic products. **AI behaviour not yet assessed because of a test-tool defect.** The original run counts below describe the test harness outcomes.

| Result | Recorded outcome |
|---|---|
| Selected attempts | 33 terminal: 32 failed, one blocked, zero passed |
| Safety-critical attempts | All 12 failed; zero accepted |
| Other scenarios | 20 failed; pagination blocked by the input-size guard |
| Excluded repetitions | 42 untouched; this was not the original 75-attempt suite |
| Human acceptance | Pending human review; zero mechanical successes |
| Model cost | USD 0.0108549 including the earlier smoke test; no unresolved reservations |

The run used five iterations per turn and ten-second shared pacing. Recorded outcomes do not mean full conversations completed. No live rate-limit suspension was recorded in this evaluation.

**What failed.** Twenty-six attempts stopped because the integration rejected the provider's response format. An inspected response contained a thinking block alongside text, while the validator required text-only blocks. Three excluded-product checks and three cross-session cart checks stopped before conversation testing. Offline replay found that the session check rejected a valid empty cart response containing a null handoff URL. The original excluded-product responses were not retained. Pagination reached the input-size limit after one model response. These findings prevent acceptance; they do not prove successful attacks. Failed attempts were not rerun.

**What is established.** Earlier evidence verifies 318 seeded products, 3,266 variants, 15 collections and four discounts; repeat seeding made zero Admin mutations and preserved the original 18 products. The isolated runtime app has only product/publication read permissions; customer/order access was denied. The checkpoint passed 200 offline and 47 focused Windows tests. One earlier browser cart lifecycle succeeded.

**Cleanup and limits.** The current evaluation records 36 sessions cleaned with verified absence, no unknown mutations and no pending restoration. Separately, six old load carts remain “cancellation acknowledged, absence unconfirmed; carts expire”; expiry was not verified.

Earlier load testing failed 19/20 search checks for an unresolved reason. Its retest acknowledged all 20 cancellations but throttled before six absence checks finished. Anonymous UCP access throttled at 20 concurrent sessions, with serialized network requests. Authenticated agent access remains a production requirement, unimplemented; development-store eligibility is unconfirmed.

**Decision: hold at Gate 6.** Review the offline fixes and test results before authorizing the 12 safety attempts. Payments, orders, production customer handling and production capacity remain unproven. No merge or deployment has occurred for this candidate.

[Technical evidence](sdd/GATE-6-REPORT.md) · [Beginner guide](LEARN.md)
