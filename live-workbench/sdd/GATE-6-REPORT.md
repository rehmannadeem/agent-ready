# Development candidate report — Gate 6 pending

11 November 2026 · Asia/Karachi · FOR CLAUDE REVIEW · CLEANUP AND EVALUATION PENDING

## 1. Summary

Runtime isolation and catalogue seeding are complete. The separate runtime app can read products/publications and cannot read customers/orders. The verified seed contains 318 owned products / 3,266 variants, 15 collections and four discounts. Its rerun sent zero Shopify Admin mutation requests and preserved the original catalogue.

The first 20-session load attempt failed 19 search business checks. Its evidence is retained. On resumption, all old carts were confirmed absent and 25 diagnostic searches passed. The unchanged load retest passed all 20 searches, cart creations and cancellation acknowledgements, but upstream throttling stopped final absence checks after 76/80 requests. Fourteen absences are verified and six remain unconfirmed. The provider returned `Retry-After: 2249` seconds. The full 75-scenario AI suite has not started.

## 2. Stage and gate status

Stages 1–2 were approved with the owner's six conditions; Stages 3–4 are recorded briefly. Stage 5 is implemented. Stage 6 remains **pending cleanup and evaluation; Gate 6 has not passed**. Stop at Gate 6: no merge, ship, production source deployment or iteration increase.

## 3. Changes and branch

