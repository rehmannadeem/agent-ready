# Bounded 33-attempt evaluation continuation

This supersedes the critical-only execution handoff. Use the final source checkpoint pinned in the scheduled task and private `eval-driver-gates.json`. This document is execution guidance, not proof of completed evaluation. Follow `FINAL-DELIVERY-RUNBOOK.md` for the owner's separate final delivery/PR instructions.

## Authorized scope and stop rules

- First S05, S19, S20, S21, each repetitions 1–3 (12 attempts). Then the other 21 scenario IDs, repetition 1 only. **33 selected slots; 42 other slots remain NOT_RUN/out of scope.** Exact immutable selection is `AUTHORIZED_SLOTS` in `evals/launch-policy.mjs`; never run the other repetitions.
- Earliest merchant/model dispatch: **2026-11-11 14:15 UTC = 19:15 PKT**. Cutoff: **2026-11-12 13:00 UTC = 18:00 PKT**. No new merchant/model dispatch at/after cutoff; offline finalization and reading existing execution usage are allowed. No local timer or background sleeping launcher is authorized.
- Five model iterations, 10-second pacing shared by ordinary and companion Worker requests. Owner cap USD10, funded cap USD1.90. Keep canonical run `scale_20261110_owner_approved_v1` and `eval-budget.json`; never reset/increase/recreate the ledger. Smoke execution592 (51 input18 output, USD0.0000141) already counts.
- Every live429 immediately suspends all further requests. Resume eligibility is **observed_at + full Retry-After + 900 seconds**, never before the initial time. Hourly wakes may wait longer. Missing/invalid Retry-After means operator reconciliation, not a guessed delay. No paid rerun of the blocked first attempt.
- After an eligible cooldown, recover only the current evaluation's registered sessions/simulations. Verify cleanup/restoration before proceeding to the **next untouched selected slot**. Unknown mutation/dispatch outcomes, stale leases, incomplete journals, or changed fixture state fail closed. Never delete evidence, leases, journals, claims or report rows to force progress.
- Earlier six load carts: **cancellation acknowledged, absence unconfirmed; carts expire**. Expiry has not been observed. Absence is not a gate and no further reads of these carts are authorized. No new load test, authentication implementation, app/scope change, customer/order access, or production deployment.

## Device, paths and existing tools

Device `geo`: `ec67bb61-d619-4327-9468-237511f11d83`.

WORK = `G:\Projects\Armans-AgentReady-Scale-20261110\source-704057a\agent-ready-704057a78efc2c093e3631d5c569f340ddf0b388\live-workbench`

PRIVATE = `G:\Projects\Armans-AgentReady-Scale-20261110\private`

Discover tool schemas from `ALL_TOOLS` for Remote Desktop Commander `read_file`, `start_process`, `read_process_output`, and n8n `get_workflow_details`, `execute_workflow`, `get_workflow_execution`. Tools run through `functions.exec`; no prior functions store or chat memory is needed. Use literal complete paths in actual PowerShell commands. Never print `eval-config.json`, `controller-config.json`, credentials, full model prompts, or full native execution/authentication data.

Private files include `start-suite-once.mjs`, `connector-driver.source.js`, `connector-io.mjs`, `eval-driver-gates.json`, `eval-config.json`, `controller-config.json`, `eval-approval.json`, `eval-budget.json`, `owned-manifest.local.json`; recovery files are `eval-recovery-sessions.json` and `eval-controller-recovery.json`. These are distinct from all old load contexts.

## Each scheduled wake

1. Check UTC time locally. Before14:15Nov11, stop without requests. At/after13:00Nov12, do offline deadline finalization only. Do not build credentials or probe the store while waiting.
2. Acquire a durable orchestration lease before launch, recovery, or driver activity:

   `node "WORK\evals\orchestration-lease.mjs" acquire "PRIVATE\orchestration.lease.json"`

   Continue only on `ACQUIRED`; retain the returned `lease_id` as `LEASE_TOKEN`. `ACTIVE` means another invocation owns execution: report/exit without a second driver. `STALE_REQUIRES_RECONCILIATION`, `BLOCKED_UNKNOWN`, `BUSY_OR_INTERRUPTED` require operator reconciliation: never steal/delete a lease or operation lock. Heartbeat at least once per minute using `heartbeat PATH TOKEN` while monitoring long preparation/recovery. TTL is300seconds. Private connector I/O heartbeats on each operation.
3. Run safe status:

   `node "WORK\evals\status.mjs" "PRIVATE\eval-approval.json" "PRIVATE\eval-results"`

   Check real remaining budget, unresolved reservations and selected33 summary. Do not reset unresolved usage. If reports show missing usage, unknown dispatch or non-rate recovery blocker, preserve and report; do not manufacture success or substitute another model.
