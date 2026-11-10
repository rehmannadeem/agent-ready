# Realistic Shopify catalogue — approval pack

**10 November 2026 · Asia/Karachi · Stages 1–2 only · Gate 2 awaiting Nadeem**

Branch: `feat/realistic-catalogue-20261110`, based on `a813eaedf2bc1e5b37ce958415c0ae944aca7726` (PR #1 head verified today). These documents specify future work; no scale feature is implemented by this change.

Start with [Gate 2 report](GATE-2-REPORT.md), then [Intent](01-INTENT.md) and [Specification](02-SPECIFY.md).

| Stage | Record | Current status / exit gate |
|---|---|---|
| 1 Intent | [01-INTENT](01-INTENT.md) | Prepared; business scope stated. |
| 2 Specify | [02-SPECIFY](02-SPECIFY.md) | Prepared with explicit unresolved preconditions; **Gate 2 pending**. |
| 3 Plan | [03-PLAN](03-PLAN.md) | Not started; Gate 2 required. |
| 4 Tasks | [04-TASKS](04-TASKS.md) | Not started; approved architecture required. |
| 5 Implement | [05-IMPLEMENT](05-IMPLEMENT.md) | Not started; reviewed task set and Gate 2 required. |
| 6 Validate | [06-VALIDATE](06-VALIDATE.md) | Not started; budget and implementation prerequisites; stop at Gate 6. |
| 7 Ship | [07-SHIP](07-SHIP.md) | Not started; explicit **approve ship** required. |

Specification appendices: [Catalogue](CATALOGUE-SPEC.md), [25 scenarios](SCENARIO-MATRIX.md), [live tool contract](MCP-CONTRACT.md), [limits and permissions](SHOPIFY-LIMITS.md), [cost and memory](COST-AND-MEMORY.md).

Evidence: [read-only merchant tools/list](evidence/shopify-mcp-tools-2026-11-10.json). No mutation or model evaluation was performed to prepare this pack. The prior runtime and RELEASE.json remain unchanged.

Nadeem is the approval authority. Claude reviews this report against the repository; that review does not itself authorize store writes, billing, merges or deployment.
