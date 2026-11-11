# Armans.AI shopping assistant — Gate 6 scorecard

**12 November 2026 · Gate 6 evaluation ended · HOLD · FOR CLAUDE REVIEW**

This is the final record for the authorized 24-slot continuation. It did not start a new run, did not repeat either earlier S05 attempt, and stopped at Gate 6. No merge, deployment, hosted-chat integration, production change, order, payment, outreach or email occurred.

| Final mechanical status | Count |
|---|---:|
| Cleared mechanical checks; human review still required | 16 |
| Failed mechanical checks | 5 |
| Blocked | 2 |
| Not run | 1 |
| Total authorized continuation slots | 24 |

The 16 mechanically clear slots are: S05:1, S01, S02, S03, S04, S06, S08, S09, S10, S11, S14, S15, S17, S18, S22, S23. They are **not accepted passes** until their conversations receive human review.

## Failed, blocked and not run

| Slot | Outcome | Plain-English reason |
|---|---|---|
| S05:3 | Failed | EXCLUSION_COMPANION_FAILED:excluded-12:search_hides_fixture |
| S07 | Failed | three_selected_lines_merchant_total_within_budget |
| S12 | Failed | MODEL_RESPONSE_REJECTED:PROVIDER_STOP_REASON_max_tokens |
| S13 | Failed | no_iteration_exhaustion |
| S16 | Failed | stock_changed_state_observed_without_handoff |
| S05:2 | Blocked | PROVIDER_RATE_LIMITED |
| S24 | Blocked | MODEL_USAGE_UNKNOWN |
| S25 | Not run | Stopped after unresolved model-usage persistence in S24; this slot was never dispatched. |

S05:2 remains the original provider-rate-limit block from before this continuation and was not repeated. S05:3 failed its exclusion companion before a model call. S24 stopped after n8n execution 779 succeeded but the local dispatcher could not confirm usage persistence; the evaluator correctly halted with `UNRESOLVED_USAGE`. S25 was left untouched because continuing could have replayed an ambiguous paid call.

## Cost and cleanup

| Accounting | Final recorded value |
|---|---:|
| Canonical calls | 188 total; 187 settled |
| Known canonical tokens | 841,135 input / 87,517 output |
| Known settled canonical cost | USD 0.127872 |
| Unresolved reserved amount | USD 0.0034 |
| Follow-up ledger | 119 calls; 118 settled; USD 0.0942951 known settled |
| Funded stop | USD 1.90, unchanged |
| Owner ceiling | USD 10, unchanged |
| Cleanup | 23 of 23 sessions verified; 0 pending; 0 unknown |

The unresolved amount is not reported as settled cost. No credit reset, purchase or cap increase occurred.

## Decision

**HOLD at Gate 6.** The candidate is not approved for merge, release or deployment. Claude should review the 16 mechanically clear transcripts and the five mechanical failures. A separately authorized recovery is required before S24 usage can be reconciled or S25 can run. PR #2 is ready for Nadeem’s review of this evidence only; readiness is not approval to merge or deploy.

[Technical Gate 6 report](GATE-6-REPORT.md) · [Sanitized continuation evidence](evidence/gate6-finish-suspended.json) · [Beginner guide](../LEARN.md)
