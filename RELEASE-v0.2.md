# v0.2 batch milestone — FOR CLAUDE REVIEW

## Changes

- CLI batch audit of up to 50 unique public domains with 1–5 workers (default 3).
- One CSV and one portable HTML report with score, coverage, explicit ungraded
  rows, findings, fixes and request evidence.
- Shared per-host pacing and 429 cooldowns, including Retry-After HTTP dates.
- Public-address validation, pinned DNS connection, redirect checks and response
  limits. TLS certificate verification remains enabled.
- Unreadable MCP and robots.txt checks are excluded from scoring. Missing sampled
  product pages are labeled Not checked in Markdown as well as batch exports.
- Offline unittest CI on Python 3.10/3.14, Linux/Windows.

## Verification

Run `python -m unittest discover -v`. The suite includes a subprocess executing
`python agent_ready.py --batch domains.txt` against 50 synthetic domains with
real sockets disabled. It checks two output files, 50 rows, one ungraded domain
and one domain with partial coverage. Synthetic results are not client evidence.

## Release state and version

This is a branch-only review candidate; no merge or public release is performed.
The requested `v0.2` tag is prepared locally on the candidate branch commit.
It is not pushed. Release publication remains with Nadeem after Claude review.
The source already advertised internal revision `0.2.1` before this work; that
identifier is retained rather than silently downgraded. The requested `v0.2`
tag names the batch milestone.

After approval, Nadeem can inspect the commit, confirm its CI checks, then push
that exact tag and publish these notes as the GitHub release. Do not move an
existing published tag to a different commit. This document is not an automated
release workflow and does not merge the branch.

## Limits

Public discovery evidence only. No live catalog queries, carts, checkouts,
purchases, measured business outcomes or catalog-wide quality claims.
A 429 cooldown longer than 30 seconds produces Not checked results until it
expires. Only standard HTTP ports are supported; environment proxies are ignored.
The stricter public-only transport also applies to single-store and MCP audits.
Batch exit code 0 means reports were written, not that every store was graded.
