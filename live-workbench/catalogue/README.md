# Synthetic catalogue execution

Scope: the approved development store `karachi-kicks-supportops-lab.myshopify.com` only. No production deployment, orders, customer records or payment actions. Runtime credentials are never used by these scripts.

## Artifacts and credentials

- `seed-v1.json` is the fixed-seed canonical input; `seed-v1.csv` is a one-row-per-variant review export. `seed-v1.sha256.json` records both digests.
- 318 products / 3,266 variants total; 300 shopper-eligible products / 3,248 variants; 10 draft, 5 archived, 3 active-but-unpublished specimens; 15 collections and 4 synthetic-only discount codes.
- Use a separate seed app with exactly `write_products,write_inventory,write_publications,write_discounts`. Read equivalents implicitly granted by these scopes are accepted. No location/customer/order/theme writes.
- Provide `SEED_ACCESS_TOKEN` **or** `SEED_CLIENT_ID` and `SEED_CLIENT_SECRET` through the local process environment. Never paste credentials into source, reports, chat, or runtime settings. The client-credentials exchange only obtains a token for this seed process.
- Live IDs go to `catalogue/owned-manifest.local.json`; read-only observations to `catalogue/preflight.local.json`; simulations to `simulate/<type>.local.json`. Keep all `*.local.json` out of Git and retain the ownership manifest securely for reruns/restores.

## Execution

1. Run `node catalogue/seed.mjs`. This is read-only. It reads identity, scopes, exact counts, actual throttle data, existing products, locations, publications and the full pinned **2026-07** schema. The known baseline is 18 existing products / 27 variants, retained untouched. It checks development-plan/USD identity and forbids extra scopes. It cannot authorize writes until selected IDs are supplied and the full preflight passes.
2. From the returned IDs, set `SEED_LOCATION_IDS` to one or two existing suitable locations, including the existing US location. Set `SEED_PUBLICATION_IDS` to the explicit shopper-facing publication IDs selected for this evaluation. Both are comma-separated GraphQL IDs. Do not infer an agent publication from the Online Store name. No new locations are created.
3. Run `node catalogue/seed.mjs` again. It must return `ok: true`. Every operation is parsed/validated against the actual pinned schema; each later request's variables are coerced against that schema before dispatch. Custom scalar semantics (for example monetary formatting) are also checked by Shopify. API-version fallback is refused.
4. The authorized seed execution is `node catalogue/seed.mjs --apply`. It repeats preflight in the same process, then creates draft products, captures IDs, explicitly sets status/publications, and verifies variant, price, option, inventory and publication state. The three active exclusions are checked against **every publication returned by the authorized API**, not just Online Store. It creates owned collections and four collection-restricted codes. UCP visibility and cart acceptance remain separate tests.
5. Repeat the same command to verify an unchanged seed without duplicating products. Existing handles are never adopted without a recorded ID and both ownership tags. Input changes, live edits, a changed baseline, mismatched inventory/publication state or an unresolved mutation halt execution.

The client is serial, uses actual requested query costs and throttle restoration rates, and stops on HTTP 429, GraphQL errors, unexpected API versions or ambiguous mutation outcomes. It never retries an unknown create. A persisted `pending` mutation requires explicit read-only reconciliation; do not delete it and blindly rerun. New seed revisions require review rather than replacing existing product lists through `productSet`.

Actual 2026-07 testing established that location `name` and `isActive` require additional read scopes. To retain the approved four write scopes, the API reads location IDs only. `SEED_LOCATION_ATTESTATION_PATH` supplies separately observed Shopify Admin settings evidence for active status, online-order fulfillment eligibility and country. The merge requires the exact store, API-returned IDs, matching settings URLs, explicit booleans/country and evidence no older than 24 hours; it rejects unknown IDs, missing fields and conflicting API evidence. The source distinction is retained in every preflight. The dated attestation in `catalogue/evidence/` records the two locations observed during this run. Toronto has shipping disabled and zero shipping rates; seeding inventory there does not establish shipping availability.

GraphQL is pinned to **16.15.0**. Full live schema and all 20 operation documents passed this validator. GraphQL 17 introduced stricter interface-deprecation rules that reject six unrelated fields in Shopify's emitted schema; no `assumeValid` bypass is used.

The seed CLI and simulation CLI hold one exclusive `<manifest>.lock` file for their whole process, including authentication, read-only preflight, writes and restoration. Acquisition uses atomic `wx`; a concurrent process fails before reading or modifying the manifest. Normal completion or a caught error releases only that process's own lock in `finally`. A process crash leaves its lock in place: there is no age-based or PID-based removal. An operator must first establish that no owner remains active and reconcile any interrupted mutation before manually removing a stale lock. Programmatic controllers use `withManifestLock` around authentication, manifest loading and simulation as well.

## Controlled simulations

After the full seed is verified:

| Action | Command | Target |
|---|---|---|
| Stock change | `node simulate/scenarios.mjs stock --apply` | Owned black US 10 variant in `stock_simulation`, zero across its stocked locations |
| Price change | `node simulate/scenarios.mjs price --apply` | Owned black US 10 variant in `price_simulation`, price + USD 10 |
| Publication change | `node simulate/scenarios.mjs publication --apply` | Owned `publication_simulation` product, unpublish from all returned publications |
| Discount expiry | `node simulate/scenarios.mjs discount --apply` | **ARMANS-SEED-V1-MIN100**, after it has been applied in S12 |
| Restore | Append `--restore` to the matching command | Restore the journal's exact original state only if current state still equals the script's observed after-state |

All simulations repeat read-only preflight. Inventory uses Shopify's `changeFromQuantity` CAS and `@idempotent` keys. Price/publication/discount APIs do not expose an atomic conditional update; their journal and read-before-write snapshot guard catches intervening edits observed before the request, but cannot provide a transactional guarantee against a simultaneous external write. Unknown outcomes require reconciliation. Successful restores are read back and compared to the original snapshot, ignoring platform update timestamps only. Each successful restore refreshes the manifest's expected version.

The fixed valid discount window is **2026-11-10 through 2026-12-10 UTC**. Later runs need a versioned fixture revision. Do not silently move the dates.

## Teardown and limitations

`node catalogue/teardown.mjs` performs a read-only deletion preview. `--apply` is refused; there is no delete mutation in these files. The tested predicate requires both tags plus manifest ID/handle. No live deletion has been performed.

Metadata is explicit product description/text tags; **metafield-based querying is NOT TESTED**. Original descriptions and fictional vendors are used without images. Second-location behavior is NOT TESTED when only one location is selected. UCP discovery, catalogue exposure, discounts, cart totals and purchase handoff need the separate live evaluation harness; catalogue seeding alone does not establish those results.

Run deterministic tests with `node --test test/catalogue.test.mjs test/seed.test.mjs`. The provided Shopify standalone validator could not run because its schema assets were absent; the mandatory live-schema validation above is the implemented substitute. No code test is labeled as a successful store mutation.
