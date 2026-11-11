# Agent-Ready Live: historical 0.1 acceptance

Current results: [Shopping acceptance](SHOPPING-ACCEPTANCE-2026-11-09.md). The observations below predate the shopping implementation and deployment-recovery test.

Development-store demonstration. Independent review was not performed; Nadeem removed it as a required delivery gate during this session.

Verified on 9 November 2026. User-facing times below are Asia/Karachi (UTC+05:00). Machine timestamps use UTC.

## Result

The deployed Cloudflare application successfully read the selected product from the Shopify development store. Nadeem changed its price in Shopify Admin from USD 79.00 to USD 80.00 and restored USD 79.00. The application returned each value. Change and restoration observations were fresh upstream reads (X-Workbench-Cache: MISS).

This demonstrates authenticated product retrieval, propagation of a manual product change, and verified restoration of the product value. It is not a demonstration of code-deployment rollback or an autonomous shopping transaction.

## Environment and ownership

- Store: Karachi Kicks SupportOps Lab, karachi-kicks-supportops-lab.myshopify.com
- Product: Karachi Kicks Runner Pro
- Product ID: gid://shopify/Product/8272134242367
- Variant ID: gid://shopify/ProductVariant/43580047556671
- Currency: USD
- Preview: https://armans-agent-ready-live.veenus-rehman.workers.dev
- Application source commit: 0c4f8c4ee53cf55fa46b47df7b09aaf53570e145
- Application version: 0.1.0
- Current deployed Worker version: 9dae6df5-e2fc-4026-b350-21a6dcdf7e0c
- Current deployment created: 2026-11-09T12:00:55.135Z (17:00:55 Asia/Karachi), from a secret change
- Original code deployment: 00d3837c-4cc1-4930-9984-0a752c6b0451
- Code review: draft PR #1; independent Claude review remains pending.

Nadeem entered the Shopify application credentials in the private Wrangler prompts and performed both product-price edits. ChatGPT verified the endpoint responses, executed tests, checked permissions and prepared this record. The observed app permissions were read-only for products; no permission change was performed by ChatGPT.

## Price acceptance evidence

| Observation | Asia/Karachi | UTC observed_at | Returned price | Result |
|---|---|---|---|---|
| Initial deployed catalog read | 17:02:12 | 2026-11-09T12:02:12.967Z | USD 79.00 | HTTP 200; product returned |
| Manual test change | 17:10:15 | 2026-11-09T12:10:15.436Z | USD 80.00 | HTTP 200; cache MISS |
| Manual restoration | 17:11:26 | 2026-11-09T12:11:26.065Z | USD 79.00 | HTTP 200; cache MISS |

The initial row is transcribed from the observed deployed API response. The complete safe responses for the change and restoration are included below. Restoration is verified for this variant's price; no wider inventory, order or payment state was changed.

## Other verification

| Check | Actual evidence | Meaning |
|---|---|---|
| Windows unit tests | 17 passed, 0 failed | Tested code paths passed using fixtures; this does not mean live failures were induced |
| Live homepage | HTTP 200, text/html | Homepage resource served |
| Live health | HTTP 200; catalog_configured changed from false to true | Both required secret bindings are present; successful catalog read separately confirms authentication |
| Public discovery check | HTTP 200; application/json; PROFILE_SHAPE_OK | Basic shape passed on the configured store's public UCP route |
| Arbitrary URL query | HTTP 400, QUERY_NOT_SUPPORTED | Visitors cannot select an arbitrary upstream through query parameters |
| POST to catalog API | HTTP 405, METHOD_NOT_ALLOWED | Public application does not expose product-write operations |
| Application's own UCP path | HTTP 404, NOT_A_COMMERCE_SERVICE | The diagnostic application does not masquerade as a merchant |
| Unknown API path | HTTP 404, NOT_FOUND | Unknown API paths rejected |

The discovery result advertises capabilities; their presence was not treated as proof that those operations work. No missing-profile or wrong-content routing fault was established on this store during this acceptance run. No routing repair is claimed.

The 17 tests include malformed profiles, password redirects, external redirects, missing credentials, GraphQL errors under HTTP 200, token rejection/reacquisition, throttling, response-size limits, safe error output and write rejection. Those failure scenarios were simulated in tests; live credential revocation, provider throttling and outages were not induced.

## Access findings

A manual baseline workflow was created in the owner's personal n8n project, at the project root: Agent-Ready Live - Acceptance 2026-11-09. It is inactive and has no schedule.

