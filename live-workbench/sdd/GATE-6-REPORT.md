# Development candidate progress report — Gate6 not passed

10 November 2026 · FOR CLAUDE REVIEW · IN PROGRESS

## 1. Summary

The dedicated runtime app is installed, verified and connected to the Worker through Cloudflare secrets. It can read products/publications and cannot read customers/orders. The seed app is installed and its read-only preflight passed. Seeding is in progress after a guarded pause on the first draft product. One model transport smoke passed. The full75-scenario suite has not started at this checkpoint.

## 2. Stage and gate status

Stages1–2 approved with the owner's six conditions; Stages3–4 recorded briefly. Stage5 implemented; Stage6 live validation in progress. Gate6 has NOT passed. Stop at Gate6; Stage7, merge and production source deployment are not authorized.

## 3. Changes and branch

Branch `feat/realistic-catalogue-20261110`; last pushed checkpoint `704057a78efc2c093e3631d5c569f340ddf0b388`. Current validation fixes/evidence are uncommitted until the next checkpoint. PR1 stays open and unmerged.

Runtime: **Armans Shopping Runtime v1**, only `read_products,read_publications`, no webhook subscriptions. Shared **Armans SupportOps Connector** was not edited or released; its unsaved failed permission draft was discarded. Cloudflare's SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET now point to the separate runtime app. This was a credential change, not a candidate source deployment.

Seed: **Armans Catalogue Seed v1**, approved four write scopes only. No write_locations or broader location scope requested. The seed's isolated credential is not used by the runtime. The separate n8n single-call helper supports a controlled local loop; the existing published hosted-chat workflow is unchanged.

## 4. Evidence

- Intermediate tree:153/153 deterministic tests pass; final rerun pending current seed fixes. Prior149-test and32-file syntax evidence retained.
- Actual local runtime:11/11 baseline checks and8/8 private-inspection checks passed. These earlier tests blocked outbound fetch.
- Windows runtime readiness:10/10 passed. Live read-only smoke:3/3 passed for Admin catalogue, UCP search and exact product lookup; Runner ProUSD79.
- [Runtime isolation](evidence/runtime-isolation-2026-11-10.json): product/publication access succeeds; customer/order access returns ACCESS_DENIED; no customer/order records read.
- Seed preflight: correct development store, USD, baseline18products/27variants, exact approved scopes, all20 pinned operations validated, nested-read requested cost102. See [preflight](../catalogue/evidence/preflight-passed-2026-11-10.json) and [location attestation](../catalogue/evidence/location-ui-attestation-2026-11-10.json).
- Generated318products/3266variants; intended300eligible/3248variants,10draft/5archived/3unpublished,15collections/fourdiscounts. JSON SHA256 `72955f4f280b995d0cd37e69b7f9f6e848ed51de18eacf9983be783653008e32`.
- At this checkpoint one owned draft with16variants exists: totals19/43. Timestamp guard stopped; complete read-only content/inventory/no-publication reconciliation passed. Remaining seeding is not yet accepted.
- Model transport smoke [execution 592](../evals/helper-smoke-evidence.json) succeeded once. Live scenarios0/75 at this checkpoint; no pass rate. Safety-critical and bounded-load acceptance remain pending.

## 5. Shopify constraints and observed issues

API2026-07. Seed preflight measured bucket2000/restore100 and nested cost102. Pinning GraphQL16.15.0 resolved17.1.0 validation rejection of unrelated schema metadata; no validation bypass was used. Existing resource IDs and seeded ownership must remain matched.

Location IDs came from the API; restricted name/status fields were confirmed through fresh read-only Admin UI observations and a strict store-bound attestation. Only Online Store publication is selected. Toronto location has Shipping Off/zero rates; no shipping settings were changed. The first product's post-create timestamp advanced with no seeded-field difference; created-phase reconciliation requires full exact draft comparison before continuation.

## 6. Cost so far

One transport smoke:51 input tokens,18 output tokens, zero cache tokens; **USD0.0000141** actual usage reconciled. No unknown reservation remains. Full suite is75 scenarios at five iterations. Owner ceiling remains **USD10**; current creditUSD1.98 led to a stricter **USD1.90 funded stop**, enforced on the same persistent ledger. No credit purchase or auto-topup change. No permission to increase to eight iterations.

## 7. Remaining work

Finish guarded seed, verify totals/exclusions and duplicate-free rerun; complete local controller wiring; execute/review75 first attempts; run twenty logical-session bounded commerce load; verify simulation restoration and browser acceptance. A mechanical pass is PENDING_REVIEW until transcript/tool evidence is checked. Every first attempt stays in the denominator. Missing evidence remains NOT_RUN/BLOCKED, never a pass.

## 8. Owner action

No further Install click is needed: both apps are installed. The executor continues within the approved scope. Any future decision must identify the exact blocked action; do not request modification of the shared SupportOps app. No merge, ship, production source deploy or iteration increase is authorized.

## 9. UPDATE OBSIDIAN

Suggested note `Agent-Ready Live — Project Log`; exact existing vault filename has not been verified. Do not edit the vault automatically.

`2026-11-10 — Gate6 IN_PROGRESS: dedicated runtime read_products/read_publications installed; customer/order access denied; Cloudflare credential-only switch completed. Seed preflight passed; first owned draft created and reconciled after timestamp guard, remaining seed pending. Live read-only commerce3/3; one model smoke51input/18output,USD0.0000141;75suite pending,fiveiterations,fundedcapUSD1.90/ownerUSD10. PR1open,no merge/source deploy.`

## 10. Gate6 blockers

Verified full seed/idempotence, complete scenario attempts and transcript reviews, safety-critical3/3 repetitions, bounded-load metrics, simulation restoration and browser acceptance. Gate6 is not passed by installation, a successful transport smoke or deterministic tests alone. This progress report must be refreshed from final evidence before the Gate6 stop handoff.
