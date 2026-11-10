# Controlled scale evaluation — first suite

This harness exercises the real protected Worker and live development-store data with a local tool loop and an **inactive, single-model-call n8n helper**. It is **not execution-equivalent to the hosted n8n AI Agent workflow**. Report that distinction in the scorecard. No paid model calls are made by tests or `--plan`.

Fixed first-suite limits: 25 scenarios × 3 repetitions; at most four shopper turns per ordinary scenario; S24 has exactly 24; **five model decisions per turn**, 2,000 maximum output tokens, and **USD 10 total**. Eight iterations are not supported. Tool decisions may contain several calls, just as one model decision can request multiple tools; they are executed sequentially, with no automatic mutation retry.

## Budget enforcement

`budget.mjs` persists an atomic reservation **before** each model call. A reservation is USD 0.0034: 24,000 input tokens at USD 0.10/M plus 2,000 output tokens at USD 0.50/M. Integer nanodollars avoid floating-point budget drift. The full conservative 1,800-call envelope is USD 6.12 plus 30% contingency = USD 7.956. The ledger still stops at USD 10, regardless of the estimate. Private approval pins one absolute `budget_ledger_path` and one immutable `evaluation_run_id`; all diagnostics, reports and later attempts use that same ledger. Changing `--out` never creates a new allowance. A ledger with a different run ID fails closed. Approval also pins `funded_limit_usd` (currently USD 1.90 against the owner-verified USD 1.98 balance, auto-topup off). Each reservation must fit both this funded ceiling and the unchanged USD 10 authorization. A funding stop leaves the 75-run report incomplete; it never buys credits, raises the allowance or resets the ledger.

The complete system+prompt content—including serialized tools, retained conversation and current observations—is limited to **23,000 UTF-8 bytes**, leaving a 1,000-token framing reserve. This is a deliberately conservative byte-based bound, not an exact tokenizer measurement. Provider usage is reconciled after every call. Exceeding the bound stops before dispatch; output/input usage above the reservation, unknown usage or unexpected cache billing stops subsequent calls. Caching, attachments, web search and code execution are disabled in the helper.

On timeout or missing usage, the reservation remains charged against the cap. Do not delete the ledger, retry the request or clear its halt. Reconcile the existing execution first. A crashed lock file also fails closed; an operator may remove only a stale lock after confirming its process is dead, preserving the ledger. Spool claims without an execution ID are ambiguous and must not be redispatched automatically.

## Prerequisites

- Seed manifest belongs to `karachi-kicks-supportops-lab.myshopify.com`, matches the exact seed SHA-256 and contains actual Shopify IDs.
- Root has verified store identity, protected endpoint, session isolation, billing tariff and available Gateway balance.
- Private approval JSON records the existing owner approval and completed preflight facts, with `owner_approved`, `gateway_tariff_verified`, `gateway_balance_confirmed`, `single_call_transport_verified`, `worker_preflight_passed`, `seed_verified` all true; `max_usd:10`, `max_iterations:5`, `model:"claude-haiku-5-5"`, `evaluation_run_id` (8–128 letters/digits/underscore/hyphen), canonical absolute `budget_ledger_path`, and positive `funded_limit_usd` no greater than 10 (current value 1.90). Never set verification flags merely to bypass a blocker.
- `ARMANS_EVAL_CONFIG` points to a **private, ignored** local JSON file: `worker_url`, `service_secret`, `session_issuer_secret`; optional `controller_module`, `controller_config_path` and `agent_profile_url` for separately approved simulation hooks. The default adapter is Node/server-only. These secrets must never enter a browser or model prompt.
- No raw spool, private configuration, ownership manifest, session tokens or unchecked execution export is committed. Only sanitized results are candidates for the evidence folder.

## Start locally

```sh
node evals/run.mjs --plan
node --test test/budget.test.mjs
node evals/run.mjs --seed catalogue/seed-v1.json --manifest catalogue/owned-manifest.local.json --adapter evals/local-adapter.mjs --approval /private/eval-approval.json --spool /private/eval-spool --out /private/eval-results
```

The full run waits for its connector bridge. `--only S01,S02` is a scoped diagnostic run, **not the full 75-run suite**. It uses the same ledger. All model setup/cleanup work counts; the supplied adapter uses deterministic API setup/cleanup instead of extra model calls.

## Connector bridge — exactly one dispatch per reservation

Helper ID **`McTDlGb8oc3hZ5gl`**, name **Armans Scale Eval — single model call**, team project **armans-shopify-supportops**, created inactive. Do not publish it. Its source is `n8n/scale-eval-single-call.sdk.js`.

1. Run `node evals/bridge.mjs next /private/eval-spool` and consume the JSON internally. Do not print the prompt or private observations in chat.
2. For `action:execute`, call the existing n8n connector with:
   `execute_workflow({workflowId:"McTDlGb8oc3hZ5gl",executionMode:"manual",triggerNodeName:"Evaluation input",inputs:{webhookData:{body:request.body}}})`.
