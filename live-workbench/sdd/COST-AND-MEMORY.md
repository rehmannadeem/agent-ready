# Stage 2 research — model cost, memory and session requirements

Checked: **10 November 2026 (Asia/Karachi)**. Scope: specification only; stop at Gate 2.
No workflow, credential, store, deployment or billing setting was changed. No model evaluation or load test was run. Incremental evaluation-model spend in this research: **USD 0**.

## Decision summary

The conservative expanded-suite estimate is **USD 12.73 at Anthropic's direct API rates**, including 30% contingency. This exceeds the brief's USD 10 threshold. **Do not run the full evaluation suite under the current budget.**
Actual n8n Gateway rates and the credit-to-USD conversion remain **unverified**. Direct-provider pricing is a benchmark, not the confirmed n8n charge. Gate 2 must record this blocker and an owner decision; approval of specification alone must not be treated as permission for unbounded model spending.

## Current runtime facts — read-only n8n inspection

Workflow: `lt6LYUdhwOpq2Wzi`, Agent-Ready Shopping Assistant.
Published version and current draft: `574ae801-34c9-446b-ac39-9c5223fcf893`; active; published graph matches draft.

| Setting | Observed value | Specification implication |
|---|---|---|
| Model | Anthropic `claude-haiku-5-5`, node version 1.6 | Estimate this exact model; do not substitute a different Haiku rate. |
| Output limit | `maxTokensToSample: 2000` | Budget every model invocation, including intermediate tool reasoning/output. Validate billed token usage later. |
| Agent loop | `maxIterations: 5` | Five model iterations per shopper turn, not five total conversation turns. |
| Memory | Simple Memory 1.4; `sessionIdType: fromInput`; `contextWindowLength: 8` | n8n describes this setting as previous interactions, not simply eight raw messages. |
| Chat access | n8n user authentication and execute permission required; `includeUserInOutput: false` | The Worker does not automatically receive a trusted authenticated user identity. |
| MCP connection | Worker `/api/mcp`; HTTP Streamable; `authentication: none`; tool include mode `all` | Must authenticate and explicitly restrict tools before scale tests. |
| Timeout | Workflow 120 seconds; MCP tool 25 seconds | Record timeout failures; do not silently repeat cart mutations. |
| Retention | Successful executions `none`; errors `all`; manual executions saved; intermediate steps enabled | Stage 6 needs a deliberate sanitized evidence path; successful hosted runs may leave no retrievable trace. |

No credential values or billing account details were read. The model node configuration alone does not establish the applicable Gateway tariff or available balance.

## Verified pricing and unverified billing

Official Anthropic pricing, checked on the date above:

| Haiku 5.5 prompt size | Input / million tokens | Output / million tokens |
|---|---:|---:|
| At most 100,000 input tokens | USD 0.10 | USD 0.50 |
| Above 100,000 input tokens | USD 0.50 | USD 2.50 |

