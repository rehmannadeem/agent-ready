# Stage 2 — Specify

Date: 10 November 2026. Status: **specification prepared; Gate 2 pending**. Implementation and evaluation have not started.

## Baseline and requirement trace

Repository head `a813eae` and its Worker source/configuration were read today. n8n's active version `574ae801-34c9-446b-ac39-9c5223fcf893` still uses Haiku 5.5, eight prior interactions and five model iterations. The prior 30-test result is historical, not a test rerun today.

| Requirement | Current gap | Required behavior and evidence |
|---|---|---|
| R01 / L1 | Admin read filters one handle | Paginated category/vendor/price/stock listing, validated parameters and complete traversal; shopper-visible projection must exclude ineligible records. |
| R02 / L2 | Five products, no returned cursor | Maximum 10 products per application call, opaque next cursor, stable filters/market across pages; S13 proves later-page access. |
| R03 / L3 | One cart line | Multiple selected variants; update quantity/remove line using actual `update_cart`; correct refreshed contents and totals. |
| R04 / L4 | Single-product dashboard | Filterable browse, stock badges, live observation timestamp, all pages accessible; noindex retained. |
| R05 / L5 | Eight-interaction memory | Proposed 20 interactions plus authoritative server-held cart/selection state; S24 spans 24 turns. Window size alone is insufficient. |
| R06 / L6 | Public unauthenticated tool routes | Missing/wrong bearer rejected with 401; no merchant call; per-session and aggregate rate controls; no shared secret in browser assets. |
| R07 / L7 | Observability disabled | Structured operation/status/duration/correlation logs; no credentials, session tokens, cart capability keys, raw payloads or personal data. |
| R08 / L8 | Five-stage record | Seven stage records with truthful completion and gate status; no automatic transition through Gates 2/6/Ship. |
| R09 | No cart session ownership | Trusted principal + server-issued session binding; cross-session read/update/cancel rejected before upstream call, including concurrent sessions. |
| R10 | No discount editing/detail lookup | Actual `lookup_catalog`, `get_product`, and cart discount-code replacement/clearing; merchant warnings and totals preserved. |
| R11 | No realistic catalogue or controls | Deterministic 318-product/3,266-variant specification, ownership tags, messy data, exclusion specimens, reproducible counts. |
| R12 | No changes during conversation | Approved stock/price/publication/discount simulations with barriers, before/after evidence and guarded restoration. |
| R13 | No scaled acceptance | Deterministic tests, 25 scenarios × 3, 20-session API load check, security tests, cost ledger and honest scorecard. |

## Catalogue and visibility

See [CATALOGUE-SPEC.md](CATALOGUE-SPEC.md) for exact counts and fixture requirements. Publish exactly the 300 eligible products; retain 10 drafts, five archived and three active publication-exclusion specimens separately. All 318 carry both ownership tags. Do not count excluded products toward the ≥290 published acceptance floor.

No shopper-facing Admin browse fallback may leak draft, archived or excluded records. Verify relevant publications and market; Online Store unpublishing is not automatically a guarantee about every UCP surface. Record raw merchant visibility separately from application filtering. S05 requires all application-facing surfaces to withhold excluded records; any merchant discrepancy remains an explicit finding.

Use a fixed synthetic US/USD market context for repeatable tests, subject to read-only confirmation that this store supports it before implementation. Context is not a real shipping address. Do not infer shipping availability, taxes or a final payable amount from a pre-address cart estimate.

## Supported operations, not guessed APIs

The live merchant advertised 14 tools on 10 November; only seven catalog/cart tools are proposed for this application. [MCP-CONTRACT.md](MCP-CONTRACT.md) maps exact fields. No checkout, order, payment or business-query tool will be auto-imported merely because Shopify advertises it.

`update_cart` replaces state: read current owned cart, reconstruct the complete supported desired cart, preserve relevant fields, apply the requested edit, then verify the response. Serialize edits per cart or reject a stale revision; concurrent overwrites must not silently lose another change. Discounts use this same operation; there is no claimed `apply_discount` merchant tool.

## Security and credential acceptance

- Separate seed app: proposed `write_products`, `write_inventory`, `write_publications`, `write_discounts`; no orders, customers, payments or theme scope. No new location scope unless separately approved and needed. These are resource-wide scopes; tag restrictions are enforced by our code, not Shopify permissions.
- Keep runtime Admin access read-only. Resolve any additional necessary read scope and remove unneeded exposure in the later design; no credential is created or changed today.
- A shared bearer authenticates n8n as a service, not a shopper. Session identity must be obtained from authenticated server context and integrity-protected. A pasted cart ID or model-chosen session ID grants no ownership.
- A browser cannot safely contain the shared service bearer. The later architecture must provide an authenticated server-side intermediary for dashboard actions, or leave them disabled. Do not “fix” authentication by embedding the secret in JavaScript.
- Auth failures, storage/ownership failures and rate-limit failures fail closed. Public agent-profile discovery stays independently accessible for negotiation.

## Acceptance and gates

1. At least 290 tagged published products and 2,000 variants; target 300 / 3,248. All excluded specimens present and withheld as specified.
2. All existing and new deterministic tests pass. No test count is invented before execution.
3. Run all 25 scenarios three times: 75 conversations. At least **68/75** pass (≥90%); S05, S19, S20, S21 each **3/3**, and every required subcase passes. NOT RUN/BLOCKED remain in the denominator and prevent a completeness claim.
4. Report p50/p95 latency, upstream and end-to-end timing, error rate, throttling counts, session isolation and actual tested load. Twenty sessions do not mean twenty simultaneous upstream requests.
5. No leaked secret/cart key; absent/wrong bearer returns 401; cross-session actions refused. Injection changes no privilege or price.
6. Record per-call token use, total model cost and approved cap. Current conservative estimate exceeds USD 10; evaluations are blocked pending budget handling and verified n8n billing.
7. Seed/teardown ownership predicates and idempotent re-run behavior pass. Live teardown remains separately prohibited unless Nadeem asks.
8. No payment, order, personal data, real-brand fixture or unsupported success claim. L1–L8 each resolved or explicitly recorded with reason. Critical security gaps cannot be waived into a “pass”.

Gate 2 approval authorizes only the explicitly approved store/credential/budget scope. Stages 3–6 follow afterward; validation must stop at Gate 6. Gate 7 deployment and any merge remain separate explicit decisions. A local or isolated validation environment is not permission to overwrite the currently shared Worker.

## Unknowns requiring a later preflight

Actual store variant count/plan/throttle status, publication/location identifiers, scope checks, metafield queryability through UCP, the conflicting daily-creation limits, and signed-in Gateway rates remain unverified. See [SHOPIFY-LIMITS.md](SHOPIFY-LIMITS.md) and [COST-AND-MEMORY.md](COST-AND-MEMORY.md). Do not start a dependent write, paid run or unsupported assumption until its precondition is resolved.
