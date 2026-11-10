# Stage 3 — Plan

Gate 2 approved by Nadeem on 10 November 2026. This plan preserves his six conditions. Gate 6 remains the next stop; no merge, ship or production deployment. PR #1 stays open.

1. **Read-only preflight:** verify the named Basic development store, USD, US market, existing products, locations and publications before seeding. UI checks match; authenticated API checks run after seed installation and before any data mutation. Stop on mismatch.
2. **Seed separation:** one dedicated app, only write_products/write_inventory/write_publications/write_discounts. No write_locations. Existing products remain untouched. Generate deterministic owned fixtures and verify full counts; guarded simulation and dry-run teardown operate only on owned IDs with both tags.
3. **Trusted sessions:** local operator bridge issues opaque, authenticated sessions; server-held bearer and independent HMAC assertion go to an isolated local Worker. SQLite Durable Objects own carts and serialize changes. Model arguments never select cart ownership. Browser cookies are HttpOnly; no service secret reaches JavaScript.
4. **Catalogue and commerce:** read-only Admin publication/market checks protect browse/search/detail/cart. Real UCP supplies seven discovered operations, exact variants, pagination, cart updates and discounts. Unknown eligibility fails closed.
5. **Evaluation:** five model calls maximum per shopper turn; no automatic retries. Separate inactive n8n helper performs one native Haiku call, returns actual usage; local harness owns the loop and executes local authenticated Worker tools. Reserve the worst-case charge before each call and reconcile usage. USD10 hard ceiling, unknown charges remain reserved. This validates the controlled loop, not unchanged hosted-chat integration.
6. **Recovery:** preserve current Worker/workflow. Local changes can be stopped without deployment. Retain seed manifests and simulation originals; restore only when expected state still matches. No live teardown without owner's request.

The single-call helper is a test integration, not a production workflow replacement. Any need to expand runtime read permissions is reported before changing the installed app. No new database/cloud endpoint is deployed.
