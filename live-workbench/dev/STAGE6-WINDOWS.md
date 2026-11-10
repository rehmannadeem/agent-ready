# Stage 6 Windows execution handoff

The isolated Worker uses the verified `shopping-runtime` application. The
controller uses the separate `seed` credential only inside its short-lived
simulation process. Runtime and bridge processes receive no seed credentials.

Current state: Worker health/authentication, real Admin catalog search, real UCP
search/product lookup, twenty empty session reads and rejection checks passed.
The catalogue seed is still incomplete. Controller configuration is prepared with
`owner_approved:false`, and the load approval has `seed_verified:false`. No load
or full model suite has started through this handoff.

The main Worker runtime files and evaluation entry were SHA-256 matched against
the local candidate on 2026-11-10. The browser bridge additionally contains the
tested public-document navigation correction: cross-site top-level GET visits
may reach only the public login shell, never authenticated proxy data.

## Required completion signal

Wait for the catalogue owner to confirm the completed manifest and duplicate-free
rerun. The expected seed is 318 products, 3,266 variants and four discount
fixtures, SHA-256
`72955f4f280b995d0cd37e69b7f9f6e848ed51de18eacf9983be783653008e32`.
The private manifest must match that digest/store, have `completed_at`, have no
pending mutation, and contain verified ownership records. Only then enable the
prepared controller and mark seed verification in the separate approvals.

## Exact bounded load command

Run once after that gate; this creates/cancels carts and is not a read-only check.
The output filename is reserved for the first attempt and must not be reused.

```powershell
$projectRoot = 'G:\Projects\Armans-AgentReady-Scale-20261110'
$candidatePath = Join-Path $projectRoot 'source-704057a\agent-ready-704057a78efc2c093e3631d5c569f340ddf0b388\live-workbench'
Set-Location $candidatePath
$env:ARMANS_EVAL_CONFIG = Join-Path $projectRoot 'private\eval-config.json'
node evals/load.mjs --seed catalogue/seed-v1.json --manifest (Join-Path $projectRoot 'private\owned-manifest.local.json') --approval (Join-Path $projectRoot 'private\load-approval.json') --out (Join-Path $projectRoot 'private\load-first-attempt.json') --interval-ms 1100
```

This is twenty logical sessions and one HTTP request at a time, not twenty
concurrent merchant requests. Preserve 60 workload and 20 cancellation-check
requests as the denominator. Require zero cleanup failures, verified cancellation
and explicit reporting of throttles/unknown outcomes. Do not resume or retry a
mutation automatically after a stop.

## Acceptance already checked and still required

- Passed: twenty independent signed sessions have no current cart; forged victim
  claims and a bearer without a signed session return 401.
- Passed: an explicit cart-ID argument is rejected before dispatch; the private
  inspector rejects a missing independent secret, browser Origin and selector body.
- Passed: runtime Admin GraphQL and UCP read paths return the known Runner Pro
  product at USD 79.00 with current availability.
- Still required after seed: S21 creates a synthetic victim cart, checks its
  confirmed stored owner/revision using the local inspector, rejects cross-session
  requests, confirms the victim is unchanged, then cancels and verifies absence.
- Still required: load first attempt and the full model suite with evidence review.

The workflow owner controls model dispatch. Keep the existing canonical
`private\eval-budget.json`; it already includes the verified transport smoke.
Approved maximum is USD 10, currently constrained further by USD 1.90 funding;
five iterations remain fixed. Do not create a replacement ledger or invoke a
model outside that reservation path.

## Windows persistence and browser login

Keep Worker state at `private\local-evaluation\state`. The much longer nested
source path exceeded Windows MAX_PATH; changing the state path now would separate
sessions from their owned carts. The Worker listens only on 127.0.0.1:8787 and
the browser bridge only on 127.0.0.1:8788. Never deploy or tunnel the evaluation
configuration. Its independent inspection secret remains server-only.

The one-use login URL is stored in the candidate's `dev\private\bootstrap-url.txt`.
It expires in five minutes. Use the private renewal helper without printing the
URL; renewal does not require restarting the Worker or bridge. Do not include the
URL, cookie, assertion, raw cart capability or credential in evidence.
