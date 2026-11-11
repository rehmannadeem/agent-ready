# Scheduled critical evaluation: 11 November 2026, 19:15 PKT

This is an execution handoff, not evidence of a completed run. The owner authorizes exactly twelve first attempts: S05 repetitions 1–3, S19 repetitions 1–3, S20 repetitions 1–3, S21 repetitions 1–3. The other 63 cases are out of scope and must remain NOT_RUN. Stop at Gate 6; no merge, shipping, production deployment, authentication changes, load tests, or old-cart verification requests.

## Fixed boundaries

- Earliest store or model request: **2026-11-11T14:15:00.000Z = 19:15 PKT**. `evals/launch-policy.mjs` and the private connector driver enforce the hard date. Do not bypass either guard, backdate a clock, or launch a waiting process early.
- Five model iterations per turn; 10,000 ms minimum between ordinary AND companion Worker requests, including scenario preparation and cleanup. No increase, automatic retries, or paid reruns.
- Shared ledger run ID `scale_20261110_owner_approved_v1`; authorized USD 10 ceiling, funded USD 1.90 ceiling. Historical smoke execution 592 already cost USD 0.0000141 (51 input / 18 output tokens). Preserve that ledger; never reset, relocate, or increase its allowance.
- Six earlier load carts: **cancellation acknowledged, absence unconfirmed; carts expire**. Expiry has not been verified. Their normal expiry is expected eventually but has **not been observed**. The owner removed verified absence as a prerequisite. Do not check these carts again and do not change their status to absent/expired.
- Any live provider 429 / RATE_LIMITED suspends the run immediately, with current case BLOCKED, untouched cases NOT_RUN, pending cleanup/restoration explicit. Persisted suspension refuses restart even after Retry-After expires. Do not automatically retry or start another case.
- Human transcript review is still required; mechanical successes remain PENDING_REVIEW.

## Device and files

Use Remote Desktop Commander device `geo`, ID `ec67bb61-d619-4327-9468-237511f11d83`.

Windows working directory:

`G:\Projects\Armans-AgentReady-Scale-20261110\source-704057a\agent-ready-704057a78efc2c093e3631d5c569f340ddf0b388\live-workbench`

Private directory:

`G:\Projects\Armans-AgentReady-Scale-20261110\private`

The private directory contains `start-suite-once.mjs`, `connector-driver.source.js`, `connector-io.mjs`, `eval-driver-gates.json`, `eval-config.json`, `eval-approval.json`, `eval-budget.json`, and `owned-manifest.local.json`. Do not print credential-bearing configuration files. Inspect values inside a local script and output only selected nonsecret fields. Prompt/result spool files also stay private. No credential changes are needed.

Final execution source: the GitHub commit containing this runbook; its exact SHA is also recorded in the private `eval-driver-gates.json.source_checkpoint` and scheduled task prompt.

The root coordinator updates `eval-driver-gates.json.source_checkpoint` after committing this preparation. The launcher records that checkpoint. Expected gates are owner authorization, acknowledged load finding, acknowledged earlier cancellations, scope `critical_12_only`, exact four scenario IDs, hard not-before date, and `automatic_resume:false`. There is deliberately **no cart-absence or load-pass prerequisite**.

## Scheduled execution steps

1. Check UTC time and connected-device availability using metadata/local commands. If before 14:15 UTC, stop without store/model requests. If the authorized computer or tools are unavailable, report blocked; do not create another timer or substitute a different account. This runbook itself creates no automation.
2. Read the safe local status, not secret configuration:

   ```powershell
   Set-Location 'G:\Projects\Armans-AgentReady-Scale-20261110\source-704057a\agent-ready-704057a78efc2c093e3631d5c569f340ddf0b388\live-workbench'
   node evals/status.mjs 'G:\Projects\Armans-AgentReady-Scale-20261110\private\eval-approval.json' 'G:\Projects\Armans-AgentReady-Scale-20261110\private\eval-results'
   ```

   Confirm no unresolved reservations or ledger halt. Confirm `suite-dispatched.json` and `eval-results\results.json` are absent. If either exists, **do not invoke the launcher again**; inspect safe status and continue only the existing driver for an active, unsuspended process. Never delete these files to force another attempt.
3. Inspect n8n helper `McTDlGb8oc3hZ5gl` with `get_workflow_details` before execution. Expected inactive/manual-only workflow, version `55919eaf-7b14-468e-8402-9c783f2787f3`, trigger `Evaluation input`, one native model node `One Haiku invocation`, model `claude-haiku-5-5`, maximum output 2000 tokens, retry count one. Use existing n8n connector access; do not publish the workflow or configure an external webhook. Stop on unexpected helper changes.
4. After the hard time and checks, start exactly once:

   ```powershell
   node 'G:\Projects\Armans-AgentReady-Scale-20261110\private\start-suite-once.mjs'
   ```

   The launcher validates the ledger and 10-second configuration, creates the exclusive durable dispatch marker, then runs `evals/run.mjs` with BOTH `--only S05,S19,S20,S21` and `--priority S05,S19,S20,S21`. It writes private stdout/stderr and PID. It does not execute a load test or any old-cart read. The adapter's ordinary health check and scenario requests occur only after this launch.
