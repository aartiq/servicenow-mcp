"""
ServiceNow MCP + Google Gemini integration.
Loads MCP tool schemas and adapts them for Gemini function calling.

Requirements: pip install google-generativeai python-dotenv
Usage:
  1. Copy .env.basic.example or .env.oauth.example to .env and fill in credentials.
  2. python servicenow_gemini_client.py
"""

import json
import os
import subprocess
from pathlib import Path
from typing import Any

import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

genai.configure(api_key=os.environ["GEMINI_API_KEY"])

_SCRIPT_DIR = Path(__file__).parent
_SERVER_PATH = _SCRIPT_DIR / ".." / ".." / "dist" / "server.js"

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
    payload = json.dumps({"jsonrpc": "2.0", "method": "tools/list", "id": 1})
    return _run_server(payload).get("result", {}).get("tools", [])


def call_mcp_tool(name: str, arguments: dict) -> str:
    payload = json.dumps({
        "jsonrpc": "2.0",
        "method": "tools/call",
        "params": {"name": name, "arguments": arguments},
        "id": 1,
    })
    response = _run_server(payload)
    content = response.get("result", {}).get("content", [])
    return "\n".join(c.get("text", "") for c in content if c.get("type") == "text")


def mcp_tools_as_gemini_declarations(tools: list[dict]) -> list[dict]:
    """Convert MCP tool definitions to Gemini FunctionDeclaration dicts."""
    return [
        {
            "name": t["name"],
            "description": t["description"],
            "parameters": t["inputSchema"],
        }
        for t in tools
    ]


def run_agent(user_message: str) -> str:
    """
    Agentic loop with Gemini. Resolves tool calls until a final answer is produced.
    """
    mcp_tools = get_mcp_tools()
    declarations = mcp_tools_as_gemini_declarations(mcp_tools)
    gemini_tools = [{"function_declarations": declarations}]

    model = genai.GenerativeModel(model_name="gemini-1.5-pro", tools=gemini_tools)
    chat = model.start_chat()
    response = chat.send_message(user_message)

    while True:
        part = response.candidates[0].content.parts[0]

        if hasattr(part, "function_call") and part.function_call.name:
            fc = part.function_call
            result_text = call_mcp_tool(fc.name, dict(fc.args))
            response = chat.send_message(
                genai.protos.Content(
                    parts=[genai.protos.Part(
                        function_response=genai.protos.FunctionResponse(
                            name=fc.name,
                            response={"result": result_text},
                        )
                    )]
                )
            )
        else:
            return part.text


if __name__ == "__main__":
    import sys
    query = " ".join(sys.argv[1:]) or "Show me critical incidents opened in the last 24 hours"
    print(f"Query: {query}\n")
    answer = run_agent(query)
    print(f"Answer:\n{answer}")
