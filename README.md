# Agent-Ready Audit

**Can AI shopping agents buy from your store?**

ChatGPT, Gemini and Copilot can now search products, build carts and check out on a shopper's behalf. In 2026 Shopify opened this "agentic commerce" layer to every developer through the Universal Commerce Protocol (UCP). Stores that agents cannot read, or cannot transact with, get left out of AI shopping answers.

This tool checks a store from the outside, the way an AI agent sees it, and tells you what to fix.

```
python agent_ready.py allbirds.com yourstore.com
```

## What it checks

| Area | What is tested | Why agents care |
|---|---|---|
| Commerce manifest | `/.well-known/ucp` exists, parses, and which UCP version it advertises | It is how an agent discovers that a store supports AI checkout |
| Headless gap | If the public domain has no manifest, whether the Shopify backend does | Headless front ends often forget to serve the manifest |
| Agent endpoint | The MCP endpoint in the manifest answers `initialize` and `tools/list` | This is the live interface agents call |
| Core capabilities | Catalog search, catalog lookup, cart, checkout | Missing any one breaks an end-to-end purchase |
| Payment handlers | Which payment methods are exposed to agents | Agents can only complete payment through listed handlers |
| Policies | Refund, shipping, privacy and terms pages with real content | Agents compare delivery and returns before recommending |
| robots.txt | Whether AI search and assistant bots are blocked site-wide | Blocking them hides the store from AI answers. Training-bot opt-outs are reported as information only |
| Product data | schema.org Product JSON-LD with price, availability, GTIN, brand | Agents need clean, structured data to match and compare products |

Output: a score out of 100, a letter grade, findings ranked by severity with a plain-English fix for each, and a JSON file with every request made.

## Install and run

Python 3.10 or newer. No required packages.

```
git clone https://github.com/rehmannadeem/agent-ready.git
cd agent-ready
python agent_ready.py yourstore.com
```

On Windows, also run `pip install truststore`. It makes Python use the operating system's certificate checks. Some Windows machines hold an expired root certificate that breaks Python's default check. Certificate verification is never switched off.

Reports are written to `reports/` (git-ignored, so audits of other people's stores stay private).

## Use it from Claude, ChatGPT or Cursor (MCP server)

The audit also runs as an MCP server, so an AI assistant can call it as a tool.

```
pip install mcp
```

Add this to your MCP client's config (in Claude Desktop: **Settings → Developer → Edit Config**), using your own path:

```json
{
  "mcpServers": {
    "agent-ready-audit": {
      "command": "python",
      "args": ["/path/to/agent-ready/agent_ready_mcp.py"]
    }
  }
}
```

Restart the client, then ask: *"Audit allbirds.com for AI-agent readiness."*

| Tool | What it does |
|---|---|
| `audit_store` | Full report for one store |
| `audit_stores` | Comparison table for up to 5 stores (an agency's client list, or prospects) |

Both tools are marked read-only. Reports are also saved to `reports/`. Works with MCP Python SDK 1.x and 2.x.

Check it without any AI client: `python mcp_smoke_test.py yourstore.com`

## Example output

```
Auditing allbirds.com ...
  score 100/100 grade A | coverage 85% | high issues: 0 | requests: 12 | report: reports\allbirds.com.md
```

See [`examples/allbirds.com.md`](examples/allbirds.com.md) for a full report.

A common finding on headless (custom front-end) Shopify stores: the Shopify backend publishes the agent manifest, but the public domain does not serve it. The audit detects this and names the backend domain, so the fix is a single route on the front end.

## Design choices

- **Public endpoints only.** No login, no admin access, no cart or checkout actions.
- **Polite.** One request at a time, a one-second gap between requests, and backs off when a store returns HTTP 429.
- **Never reports a false failure.** If a page cannot be read (rate limit, block, network error), that check is marked "not checked" and left out of the score. The report states its coverage. If the store or its manifest cannot be read at all, no grade is given.
- **Headless-aware.** Policies kept on a separate support site are found from homepage links and scored as "elsewhere", not "missing". Gift cards are skipped when sampling a product.
- **Identifies itself.** The User-Agent names the tool and links back to its author.

## Tests

```
python -m unittest -v
```

Offline tests cover scoring, coverage, the headless gap, robots.txt parsing and structured-data parsing. No network needed.

## Limits

- Live catalog queries through the agent endpoint require a registered UCP agent profile. They are not part of this public audit yet.
- One product page is sampled. A full catalog-quality audit needs merchant access.
- A good score means agents can technically transact with the store. It does not measure how often agents choose to recommend it.
- UCP moves fast. The newest version known to this release is `2026-08-25`.

## Roadmap

- [x] MCP server, so Claude, ChatGPT or Cursor can run audits as a tool
- [ ] Catalog-quality sampling through the UCP endpoint (needs an agent profile)
- [ ] Batch mode with CSV output for agencies auditing many client stores
- [ ] n8n workflow: new lead → automatic audit → draft report email for human review

## Author

Built by **Rehman Nadeem** ([Armans.AI](https://armans.ai)). 25 years in IT systems and networking, now building AI automations that fail safely and leave an audit trail.

Need this fixed on your store, or run across your agency's client list? Open an issue or reach out through armans.ai.

MIT licence.
