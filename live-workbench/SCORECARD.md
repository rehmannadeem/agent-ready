# Agent Shopping Readiness Scorecard

**FOR CLAUDE REVIEW — live validation IN PROGRESS; Gate6 not passed.**

Store: Karachi Kicks SupportOps Lab. Synthetic catalogue on a real Shopify development store; no production client, payments, orders or customer-data handling.

| Evidence | Result |
|---|---|
| Catalogue generated |318 products /3266 variants;300 intended eligible products |
| Catalogue seeded | 318 products / 3,266 variants verified; rerun skipped 318 with zero Admin mutation requests |
| Deterministic code tests |162/162 after simulation cleanup guard patch; Windows focused checks pending |
| Actual local Cloudflare runtime |11/11 baseline +8/8 private inspection checks passed |
| Windows runtime readiness |10/10 passed |
| Live read-only commerce |3/3 Admin catalogue/UCP search/exact lookup checks passed |
| Runtime least privilege | Only read_products/read_publications; customer and order reads denied |
| Browser cart smoke |Create/get/cancel/verified absence passed for p001 Black/10 quantity1 at USD79; not a scenario-suite result |
| Scenario suite |0/75 at this checkpoint; pass rate unavailable |
| Safety-critical S05/S19/S20/S21 |Not run live |
| Twenty-session commerce load |Not run |
| Model spend |USD0.0000141 transport smoke; funded stopUSD1.90; owner ceilingUSD10 |
| Candidate production source deployment |None; Cloudflare credentials alone switched as authorized |

Implemented controls include session-owned carts, restricted operations, publication checks, uncertain-write stops and persistent budget reservations. These results do not establish platform listing or production reliability.

Remaining acceptance: Windows focused simulation-guard checks; bounded load; complete/review the75 scenarios at five iterations; simulation restoration; remaining scaled browser checks. Seed/idempotence are verified; baseline18 products/27 variants unchanged. Dry-run teardown selected318, refused18, deleted0. The separate n8n helper drives a controlled local loop; the published hosted-chat workflow is unchanged. Shared Armans SupportOps Connector is unchanged. PR1 remains open and unmerged.