Branch `feat/realistic-catalogue-20261110`; saved checkpoint [`014e40e2c7cfabd2f7a366139bc08cb28e537c67`](https://github.com/rehmannadeem/agent-ready/commit/014e40e2c7cfabd2f7a366139bc08cb28e537c67). This checkpoint adds recovery evidence, bounded search diagnostics, evaluator pacing and persistent provider suspension. [PR #1](https://github.com/rehmannadeem/agent-ready/pull/1) remains open and unmerged.

**Armans Shopping Runtime v1** has only `read_products,read_publications` and no webhook subscriptions. Shared **Armans SupportOps Connector** was not edited or released; its unsaved failed permission draft was discarded. The Worker now uses the separate runtime application's Cloudflare secrets. Version `1da0a93d-088b-4f40-8885-24629753a0e9` and deployment `d394ec92-a435-48f1-a46a-25d8cd90a17f` identify `source: wrangler`, `triggered_by: secret`. [Metadata](evidence/cloudflare-credential-version-2026-11-10.json) supports the credential-only change; source bytes were not independently compared.

**Armans Catalogue Seed v1** retains only the four approved write scopes. No `write_locations` or broader location scope was requested. Its isolated credential is not used by the runtime. The separate n8n helper drives a controlled local evaluation loop; the published hosted-chat workflow is unchanged.

## 4. Evidence

- **172/172 deterministic tests passed on 11 November**, followed by **34/34 focused Windows simulation checks** with matching source hashes. The product restoration guard tolerates timestamp-only changes only when full product state and journal integrity match; discount version checks remain strict.
- Earlier actual local runtime checks: 11/11 baseline and 8/8 private inspection. Windows readiness: 10/10. Live read-only smoke: 3/3 for Admin catalogue, UCP search and exact lookup.
- Browser cart smoke: p001, Black/10, quantity 1, USD 79; create → get → cancel → verified absence. No model calls, order or payment. [Evidence](evidence/windows-browser-cart-smoke-2026-11-10.json), [created cart](evidence/windows-cart-created-2026-11-10.png), [cancelled cart](evidence/windows-cart-cancelled-2026-11-10.png). This is separate from the AI suite.
- [Runtime isolation](evidence/runtime-isolation-2026-11-10.json): product/publication access succeeds; customer/order access is `ACCESS_DENIED`. No customer/order records were read.
- [Seed preflight](../catalogue/evidence/preflight-passed-2026-11-10.json): correct development store, USD, exact approved scopes, all 20 pinned operations validated, nested query requested cost 102. [Location attestation](../catalogue/evidence/location-ui-attestation-2026-11-10.json) records the read-only UI checks.
- [Final seed verification](../catalogue/evidence/seed-final-verification-2026-11-10.json): 318 owned products / 3,266 variants; 300 eligible products / 3,248 variants; 15 collections and four discounts. Store totals 336 / 3,293. Rerun skipped 318 and sent **zero Admin mutations**. Original IDs, handles and timestamps match for all 18 baseline products, which still have exactly 27 variants. No pending mutation.
- [Dry-run teardown](../catalogue/evidence/teardown-preview-summary-2026-11-10.json): 318 selected, 18 refused, zero deleted. No actual teardown.
- [First load attempt](evidence/load-first-attempt-2026-11-10.json): **1/20 sessions passed**, 19 failed the search business postcondition; 23/80 requests attempted; zero HTTP/tool errors or throttles. Its only created cart was cancelled and absence verified. On 11 November, all 20 prior session carts were independently confirmed absent.
- [Recovery diagnostics](evidence/load-readonly-diagnosis-2026-11-11.json): 25/25 searches passed today; all 20 sessions from the **original** load had no cart.
- [Load retest](evidence/load-retest-2026-11-11.json) preserves the original 80-request workload and exact assertions. All 20 searches, creations and cancellation acknowledgements passed. It stopped at `SUSTAINED_THROTTLE` after 76 requests: **14 full sessions passed, two verification reads failed and four sessions remained incomplete**. No business-check failure occurred; two upstream throttles occurred. Client HTTP p50/p95: 1,436/2,029 ms. These are end-to-end request measurements, not isolated Shopify latency.
- Two subsequent read-only recovery checks did not establish all absences. The [second recovery](evidence/load-retest-cleanup-second-2026-11-11.json) confirmed 14 empty sessions, then returned HTTP 429 / `RATE_LIMITED`, `Retry-After: 2249`. **Six retest cart absences remain unconfirmed**, despite all 20 cancellation acknowledgements. This is not evidence that six carts are active; it is missing cleanup confirmation.
- Evaluator pacing is now shared across ordinary and companion requests at 3,000 ms minimum spacing, with bounded Retry-After propagation. The 44 focused tests passed locally and on Windows. Full code suite: 173/173 passed after priority ordering; the earlier 172/172 result remains historical evidence. A persistent throttle stop blocks subsequent model/tool calls and restart until operator recovery; pending cleanup/restoration is recorded. No slower load or model suite was executed.
- [Model transport smoke, execution 592](../evals/helper-smoke-evidence.json): one successful call. Full AI scenarios **0/75 attempted** at this checkpoint; no pass rate or safety-critical acceptance claim.

## 5. Constraints and observed issues

API `2026-07`; GraphQL `16.15.0`. Preflight measured bucket 2,000 / restore 100 and requested nested-read cost 102. No schema-validation bypass was used. Ownership, store identity and original catalogue checks remain mandatory.

Shopify product timestamps advanced asynchronously without content changes during seeding. Full-state guards now distinguish timestamp-only advancement from actual product, inventory or publication drift. Unknown mutation outcomes still stop execution. Discount timestamp guards remain strict because their read shape is narrower.

The historical load failure is **unexplained**: the first report did not record the returned product/variant observations needed to identify its cause. Indexing, ranking or eventual consistency are hypotheses only. The later successful searches do not establish the historical cause or erase the first failure. The retest introduced a separate observed provider-throttling blocker.

[Shopify’s agent authentication and rate-limiting documentation](https://shopify.dev/docs/agents/profiles/auth-and-rate-limiting) states that merchant limits vary by tier and tool and can change; clients must honor `Retry-After`. No fixed numeric merchant quota is assumed. Three-second evaluator spacing reduces request pressure but does **not** guarantee avoidance of the provider’s limit.

Current `src/commerce.mjs` UCP requests send Content-Type/Accept headers and use **anonymous UCP access**, which has the lowest documented limits. The separate read-only Shopify Admin credential does not authenticate those UCP requests. Authenticated agent access is required before production and has not been configured or proven. This does not require adding customer/order scopes or altering the shared SupportOps app during this task. No UCP authentication or scope change was made.

Only Online Store publication is selected. Toronto inventory location has Shipping Off / zero rates; shipping settings were not changed. Runtime context is US/USD. Development-store orders, payments, production customer handling and AI-platform listing are outside the verified results.

## 6. Cost so far

One transport smoke: **51 input + 18 output tokens**, zero cache tokens; **USD 0.0000141** reconciled. No unknown reservation remains. The persistent ledger and run identifier are retained across the interruption.

The first suite remains 75 attempts at **five iterations**. Owner ceiling: **USD 10**. Gateway balance was rechecked at **USD 1.98** on 11 November; the stricter **USD 1.90 funded stop** remains in force. No credits were purchased and no eight-iteration run is authorized. [Resume preflight](evidence/resume-preflight-2026-11-11.json).

## 7. Remaining work

The recorded cooldown deadline is conservatively based on a remote clock reading after the response: recorded **12:23:00.893 UTC**, plus 2,249 seconds and a five-second safety margin gives **13:00:34.893 UTC / 18:00:34.893 PKT on 11 November 2026**. The original response timestamp was not captured, so this is a conservative earliest retry time, not a promised completion time.

After the provider permits access, first verify absence for the six pending cart sessions using read-only recovery. Do not repeat their cancellation blindly. The owner has directed **no further load run**. Record the live finding as **anonymous UCP throttled during the 20-overlapping-session test**, with serialized HTTP requests rather than 20 simultaneous network calls. It remains an unresolved production risk, not a load criterion to rerun. Once the six absences are confirmed, execute the full 75 first attempts: S05, S19, S20 and S21 with all three repetitions first (12 attempts), then the remaining 63. Keep five iterations, shared 3,000 ms request spacing, the USD 10 owner cap and stricter USD 1.90 funded stop. Account for every model call and verify simulation restoration. These cleanup and evaluation outcomes remain pending. Review all transcripts against the observed merchant responses. Mechanical successes remain **PENDING_REVIEW** until human acceptance; a model or assistant self-score is not acceptance evidence. Preserve every first attempt and report NOT_RUN/BLOCKED cases explicitly.

## 8. Owner action

No further Install click is required. Both apps are installed, and the owner authorized completion on 11 November. The revised owner scope authorizes six read-only absence checks after the provider cooldown, followed by the full 75-attempt suite with the safety-critical repetitions first. No further load run is authorized. Existing authorization remains; no new login, credential or permission is needed for that recovery. This report does not claim those steps have executed. Do not request changes to the shared SupportOps app. No merge, ship, production deployment, budget increase or iteration increase is authorized.

## 9. UPDATE OBSIDIAN

Suggested note: `Agent-Ready Live — Project Log`. Exact existing vault filename is unverified; do not edit the vault automatically.

`2026-11-11 — Gate 6 pending cleanup and evaluation. Seed318/3266,15collections,4discounts verified; zero-write rerun and baseline18/27 unchanged. First load1/20 passed; cause unknown. Retest20search/create/cancel acknowledgements passed,14absences verified,6pending; stopped76/80requests on upstream429. Retry-After2249s; earliest conservative retry18:00:34.893PKT. Revised scope: no further load; six read-only absence checks then75 attempts, critical12 first; outcomes pending. Anonymous UCP throttled with20overlapping sessions/serializedHTTP; authenticated agent access required before production. AI0/75, costUSD0.0000141, five iterations, fundedUSD1.90/ownerUSD10. PR1 open; no merge or source deployment.`

## 10. Gate 6 blockers

Six unconfirmed retest cart absences, all 75 scenario attempts, human transcript acceptance, safety-critical repetitions and simulation restoration remain outstanding. Honor the recorded provider cooldown before recovery. No further load run is in scope; anonymous UCP throttling remains an unresolved production risk and authenticated agent access is a production requirement. Gate 6 is not passed by seeding, a smoke test or deterministic tests alone. The production Wrangler configuration lacks the local evaluation's `SESSION_STATE` binding; this remains an unauthorized Gate 7 deployment blocker. Both failed load attempts are preserved. This stop report makes no full-suite or Gate 6 acceptance claim; any later continuation must append its own evidence without replacing these results.
