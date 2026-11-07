# AI Agent-Readiness Audit: https://allbirds.com

**Score: 100/100 (Grade A)** - 0 high-priority issue(s) - based on 85% of checks; see INFO items for what could not be tested

Audited 2026-11-07 05:21 UTC with agent-ready-audit 0.1.0. Public endpoints only.

## Can AI shopping agents buy from this store?

| Check | Result |
|---|---|
| Shopify store detected | Yes |
| Commerce manifest (/.well-known/ucp) | Yes - version 2026-08-25 |
| Agent endpoint (MCP) live | Yes - 16 tools |
| Core capabilities (search, lookup, cart, checkout) | 4/4 |
| Payment options exposed to agents | com.google.pay, dev.shopify.card, dev.shopify.shop_pay |
| Refund / shipping policy | Yes / Yes |
| AI search bots blocked | None |
| Product structured data (JSON-LD) | Not checked (HTTP 429) |
| Price / stock / GTIN in product data | Not checked |

## Findings and fixes

**1. [INFO] Product data:** Product page could not be read (HTTP 429), so product data was not scored.

   Fix: Re-run the audit later. Stores often rate-limit repeated requests.

## What an AI agent can do here

Tools exposed at the store's agent endpoint: `get_checkout`, `create_checkout`, `update_checkout`, `complete_checkout`, `cancel_checkout`, `get_cart`, `create_cart`, `update_cart`, `cancel_cart`, `get_order`, `ask_business`, `search_catalog`, `lookup_catalog`, `get_product`, `search_locations`, `lookup_locations`

## Method and limits

- Reads only public pages and the public agent manifest. No login, no admin access, no purchases.
- Live catalog queries need a registered UCP agent profile and are not part of this public audit.
- One product page is sampled. Catalog-wide data quality needs a full audit.
- A high score means agents can technically transact. It does not measure how often agents recommend the store.

---
Built by Rehman Nadeem, Armans.AI - https://armans.ai - open source, MIT licence.
