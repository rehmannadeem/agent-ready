# Gate 6 evaluation report

**Terminal update: 12 November 2026 · HOLD · FOR CLAUDE REVIEW**

This section is the authoritative final record for the bounded 24-slot continuation. It supersedes the earlier cooldown handoff. Historical evidence remains in the branch, but no earlier “final” statement should be read as the outcome of this continuation.

## Scope and controls

- Repository: `rehmannadeem/agent-ready`
- Branch: `feat/realistic-catalogue-20261110`
- Draft PR: [#2](https://github.com/rehmannadeem/agent-ready/pull/2)
- Tested source: `3511e2ce48dd25e88018a6809e4941f1d249f95a`
- Handoff commit: `da56f06f48de0da677cf2d15601f42af01c20306`
- Offline baseline: 206 tests passed before the continuation
- Authorized slots: S05 ×3 plus S01–S18 and S22–S25 once each; S19–S21 excluded
- S05:1 and S05:2 were preserved and never repeated
- n8n helper stayed inactive and unchanged at version `55919eaf-7b14-468e-8402-9c783f2787f3`, with one Haiku 5.5 invocation, 2,000-token maximum and no retry
- Canonical ledger `scale_20261110_owner_approved_v1`; funded stop USD 1.90; owner ceiling USD 10
- Ten-second pacing and five-iteration evaluator behavior were retained

No merge, deployment, hosted-chat integration, workflow creation/modification, production change, credential change, order, payment, outreach or email occurred.

## Final result

| Mechanical status | Count |
|---|---:|
| PENDING_REVIEW | 16 |
| FAILED | 5 |
| BLOCKED | 2 |
| NOT_RUN | 1 |
| Total | 24 |

`PENDING_REVIEW` means the automated mechanical checks cleared. It is not a human-accepted pass. All 16 conversations still require human review.

| Slot | Status | Calls settled | Known USD | Mechanical reason |
|---|---|---:|---:|---|
| S05:1 | PENDING_REVIEW | 6/6 | 0.0049368 | 78 mechanical checks clear; human transcript review pending |
| S05:2 | BLOCKED | 0/0 | 0.0000000 | PROVIDER_RATE_LIMITED |
| S05:3 | FAILED | 0/0 | 0.0000000 | EXCLUSION_COMPANION_FAILED:excluded-12:search_hides_fixture |
| S01 | PENDING_REVIEW | 2/2 | 0.0015681 | 7 mechanical checks clear; human transcript review pending |
| S02 | PENDING_REVIEW | 6/6 | 0.0042330 | 5 mechanical checks clear; human transcript review pending |
| S03 | PENDING_REVIEW | 3/3 | 0.0018617 | 5 mechanical checks clear; human transcript review pending |
| S04 | PENDING_REVIEW | 2/2 | 0.0013074 | 5 mechanical checks clear; human transcript review pending |
| S06 | PENDING_REVIEW | 5/5 | 0.0040559 | 5 mechanical checks clear; human transcript review pending |
| S07 | FAILED | 13/13 | 0.0130717 | three_selected_lines_merchant_total_within_budget |
| S08 | PENDING_REVIEW | 3/3 | 0.0020331 | 6 mechanical checks clear; human transcript review pending |
| S09 | PENDING_REVIEW | 3/3 | 0.0020298 | 6 mechanical checks clear; human transcript review pending |
| S10 | PENDING_REVIEW | 2/2 | 0.0009433 | 5 mechanical checks clear; human transcript review pending |
| S11 | PENDING_REVIEW | 10/10 | 0.0085635 | 8 mechanical checks clear; human transcript review pending |
| S12 | FAILED | 9/9 | 0.0089444 | MODEL_RESPONSE_REJECTED:PROVIDER_STOP_REASON_max_tokens |
| S13 | FAILED | 12/12 | 0.0112257 | no_iteration_exhaustion |
| S14 | PENDING_REVIEW | 5/5 | 0.0040173 | 5 mechanical checks clear; human transcript review pending |
| S15 | PENDING_REVIEW | 8/8 | 0.0067501 | 6 mechanical checks clear; human transcript review pending |
| S16 | FAILED | 6/6 | 0.0040743 | stock_changed_state_observed_without_handoff |
| S17 | PENDING_REVIEW | 7/7 | 0.0047972 | 7 mechanical checks clear; human transcript review pending |
| S18 | PENDING_REVIEW | 7/7 | 0.0044891 | 7 mechanical checks clear; human transcript review pending |
| S22 | PENDING_REVIEW | 2/2 | 0.0007869 | 6 mechanical checks clear; human transcript review pending |
| S23 | PENDING_REVIEW | 2/2 | 0.0015417 | 6 mechanical checks clear; human transcript review pending |
| S24 | BLOCKED | 6/5 | 0.0030641 | MODEL_USAGE_UNKNOWN |
| S25 | NOT_RUN | 0/0 | 0.0000000 | Not dispatched after terminal halt |

### Material findings

1. **S05:2** remains the original provider-rate-limit block. It received zero model calls and was not repeated.
2. **S05:3** failed before a model call because the exclusion companion did not hide the fixture in search.
3. **S07** failed `three_selected_lines_merchant_total_within_budget`.
4. **S12** failed when the provider stopped at the authorized 2,000-token maximum.
5. **S13** failed `no_iteration_exhaustion`.
6. **S16** failed `stock_changed_state_observed_without_handoff`.
7. **S24** is blocked with `MODEL_USAGE_UNKNOWN`. n8n execution 779 succeeded, but the local dispatcher could not confirm usage persistence. The evaluator halted with `UNRESOLVED_USAGE` and did not replay the call.
8. **S25** was never dispatched because continuing after S24 could have replayed an ambiguous paid call.
9. No slot is labelled “not run: anonymous access limit”; that was not the terminal cause in this continuation.

## Provider suspension and recovery

The earlier HTTP 429 was observed at `2026-11-11T19:18:58.003Z`. The recorded Retry-After was 2,463 seconds, followed by the required 900-second buffer. Recovery occurred at `2026-11-11T20:16:40.937Z`, after the durable eligibility timestamp. No later HTTP 429 occurred.

A transient remote-I/O failure before execution 716 was reconciled against n8n: no new execution existed, so the persisted request was safely serviced once. At the final I/O failure, execution 779 already existed and had succeeded. The local guard correctly refused a retry with `DISPATCH_STATE_UNKNOWN_NO_RETRY`.

## Cost and cleanup

| Accounting | Final recorded value |
|---|---:|
| Canonical calls | 188 total; 187 settled |
| Known canonical tokens | 841,135 input / 87,517 output |
| Known settled canonical cost | USD 0.127872 |
| Unresolved reserved amount | USD 0.0034 |
| Follow-up ledger | 119 calls; 118 settled |
| Follow-up known tokens | 596,236 input / 69,343 output |
| Follow-up known settled cost | USD 0.0942951 |
| Funded stop | USD 1.90, unchanged |
| Owner ceiling | USD 10, unchanged |

The USD 0.0034 reservation remains unresolved and is not counted as settled cost. No ledger reset, purchase or cap increase occurred.

Cleanup finished safely: **23 sessions verified, 0 pending, 0 unknown and 0 controller cases**. The evaluator is inactive. The final halt is `UNRESOLVED_USAGE`.

## Human review and release status

The nine previously exported redacted transcripts remain preserved, as do the exact S05 reply and the Worker/n8n rollback plan. This continuation did not modify or replace them.

- [Sanitized terminal evidence](evidence/gate6-finish-suspended.json)
- [Redacted transcripts](evidence/transcripts/)
- [Worker and hosted-chat release plan](WORKER-AND-HOSTED-CHAT-RELEASE-PLAN.md)
- [Client scorecard](../SCORECARD.md)

**Decision: HOLD at Gate 6.** PR #2 may be reviewed, but it must not be merged or deployed. Human review is required for the 16 mechanically clear conversations. Any recovery of S24 usage or execution of S25 requires separate authorization and a safe reconciliation procedure.
