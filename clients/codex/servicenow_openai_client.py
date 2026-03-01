"""
ServiceNow MCP + OpenAI integration.
Loads MCP tool schemas and adapts them as OpenAI function definitions.

Requirements: pip install openai python-dotenv
Usage:
  1. Copy .env.basic.example or .env.oauth.example to .env and fill in credentials.
  2. python servicenow_openai_client.py
"""

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

import openai
from dotenv import load_dotenv

load_dotenv()

# Path to the built MCP server (relative to this file's location)
_SCRIPT_DIR = Path(__file__).parent
_SERVER_PATH = _SCRIPT_DIR / ".." / ".." / "dist" / "server.js"

# ServiceNow auth env vars forwarded to the MCP subprocess
_MCP_ENV_KEYS = {
    "SERVICENOW_INSTANCE_URL", "SERVICENOW_AUTH_METHOD",
    "SERVICENOW_BASIC_USERNAME", "SERVICENOW_BASIC_PASSWORD",
    "SERVICENOW_CLIENT_ID", "SERVICENOW_CLIENT_SECRET",
    "SERVICENOW_USERNAME", "SERVICENOW_PASSWORD",
    "WRITE_ENABLED", "MCP_TOOL_PACKAGE",
    "NOW_ASSIST_ENABLED", "ATF_ENABLED", "SCRIPTING_ENABLED",
}
_MCP_ENV = {k: v for k, v in os.environ.items() if k in _MCP_ENV_KEYS}


def _run_server(stdin_payload: str) -> dict[str, Any]:
    result = subprocess.run(
        ["node", str(_SERVER_PATH.resolve())],
        input=stdin_payload,
        capture_output=True,
        text=True,
        env={**os.environ, **_MCP_ENV},
    )
    if result.returncode != 0:
        raise RuntimeError(f"MCP server error: {result.stderr}")
    return json.loads(result.stdout)


def get_mcp_tools() -> list[dict]:
    """Fetch tool schemas from the MCP server."""
    payload = json.dumps({"jsonrpc": "2.0", "method": "tools/list", "id": 1})
    response = _run_server(payload)
    return response.get("result", {}).get("tools", [])


def mcp_tools_as_openai_functions(tools: list[dict]) -> list[dict]:
    """Convert MCP tool definitions to OpenAI function calling format."""
    return [
        {
            "type": "function",
            "function": {
                "name": t["name"],
                "description": t["description"],
                "parameters": t["inputSchema"],
            },
        }
        for t in tools
    ]


def call_mcp_tool(name: str, arguments: dict) -> str:
    """Execute a tool via the MCP server and return the result as text."""
    payload = json.dumps({
        "jsonrpc": "2.0",
        "method": "tools/call",
        "params": {"name": name, "arguments": arguments},
        "id": 1,
    })
    response = _run_server(payload)
    content = response.get("result", {}).get("content", [])
    return "\n".join(c.get("text", "") for c in content if c.get("type") == "text")


def run_agent(user_message: str) -> str:
    """
    Simple agentic loop: sends a message to GPT-4o with ServiceNow tools
    available and resolves any tool calls until a final text answer is produced.
    """
    mcp_tools = get_mcp_tools()
    openai_tools = mcp_tools_as_openai_functions(mcp_tools)

    client = openai.OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    messages = [{"role": "user", "content": user_message}]

    while True:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            tools=openai_tools,
            tool_choice="auto",
        )
        choice = response.choices[0]

        if choice.finish_reason == "stop":
            return choice.message.content or ""

        if choice.finish_reason == "tool_calls":
            tool_calls = choice.message.tool_calls or []
            messages.append(choice.message)

            for tc in tool_calls:
                args = json.loads(tc.function.arguments)
                result = call_mcp_tool(tc.function.name, args)
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": result,
                })

        else:
            break

    return ""


if __name__ == "__main__":
    query = " ".join(sys.argv[1:]) or "List my 5 most recent open P1 incidents"
    print(f"Query: {query}\n")
    answer = run_agent(query)
    print(f"Answer:\n{answer}")