3. Immediately persist the returned execution ID with `node evals/bridge.mjs started DIR RESERVATION_UUID EXECUTION_ID`. If the connector request outcome is ambiguous, stop; do not invoke it again.
4. For `action:poll`, fetch that existing execution. Read `One Haiku invocation` output only and project the result in memory. Do not export the complete execution/authentication context.
5. Require one successful native model-node run, the expected model and raw `usage.input_tokens/output_tokens`. Use `project-execution.mjs` to project only the native result. A non-`end_turn` stop (for example `max_tokens`) with known usage is returned as a failed model response with its usage intact; settle the actual cost before failing that case, without retrying. Join only `content` entries whose type is `text`; require no provider-native tool-use blocks. If usage or dispatch count is unclear, return an error and stop; never manufacture zeros.
6. Save a private response JSON with `{reservation_id,model:"claude-haiku-5-5",model_calls:1,execution_id,text,usage}`. Complete it with `node evals/bridge.mjs complete DIR RESPONSE_FILE`. The harness reconciles usage before executing the model's tool decision.

The helper uses the native Anthropic message node, no connected tools, `maxToolsIterations:1`, and n8n node retry disabled. The inspected native transport makes an authenticated HTTP request rather than an Anthropic SDK retry loop. Web/code tools are disabled, preventing their pause/continuation paths. The bridge itself never retries a dispatch. No public webhook activation, new provider key or credit purchase is required.

## Scenario controller and evidence

`scenarios.mjs` contains all 25 scripts; fixtures resolve through the seed and live manifest. Missing fixtures stop that scenario. The default adapter implements basic two-line/discount cart setup, exclusions, later-page preflight and explicitly labelled local 429/timeout fault injection. These are not claims of actual Shopify throttling. Live stock/price/publication/discount changes and cross-session cart-ID extraction require an approved `controller_module`.

A controller exports `createController({oracle,client,createSession,workerUrl,headersForSession,rawRequest,controllerConfigPath,agentProfileUrl})`, returning `capabilities` plus optional `prepareScenario`, `beforeTurn`, `assertScenario`, `cleanup`. All arguments stay in owner-controlled Node code. `rawRequest` is restricted to the protected `/api/mcp` and `/api/shop` paths; it supports deliberate rejected-auth companion tests. `prepareScenario` may return `{context,currentState,restore}`. For S21 it supplies `context.otherCartId` from the other approved synthetic session, never a real customer's cart. Simulation changes occur at the specified before-turn barrier and must return a guarded `restore`. Missing hooks produce **BLOCKED**, not a simulated success.

Mechanical assertions alone cannot prove all buyer-facing claims. Completed runs remain **PENDING_REVIEW** until a transcript/tool-evidence review is recorded; review entries have keys such as `S01-1`, with `{pass:true|false,evidence:"specific observation",reviewer:"name"}`. All first-attempt failures remain visible. The overall denominator stays **75**, with separate FAILED, BLOCKED, NOT_RUN and PENDING_REVIEW counts; no incomplete suite is reported as complete. A later evidence review must not rerun paid calls to erase a failure. Use `node evals/review.mjs RESULTS_JSON REVIEW_MAP_JSON` for offline finalization, following `review-guide.md`. The reviewer, observation, timestamp, prior status and evidence SHA-256 are retained. Interrupted RUNNING records become BLOCKED, and existing FAILED records cannot be made PASSED by a review. Each row includes confirmed token counts, USD cost and any unresolved reserved cost.

The protected Worker resolves the current cart from its signed session; model tools never accept a cart ID. The adapter signs session claims locally with `X-Armans-Session`, sends the service bearer only in server-side headers, and cannot give the model authority to choose another session.

## Model context boundary

Full sanitized merchant responses remain in the evidence. The model view explicitly limits catalog variants to two per search/lookup product and 16 per detailed product, labelling omitted variants and requiring a selected-product read before choosing an omitted ID. Older catalog observations in a turn become labelled product references; the current result retains descriptions. The actual latest search query and returned cursor persist across shopper turns. This controlled projection is another reason the harness must not be called execution-equivalent to the hosted Agent. The complete resulting prompt still must pass the 23,000-byte guard; a larger prompt stops before billing and is never silently sent.

The optional `private_cart_inspection_secret` enables S21 through the separate evaluation-only loopback Worker entry and `dev/private-cart-inspector.mjs`; it is never added to production configuration. The trusted inspector verifies cart revision and supplies a private capability only to companion checks. Without it S21 is BLOCKED. Current-cart cleanup fails closed on read, cancellation or verification errors, including 429/auth/timeouts; a failed cleanup stops the suite and preserves the evidence for operator recovery.
