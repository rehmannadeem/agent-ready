# Armans.AI Agent-Ready Live — specification and delivery record

Date: 9 November 2026. Environment: Karachi Kicks SupportOps Lab, a Shopify development store.
This is a practical delivery record. Repository files describe the implementation; live results establish what works.

## 1. Intent — the business outcome

A shopper asks for a product within a budget. The assistant finds current Shopify data, creates a requested test cart, and offers Shopify checkout for human review.
The merchant gains a demonstrable shopping integration and evidence of failures that can prevent an agent-assisted purchase.
Today's scope is product discovery, cart operations and checkout handoff. It does not include taking payment or creating a paid order.

## 2. Specify — measurable acceptance requirements

| ID | Requirement | Evidence required |
|---|---|---|
| A1 | Find Runner Pro under USD 80 using live Shopify data. | Returned product, exact variant and current price. |
| A2 | Add one item only after the shopper asks. | Nonempty Shopify cart, quantity one, merchant total USD 79 at the observed price, no warnings. |
| A3 | Give the buyer a Shopify checkout link only for a valid cart. | Merchant-issued link; rendered checkout inspected separately from an HTTP response. |
| A4 | Refresh and cancel the current conversation's cart. | Successful reads; cancellation response; accurate display of a missing or cancelled cart. |
| A5 | Report unavailable products and errors honestly. | Empty search does not create a cart; stock warnings and timeouts do not become success messages. |
| A6 | Restrict the assistant to the four shopping tools. | Attempts to reveal secrets, edit price or submit payment are refused without those tool calls. |
| A7 | Recover from a controlled deployment fault. | Failure evidence, rollback result and restored catalog response. |
| A8 | Keep evidence and source reproducible. | Versioned source, tests, release identifiers and this delivery record, without secrets or private cart links. |

## 3. Plan — how the parts work together

- **Shopify:** owns products, variants, availability, cart results and checkout.
- **Cloudflare Worker:** exposes the four permitted tools and validates inputs and merchant responses.
- **n8n:** runs the signed-in chat, model, conversation memory and calls to those tools.
- **Browser:** shows the shopper's conversation and the actual handoff experience.
- **GitHub:** holds implementation, acceptance evidence and release history.

The assistant uses `search_catalog`, `create_cart`, `get_cart` and `cancel_cart`. It cannot submit orders or payments.
Admin catalog access and a valid UCP discovery document are separate checks; neither alone proves shopping operations work.

## 4. Tasks — implementation and evidence trace

| Task | Acceptance | Implementation | Observed result / status |
|---|---|---|---|
| Read the live product and demonstrate a price change. | A1 | `src/worker.mjs`, `catalog.graphql` | Prior exercise verified USD 79 → 80 → 79 through fresh API responses. |
| Run the authenticated AI shopping conversation. | A1, A2 | `n8n/shopping-assistant.sdk.js`, `src/commerce.mjs` | Browser run found Runner Pro and created one-item USD 79 cart without warnings. Final saved AI execution 591 also passed search/create/cancel/get with accurate reporting. |
| Inspect the handoff as a shopper. | A3 | `src/commerce.mjs`, Shopify checkout | Signed-in Chrome journey reached rendered Shopify checkout after authorized storefront password entry: Runner Pro, quantity one, USD 79. The page explicitly says payments are unavailable. |
| Handle cart refresh, cancellation and missing carts. | A4 | `src/commerce.mjs`, `public/shopping.js`, `test/commerce.test.mjs` | Cancellation display corrected. Actual Shopify missing-cart response preserved instead of generic rejection. 30 automated tests passed. Deployed create → refresh → cancel → get lifecycle passed at 18:49 Pakistan time; final read returned not_found/cart_not_found with no items or handoff. |
| Test unavailable merchandise and prohibited actions. | A5, A6 | Agent instructions, tool allowlist | Earlier runs: nonexistent product returned no results; prohibited price/secret/payment request caused no tool call. Earlier cart rejection exposed a stock error. |
| Rehearse recovery. | A7 | `wrangler.jsonc`, Worker configuration | Earlier controlled catalog configuration fault produced 503; rollback restored catalog 200 and USD 79. |
| Record release and handover. | A8 | `RELEASE.json`, acceptance documents, this file | Release identifiers and final live results are recorded in RELEASE.json and SHOPPING-ACCEPTANCE-2026-11-09.md. |

Evidence above distinguishes earlier exercises, the current browser journey and deterministic API checks. The initial model retrospective was inconsistent. Its reporting instructions were corrected and republished; saved execution 591 then passed search → create → cancel → get with an accurate explanation. Both the deterministic lifecycle and sanitized AI trace establish the final result.

## 5. Implement — delivered changes and final acceptance

1. Completed the authenticated hosted-chat journey and inspected rendered checkout through authorized owner access. No customer details or payment were entered.
2. Fixed cancellation acknowledgement wording and the actual Shopify cart_not_found response shape. Added regression coverage; the final deployed lifecycle confirmed the same cart no longer exists.
3. Recorded the current Worker release, application source commit, n8n published version and test count in RELEASE.json.
4. Preserved the real store limitation: Shopify displays payments unavailable. Checkout handoff is demonstrated; purchase completion is not.

## Five-minute repeatable demonstration

1. Open the signed-in hosted chat and say: **“Find Runner Pro under USD 80 and add one to a test cart. Do not place an order or make a payment.”**
2. Inspect the returned product, quantity, merchant totals and any warning. Explain that the result came from the store at that moment.
3. Follow **Review cart on Shopify**. A fresh visitor needs the development storefront password. Inspect the item and price. This store currently displays payments unavailable; do not claim payment completion. Shipping and tax need a supported address.
4. Return to chat, request a cart refresh, then request cancellation. Inspect the returned state; do not infer deletion from an acknowledgement alone.
5. Ask for a deliberately nonexistent product, then ask the assistant to change a product price. Show the honest empty result and restricted capabilities.

For another merchant, replace the product and budget with an agreed test item. Confirm stock and publication first; do not force inventory or promise availability based on search alone.

## A service a client can commission

**Shopify Agent Commerce Readiness and Shopping Integration Pilot**

Scope: one Shopify store, one agreed catalog journey, UCP discovery and operation checks, a restricted shopping assistant, cart-to-checkout handoff, error tests and a handover report.
Deliverables: findings with evidence, scoped fixes, versioned integration source, deployment and rollback instructions, an acceptance demonstration and a list of production requirements.
Acceptance: the agreed product can be discovered, a correct cart can be created, and an authorized shopper can reach checkout; failures are reported accurately.
Position this portfolio example as a development-store integration demonstration. It is not proof of production customer operation, payment completion or inclusion in any AI shopping platform.

## Production requirements before a client launch

- Authenticate and authorize the public shopping endpoints; apply rate limits and abuse controls.
- Bind carts to authorized sessions; assess cart capability links and retained manual/error execution data.
- Explicitly allowlist tools in n8n; review intermediate-step exposure, secret handling and least-privilege access.
- Test the client's publication, inventory, variants, currency, discounts, delivery, tax, returns and checkout rules with agreed cases.
- Confirm model costs, monitoring, failure alerts, timeout/retry policy, deployment ownership and recovery responsibilities.
- Use the client's approved payment test process for payment acceptance; obtain a separate decision before production payment or customer-data work.

This sprint establishes specific demonstrated capabilities. Broader skill level, production readiness, platform approval and future client revenue require separate evidence.
