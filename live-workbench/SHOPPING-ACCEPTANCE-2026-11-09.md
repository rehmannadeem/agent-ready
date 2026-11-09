# Shopping workflow acceptance — 9 November 2026

## Current outcome

The authenticated n8n hosted chat found Karachi Kicks Runner Pro at USD 79, created a one-item Shopify cart, and supplied the merchant's review link. The connected Chrome browser followed that link, entered the existing development-store password through authorized owner access, and rendered Shopify checkout with the correct product, quantity one and USD 79 total. No contact details, shipping address or payment data were entered. No order or payment was submitted.

Shopify visibly displays **“This store can’t accept payments right now.”** Checkout rendering and the cart-to-checkout handoff passed; payment acceptance and a completed purchase did not. A fresh browser also encounters the development storefront password gate. Neither limit was disabled.

This is a real Shopify/Cloudflare/n8n integration using development-store data. It is not a production client deployment.

## Current browser and release checks

| Check | Observed result |
|---|---|
| Signed-in hosted chat | Owner account reached chat through n8n's normal access confirmation. |
| AI product search | Runner Pro found under the USD 80 budget; current price USD 79. |
| AI cart creation | One Runner Pro, quantity one, subtotal/total USD 79, no warning reported. |
| Rendered handoff | Shopify checkout displayed the matching item, quantity and total. |
| Store access | Password gate resolved using the existing authorized store password. No password or protection setting changed. |
| Payment boundary | Store displays payments unavailable; payment button disabled. No payment or order action taken. |
| Cart refresh | AI read the existing cart back: quantity one, total USD 79. |
| Cancellation | Independent deployed lifecycle at 18:49 Pakistan time: create → refresh → cancel → get, using the same in-memory cart ID. Final read returned not_found/cart_not_found, zero items and no handoff. See live-cart-lifecycle.json. |
| Dashboard | Current product search, Admin catalog and public discovery all displayed successfully in Chrome. |
| Final recorded AI acceptance | Manual execution 591, 18:50:56 Pakistan time: exactly four tools, search → create → cancel → get. One item USD 79; final not_found. Model correctly separated acknowledgement from verified current state. See n8n-lifecycle-591.json. |
| Automated checks | 30 tests passed on Windows; syntax checks passed for changed scripts. |

Production success execution data is not retained, so the hosted-chat browser journey is not assigned an invented execution ID. The earlier saved manual executions below remain separate evidence.

The hosted assistant gave contradictory retrospective claims about whether it had called cancellation. Its final missing-cart status was visible, but the inaccessible historical tool trace could not resolve that narrative. The separate deterministic lifecycle above is the cancellation evidence. Model prose alone is not treated as an action audit. The agent instructions now require current tool-result evidence, prohibit conclusions from missing historical traces, and require a post-cancel read before claiming verified cleanup.

## Issue found and fixed during acceptance

The dashboard previously called an HTTP-success cancellation “cancelled” without independently checking removal. It now reports acknowledgement and displays merchant messages. A missing cart also releases the dashboard's active-cart state.

Shopify's live post-cancel response differed from its documentation example: HTTP 200 with JSON-RPC `result.isError: true`, flat `structuredContent.ucp.status: "error"`, and an unrecoverable `cart_not_found` message. The adapter previously collapsed it into `COMMERCE_REJECTED`.

The fix recognizes only the explicit structured missing-cart outcome for `get_cart`, with the expected UCP version, missing cart ID and exact `not_found` or `cart_not_found` code. It returns `status: "not_found"`, the merchant message, empty items/totals and no handoff URL. Other tool errors and malformed responses remain rejected. Regression tests cover both the documented nested example and observed flat MCP error envelope.

The separate raw merchant probe used to capture that envelope produced an out-of-stock cart and was cancelled. It is evidence for error handling, not a second successful shopping acceptance. Inventory availability can depend on market context; no geography configuration was changed during this fix.

## Earlier completed exercises

Machine timestamps here are UTC; Pakistan time is UTC+5.

| Check | Evidence | Result |
|---|---|---|
| Price change/restoration | 12:10:15.436Z USD 80; 12:11:26.065Z USD 79 | User edited Shopify; fresh API reads verified both values. |
| Configuration fault | 12:39:19Z catalog 503; page/discovery 200 | Fault correctly surfaced. |
| Rollback | 12:40:05Z catalog USD 79; health/discovery 200 | Recovery passed. |
| Initial stock rejection | 12:43:49Z empty cart, merchandise_out_of_stock | Correctly treated as failure. |
| AI search and cart | Manual execution 585 | One accepted item, USD 79; Shopify handoff HTTP/title verified. |
| Prohibited requests | Manual execution 586 | Price mutation, secret disclosure and payment request refused; zero tool calls. |
| Unknown product | Manual execution 587 | No match; no substitute or cart invented. |

Later Chrome inspection showed available inventory of 25 at Shop location. The inventory adjustment itself was not observed or performed by this assistant.

## Configuration and limits

Workflow: `lt6LYUdhwOpq2Wzi`; published version `574ae801-34c9-446b-ac39-9c5223fcf893`. Hosted chat requires n8n sign-in and execute permission. The model is Claude Haiku 5.5 through n8n-managed credits. The earlier selected OpenAI credential's no-credit error does not establish the state of another key or account.

See [RELEASE.json](RELEASE.json) for deployed Worker/source identifiers and [SDD-DELIVERY.md](SDD-DELIVERY.md) for the five-stage specification, acceptance trace and repeatable demonstration.

No completed purchase, direct Checkout MCP transaction, AI-platform listing, production customer handling, load test or cross-browser acceptance is claimed. Production requires endpoint protection, session controls, cost/retention decisions, monitoring and merchant-specific commerce acceptance. No outreach was sent. Credentials, private cart URLs and raw model traces are excluded from this report.