Execution 582 succeeded at 2026-11-09T12:04:13.354Z. Its selected-product query agreed with the USD 79.00 baseline. The existing installed app has read_products, read_orders and read_customers, with no write_products. This application uses product reads only; the broader existing permissions do not imply that it processes orders or customers.

The n8n workflow reuses the existing Karachi Kicks credential. It is a separate permission/baseline check; the deployed workbench connects directly to Shopify and does not depend on n8n or Supabase.

No credentials, access tokens, session cookies or complete authentication execution logs belong in the public evidence package.

## Reproduce the demonstration

1. Open the preview and select Run live checks.
2. Confirm the selected product, currency, price and observation timestamp.
3. Record the original price in Shopify Admin. Make one small change only in this development-store product.
4. After at least 30 seconds, run the checks again and compare the actual price and timestamp. Successful responses can be cached at the edge for up to 30 seconds.
5. Restore the original price in Shopify Admin. Repeat the check after the cache window.
6. Use Download evidence to save the application's report. Review it before sharing.
7. Explain separately: the Admin product read, the public discovery finding and the untested commerce operations.

Nadeem confirmed that the dashboard displayed Karachi Kicks Runner Pro, Default Title and 79.00 after running the live checks, then reported completing the evidence download. He supplied the exported JSON in chat. Its captured_at is 2026-11-09T12:28:32.498Z (17:28:32 Asia/Karachi). Health, catalog and discovery have HTTP 200; catalog and discovery are cache MISS; the catalog contains the correct store and USD 79.00. The submitted JSON contains no credentials or access tokens. This closes the user-assisted product-display and export-content checks. The original downloaded file's path/bytes were not independently read; no automated visual-layout or cross-browser verification is claimed.

## Recovery and operations

- Product recovery: restore the recorded original variant price in Shopify Admin and verify it through /api/catalog. This was completed for USD 79.00.
- Code recovery: retain the source commit and deployment identifiers; review Cloudflare deployment history before selecting a previously known-good release. Code rollback was not executed here.
- Secret changes created separate deployment versions. Do not assume rolling code back also restores or preserves the desired credentials; verify health and catalog access after any recovery.
- A setup or access error must remain a visible failure, not a successful readiness result.
- Keep credentials in Cloudflare secrets and n8n's existing credential store, never in Git.
- Production use needs an agreed merchant installation/authentication design, data-publication review, access controls, rate limiting, monitoring and a tested release-recovery process.

## Remaining boundaries

- This is one selected product in a Shopify development environment.
- Full UCP schema validation, negotiation, actual UCP/MCP catalog operations, cart, checkout and payments are not verified.
- No AI-platform listing, recommendations, sales uplift or general merchant compatibility is established.
- The existing Python Agent-Ready auditor was not changed or newly tested during this workbench acceptance.
- Product display and evidence export are user-confirmed, and the submitted export content was reviewed. Independent code/claim review remains open; full visual-layout and cross-browser testing were not performed.
- A merchant production pilot requires an actual merchant scope, deployment and acceptance.

## Brief demonstration script

"This development-store integration reads one selected Shopify product through an authenticated server-side connection. I changed its price from 79 to 80 US dollars and restored it to 79; the deployed application returned both changes. It separately checks the store's public commerce profile. The profile passed basic structure checks, but I have not claimed checkout or payment support. The repository contains the implementation, tests and observed acceptance evidence."

Historical draft. See CLIENT-DELIVERY.md for current verified portfolio wording.

## Captured change response

```json
{
  "requested_at": "2026-11-09T12:10:16.1836397Z",
  "status": 200,
  "cache": "MISS",
  "catalog": {
    "source": "Shopify Admin API",
    "environment": "development store",
    "observed_at": "2026-11-09T12:10:15.436Z",
    "store": "karachi-kicks-supportops-lab.myshopify.com",
    "shop_name": "Karachi Kicks SupportOps Lab",
    "currency": "USD",
    "product_filter": "karachi-kicks-runner-pro",
    "products": [
      {
        "id": "gid://shopify/Product/8272134242367",
        "title": "Karachi Kicks Runner Pro",
        "handle": "karachi-kicks-runner-pro",
        "status": "ACTIVE",
        "product_url": "https://karachi-kicks-supportops-lab.myshopify.com/products/karachi-kicks-runner-pro",
        "variants": [
          {
            "id": "gid://shopify/ProductVariant/43580047556671",
            "title": "Default Title",
            "price": "80.00"
          }
        ],
        "more_variants": false
      }
    ],
    "more_products": false,
    "limitation": "Admin catalog access does not prove public storefront access, agent discovery, checkout or payment support."
  }
}
```

