# Releasing NowAIKit to npm

Both packages are **ready to publish** but npm requires a 2FA **OTP** at publish
time (your account has 2FA enabled), so these must be run interactively by you.

## Versions ready
- `nowaikit-sdk` → **2.1.0** (npm currently has 2.0.0)
- `nowaikit` → **4.1.0** (npm currently has 4.0.5)

## Publish (run each, paste your authenticator OTP)

```bash
# SDK
cd nowaikit-sdk
npm run build && npm test
npm publish --otp=XXXXXX        # <- 6-digit code from your authenticator app

# MCP server
cd ../nowaikit
npm run build && npm test
npm publish --otp=XXXXXX
```

> Tip: to let CI / an agent publish without an OTP each time, create a
> **granular access token with "bypass 2FA"** at npmjs.com → Access Tokens, then
> `npm config set //registry.npmjs.org/:_authToken <token>` and publish normally.

## MCP Registry (modelcontextprotocol.io)

The package already declares `"mcpName": "io.github.aartiq/nowaikit"`. To list it
in the public MCP registry:

```bash
# one-time: install the publisher CLI
npm i -g @modelcontextprotocol/publisher   # or: npx mcp-publisher
# authenticate (GitHub OAuth) and publish using server.json / package metadata
mcp-publisher login github
mcp-publisher publish
```

(See https://github.com/modelcontextprotocol/registry for the current flow.)

## After publishing
- The website footer/JSON-LD show the MCP version — bump them to 4.1.0 on the
  next site edit (search `4.0.5` in website-nowaikit-v2).
- VS Code Builder (`nowaikit-builder`) and Chrome Utils republish to their stores
  are separate manual steps (`vsce publish`, Chrome Web Store dashboard).
