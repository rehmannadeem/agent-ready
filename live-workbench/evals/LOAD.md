# Bounded twenty-session load check

Status: implementation and deterministic tests only. **No live load run is claimed.** This check uses no model and spends no model credits. It creates and cancels development-store carts; it cannot place orders or payments.

Twenty independently signed logical sessions remain open across stage barriers: search all sessions, create eligible carts, cancel confirmed carts, then verify absence. Each search must observe the exact seeded, available Black/US10 variant. API requests are serialized, with at least **1,100 ms between dispatch starts**. The maximum simultaneous client HTTP requests is **one**, not twenty. The report measures logical-session overlap and confirmed cart overlap separately.

## Preconditions and command

The completed seed manifest must match the checked-in seed digest and the exact development store. The fixture must have both ownership tags and a verified manifest entry. The local adapter verifies Worker health/store and obtains independent trusted sessions from server-only configuration. No seed write credential is read by this harness.

The private approval JSON must contain:

```json
{
  "owner_approved": true,
  "worker_preflight_passed": true,
  "seed_verified": true,
  "load_test_approved": true
}
```

Set `ARMANS_EVAL_CONFIG` to the existing private local-adapter configuration. Its service and issuer secrets remain in the Node process. Use a fresh output filename; previous reports are never overwritten or automatically resumed.

```powershell
node evals/load.mjs --plan
node evals/load.mjs --seed catalogue/seed-v1.json --manifest catalogue/owned-manifest.local.json --approval evals/private/load-approval.local.json --out evals/output/load-first-attempt.json
```

The second command is for the separately authorized live run after installation, permission grants and seed verification. An optional `--interval-ms` may slow dispatch; values below 1,100 ms are rejected.

## Measurement and stop rules

- Preserve **20 sessions, 60 workload requests and 20 cancellation-verification requests** as planned denominators. Report attempted and not-run requests separately. Session pass rate always divides by twenty.
- Client latency includes Worker processing, permit waiting, eligibility checks and Shopify calls. Report nearest-rank p50/p95 for attempted responses. Isolated Shopify latency is **unavailable** in the current response contract; it is never estimated from client latency.
- Error rate is tool errors divided by attempted requests. Business postcondition failures are reported separately. HTTP 200 alone does not prove cart creation or cancellation.
- `SERVICE_RATE_LIMITED` / `SESSION_RATE_LIMITED` are application throttles. `RATE_LIMITED` is upstream; the present response cannot distinguish Admin eligibility throttles from UCP throttles. Unclassified HTTP 429 stays unknown.
- Honor an exposed `Retry-After` before any subsequent new operation. When unavailable, use a five-second cooldown. A wait above sixty seconds stops this bounded run. The current Worker often does not forward `Retry-After`; absence is recorded.
- Stop all further API dispatch on two consecutive 429s, two 429s within sixty seconds, an unknown mutation outcome, or authorization/configuration failure. Never retry a mutation automatically. No cleanup requests are quietly dispatched after a stop.
- Every confirmed or potentially created cart left after a stop appears in `cleanup_failures`. Cancellation is only passed after a separate `get_cart` confirms `not_found` or `no_current_cart`.

Reports contain only correlations, outcomes and timings. A sibling `*.sessions.local.json` stores trusted session claims for operator recovery, with private file permissions and Git exclusion. It contains no bearer, signed assertion, merchant cart ID or handoff key. Treat these recovery claims as private; never send them to a model or client. An interrupted intent requires operator review—no automatic resume is supplied.

## Deterministic validation

`node --test test/load.test.mjs` verifies twenty isolated sessions, serialized dispatch, honest overlap/timing metrics, throttle stop rules, unknown-mutation handling, cleanup failure reporting, fixed denominators, preflight refusal and persistence failure behavior. These tests use mock responses and a controlled clock; they are not evidence of Shopify capacity.