## Captured restored response

```json
{
  "requested_at": "2026-11-09T12:11:26.5563194Z",
  "status": 200,
  "cache": "MISS",
  "catalog": {
    "source": "Shopify Admin API",
    "environment": "development store",
    "observed_at": "2026-11-09T12:11:26.065Z",
    "store": "karachi-kicks-supportops-lab.myshopify.com",
    "shop_name": "Karachi Kicks SupportOps Lab",
    "currency": "USD",
    "product_filter": "karachi-kicks-runner-pro",
    "products": [
      {
        "id": "gid://shopify/Product/8272134242367",
        "title": "Karachi Kicks Runner Pro",
        "handle": "karachi-kicks-runner-pro",
        "status": "ACTIVE",
        "product_url": "https://karachi-kicks-supportops-lab.myshopify.com/products/karachi-kicks-runner-pro",
        "variants": [
          {
            "id": "gid://shopify/ProductVariant/43580047556671",
            "title": "Default Title",
            "price": "79.00"
          }
        ],
        "more_variants": false
      }
    ],
    "more_products": false,
    "limitation": "Admin catalog access does not prove public storefront access, agent discovery, checkout or payment support."
  }
}
```

## Browser export supplied by Nadeem

Provenance: user-pasted export following reported browser download; preserved here as JSON content, not as a byte-for-byte copy of the original local file.

```json
{
  "application": "Armans.AI Agent-Ready Live",
  "captured_at": "2026-11-09T12:28:32.498Z",
  "environment": "development store",
  "health": {
    "ok": true,
    "http_status": 200,
    "cache": null,
    "data": {
      "service": "Armans.AI Agent-Ready Live",
      "version": "0.1.0",
      "environment": "development store preview",
      "store": "karachi-kicks-supportops-lab.myshopify.com",
      "catalog_configured": true,
      "commerce_operations_tested": false
    }
  },
  "catalog": {
    "ok": true,
    "http_status": 200,
    "cache": "MISS",
    "data": {
      "source": "Shopify Admin API",
      "environment": "development store",
      "observed_at": "2026-11-09T12:28:32.067Z",
      "store": "karachi-kicks-supportops-lab.myshopify.com",
      "shop_name": "Karachi Kicks SupportOps Lab",
      "currency": "USD",
      "product_filter": "karachi-kicks-runner-pro",
      "products": [
        {
          "id": "gid://shopify/Product/8272134242367",
          "title": "Karachi Kicks Runner Pro",
          "handle": "karachi-kicks-runner-pro",
          "status": "ACTIVE",
          "product_url": "https://karachi-kicks-supportops-lab.myshopify.com/products/karachi-kicks-runner-pro",
          "variants": [
            {
              "id": "gid://shopify/ProductVariant/43580047556671",
              "title": "Default Title",
              "price": "79.00"
            }
          ],
          "more_variants": false
        }
      ],
      "more_products": false,
      "limitation": "Admin catalog access does not prove public storefront access, agent discovery, checkout or payment support."
    }
  },
  "discovery": {
    "ok": true,
    "http_status": 200,
    "cache": "MISS",
    "data": {
      "source": "Public HTTP request",
      "observed_at": "2026-11-09T12:28:31.985Z",
      "url": "https://karachi-kicks-supportops-lab.myshopify.com/.well-known/ucp",
      "final_url": "https://karachi-kicks-supportops-lab.myshopify.com/.well-known/ucp",
      "http_status": 200,
      "content_type": "application/json; charset=utf-8",
      "redirects": [],
      "classification": "PROFILE_SHAPE_OK",
      "version": "2026-08-25",
      "capability_names": [
        "dev.ucp.shopping.checkout",
        "dev.ucp.shopping.fulfillment",
        "dev.ucp.shopping.discount",
        "dev.ucp.shopping.cart",
        "dev.ucp.shopping.buyer_consent",
        "dev.ucp.shopping.order",
        "dev.shopify.shopping.declared_fields",
        "dev.ucp.common.ask",
        "dev.ucp.shopping.catalog.search",
        "dev.ucp.shopping.catalog.lookup",
        "dev.shopify.catalog",
        "dev.ucp.common.identity_linking",
        "dev.ucp.shopping.permalink"
      ],
      "meaning": "Basic JSON structure passed. Advertised endpoints, capabilities, checkout and payments have not been tested."
    }
  },
  "not_tested": [
    "UCP service operations",
    "AI platform listing",
    "carts",
    "checkout",
    "payments",
    "production customer handling"
  ]
}
```