5. Drive the existing private model spool continuously through the tool host. `connector-driver.source.js` is JavaScript for **functions.exec with tools available**, not a Windows Node program. Read that nonsecret source with Remote Desktop Commander, strip its read-file wrapper, store the exact source, then evaluate it with a short awaited batch such as `runArmansConnectorBatch(3)`. Never print private request bodies or full model execution data. The driver itself:
   - Runs `connector-io.mjs next` remotely to claim one queued request.
   - Dispatches `n8n.execute_workflow` once, manual mode, `Evaluation input`, `inputs.webhookData.method='POST'`, body from that queued request.
   - Persists the returned execution ID immediately with `connector-io.mjs started` before polling.
   - Polls that same ID and reads only the native `One Haiku invocation` result. It projects exact raw usage and model text, never n8n authentication/execution context.
   - Writes the projected response with `connector-io.mjs complete`. The harness settles the reservation from real usage, then decides whether to continue.
   - Refuses ambiguous dispatches, malformed/missing usage, retries, changed model, or multiple native calls. Do not work around these stops.

   In functions.exec, after loading the exact trusted source into a variable `source`, an execution pattern is `text(await eval(source + '\nrunArmansConnectorBatch(3)'))`. Use `functions.wait` only if functions.exec returns a running cell. Batches may notify safe execution IDs and token counts. Keep user/parent progress updates roughly each minute.
6. Between batches, run the safe status command. Keep gaps below the spool's 120-second model-response deadline once a model request exists. Early S05 preparation includes many paced exclusion checks and can legitimately take several minutes before the first request. An idle spool is not proof the suite finished: inspect the recorded process and selected summary, then continue monitoring without model retries. No more than 60-second blocking waits.
7. Stop when all twelve selected slots are terminal, the process exits, a provider suspension occurs, or a budget/unknown-outcome guard trips. A 429 must not trigger a new timed resume. If dispatch outcome is unknown, preserve its reservation and claim; do not pay for another invocation. If a process crashes, report interrupted/blocked rather than relaunching first attempts.
8. Save sanitized evidence and report at Gate 6: **selected denominator 12**, counts for selected statuses, untouched out-of-scope 63, actual execution IDs/input/output/cost and unresolved reservations, exact provider error/Retry-After, cleanup status, and owner review pending. Keep historical load findings separate. No PASSED claim without review.

## Evidence and recovery

`eval-results\results.json` retains the 75-slot historical schema, but `execution_scope.authorized_attempts` and `selected_summary.authorized_attempts` must be **12**, with 63 excluded. `evals/status.mjs` displays selected counts separately. The historical smoke remains in total ledger cost and is not a thirteenth scenario.

A suspended run retains a private `suspended-session.local.json` and explicit pending-cleanup indicators. Do not claim cleanup succeeded, run immediate recovery requests, or remove `results.suspension`. Controller restoration journals remain private. These critical cases do not include stock/price/publication/discount simulation hooks; do not run unrelated simulations or seed writes. Any future expanded run would need its own scope decision; UI location attestation expires 2026-11-11T16:50:00Z and must not be silently refreshed.

The planned n8n connector driver operates only while the scheduled agent invocation remains active. There is no independent Windows model daemon or local delayed launch. If the scheduled environment cannot maintain the driver, report that limitation before dispatch; do not leave a paid pending request unattended.

## Loading the driver in a fresh scheduled tool context

No functions store or earlier agent memory is required. Discover `remote_desktop_commander_read_file`, `start_process`, `read_process_output`, and n8n `get_workflow_details`, `execute_workflow`, `get_workflow_execution` by filtering `ALL_TOOLS` names; read their returned tool schemas. They are available on `tools` in functions.exec. Load the source directly using `read_file` on the private `connector-driver.source.js` path. The tool text starts with `[Reading ...]` followed by a blank line: select that content block, then use `text.slice(text.indexOf('\n\n')+2)`; validate it begins `// Tool-host orchestration source` and contains the hard14:15UTC guard. Keep source in `store('criticalDriverSource', source)` for this invocation, then each batch uses `await eval(load('criticalDriverSource') + '\nrunArmansConnectorBatch(3)')`. Do not emit the source or model prompts. If the tool wrapper differs, inspect only the nonsecret source header and adapt the wrapper parsing, never truncate code silently. Re-reading this same private source is safe if context is lost.

The native driver uses the current connector schemas: `execute_workflow({workflowId:'McTDlGb8oc3hZ5gl',executionMode:'manual',triggerNodeName:'Evaluation input',inputs:{webhookData:{method:'POST',body:queuedBody}}})`; returns an executionId which must be persisted before any poll. `get_workflow_execution` first uses `includeData:false`, then only `nodeNames:['One Haiku invocation'],includeData:true,truncateData:1` when successful. The driver already implements projection/persistence and must not be replaced with raw execution export. A claimed request with no execution ID is ambiguous: stop without a duplicate dispatch.
