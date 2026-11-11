# Final evaluation and delivery handoff

Latest owner instruction: continue without asking for intermediate approval. This handoff supersedes older critical-only stop instructions. It does not authorize merging or deployment.

## Execution scope and clock

Start no earlier than 11 November 2026, 19:15 Asia/Karachi (14:15 UTC). The execution runbook is [EVALUATION-33-CONTINUATION-RUNBOOK.md](EVALUATION-33-CONTINUATION-RUNBOOK.md). Run S05, S19, S20, S21 three times each, then each of the other 21 scenario IDs once: **33 selected attempt slots**, not 75. Preserve five iterations per conversation turn and ten-second pacing. Preserve the canonical ledger including prior smoke cost, USD10 owner cap and existing USD1.90 funded stop. No purchases or new credentials.

The scheduled task wakes hourly to continue authorized work. A wake is not permission to send a request: first inspect the durable not-before time, deadline, singleton/lease, active process, ledger and pending recovery. If a prior invocation is active, do not create a second driver or launcher. If the tool environment cannot sustain the driver, stop before reserving/dispatching a model call.

On a live429, stop calls and persist its observation time and Retry-After. No request may resume before that full delay **plus900seconds**. An hourly wake may be later than this minimum. Preserve blocked attempts, tokens and errors; continue untouched slots only after safe recovery. Never repeat a paid attempt, blindly retry an ambiguous mutation, clear an unknown reservation, or delete a suspension/dispatch marker to force progress.

The hard store/model request cutoff is **12 November 2026,18:00 PKT =13:00 UTC**. At or after it, do not make live store/model requests, even for cleanup. Preserve pending cleanup/restoration as a limitation. If anonymous throttling prevents remaining selected slots, use exactly **not run: anonymous access limit** for their reason. Do not use that reason for a different blocker (offline device, expired attestation, budget, unknown mutation); state the actual cause. Finish documentation and PR work even when tests remain blocked. The last hourly wake may finalize after the cutoff but cannot make store requests.

The six old load carts remain **cancellation acknowledged, absence unconfirmed; carts expire**. Expiry is not independently verified. They are not prerequisites and must not be read or cancelled again. No further load test, authentication implementation, customer/order access, payment, production source deployment or shared SupportOps change.

## Evidence and documents

After all33 slots terminate or the cutoff prevents continuation, reconcile actual model usage and preserve any unresolved reservation. Save sanitized evidence without secrets, raw private prompts, cart identifiers/checkout URLs or customer data. Keep all original failed load/evaluation attempts. Separate the33 selected summary from the42 excluded repetitions in the75-slot historical schema. Mechanical successes remain pending human transcript review.

Rewrite [../SCORECARD.md](../SCORECARD.md) as a one-page plain-English client review, about400words: business outcome, actual tested scope/results, costs, unresolved limits and decision needed. Replace pending placeholders only with observed evidence. Preserve authenticated UCP agent access as a production requirement **not built**, development-store/synthetic-data distinction, unproven production/payment/customer behavior, historical load findings and pending cleanup. Update RELEASE.json and the technical Gate6 report consistently.

Finish [../LEARN.md](../LEARN.md) for a beginner: meaningful Mermaid diagram, glossary, real product example, sessions/scopes/credentials, UCP vs Admin authentication,429/backoff, token costs, test evidence versus claims, and how to interpret the scorecard. Keep explanations consistent with final results. Public-source research is [UCP-AUTH-RESEARCH.md](UCP-AUTH-RESEARCH.md); no authentication changes are authorized.

## Exactly one final pull request

Repository: rehmannadeem/agent-ready. Existing work branch: feat/realistic-catalogue-20261110. Base: main. PR1 is currently open on the older feat/live-shopify-workbench-20261109 branch; it must stay unmerged.

Before creating anything, query current PR metadata and search for an existing PR whose head is the work branch and base is main. If a final PR already exists, update that same PR; do not create a duplicate. Otherwise open one review PR to main from the work branch after final evidence is committed. A draft is appropriate if acceptance remains blocked. Do not claim tests passed unless their evidence exists. Describe the problem, implemented behavior, selected33 results, spending, authenticated-access requirement and unresolved risks. Link SCORECARD.md and LEARN.md.

Once the final PR exists, update PR1 title/body to clearly say **Superseded by PR #N** with the actual final PR link, preserving its historical description; close PR1 as superseded, never merge it. This metadata change is authorized by the owner. Do not send Slack/email/outreach or request unrelated reviewers.

Verify the final PR is open, targets main, has the intended head, and has not merged. Verify PR1 is closed/unmerged with the superseding link. Do not enable auto-merge. Do not merge, deploy, release, or publish a site. Report the final PR link and concrete results, then ask the owner before any merge/deployment. If evidence is blocked, explain that a safe approval decision may be to hold.

Disable the continuation automation once final delivery is recorded. No further execution is authorized by an old recurring wake. If remote access prevents completing a step, report that specific limitation; do not invent a result or leave ambiguous paid requests unattended.