Source: [Claude Haiku 5.5 model documentation](https://platform.claude.com/docs/en/models/haiku-5-5/overview), pricing section. The estimate below assumes no cache or batch discount. Cached inputs still count toward the prompt-length pricing threshold. Source: [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing).

n8n states that Gateway requests are charged at its own service-pricing page. Its balance is shared across the instance; it is separate from Assistant credits. In-flight requests can finish when the balance runs out, so an empty balance is not a strict spending cap. Sources: [official Gateway documentation](https://github.com/n8n-io/n8n-docs/blob/main/docs/deploy/use-n8n-cloud/gateway-credits/README.md), [spend tracking](https://github.com/n8n-io/n8n-docs/blob/main/docs/deploy/use-n8n-cloud/gateway-credits/track-gateway-credit-spend.md).

The linked [n8n service pricing page](https://app.n8n.cloud/service-pricing) returned no readable rate table in this research. Therefore: Haiku Gateway input/output prices, any markup, currency/conversion, available balance and auto-top-up state are **not verified**. Do not assume one credit equals one dollar or that Gateway pricing equals Anthropic API pricing. Read the signed-in pricing/balance display before paid evaluation, without displaying secrets or changing settings.

## Conservative suite calculation — proposed envelope, not measurements

The 25 scenarios repeated three times create **75 scenario conversations**, but multi-turn conversations and agent loops make many more model calls.

| Component | Conversations | Shopper turns per conversation | Total shopper turns |
|---|---:|---:|---:|
| S01–S23 and S25 | 24 × 3 = 72 | Up to 4, including clarification and verification | 288 |
| S24 long conversation | 3 | Exactly 24 for this estimate | 72 |
| Total | 75 | — | **360** |

Proposed expanded loop allowance: at most **8 model calls per turn**. Several searches, variant lookup, multiple cart edits, refresh and a final answer can exhaust the existing five-iteration setting. Eight is a proposed ceiling, not a guaranteed requirement or an implemented change. If a scenario needs more than four turns, or S24 needs more than 24, revise the calculation before running it.

Proposed maximum serialized input: **24,000 tokens per model request**, counting system prompt, tool schemas, retained chat, current tool observations and intermediate steps. Proposed output limit remains 2,000 tokens. These caps are **not implemented or proved today**; a later harness must measure/enforce them or stop. Do not drop merchant warnings or authorization state to fit a cap. Use compact tool results and separate authoritative cart state.

| Calculation | Five-iteration comparison | Expanded eight-iteration envelope |
|---|---:|---:|
| Model requests | 360 × 5 = 1,800 | 360 × 8 = 2,880 |
| Input tokens | 43,200,000 | 69,120,000 |
| Output tokens | 3,600,000 | 5,760,000 |
| Input cost at USD 0.10/M | 4.3200 | 6.9120 |
| Output cost at USD 0.50/M | 1.8000 | 2.8800 |
| Base direct-provider estimate | **6.1200** | **9.7920** |
| 30% contingency | 1.8360 | 2.9376 |
| Planning total | **USD 7.96** | **USD 12.73** |

Expanded per-conversation benchmark: ordinary four-turn run USD 0.1088 before contingency; one 24-turn S24 run USD 0.6528. Formula: `(input_tokens × input_rate + output_tokens × output_rate) / 1,000,000`. Replace the rates with verified Gateway rates before approving a run. If all requests instead cross the 100k threshold, the listed provider rates are five times higher; that is outside the proposed envelope and must stop the run.

The 30% reserve covers estimation error and explicitly approved reruns; it does not authorize automatic mutation retries. No model-as-judge calls are budgeted. Use deterministic assertions and human review of sanitized evidence. Deterministic tests and the 20-session API load test should call no LLM; Shopify, Cloudflare and n8n platform usage can still have separate quotas or charges. Existing subscription charges, tax, foreign-exchange effects and infrastructure costs are not included in the model-token estimate.

## Memory 8 → 20: justification and computable cost impact

The [Simple Memory documentation](https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.memorybufferwindow/) defines the window as prior interactions and warns against this memory in queue mode. Propose **20 interactions**, subject to measured serialized token size and the 24k request cap. This improves continuity for recent comparisons and selections; it cannot guarantee recall of the start of a conversation longer than 20 interactions.

Planning assumption: one retained shopper/assistant interaction averages **600 tokens**; this is a sizing assumption, not a measured tokenizer result. A fully populated 20-interaction window adds `(20 − 8) × 600 = 7,200` input tokens per model call. At the verified short-prompt provider rate this is USD 0.00072 per call. A deliberately loose upper bound across all 2,880 calls is 20.736M additional input tokens, USD 2.0736 before contingency. **Do not add this again to the suite table:** its 24k input allowance already includes memory.

For the actual 24-turn S24 shape, assuming history is loaded before each turn and eight model calls use the same retained interaction window: `sum(t=1..24, min(t−1,20) − min(t−1,8)) = 114`. Across three repetitions, the increase is `114 × 600 × 8 × 3 = 1,641,600` input tokens, about **USD 0.1642** before contingency at direct short-prompt rates. Current tool traces can increase this; measure provider-reported input usage later.

S24 must validate a server-held current cart and structured selections, not rely solely on the model remembering a cart ID. At turn 24, early interactions have left a 20-interaction window. Persist canonical cart ownership/state separately; re-read Shopify for mutable stock, price and totals. Confirm the n8n deployment mode before selecting long-term memory storage. No new database or memory service is authorized at Gate 2.

## USD 10 stop rule and owner decision

1. **Before evaluation:** verify actual Gateway rates/conversion and billing route; record remaining balance without secrets. Recalculate all planned calls, repeated inputs, output/thinking tokens, reserved retries and contingency. If rates cannot be verified, remain blocked. Do not switch credentials, buy credits or enable auto top-up.
2. **At Gate 2:** report the current conservative USD 12.73 direct-provider estimate. Recommend preserving the USD 10 ceiling initially, refining the exact turn/call budget and reducing unnecessary calls while retaining all 75 scenario conversations. If the bounded revised plan still exceeds USD 10, obtain an explicit higher spend limit before evaluation. Do not reduce repetitions silently or report incomplete coverage as a pass.
3. **During a later authorized run:** record per-call usage and per-scenario USD using the actual billing rates. Include billed thinking/cache categories where applicable; do not count only visible response text. Reserve the worst-case cost of the next complete turn before starting it.
4. Run model evaluation sequentially for budget control. Stop before `confirmed_spend + unresolved_in_flight_reserve + next_turn_worst_case` exceeds the approved cap. Pause for owner review at USD 8 accumulated/reserved spend, or earlier if projected completion exceeds USD 10. If usage accounting is missing or stale, stop instead of assuming zero.
5. Any retry requires its own budget reservation. No automatic repeat of cart creation or mutation on timeout. If budget stops the suite, mark remaining scenarios **NOT RUN** and preserve the denominator; do not fabricate a 75-run pass rate.

## Security requirements that must precede scale evaluation

These are Stage 2 requirements for a later design, not implemented controls:

- Keep the shared Worker bearer secret in the server-side n8n credential and Cloudflare secret binding. **Never deliver it to dashboard JavaScript, HTML, localStorage, chat output or downloadable evidence.** A static browser cannot safely hold a shared service secret; use an authenticated server-side route for browser actions or disable those actions until that route exists.
- Service authentication identifies the calling service, not the individual shopper. Require a trusted authenticated principal plus a server-issued conversation/session identity. Do not trust a model-selected `session_id`, a user-pasted cart ID or arbitrary `X-Session-Id` header. Current `fromInput` memory keys and chat sign-in alone do not prove Worker-side ownership.
- Require an authenticated, integrity-protected handoff of session identity from the chat/backend to the Worker. Bind every created cart to that identity in server-side state. Reject cross-session read, update and cancellation before Shopify is called. Persist the mapping across Worker instances; do not rely on module globals or LLM memory. Failure to resolve trusted identity must fail closed.
- Apply per-authenticated-session limits plus a service-wide ceiling; account for concurrent requests atomically. Synthetic test sessions must be unique and isolated. Keep bearer secrets, raw session tokens, cart capability keys and authorization headers out of logs; log redacted correlation IDs, operation, timing and outcome.
- The chosen browser authentication and trusted session propagation method remains a **design decision required after Gate 2**. Merely adding the same bearer token to every request does not solve S21.

Sources informing these requirements: [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) (server-side session meaning, token handling, expiry), [Cloudflare service tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/) (service authentication), [n8n Tools Agent](https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.agent/tools-agent/) (iterations and intermediate steps). The specific separation of service identity, shopper identity and cart ownership above is our design inference for this application.

## Gate status

**Stages 1–2 research only. STOP at Gate 2.** Runtime unchanged. Outstanding decisions: actual billing tariff/conversion; acceptable evaluation budget or bounded revised envelope; approved session identity approach in the later architecture; and owner approval before any store write, new credential, permissions change, implementation or evaluation execution.
