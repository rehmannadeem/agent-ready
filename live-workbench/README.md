# Agent-Ready Live 0.2

A working development-store shopping demonstration: an n8n AI assistant searches Shopify UCP, selects a real variant, creates a cart, and hands the buyer to Shopify's checkout page. No payment or order-completion tool is exposed.

- Dashboard: https://armans-agent-ready-live.veenus-rehman.workers.dev
- AI chat (n8n sign-in): https://nadeem-geo.app.n8n.cloud/webhook/6f819cfd-1881-4e5d-9c32-904c2d5beb42/chat
- Workflow: https://nadeem-geo.app.n8n.cloud/workflow/lt6LYUdhwOpq2Wzi
- Current results: [Shopping acceptance](SHOPPING-ACCEPTANCE-2026-11-09.md)
- Repeatable client process: [Client delivery](CLIENT-DELIVERY.md)

## Architecture

The n8n chat trigger authenticates the operator. Its AI Agent uses Claude Haiku 5.5 through n8n Gateway credits, eight turns of conversation memory and four MCP tools. Cloudflare adapts those tools to one fixed Shopify domain. Shopify supplies product data, cart totals and the handoff URL. The human completes any checkout on Shopify.

The dashboard also supports explicit product search and test-cart buttons without an LLM. Its earlier Admin product-read and public-profile checks remain separate diagnostics.

## Interfaces

| Route | Purpose |
|---|---|
| GET /api/health | Configuration status; no commerce acceptance claim |
| GET /api/catalog | Selected product via server-side Admin authentication |
| GET /api/discovery | Basic merchant-profile structure check |
| GET /agent-profile.json | Cacheable UCP agent profile used for negotiation |
| POST /api/mcp | MCP initialize, tools/list, tools/call and ping |
| POST /api/shop | Explicit dashboard shopping operations |

Allowed tools: search_catalog, create_cart, get_cart, cancel_cart. Quantity is limited to 1–10. No arbitrary host, Admin query, product write, checkout completion, payment, order or customer tool exists. Cart capability IDs and links are private to a shopping session; do not put them in public evidence.

## Run and deploy

Use Node 22 or later. Run `npm test`, `npm run check`, then `npx wrangler@4.158.0 deploy` from this folder. On Windows, use `npx.cmd`.

The existing Worker already has SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET stored as secrets. These serve the Admin diagnostic only; the shopping adapter uses Shopify's anonymous UCP catalog/cart interface. Configure SHOPIFY_STORE, SHOPIFY_API_VERSION, CATALOG_HANDLE and UCP_AGENT_PROFILE_URL in wrangler.jsonc. Never commit secret values.

The agent profile must be publicly fetchable and cacheable. The tested profile uses Cache-Control: public, max-age=300. Cart responses remain no-store. The supplied n8n SDK source rebuilds the workflow; resolve the model credential through n8n's supported managed-credit mechanism or a funded merchant-approved API credential. Set a 120-second workflow timeout. Production success executions are not retained; manual acceptance runs are retained for review.

## Recovery

Unpublish the n8n workflow to stop chat execution. Cloudflare's prior catalog-only version is 9dae6df5-e2fc-4026-b350-21a6dcdf7e0c. To restore it:

`npx.cmd --yes wrangler@4.158.0 rollback 9dae6df5-e2fc-4026-b350-21a6dcdf7e0c --message "Restore catalog-only baseline" --yes`

That rollback was exercised successfully during acceptance. It removes the new shopping endpoints; verify health, catalog and discovery afterwards. Re-deploy the current source to restore shopping.

## Limits

This is an owner-operated development-store demonstration. Human cart/checkout review is required. Production rollout needs merchant-approved access, model budget limits, durable session storage, monitoring, abuse controls, privacy/retention decisions, supported markets/shipping and UI acceptance. n8n Simple Memory is not a durable customer-session database. AI marketplace listing, completed orders and payment processing are not demonstrated. The Python auditor is unchanged.

## Primary references

- https://shopify.dev/docs/agents/catalog/storefront-catalog
- https://shopify.dev/docs/agents/carts-and-checkout/cart-mcp
- https://shopify.dev/docs/agents/carts-and-checkout/checkout-mcp
- https://shopify.dev/docs/agents/get-started/profile
- https://shopify.dev/docs/apps/build/authentication-authorization/client-credentials-grant
