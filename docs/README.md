# NowAIKit documentation

Start here. Full guides and the product home are at [nowaikit.com](https://nowaikit.com).

## Getting started
- [Installation](INSTALLATION.md) , install the CLI or desktop app, run the setup wizard and `nowaikit doctor`, or run the HTTP server.
- [Client setup](CLIENT_SETUP.md) , connect Claude, ChatGPT, Gemini, Cursor, VS Code and others.

## Authentication
- [OAuth setup](SERVICENOW_OAUTH_SETUP.md) , ServiceNow OAuth apps, `nowaikit auth login`, `auth test`.
- [Delegated auth](DELEGATED_AUTH.md) , multi-tenant and backend-managed OAuth: strict mode, the
  gateway header contract, and the capability model.

## Configuration
- [Configuration reference](CONFIGURATION.md) , every environment variable in one place.
- [Tool packages and discovery](TOOL_PACKAGES.md) , role subsets and `MCP_TOOL_DISCOVERY=lean` for
  clients that cap tool count.
- [Multi-instance](MULTI_INSTANCE.md) , manage dev, test and prod in one session.

## Tools and capabilities
- [All tools](TOOLS.md) , the full catalog by module, generated from the code.
- [Scripting](SCRIPTING.md) , server-side script execution.
- [ATF](ATF.md) , running Automated Test Framework suites.
- [Reporting](REPORTING.md) , server-side reports and charts.
- [Now Assist and AI](NOW_ASSIST.md) , Otto (Now Assist), AI agents, AI Control Tower, and the instance's own MCP servers and A2A agents (Action Fabric).

## Skills and advanced
- [Skills and branded reports](SKILLS_AND_REPORTS.md) , Apex AI Skills, and using your own Claude Code
  or Codex subscription.
- [Script execution helper](SCRIPT-EXEC-HELPER.md) , how server-side script execution works.
- [Copilot attachment flow](COPILOT-ATTACHMENT-FLOW.md) , attachment handling for Microsoft Copilot.

Changes across versions are in the [changelog](../CHANGELOG.md).
