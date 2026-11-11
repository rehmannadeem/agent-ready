# Gate 2 report — owner decision required

**10 November 2026 · Asia/Karachi · FOR CLAUDE REVIEW**

## 1. Summary — three lines

Prepared the intent and specification for 300 published synthetic products / 3,248 variants, plus 18 excluded products / 18 variants.
Verified the merchant's live MCP tool schema and specified 25 scenarios, each repeated three times; no scale implementation or evaluation has run.
Stopped at Gate 2 as required: Shopify writes, credentials, live application, main and deployment remain unchanged.

## 2. Stage and gate

Stages 1–2 prepared. **Gate 2 awaiting Rehman Nadeem.** Stages 3–7 have clearly marked unstarted records, not claims of completed work. The attachment's sections 2–3 explicitly require this stop before store writes or new credentials. Claude reviews; Nadeem authorizes.

## 3. Changes, branch and commits

Repository: [rehmannadeem/agent-ready](https://github.com/rehmannadeem/agent-ready).
Branch: [feat/realistic-catalogue-20261110](https://github.com/rehmannadeem/agent-ready/tree/feat/realistic-catalogue-20261110).
Parent: `a813eaedf2bc1e5b37ce958415c0ae944aca7726`, verified PR #1 head. This report's own commit is available in the file history and final handover; a commit cannot embed its own hash.

Changed paths are exclusively `live-workbench/sdd/`: README; seven stage records; CATALOGUE-SPEC; SCENARIO-MATRIX; MCP-CONTRACT; SHOPIFY-LIMITS; COST-AND-MEMORY; this report; and sanitized evidence. No runtime source or release metadata changed. PR #1 remains open and unmerged.

## 4. Evidence and numbers

| Evidence | Observed or specified result |
|---|---|
| Remote access | Authorized Windows device `geo`; project directory under `G:\Projects\Armans-AgentReadyLive-20261109` inspected. |
| Live merchant discovery | Read-only `tools/list` at 2026-11-10T15:02:50.3230668Z; 14 advertised tools, seven selected for this scope. [Schema evidence](evidence/shopify-mcp-tools-2026-11-10.json). |
| Supported operations | Search/paging, lookup, product detail, create/get/update/cancel cart. Discount codes are cart fields, not an invented standalone tool. |
| Existing n8n configuration | Published version `574ae801-34c9-446b-ac39-9c5223fcf893`, draft matches; five iterations; memory eight interactions; unauthenticated Worker MCP connection. Read-only observation, unchanged. |
| Catalogue target | Published: 300 products / 3,248 variants. Excluded: 10 draft + 5 archived + 3 unpublished, one variant each. Total: 318 / 3,266. Maximum per product: 32 variants, three options. |
| Acceptance threshold | At least 290 published products and 2,000 variants; all 75 scenario runs complete, at least 68 pass; S05/S19/S20/S21 each 3/3 with every defined subcase passing. |
| Current evaluation | **0/75 run; no pass rate available.** Prior baseline's 30 tests are historical, not new validation. |
| Document verification | [Specification checks](evidence/specification-checks.json): arithmetic, required files, scenario IDs, local links and selected tool schema consistency. These checks are not application tests. |

## 5. Shopify limits — checked 10 November 2026

| Limit relied on | Value / qualification | Source |
|---|---|---|
| Per product | 2,048 variants; three options. Proposed maximum 32 / three. | [Variants](https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/productVariantsBulkCreate), [options](https://help.shopify.com/en/manual/products/variants/add-variants) |
| GraphQL budget | Cost-based, per app/shop; Standard 100 points/sec; actual dev-store budget unknown. Single query ≤1,000 points; array inputs ≤250. | [Rate limits](https://shopify.dev/docs/apps/build/apis/graphql-admin/rate-limits) |
| Resource throttle conflict | Current guide: 500,000 existing variants →10,000/day. Pinned 2026-07 productCreate: 50,000→1,000/day. No separate dev-store daily cap established. Full store count and actual enforcement must be checked before seeding. | [Current](https://shopify.dev/docs/api/usage/limits), [pinned](https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/productCreate) |
| Merchant MCP throughput | No fixed merchant Cart MCP requests/sec budget established. Global Catalog's published 5 RPS must not be applied to this endpoint. Honor throttling/Retry-After and stop sustained throttling. | [Agent authentication and limits](https://shopify.dev/docs/agents/profiles/auth-and-rate-limiting) |

Complete source URLs, API qualifications, scope proposal and unresolved store preflight: [SHOPIFY-LIMITS](SHOPIFY-LIMITS.md). Exact live tool inputs: [MCP-CONTRACT](MCP-CONTRACT.md).

## 6. Cost so far and estimate

Incremental evaluation-model spend for this Stage 1–2 work: **USD 0**; no model evaluation calls executed. This is not a statement that subscriptions or all platform usage are free.

Conservative proposed suite: 75 conversations / 360 shopper turns / at most 2,880 model calls. At direct Haiku 5.5 short-prompt rates, 24k input + 2k output per call gives USD 9.792 base; with 30% contingency, **USD 12.73**. Actual n8n Gateway rates/conversion are not verified. This benchmark exceeds the brief's USD 10 stop threshold: **evaluation remains blocked**. [Calculation, memory impact and stop controls](COST-AND-MEMORY.md).

## 7. Not done and why

No catalogue generator/seed/import, app/credential/scope change, cart mutation, simulation, scale code, load/security test, paid evaluation, scorecard, merge or deployment. These belong to Stages 3–7 after the brief's owner gates. No Obsidian note was edited. No client was contacted.

## 8. Owner decisions and recommendations

| Decision | Recommendation and boundary |
|---|---|
| Gate 2 scope | Approve this specification for later Stages 3–6 on the named development store. Approval authorizes the separate seed app with `write_products`, `write_inventory`, `write_publications`, `write_discounts`, and the specified owned synthetic fixtures after validated preflight. Runtime stays read-only. It does not approve shipping, merging or production deployment. |
| Evaluation budget | **Keep USD 10 initially.** Verify Gateway tariff and refine the call envelope without reducing 75 runs. If the bounded estimate remains above USD 10, return with the exact revised estimate for a higher explicit cap. Do not execute the present USD 12.73 envelope. |
| Second location | Reuse an existing suitable second location if supported; otherwise mark not tested. Do not request `write_locations` or create one without an additional explicit decision. |
| PR #1 | Carry its verified head forward and recommend superseding it at the eventual release, avoiding an interim merge of a build with unauthenticated tool endpoints. Do not close or merge now. |
| Publication and market | Verify actual publication/market context before seeding. Proposed synthetic USD context is conditional on store configuration; do not collect real customer data. |

## 9. UPDATE OBSIDIAN — owner action only

Proposed exact note name: **`Agent-Ready Live — Realistic Catalogue.md`** (create if absent; its existence has not been checked).

Add this exact line:

> 2026-11-10 — Stages 1–2 prepared on feat/realistic-catalogue-20261110 from a813eae; Gate 2 pending. Target 300 published products / 3,248 variants plus 18 excluded fixtures; 75 scenario runs specified, 0 run. Evaluation spend USD 0; conservative direct-provider estimate USD 12.73, Gateway tariff unverified; retain USD 10 cap pending recalculation. No Shopify, credential, workflow or deployment changes. Review live-workbench/sdd/GATE-2-REPORT.md.

## 10. Blockers

1. Owner Gate 2 approval is required before implementation, store writes or new seed credentials.
2. Current conservative estimate exceeds USD 10; actual Gateway billing and enforceable per-call budget remain unverified.
3. Correct-store full variant count, actual throttle budget, locations/publications and relevant shopper visibility require read-only preflight before any seed writes. Resolve resource-throttle conflict against that preflight; stop if unclear.
4. Trusted shopper identity and persistent cart ownership must be designed and tested; a shared bearer alone does not solve cross-session access.

No login assistance is needed to review this pack. If later seed-app authorization or signed-in billing access requires Nadeem, request that exact action without asking for passwords in chat.
