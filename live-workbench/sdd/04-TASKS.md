# Stage 4 — Tasks

Gate 2 approved 2026-11-10. Stage 3 architecture recorded. Stage 5 in progress; nothing below is claimed passed until evidence exists.

| ID | Work | Trace | Completion evidence |
|---|---|---|---|
| T01 | Read-only identity/config/API preflight, separate seed install | R11 | Correct shop, plan/currency/counts/scopes/publications and stop guards |
| T02 | Deterministic catalogue, owned upsert, collections/discounts/inventory | R11 | Two identical generations, target counts, second-run no duplicates |
| T03 | Bearer + signed sessions + persistent cart ownership and limits | R06/R07/R09 | 401, forged/cross-session denial, restart/concurrent edit/timeout tests |
| T04 | Paginated browse/search, detail, multiline cart, discounts | R01–R04/R10 | Deterministic and live operation evidence, exclusion tests |
| T05 | Local operator bridge and protected dashboard | R04/R09 | Cookie isolation, no browser service secret, UI verification |
| T06 | Five-iteration model harness, durable USD10 budget ledger | R05/R13 | Reservation/reconciliation tests and all actual usage records |
| T07 | Approved stock/price/publication/discount simulations | R12 | Before/after/restore evidence on owned fixtures only |
| T08 | 75 scenarios, 20-session bounded load, security and teardown-copy checks | R13 | All outcomes including failures; 68/75 minimum and critical 3/3 |
| T09 | Update seven-stage delivery and Gate6 report | R08 | Exact commits, counts, cost, remaining blockers; stop for owner |

First suite stays at five iterations. Eight requires actual exhaustion evidence and fresh owner permission. Do not merge or ship.
