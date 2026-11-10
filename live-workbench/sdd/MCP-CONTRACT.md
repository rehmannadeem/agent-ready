# Merchant tool contract — observed 10 November 2026

Evidence: [tools/list response](evidence/shopify-mcp-tools-2026-11-10.json), captured `2026-11-10T15:02:50.3230668Z` (20:02 Pakistan). Endpoint: `https://karachi-kicks-supportops-lab.myshopify.com/api/ucp/mcp`. This was discovery only; no cart or other business operation was executed today.

The merchant advertised 14 tools. Proposed application allowlist is exactly: `search_catalog`, `lookup_catalog`, `get_product`, `create_cart`, `get_cart`, `update_cart`, `cancel_cart`. Exclude all checkout/order/payment operations and `ask_business`. Tool advertisement is not proof those operations have passed acceptance.

| Operation | Observed input/output contract | Specification |
|---|---|---|
| search_catalog | `catalog.query`, `catalog.filters.categories/price/available`, `catalog.context`, `catalog.pagination.cursor/limit`; response pagination has `has_next_page`, optional opaque `cursor`. | App limit 1–10, default 10. Preserve cursor; bind it to original filters/market; never fabricate page tokens. USD price filters use cents. |
| lookup_catalog | `catalog.ids`, 1–10 identifiers; product/variant input correlations. | Exact ID lookup/comparison; only eligible data; maximum ten IDs. |
| get_product | `catalog.id`, `catalog.selected` objects `{name,label}`, preferences/context/filters. | Obtain variant details and narrow Size/Colour/Fit; ask for missing required selection. No silent first-variant substitution. |
| create_cart | `cart.line_items[]` contains `item.id` and integer `quantity`; optional context and discounts. | Multiple explicitly selected variants. App policy: 1–10 units per distinct variant, duplicate lines aggregated before validation; proposed maximum ten distinct lines. These are app policies, not claimed Shopify limits. |
| get_cart | top-level `id` and metadata. | Resolve current owned cart server-side; refresh before editing and handoff; preserve messages. |
| update_cart | top-level `id`; `cart.line_items` is required; optional `cart.discounts.codes`. | Full replacement, not a patch. Keep all intended lines and supported state; omitted line removes it. Do not assume quantity zero is accepted. |
| Discounts | `cart.discounts.codes` replaces codes; empty array clears them. | Use create/update only when buyer asks. Preserve remaining cart state and show actual discount messages/totals. |
| cancel_cart | top-level `id`; metadata. | Only current session's cart. Official documentation additionally requires a stable UUID idempotency key; do not omit it because the observed discovery schema is looser. Read afterward to verify current absence. |

Required profile metadata is `meta["ucp-agent"].profile`. The existing profile advertises UCP `2026-08-25`; keep API/profile versions deliberate. Discovery exposed generic buyer/fulfillment fields but the application will not accept or collect personal information in this project.

The discovery input schema gives search limit minimum 1/default 10 without a maximum. Current [Storefront Catalog documentation](https://shopify.dev/docs/agents/catalog/storefront-catalog) states maximum 250. We rely only on the smaller application limit 10. Never infer all variants were returned from a fixed slice; use exact detail selection or reject an unresolved selection.

Official [cart documentation](https://shopify.dev/docs/agents/carts-and-checkout) describes `update_cart` as replacement of full state. Discount clearing and idempotency guidance: [Cart MCP](https://shopify.dev/docs/agents/carts-and-checkout/cart-mcp). All checked 10 November 2026.

## Load-control interpretation

[Shopify's rate guidance](https://shopify.dev/docs/agents/profiles/auth-and-rate-limiting), checked 10 November 2026, does not publish a fixed universal merchant-Cart-MCP requests/second number. Its Global Catalog 5 requests/second figure is a different endpoint and must not be applied here.

The later load harness must hold 20 isolated logical sessions while controlling total merchant request dispatch, beginning conservatively and respecting observed `429`/`Retry-After`. Proposed stop threshold: a second 429 after honoring the first Retry-After, or two 429s within a 60-second window, pauses all new work and reports the incomplete run. This is our test policy, not a vendor quota. Record configured dispatch rate, actual overlap, requests, throttles, failures and latencies; if rate controls prevent 20 simultaneous merchant requests, say so. No LLM calls in this load test.

Authentication on our Worker does not change Shopify's upstream tier, protect Shopify's own public endpoint, or create guaranteed throughput. Do not claim an application secret makes the merchant's anonymous endpoint private.
