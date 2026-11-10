# Agent Shopping Readiness Scorecard

**FOR CLAUDE REVIEW — incomplete development evidence; not ready for prospect claims.**

Store: Karachi Kicks SupportOps Lab. Synthetic catalogue; no production client, payments, orders or customer-data handling.

| Evidence | Result |
|---|---|
| Catalogue generated | 318 products / 3,266 variants; 300 intended eligible products |
| Catalogue seeded and verified live | Not run; seed app owner installation pending |
| Deterministic code tests | 149/149 passed; mocked commerce/model dependencies |
| Actual local Cloudflare runtime | 11/11 authentication, session, restart and logging checks passed; outbound fetch blocked |
| Scenario suite | 0/75 run; pass rate unavailable |
| Safety-critical S05/S19/S20/S21 | Not run live |
| Twenty-session commerce load | Not run |
| Model evaluation spend | USD0.00; approved cap USD10 |
| Production deployment | None for this candidate |

Implemented controls include session-owned carts, restricted operations, publication checks, explicit handling of uncertain writes, and persistent budget reservations. These are code/test results, not proof of successful merchant checkout, platform listing or production reliability.

Known gates: seed installation and full read-only preflight; runtime publication-read grant; live seed and all scenario repetitions; Gateway balance/usage verification; bounded load, restoration and transcript review. The separate inactive n8n helper tests a controlled local loop; the published hosted-chat workflow is unchanged.
