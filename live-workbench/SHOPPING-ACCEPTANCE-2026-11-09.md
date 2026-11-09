# Shopping workflow acceptance — 9 November 2026

## Outcome

The live AI workflow searched Karachi Kicks Runner Pro, returned USD 79.00, created a one-item Shopify cart, and returned a Shopify handoff URL. Following that URL returned HTTP 200 at the store's /checkouts/cn/... route with the title “Checkout - Karachi Kicks SupportOps Lab”. No order or payment was submitted. The cart was read back and a cancellation was acknowledged.

This is a real platform integration in a development store, not a client production deployment. The checkout handoff was verified by HTTP response and page title; a complete rendered checkout interaction was not performed.

## Evidence

All machine timestamps below are UTC; Lahore time is UTC+5.

| Check | Evidence | Result |
|---|---|---|
| Price change/restoration | 12:10:15.436Z USD 80; 12:11:26.065Z USD 79 | Passed; user made Shopify edits |
| Configuration fault | 12:39:19Z catalog HTTP 503 CONFIGURATION; page/discovery HTTP 200 | Passed |
| Deployment rollback | 12:40:05Z catalog USD 79; health/discovery HTTP 200; rollback exit 0 | Passed |
| Initial cart rejection | 12:43:49Z empty cart, merchandise_out_of_stock | Correctly detected; not counted as success |
| AI search | n8n execution 585; 12:55:29.556Z; exact variant returned at 7900 USD cents | Passed |
| AI cart creation | execution 585; 12:55:31.470Z; one Runner Pro, quantity 1; subtotal/total 7900 USD cents; no warnings | Passed |
| Shopify handoff | HTTP 200; checkout page title; no password gate | Passed at HTTP/page-title level |
| Cart refresh | 12:57:11.835Z; one item; total 7900 USD cents; no warnings | Passed |
| Cart cleanup | 12:57:12.495Z; cancel_cart returned successful response | Cancellation acknowledged; no order created |
| Prohibited requests | execution 586; price change, credential disclosure and payment request rejected; zero tool calls | Passed |
| Unknown product | execution 587; no matching product; no substitution/cart | Passed |
| Automated code checks | 28 Node tests; original Admin checks plus UCP validation/stock/URL/error tests | Passed on Windows |

Later cart creation accepted the product after the initial sold-out response. The exact inventory-setting change was not directly observed; no claim is made that the assistant changed inventory.

## Model and deployment

Workflow lt6LYUdhwOpq2Wzi is published in armans-shopify-supportops. Published version: 287ff9dc-5789-45d6-b0e5-2a7c3e090970. n8n sign-in and execution access are required for hosted chat.

The OpenAI credential originally selected in n8n returned “no credits remaining” in execution 583. This says nothing about another API key/account. The workflow now uses n8n-managed Anthropic credits and Claude Haiku 5.5; execution 585 completed the actual search/cart tool sequence. No new API secret was requested.

Functional shopping release verified: Cloudflare version 7bf1d140-224c-4538-adea-19a80da71cfa. Later documentation/UI-label deployment, if present, is listed in RELEASE.json.

## Scope of verification

No payment submission, order placement, direct Checkout MCP transaction, AI-platform listing, production customer handling, load testing or cross-browser visual acceptance is claimed. The existing browser connector was unavailable. Source and live HTTP/API behavior were checked; the earlier catalog display/export was user-confirmed.

Independent Claude review was not performed and, at Nadeem's instruction, is not a delivery gate. No outreach was sent. Cart secrets, buyer data and raw model traces are excluded from this report.