4. Verify n8n helper details before first paid dispatch. Workflow `McTDlGb8oc3hZ5gl`, expected version `55919eaf-7b14-468e-8402-9c783f2787f3`, inactive/manual-only, trigger `Evaluation input`, native node `One Haiku invocation`, model `claude-haiku-5-5`, maximum output2000, one native invocation/no retries. Unexpected changes block execution. Do not publish its webhook.
5. Invoke the lease-aware launcher (not an early waiting process):

   `node "PRIVATE\start-suite-once.mjs" LEASE_TOKEN`

   It enforces the hard time/window, exact33 scope/pacing and canonical ledger; detects an active prior evaluator PID; checks persisted cooldown; performs safe recovery only when eligible; and launches `evals/run.mjs` with exact `--slots` and critical-first priority. It preserves the existing75-slot report, first-attempt statuses and ledger. It never creates a second evaluator when an existing PID is active.

   Outcomes: `STARTED` or `ACTIVE_PROCESS` require maintaining this invocation's driver. `WAIT` means release the lease after confirming no evaluator remains and let a later scheduled wake check eligibility. `BLOCKED` means preserve evidence/report the specific blocker. `SELECTED_ATTEMPTS_FINISHED` means all selected slots are terminal, not that all passed. `DEADLINE_FINALIZED` means stop the schedule and prepare final evidence. Launcher/recovery can be a long remote process; collect output via its PID and heartbeat the lease while it runs. An unknown prior launch outcome is never retried automatically.
6. If recovery needs an expired location UI attestation before a simulation, the original attestation expires **2026-11-11T16:50:00Z**. Read the existing two location settings in Shopify Admin, verify against existing IDs, and update only the factual attestation when actually observed. No write_locations or location configuration changes. If UI access/verification is unavailable, record `PREFLIGHT_STOP:LOCATION_ATTESTATION_STALE_OR_FUTURE` accurately; do not call it an anonymous rate limit or backdate evidence.

## Drive the native model spool without duplicates

Read PRIVATE\`connector-driver.source.js` using Remote Desktop Commander. Select the text content starting `[Reading ...]`, strip through its first blank line, validate source begins `// Tool-host orchestration source`, and keep that exact nonsecret code in `store('continuationDriver', source)`. Do not depend on an earlier agent's functions store. Load it again after context loss if needed.

Run short batches in functions.exec: `await eval(load('continuationDriver') + '\nrunArmansConnectorBatch(3, '+JSON.stringify(leaseToken)+')')`. It requires the owned lease token. `functions.wait` is used only if exec returns a running cell. The driver calls `connector-io.mjs` with `--lease TOKEN`; it claims a request once, dispatches n8n once, records execution ID immediately, polls that exact execution, projects native usage/text, and persists the response. A claim without execution ID is ambiguous and never redispatched. Do not bypass a blocked claim or call the helper manually for the same prompt.

n8n call shape is `execute_workflow({workflowId:'McTDlGb8oc3hZ5gl',executionMode:'manual',triggerNodeName:'Evaluation input',inputs:{webhookData:{method:'POST',body:queuedBody}}})`. Poll with `get_workflow_execution` metadata first; on success read only `nodeNames:['One Haiku invocation'],includeData:true,truncateData:1`. The trusted driver already does this. Never export a complete n8n execution. Exact actual input/output tokens settle each reservation, including rejected/length-limited model responses when usage is known.

Keep model spool servicing gaps below its120second deadline. S05 exclusion preparation contains many 10-second-spaced requests and may take over10minutes before the first model request. An idle spool does not mean completion: inspect safe status/PID and keep heartbeating. Report counts/cost roughly each minute. No blocking wait longer than60seconds. At the final cutoff, the driver will not dispatch a new model request; existing execution usage may still be reconciled without new paid execution.

## Recovery, ending a wake and final accounting

The session registry records owner and S21 victim identities before network activity. Recovery refreshes only time claims for the same owner/SID/store. Normal and raw companion mutations record intent; unknown outcomes block another mutation, while an explicitly rejected429 is distinguished from an unknown write. Applied simulation journals restore through ownership/content guards. `applying`/`restoring` with unknown outcomes require reconciliation, never replay. No fallback to old load-session files.

A successful recovery appends suspension/recovery history and marks cleanup verified; the blocked row remains BLOCKED. The next launch selects only NOT_RUN slots. If recovery itself429s, persist its new observed timestamp/Retry-After and wait its full delay+15minutes. A non-rate recovery failure is a specific blocker; do not repeatedly probe it hourly or relabel it as an anonymous limit. Do not remove `recovery_blocker` without verified reconciliation.

Before releasing the lease, ensure no evaluator or paid request is left unattended. When the evaluator has ended and every known model execution has been settled, use `node "WORK\evals\orchestration-lease.mjs" release "PRIVATE\orchestration.lease.json" LEASE_TOKEN`. Never release another owner's lease. If this invocation is interrupted/stale, the next wake must fail closed instead of stealing it.

At cutoff, `resume-evaluation.mjs`/launcher finalizes remaining selected NOT_RUN rows offline. Use the exact reason **not run: anonymous access limit** only when a provider-rate suspension is the actual remaining blocker. Otherwise preserve the actual non-rate blocker/deadline. Forty-two out-of-scope rows remain untouched. Selected summary denominator is33; historical schema denominator75 is not an expectation of75 attempts. Separate terminal mechanical PENDING_REVIEW from human PASSED. Include actual cost/token totals, unresolved reservations, first-attempt failures, cleanup/restoration, stale-attestation or credential limitations, and original load findings. No success claim from tool HTTP200 alone.

## Existing local runtime unavailable

Do not replace the runtime with a fresh environment. Inspect the existing private restart/start helper and its configured command, secret file and persistent Durable Object/state directory before restarting. Reuse the same existing server-secrets and state paths; never regenerate credentials, delete state, reseed, or change the Worker URL to bypass a failure. Check the existing process first to avoid starting a second listener. If the established helper/path cannot be verified, report runtime unavailable and preserve all files. Any local health/store probe still obeys the authorized time/cooldown/deadline. A restart is not permission to retry a model attempt or unknown mutation.
