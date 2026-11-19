"""
NowAIKit + Google Gemini.

Starts NowAIKit as a local MCP server (stdio) and lets Gemini call its ServiceNow tools through the
official MCP Python client. Gemini's SDK accepts an MCP session directly as a tool source, so tool
schemas, calls and results flow through without any manual conversion.

Requirements: pip install google-genai mcp python-dotenv
Usage:
  1. Set GEMINI_API_KEY and your ServiceNow settings in .env (see SETUP.md), or run `nowaikit setup` first.
  2. python servicenow_gemini_client.py "Show me critical incidents opened in the last 24 hours"
"""

import asyncio
import os
import sys

from dotenv import load_dotenv
from google import genai
from google.genai import types
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

load_dotenv()

# Override with GEMINI_MODEL if you want a different Gemini model.
MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash")

# Run the installed `nowaikit` package. Lean discovery keeps the tool list small for the model;
# it can still reach every tool through search_tools / run_tool.
SERVER = StdioServerParameters(
    command="npx",
    args=["-y", "nowaikit"],
    env={**os.environ, "MCP_TOOL_DISCOVERY": os.environ.get("MCP_TOOL_DISCOVERY", "lean")},
)


async def run_agent(question: str) -> str:
    # Vertex AI: set GOOGLE_GENAI_USE_VERTEXAI=true plus GOOGLE_CLOUD_PROJECT / GOOGLE_CLOUD_LOCATION instead of a key.
    client = genai.Client() if os.environ.get("GOOGLE_GENAI_USE_VERTEXAI") else genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    async with stdio_client(SERVER) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            response = await client.aio.models.generate_content(
                model=MODEL,
                contents=question,
                config=types.GenerateContentConfig(
                    tools=[session],  # Gemini calls NowAIKit tools automatically
                    system_instruction="You help with ServiceNow. Use the tools for live data and never guess record values.",
                ),
            )
            return response.text or ""


if __name__ == "__main__":
    query = " ".join(sys.argv[1:]) or "Show me critical incidents opened in the last 24 hours"
    print(f"Query: {query}\n")
    print(f"Answer:\n{asyncio.run(run_agent(query))}")
