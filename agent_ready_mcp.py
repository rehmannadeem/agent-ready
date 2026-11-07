#!/usr/bin/env python3
"""
Agent-Ready Audit as an MCP server.

Lets Claude Desktop, ChatGPT apps, Cursor or any MCP client run the audit as a tool:
    "Audit allbirds.com for AI-agent readiness."

Requires:  pip install mcp
Runs over stdio (the standard local MCP transport).
"""
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import agent_ready as ar  # noqa: E402

try:  # MCP Python SDK 2.x
    from mcp.server.mcpserver import MCPServer as Server  # noqa: E402
except ImportError:  # MCP Python SDK 1.x
    from mcp.server.fastmcp import FastMCP as Server  # noqa: E402
try:
    from mcp.types import ToolAnnotations  # noqa: E402
    READ_ONLY = ToolAnnotations(readOnlyHint=True, destructiveHint=False, openWorldHint=True)
except ImportError:
    READ_ONLY = None

REPORTS = HERE / "reports"
MAX_BATCH = 5   # keep batch audits polite and inside client time limits

mcp = Server("agent-ready-audit")


def _save(r):
    REPORTS.mkdir(exist_ok=True)
    host = re.sub(r"^https?://", "", r["store"]).replace("/", "_")
    md = REPORTS / f"{host}.md"
    md.write_text(ar.render_markdown(r), encoding="utf-8")
    (REPORTS / f"{host}.json").write_text(json.dumps(r, indent=2), encoding="utf-8")
    return md


@mcp.tool(annotations=READ_ONLY)
def audit_store(store: str) -> str:
    """Audit one online store for AI shopping-agent readiness.

    Checks the public UCP commerce manifest (/.well-known/ucp), the store's agent
    MCP endpoint, core capabilities (catalog search, lookup, cart, checkout),
    payment handlers, refund/shipping policies, AI bot access in robots.txt and
    product structured data. Public endpoints only: no login, no purchases.
    Takes 15-60 seconds because requests are spaced out politely.

    Args:
        store: the store's domain, for example "allbirds.com".
    Returns:
        A markdown report with score, coverage, findings and fixes. The report is
        also saved to the reports folder.
    """
    r = ar.audit(store)
    if r.get("error"):
        return f"Audit incomplete for {store} - not graded. {r['error']}"
    path = _save(r)
    return ar.render_markdown(r) + f"\n_Saved to {path}_\n"


@mcp.tool(annotations=READ_ONLY)
def audit_stores(stores: list[str]) -> str:
    """Audit up to 5 stores and return a comparison table.

    Use for an agency's client list or a set of prospects. Each store takes
    15-60 seconds. Full reports are saved to the reports folder.

    Args:
        stores: list of store domains, maximum 5.
    """
    if len(stores) > MAX_BATCH:
        return f"Please send at most {MAX_BATCH} stores per call; received {len(stores)}."
    rows = ["| Store | Score | Grade | Coverage | High issues | Top finding |",
            "|---|---|---|---|---|---|"]
    for s in stores:
        r = ar.audit(s)
        if r.get("error"):
            rows.append(f"| {s} | - | - | - | - | Not graded: {r['error'][:80]} |")
            continue
        _save(r)
        high = sum(1 for x in r["findings"] if x["severity"] == "HIGH")
        top = r["findings"][0]["finding"][:90] if r["findings"] else "No issues found"
        rows.append(f"| {s} | {r['score']} | {r['grade']} | {r['coverage']}% | {high} | {top} |")
    return "\n".join(rows) + f"\n\nFull reports saved in {REPORTS}"


if __name__ == "__main__":
    mcp.run()
