"""Smoke test: start the MCP server over stdio, list tools, run one real audit.
Usage: python mcp_smoke_test.py bombas.com
"""
import asyncio
import sys
from pathlib import Path

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

HERE = Path(__file__).resolve().parent


async def main(store):
    params = StdioServerParameters(command=sys.executable, args=[str(HERE / "agent_ready_mcp.py")])
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tools = await session.list_tools()
            print("TOOLS:", [t.name for t in tools.tools])
            result = await session.call_tool("audit_store", {"store": store})
            text = result.content[0].text
            # SDK 2.x uses is_error; SDK 1.x used isError.
            print("IS_ERROR:", getattr(result, "is_error", getattr(result, "isError", None)))
            print(text[:1500])


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "bombas.com"))
