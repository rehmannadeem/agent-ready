# Worker and hosted chat release plan

**Prepared for owner review. Deployment requires the owner’s explicit “deploy” instruction.** Target is the synthetic Shopify development-store demo. Record the exact reviewed source SHA, evidence and approval before starting.

## Preflight

1. Review the Gate 6 evidence and the nine transcripts. Record each unresolved test and the release decision. A mechanical pass still needs transcript review.
2. Confirm the Cloudflare account, Worker `armans-agent-ready-live`, and the deployment currently serving traffic. Record its version ID and deployment ID. The last recorded baseline is version `1da0a93d-088b-4f40-8885-24629753a0e9`, deployment `d394ec92-a435-48f1-a46a-25d8cd90a17f`. Confirm these again before release. Check that the baseline is eligible for rollback.
3. In n8n, confirm the live workflow ID `lt6LYUdhwOpq2Wzi` and record its currently published version. The last verified version is `574ae801-34c9-446b-ac39-9c5223fcf893`. Export the workflow configuration privately and confirm that the account can restore or republish that revision. Keep credentials in the approved credential store.
4. Prepare a reviewed Worker release configuration with the `SESSION_STATE` Durable Object binding and its appropriate migration history. The repository's current remote configuration lacks that binding. Use `src/worker.mjs` and verify that the evaluation-only inspection endpoint is absent. Confirm the development store, approved runtime scopes, publication setting and secrets. Before any migration, confirm that the old version remains a usable fallback or agree on a tested forward recovery version.
5. Prepare the hosted n8n draft and validate authenticated tool requests in an isolated preview. The candidate Worker requires a service credential and a trusted signed session, and the existing hosted MCP configuration does not supply that combination. Resolve it with a reviewed server-side credential and signing integration. Bind each authenticated chat to its own server-issued session. Keep signing material outside prompts, browser code and tool output. Validate the published workflow’s actual context because the local evaluator uses a different prompt, history and tool-result format.
6. Agree on a cutover window and write down the stop conditions. Use an isolated test chat and synthetic carts. Release stays on hold for missing binding, incompatible authentication, unrestored simulation state or unresolved session-isolation checks.

## Cutover after approval

1. Pause new hosted-chat traffic for the cutover if the existing workflow cannot use both Worker versions. Upload the reviewed Worker build and activate it using the approved configuration. Record the new version and deployment IDs.
2. Check Worker health, the public agent profile, authorization failure on unsigned requests, and authenticated search, detail and cart operations in the development store. Confirm hidden products remain absent and two sessions have distinct cart state. Cancel test carts and verify absence.
3. Publish the reviewed n8n draft only after the Worker checks pass. Record the published version. Use two isolated authenticated hosted-chat sessions to check search, detail, cart ownership and prohibited actions. Review shopper-visible responses and tool outcomes. Restore normal test access once both systems pass their checks.
4. Record the results, source and version IDs in the release evidence. Label the release as a development-store demo. Record any hosted test that could not be verified.

## Rollback

- Trigger rollback on an authentication failure, cart isolation failure, repeated tool errors, failed smoke checks or an unexpected store/configuration mismatch. Pause new hosted chat traffic first.
- Restore the prior n8n revision from Workflow History and publish that restored revision when the matching Worker baseline is ready. If history is unavailable, restore from the saved export with approved credential references. Verify the published revision before re-enabling chat.
- In Cloudflare, roll back the named Worker to the recorded eligible version using the dashboard or `wrangler rollback <prior-version-id>` with the verified account and Worker configuration. If a Durable Object migration or binding change makes that version ineligible, use the reviewed forward recovery build with the compatible binding. Keep chat paused until the Worker and workflow match.
- Verify health, authenticated search, unsigned-request rejection, session isolation and cart cleanup after recovery. Record both active versions and the cause. Code rollback does not undo Shopify fixture changes or Durable Object data. Reconcile any open test sessions and restore only journaled development-store changes through their existing guards.

References: [Cloudflare Worker rollbacks](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/) · [n8n workflow history](https://docs.n8n.io/build/manage-workflows/view-change-history)
