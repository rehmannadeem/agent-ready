# Shopify AI shopping handoff — client delivery process

## What Armans.AI can demonstrate

A customer asks for a product. The assistant searches the merchant's live catalog, shows the current price, adds the chosen variant to a cart, reports stock/validation problems, and hands the customer to Shopify for checkout review. The customer retains control of personal details and payment.

Verified portfolio wording: “Built and tested an AI-assisted Shopify catalog-to-cart workflow with human checkout handoff on a development store.” Do not claim a paid client deployment, payment automation, AI-platform listing or sales improvement from this demonstration.

## Five-minute demonstration

1. Open the dashboard and select Open AI assistant. Sign in with your n8n account if prompted.
2. Ask: “Find Karachi Kicks Runner Pro under 80 US dollars.” Check USD 79 against the store.
3. Ask: “Add one to a test cart.” Check the actual line item, quantity, totals and any warnings.
4. Open Review cart on Shopify. Inspect the checkout page; stop before payment.
5. Return to the same conversation and ask: “Cancel my test cart.” Inspect execution records in n8n.
6. Ask for a nonexistent product or an unauthorized price edit. The assistant must not fabricate a product or perform the edit.

## Repeat this for a real client

| Stage | Armans.AI does | Merchant supplies/approves | Acceptance evidence |
|---|---|---|---|
| Scope | Agree one shopping journey and exclusions | Store, audience, market, products, success criteria | Written scope |
| Access | Check the merchant's actual interfaces and app installation | Authorized store access and model billing owner | Read check, scoped permissions |
| Catalog | Test price, variants, publication and availability | Correct product content and inventory | Search response |
| Workflow | Configure model, restricted tools and human handoff | Allowed customer actions and policy wording | Executable workflow/source |
| Cart | Test valid and invalid quantities/stock | Development/test products and shipping setup | Real cart and error evidence |
| Handoff | Verify the customer reaches Shopify checkout | Human review of totals, shipping and payment | Approved browser acceptance |
| Recovery | Test failure, restore and stop controls | Maintenance window and escalation contact | Rollback result |
| Handover | Deliver source, deployment IDs, runbook and training | Sign-off and support arrangement | Signed acceptance record |

For a prepared, single-store practice sprint, budget 30 minutes for scope/access, 90 for configuration and build, 60 for acceptance/recovery, and 30–60 for handover. External account, stock or checkout eligibility blockers can extend delivery; quote a client timeline after checking those dependencies.

## Operating instructions

- Use Shopify as the authority for product, stock, cart totals and checkout state. A successful search does not guarantee a cart can accept the item.
- Inspect n8n execution errors for failures. A workflow “success” alone is insufficient: inspect the actual tool results and cart contents.
- Keep model/tool iteration and spending limits. Review the merchant's retention needs before storing conversations.
- If the model account fails, stop the chat or use an already approved funded credential; an API key's existence does not establish its balance.
- If stock is rejected, the merchant fixes stock at the appropriate fulfillment location. The agent must not alter inventory to satisfy a purchase.
- If the app breaks, unpublish the n8n workflow and follow the README rollback procedure.

## Before a production client launch

Agree access control, domain, customer privacy/retention, monitoring, usage limits, durable conversation/cart storage, supported products/markets, shipping/tax configuration, and human support. Complete merchant browser acceptance and document the rollback owner. These are concrete delivery requirements, not completed claims for the present lab.
