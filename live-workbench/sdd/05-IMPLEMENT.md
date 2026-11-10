# Stage 5 — Implement

Gate 2 approved. Local candidate implemented; live catalogue installation is awaiting the owner. No production deploy, merge or seed write has occurred.

- `catalogue/`: deterministic 318-product / 3,266-variant JSON and CSV, 15 collections, four restricted discounts, separate seed client, read-only identity/count/scope/schema/throttle preflight, measured nested-read probe, owned-resource manifest, collision guards and ambiguous-mutation journal. See `catalogue/README.md` for exact execution constraints.
- `src/catalog.mjs`, `catalog.graphql`: paginated read-only catalogue, filters, complete variant paging and fresh publication/US-market eligibility. Runtime requires read_publications; installed app currently lacks it and responses fail closed.
- `src/commerce.mjs`, `session-security.mjs`, `session-state.mjs`: seven tools, exact variants, multi-line carts/edits/discounts, service bearer plus independent signed session assertions, persisted cart ownership, serialized edits, unknown-outcome stop, per-session and service-wide limits.
- `dev/`, `public/`, `wrangler.local.jsonc`: isolated loopback operator bridge and cookie sessions; protected dashboard; SQLite Durable Objects and redacted local observability. Production Wrangler configuration is unchanged.
- `evals/`, `simulate/`: 75 scenario definitions, five-iteration controlled loop, approved USD10 ledger pinned independently of report output, provider usage reconciliation, failure-preserving review, separate process for guarded simulations, and local-only validation helpers. These files do not prove live acceptance.
- `n8n/scale-eval-single-call.sdk.js`: separate inactive helper `McTDlGb8oc3hZ5gl`. It has not executed. Existing hosted workflow is unchanged.

Generated JSON SHA-256: `72955f4f280b995d0cd37e69b7f9f6e848ed51de18eacf9983be783653008e32`.

## Baseline limitations

| Limitation | Candidate status | Live status |
|---|---|---|
| L1 single handle | Removed from candidate reads | Deployed baseline unchanged |
| L2 search paging | Cursor plus ten-result limit | Requires seeded live validation |
| L3 one cart line | Multi-line updates, remove and discounts | Requires live validation |
| L4 single-product dashboard | Paginated filters and stock display | Local visual acceptance pending runtime permission |
| L5 memory eight | Controlled local loop retains twenty interactions | Hosted n8n workflow remains eight; not claimed fixed there |
| L6 unauthenticated tools | Service and per-session authentication with persisted ownership | Public deployed baseline remains unchanged under no-deploy instruction |
| L7 no observability | Enabled and redaction checked locally | Production configuration unchanged |
| L8 five-stage record | Seven-stage current delivery index | Complete current status in sdd/ |

Recommendation: review this candidate as the successor to PR #1 after live evidence. Leave PR #1 open and unmerged now. No capability is represented as shipped by this record.
