# Armans.AI Agent-Ready Live

A Cloudflare-hosted workbench that reads a selected product from a real Shopify development store and independently checks that store's public `/.well-known/ucp` route.

Business question: **Can the integration retrieve the merchant's catalog, and what does the public commerce discovery address actually return?** Each answer includes evidence and a timestamp. An authenticated Admin API success does not imply public UCP access or checkout support.

## Scope

- Real Shopify Admin GraphQL API, version `2026-07`; `read_products` required.
- One explicitly configured demo product; up to 5 matching products and 10 variants per product. Extra pages are flagged, not silently claimed as complete.
- Server-side client-credentials authentication for the owner's installed app and store in the same organization. This is not a multi-merchant OAuth app.
- Cloudflare Worker plus static dashboard, live price display, explicit error states and evidence download.
- Separate unauthenticated public discovery request. Same-origin redirects only, bounded response sizes and request deadlines.
- No customer/order operations, cart, checkout or payment implementation.
- No connection to the old SupportOps Supabase database is needed.

## Deploy and configure

Run in this directory with Node 22 or later:

```powershell
node --test test/*.test.mjs
npx.cmd --yes wrangler@4.158.0 deploy
npx.cmd --yes wrangler@4.158.0 secret put SHOPIFY_CLIENT_ID
npx.cmd --yes wrangler@4.158.0 secret put SHOPIFY_CLIENT_SECRET
```

Paste each value into Wrangler's prompt. Keep credentials out of chat, source files, screenshots and GitHub. Alternatively, add both as **Secret** values in the Worker's Cloudflare Settings → Variables and Secrets, and deploy the settings change.

The installed Shopify app must have `read_products`. This preview uses client credentials because the app and store belong to the owner; a client merchant installation needs its own supported authentication design.

`wrangler.jsonc` contains only public store configuration. Before changing `CATALOG_HANDLE`, confirm the corresponding record is suitable to expose in this public development preview. The API deliberately rejects query parameters and never accepts a visitor-supplied Shopify store or GraphQL query.

## Acceptance exercise

1. Open the deployed URL and run the checks. Record product title, variant price, observation timestamp and discovery result.
2. In the Shopify development store, open `Karachi Kicks Runner Pro`. Record the original price and change one variant price by a small amount.
3. Save; wait at least 30 seconds for the short response cache; run the checks again. The displayed price must match Shopify.
4. Restore the original price. Wait and verify the restoration. Download the evidence JSON for both observations.
5. Explain why an Admin catalog read can succeed while the public route encounters a password page. A password gate must not be labelled a routing defect.
6. Review the tests for expired/rejected credentials, HTTP 200 GraphQL errors, invalid profile structure, external redirects, response-size limits and blocked writes.

Do not disable a development store's password protection simply to turn a readiness check green. A blocked public discovery route is useful evidence of this environment's boundary.

## Evidence and limits

Successful observations may be cached for 30 seconds at the edge; the upstream `observed_at` timestamp is preserved. Errors are not cached. OAuth access tokens stay in Worker memory and are refreshed after expiry; no credentials are returned to the browser. A rejected token is evicted on HTTP 401 so a subsequent check can obtain a fresh token.

`PROFILE_SHAPE_OK` means only basic JSON shape checks passed. Full UCP schema conformance, protocol negotiation, MCP tools, catalog operations through UCP, cart, checkout, payments, and AI platform eligibility require separate tests. The preview does not publish a merchant profile or pretend to implement those services.

This is a single-store engineering preview. Production rollout needs requirements for access control, rate limiting, monitoring, secret lifecycle, data publication and merchant installation. No claim of production client deployment is made.

## Recovery

Keep the deployed version ID and commit. To inspect prior Worker versions and deployments:

```powershell
npx.cmd --yes wrangler@4.158.0 deployments list
npx.cmd --yes wrangler@4.158.0 versions list
```

Use the Cloudflare deployment history to roll back to the reviewed previous version. If credentials are revoked, the catalog must show a clear access failure; the page and discovery checks remain available. Cloudflare secrets are managed separately from Git.

## Primary references

- https://shopify.dev/docs/api/admin-graphql/2026-07/queries/products
- https://shopify.dev/docs/apps/build/authentication-authorization/client-credentials-grant
- https://developers.cloudflare.com/workers/configuration/secrets/
- https://developers.cloudflare.com/workers/static-assets/routing/worker-script/
- https://ucp.dev/2026-08-25/specification/overview/

Implementation prepared for Claude's review on a separate branch of `rehmannadeem/agent-ready`.
