# Stage 5 — Implement

Gate 2 approved. Candidate implemented; live validation is IN PROGRESS. Both separate apps are installed. One owned draft product has been created; its timestamp guard paused seeding for read-only reconciliation. No candidate source deployment or merge has occurred.

- `catalogue/`: deterministic 318-product / 3,266-variant JSON and CSV, 15 collections, four restricted discounts, separate seed client, read-only identity/count/scope/schema/throttle preflight, measured nested-read probe, owned-resource manifest, collision guards and ambiguous-mutation journal. See `catalogue/README.md` for exact execution constraints.
- `src/catalog.mjs`, `catalog.graphql`: paginated read-only catalogue, filters, complete variant paging and fresh publication/US-market eligibility. The dedicated runtime app has only read_products and read_publications. Both reads passed; customer and order access were denied.
- `src/commerce.mjs`, `session-security.mjs`, `session-state.mjs`: seven tools, exact variants, multi-line carts/edits/discounts, service bearer plus independent signed session assertions, persisted cart ownership, serialized edits, unknown-outcome stop, per-session and service-wide limits.
- `dev/`, `public/`, `wrangler.local.jsonc`: isolated loopback operator bridge and cookie sessions; protected dashboard; SQLite Durable Objects and redacted local observability. Production Wrangler configuration is unchanged.
- `evals/`, `simulate/`: 75 scenario definitions, five-iteration controlled loop, approved USD10 ledger pinned independently of report output, provider usage reconciliation, failure-preserving review, separate process for guarded simulations, and local-only validation helpers. These files do not prove live acceptance.
- `n8n/scale-eval-single-call.sdk.js`: separate inactive helper `McTDlGb8oc3hZ5gl`. Its single transport smoke executed once (execution592), using51 input and18 output tokens at USD0.0000141. Existing hosted workflow is unchanged.

Generated JSON SHA-256: `72955f4f280b995d0cd37e69b7f9f6e848ed51de18eacf9983be783653008e32`.

## Baseline limitations

| Limitation | Candidate status | Live status |
|---|---|---|
| L1 single handle | Removed from candidate reads | Deployed baseline unchanged |
| L2 search paging | Cursor plus ten-result limit | Requires seeded live validation |
| L3 one cart line | Multi-line updates, remove and discounts | Requires live validation |
| L4 single-product dashboard | Paginated filters and stock display | Local visual acceptance pending; runtime permission verified |
| L5 memory eight | Controlled local loop retains twenty interactions | Hosted n8n workflow remains eight; not claimed fixed there |
| L6 unauthenticated tools | Service and per-session authentication with persisted ownership | Public deployed baseline remains unchanged under no-deploy instruction |
| L7 no observability | Enabled and redaction checked locally | Production configuration unchanged |
| L8 five-stage record | Seven-stage current delivery index | Complete current status in sdd/ |

Recommendation: review this candidate as the successor to PR #1 after live evidence. Leave PR #1 open and unmerged now. No capability is represented as shipped by this record.

Runtime credentials were switched through Cloudflare secrets only. The shared Armans SupportOps Connector was not released or changed; its unsaved read_publications draft was discarded. Evaluation retains the USD10 owner ceiling and adds a USD1.90 funded ceiling, with five iterations and one persistent ledger.
