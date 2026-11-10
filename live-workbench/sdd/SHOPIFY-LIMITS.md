> **Current Gate 2 decision, 10 November 2026:** only write_products, write_inventory, write_publications and write_discounts are approved for the separate seed app. **Do not request write_locations or create a location.** The optional location proposal below is historical and superseded. Actual read-only runtime API preflight confirms Basic development store, USD, 18 products / 27 variants, bucket 2,000 and restore rate 100 points/second. Seed preflight must repeat these checks with the seed credential before any writes.

# Shopify limits and permissions — Stage 2 research
Checked: **10 November 2026 (Asia/Karachi)**. Intended Admin API: **2026-07**.
Scope: read-only documentation research for **318 synthetic products / approximately 3,266 variants**: 300 shopper-eligible products plus 10 draft, 5 archived and 3 publication-exclusion specimens. No store queries, mutations, credentials, deployments, model calls or load tests were performed by this research task.

## Decisions to carry into Gate 2

1. This proposed catalogue fits the documented per-product capacity if the generator enforces at most **2,048 variants and three options on each product**. Total variants across 318 products are not a per-product limit.
2. Do not claim “development stores have a 1,000-variant/day cap.” No distinct development-store daily creation cap was established in current official documentation. Current API guidance and pinned productCreate documentation conflict on the resource threshold; record the conflict below.
3. **Unpublished from Online Store is not equivalent to excluded from every agent surface.** Define the three exclusion specimens as unavailable on all shopper-facing publications relevant to this assistant, verify publication records, and independently test actual UCP search and lookup. Do not describe a Worker-side exclusion filter as proof Shopify's own UCP hid the products.
4. The runtime credential remains read-only. Propose a separate seed credential only after Gate 2. Write scopes are broad resource permissions, not tag-scoped; tag ownership checks must be enforced by our own seed/teardown code.

## Limits relied on

Every URL below was checked on **2026-11-10**.

