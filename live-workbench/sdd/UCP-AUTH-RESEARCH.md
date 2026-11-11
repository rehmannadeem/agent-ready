# UCP authentication research — for independent review

11 November 2026. Public official Shopify documentation only. No store requests, dashboard actions, credentials, authentication changes or deployments were performed for this research.

## Finding

Authenticated agent access is a production requirement for this project, but it is not configured or proven. The current runtime's isolated Admin credential does not authenticate its anonymous UCP requests. This is a code-inspection finding from the execution team, not evidence that the Admin token can be reused for UCP.

## Token versus signed access

| Route | Official requirements and implications |
|---|---|
| Token | A Shopify-issued JWT in Bearer authentication; highest tier. Merchant `tools/call` requests require the actual buyer's `Shopify-Buyer-IP`, including reads. No placeholder or server-IP fallback exists; calls without a present buyer fail. |
| Signed | RFC 9421 HTTP Message Signatures using ECDSA P-256; Shopify verifies against the public key in the agent's well-known UCP profile. Lower limits than Token; cart and checkout supported, but order tools and purchase completion are unavailable. |
| Anonymous | Lowest tier; catalog and cart only. This is the current implementation. |

Merchant allowances vary by tier/tool and can change. Honor each `Retry-After`; neither authenticated access nor ten-second spacing guarantees freedom from throttling. The documented five requests/second default concerns authenticated **Global Catalog**, not this merchant endpoint.

Source: [Auth and rate limiting](https://shopify.dev/docs/agents/profiles/auth-and-rate-limiting), sections Traffic tiers, Token, Signed, Buyer IP header, Global Catalog rate limits and Rate-limit responses.

## Documented token setup — not performed

Shopify's tutorial specifies **Dev Dashboard → Catalogs → Get an API key → name the key → Create**. It yields a client ID and secret. Runtime code exchanges these at `https://api.shopify.com/auth/access_token` using `grant_type: client_credentials`; the tutorial states a 60-minute token lifetime. The tutorial's example token scope is `read_global_api_catalog_search`.

Source: [Authenticate your agent](https://shopify.dev/docs/agents/get-started/authentication), Step 1 and Step 3.

The Catalogs page may require Partner identity verification before key creation; if locked, its documented action is **Verify to unlock**. This is conditional, not confirmation that Nadeem's organization is locked. No live Dashboard inspection was performed.

Source: [Create saved catalogs in the Dev Dashboard](https://shopify.dev/docs/apps/build/dev-dashboard/catalogs), Get API credentials.

For a future Token implementation, the owner would provide the credentials through private secret storage, never chat. Engineering would implement token refresh and trusted buyer-IP forwarding, then validate the granted permissions against the chosen merchant operations. A background evaluation must not invent buyer identity or a buyer IP. These are implementation recommendations, not actions already performed. Do not add customer/order permissions or modify the shared SupportOps app for this work.

## Profile requirements and signed-path implementation

Shopify documents a hosted HTTPS platform profile and `meta.ucp-agent.profile` in relevant requests. The merchant fetches the profile and negotiates supported capabilities; an unreadable or incompatible profile fails negotiation. Publishing capabilities alone does not prove request authentication.

Source: [Agent profiles and UCP negotiation](https://shopify.dev/docs/agents/profiles), How it works and Usage.

A future signed implementation needs protected keys and signature interoperability tests. No signing setup was performed.

## Development-store eligibility: unresolved

The reviewed authentication and profile documentation does **not explicitly establish or exclude** authenticated merchant UCP access for development stores. Do not claim universal eligibility, paid-plan requirements, or that creating a Catalogs key guarantees acceptance on Karachi Kicks SupportOps Lab. Our observed anonymous catalog/cart success is not proof of Token or Signed eligibility.

Shopify describes dev stores as testing environments, says they are always password protected, and disallows real transactions and production use. Those general policies do not answer merchant UCP tier eligibility. The observed anonymous success and current password-protection policy must both be retained without inferring a supported bypass or declaring this store ineligible. No password bypass is proposed.

Source: [Dev stores](https://shopify.dev/docs/apps/build/stores/development-stores), introduction and Limitations.

If eligibility remains unclear after the chosen implementation is reviewed, ask Shopify's support/partner contact specifically whether this development store supports the chosen UCP tier and which restrictions apply. No contact was made. Successful future authenticated responses would still require bounded evidence; they would not prove production capacity.

## Current evaluation boundary — execution team's revised instruction

The revised test scope is 12 safety-critical attempts: S05/S19/S20/S21, three repetitions each, at 19:15 PKT on 11 November, five iterations, ten-second shared spacing, stopping at the first HTTP 429. This research does not schedule or execute that test. The six old absence reads are no longer a prerequisite under the revised owner scope. Their status remains **cancellation acknowledged; absence unconfirmed**. Expiration must not be reported as verified for these carts. No new load run or authentication change is included. The broader 75-attempt suite is not completed by this critical subset.
