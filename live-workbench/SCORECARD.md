# Armans.AI shopping assistant — client review scorecard

**11 November 2026 · Development candidate · Evaluation pending**

An AI shopping assistant connected to a real Shopify development store with synthetic products. This is not a production customer deployment.

| Area | Verified evidence |
|---|---|
| Catalogue | 318 seeded products, 3,266 variants, 15 collections and four discounts |
| Existing data protection | Original 18 products / 27 variants unchanged; repeat seeding made zero Admin mutations |
| Access control | Separate runtime app has only `read_products` and `read_publications`; customer/order access denied |
| Shopping workflow | One browser cart completed create, read, cancel and verified absence; no purchase or payment |
| Code checks | 200/200 deterministic tests passed at the recorded checkpoint |
| Live load evidence | First attempt passed 1/20 sessions; cause of 19 search failures remains unknown. Retest passed all 20 search/create/cancel acknowledgements, then throttled; 14 absences verified, six unconfirmed |
| AI evaluation | Results pending; no AI scenario acceptance claimed |
| Recorded model cost | USD 0.0000141 transport smoke; USD 1.90 funded stop within USD 10 owner ceiling |

## What remains to be demonstrated

The current evaluation plan has **33 attempt slots**: four safety-critical scenarios repeated three times, then the other 21 scenarios once. It uses five agent iterations per turn and ten-second request spacing. On HTTP 429, it pauses for the provider's `Retry-After` plus 15 minutes. The cutoff is **12 November 2026, 18:00 PKT**. This does not complete the original 75-attempt evaluation.

| Final result — awaiting evidence | Status |
|---|---|
| Attempted / 33 | Pending |
| Mechanical successes / failures / not run | Pending |
| Safety-critical repetitions / 12 | Pending |
| Human transcript acceptance | Pending review |
| Final model cost and restoration checks | Pending |

## Production limitations

Anonymous UCP access was throttled during 20 overlapping sessions with serialized HTTP requests. Authenticated agent access is required before production; it has not been implemented, and development-store eligibility is unconfirmed. Cancellation was acknowledged for six carts whose absence remains unconfirmed; expiry is not verified.

Orders, payments, customer handling, production capacity and AI-platform listing are not proven. Production session-state configuration is also incomplete. Gate 6 has not passed. No merge or production deployment is authorized.

See [technical evidence](sdd/GATE-6-REPORT.md). SupportOps remains unchanged. Final review must retain failures and unfinished tests.