| Limit / behavior | Verified value and qualification | Source |
|---|---|---|
| Variants per product | Default maximum **2,048 per product**; applies to the proposed use of GraphQL product APIs. | [2026-07 productVariantsBulkCreate](https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/productVariantsBulkCreate) |
| Product options | Maximum **three options per product**. Keep Size/Colour/Fit or Waist/Length/Colour within this. | [Shopify Help: adding variants](https://help.shopify.com/en/manual/products/variants/add-variants) |
| Query cost | GraphQL Admin uses cost, not a fixed requests/second count, per **app + shop**. Standard 100, Advanced 200, Plus 1,000, enterprise 2,000 cost-points/second. Store's actual plan/rate remains unverified here; use response throttleStatus. | [GraphQL Admin limits](https://shopify.dev/docs/apps/build/apis/graphql-admin/rate-limits) |
| Single query | Requested cost maximum **1,000 points**, regardless of plan. Nested product/variant reads can require smaller pages even below this. | [GraphQL Admin limits](https://shopify.dev/docs/apps/build/apis/graphql-admin/rate-limits) |
| Array inputs | General maximum **250 elements per input array**. Batch applicable variant/inventory/publication inputs accordingly; do not confuse this with 2,048 stored variants/product. | [API limits](https://shopify.dev/docs/api/usage/limits) |
| Pagination | General object pagination/count cap **25,000**. Proposed catalogue is below it, but still requires cursors and bounded pages. | [API limits](https://shopify.dev/docs/api/usage/limits) |
| Current resource throttle | Current limit guide: once a store reaches **500,000 variants**, at most **10,000 new variants/day**; Plus exempt. Current Help also describes a 24-hour CSV/API window beginning with the first upload. | [API limits](https://shopify.dev/docs/api/usage/limits), [CSV import issues](https://help.shopify.com/en/manual/products/import-export/common-import-issues) |
| Conflicting pinned text | **2026-07 productCreate still says 50,000 existing variants → 1,000 new variants/day**. Do not silently choose one as proven behavior for this installation. The proposed addition is below either existing-total threshold only if the store's full baseline count confirms it. If enforcement differs or throttles appear, stop and resolve, never bypass. | [2026-07 productCreate](https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/productCreate) |
| Dev-store-specific daily cap | **Not established.** Official dev-theme docs allow unlimited unique products; this is a storage statement, not unlimited API throughput. Dev stores can use different simulated plans. Normal API and anti-abuse controls still apply. | [Dev stores for themes](https://shopify.dev/docs/storefronts/themes/tools/development-stores), [Dev stores](https://shopify.dev/docs/apps/build/stores/development-stores) |
| productCreate | Creates a product with its **initial variant only**; publication is a separate operation. Use supported variant creation for the rest. | [2026-07 productCreate](https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/productCreate) |
| productVariantsBulkCreate | Creates multiple variants for **one existing product** per call; supports bulk-operation use. It is not one call that creates all products. Select the default-variant strategy deliberately. | [2026-07 productVariantsBulkCreate](https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/productVariantsBulkCreate) |
| Bulk mutation operations | For 2026-01+: up to **five concurrent bulk mutations/app/shop**; JSONL ≤ **100 MB**; completion within **24 hours**; supplied mutation limited to one connection field. Any Admin mutation except recursive bulk query/mutation operations is supported. Partner-created apps can need bulk-operation enablement, and unused access can lapse after 31 days. This is not needed to prove the proposed scale; final method belongs to Stage 3. | [Bulk imports](https://shopify.dev/docs/apps/build/apis/graphql-admin/bulk-operations/imports) |
| productSet caution | List fields reconcile state and can delete omitted entries; scalar fields update only when supplied. An idempotent upsert must never replace unrelated product data. | [2026-07 productSet](https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/productSet) |

## Publication and visibility contract

A publication governs products/collections for its associated channel and catalogue context; autoPublish can publish new products automatically. Online Store is one publication context, not every sales surface. [Publication, 2026-07](https://shopify.dev/docs/api/admin-graphql/2026-07/objects/Publication)

Current publish documentation requires ACTIVE status for visibility in a channel. The pinned 2026-07 publishablePublish page could not be retrieved through the research service; the current 2026-10 reference confirms write_publications and the publication behavior, but exact 2026-07 mutation inputs must be schema-checked before later implementation. [publishablePublish, current](https://shopify.dev/docs/api/admin-graphql/latest/mutations/publishablePublish)

The Storefront Catalog reference does not specify an Online-Store-only publication rule. Treat its actual visibility for this store as **not yet verified**. Global Shopify Catalog eligibility is separate: eligible publication can be Online Store, Hydrogen or Headless; development/private-mode stores are restricted. No global AI marketplace listing is promised. [Storefront Catalog](https://shopify.dev/docs/agents/catalog/storefront-catalog), [Global Catalog eligibility](https://help.shopify.com/en/manual/shopify-catalog/requirements)

Recommended S05 specification: all 18 excluded specimens must be absent from this assistant's search, direct lookup and shopper browse responses; fresh attempts to cart their variant IDs must not produce a purchasable handoff. Separately record merchant-UCP behavior and application enforcement. All surfaces and selected market/publication IDs must be explicit in acceptance evidence. Draft/archived labels alone are not a substitute for testing.

## Proposed least-privilege seed permissions — approval only

Shopify write scopes include read access to the same resource. Do not request redundant read/write pairs solely for convenience. [Access scopes](https://shopify.dev/docs/api/usage/access-scopes)

| Seed operation | Candidate scope / qualification | Primary reference checked 2026-11-10 |
|---|---|---|
| Products, variants, prices, tags, inventory policy; collections | **write_products**. Collection creation also requires a supported plan and user permission; Starter/Retail are excluded by the reference. | [productVariantsBulkCreate](https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/productVariantsBulkCreate), [collectionCreate](https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/collectionCreate) |
| Inventory activation and quantity changes | **write_inventory**. For 2026-07, inventoryActivate and inventorySetQuantities require @idempotent. inventorySetQuantities requires changeFromQuantity on each quantity (explicit null opts out); use CAS for controlled stock simulations. | [inventoryActivate](https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/inventoryActivate), [inventorySetQuantities](https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/inventorySetQuantities) |
| Read locations | Location permits **read_inventory OR read_locations OR read_markets_home**. Prefer existing effective inventory read access from write_inventory; add read_locations only if the validated selected query requires it. | [Location](https://shopify.dev/docs/api/admin-graphql/2026-07/objects/Location) |
| Create second location | **write_locations**, optional only if this store supports it and owner approves creation. Reuse existing locations when appropriate; do not add the scope preemptively. | [locationAdd](https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/locationAdd) |
| Publish/unpublish owned specimens; inspect publications | **write_publications**, includes publication reads. Query publications requires read_publications (covered by corresponding write access). | [publishablePublish, current](https://shopify.dev/docs/api/admin-graphql/latest/mutations/publishablePublish), [publications, 2026-07](https://shopify.dev/docs/api/admin-graphql/2026-07/queries/publications) |
| Percentage/fixed amount discount codes | **write_discounts**. Existing basic discount mutation supports percentage/fixed amount; exact expiry/minimum-spend input schema to validate later. | [discountCodeBasicCreate](https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/discountCodeBasicCreate) |

Recommended initial scope proposal: **write_products, write_inventory, write_publications, write_discounts**; optional write_locations only for an approved new second location. No customers, orders, payments or theme scopes. No files scope if images are omitted. Do not assume product metafields are returned by UCP: creation/exposure/queryability is a separate capability check, with “not tested” if unsupported.

## Unresolved before seed execution

- Full existing variant count, simulated plan, actual throttleStatus and location/publication IDs not read in this research task.
- Conflicting resource-throttle documentation remains explicit.
- Distinct development-store daily variant cap was not documented in inspected current official sources; absence of a published cap is not a guarantee of unlimited creation.
- Publication exclusions and UCP visibility require explicit later tests on the correct store and market.
- Bulk-operation access depends on how the separate seed app is created.
- Gate 2 remains **pending**. This document grants no store-write or credential approval.

