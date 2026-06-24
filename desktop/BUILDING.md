# Building NowAIKit Desktop

Cross-platform Electron desktop app with React 18 + Vite renderer.

## Prerequisites

- **Node.js 20+** — [nodejs.org](https://nodejs.org/)
- **npm 9+** (comes with Node.js)
- The parent `nowaikit` project must be built first (`npm run build` in root)

## Quick Start (Development)

```bash
# 1. Build the MCP server (from the repo root)
cd /path/to/nowaikit
npm install
npm run build

# 2. Install desktop dependencies
cd desktop
npm install

# 3. Start development mode (hot-reload)
npm run dev
```

This launches Vite dev server for the renderer + Electron with the main process. Changes to React components hot-reload instantly. Main process changes require a restart.

## Production Build

```bash
# Build both renderer and main process
npm run build

# Package for current platform
npm run package

# Package for specific platform
npm run package:win     # Windows (NSIS installer)
npm run package:mac     # macOS (DMG)
npm run package:linux   # Linux (AppImage + .deb)
```

Output goes to `desktop/release/`.

## Windows-Specific Notes

### Building on Windows

```powershell
# PowerShell (run as admin if needed)
cd C:\path\to\nowaikit\desktop
npm install
npm run package:win
```

The NSIS installer will be at `release/nowaikit-Setup.exe`.

### Code Signing (Optional)

For Windows code signing, set these environment variables before building:

```powershell
$env:CSC_LINK = "path/to/your-certificate.pfx"
$env:CSC_KEY_PASSWORD = "your-certificate-password"
npm run package:win
```

Without code signing, Windows SmartScreen will show a warning on first launch.

## macOS-Specific Notes

### Code Signing & Notarization

For macOS distribution, you need an Apple Developer certificate:

```bash
export CSC_LINK="path/to/DeveloperID.p12"
export CSC_KEY_PASSWORD="password"
export APPLE_ID="your@appleid.com"
export APPLE_APP_SPECIFIC_PASSWORD="app-specific-password"
export APPLE_TEAM_ID="YOUR_TEAM_ID"
npm run package:mac
```

## Architecture

```
desktop/
  main/                    # Electron main process (Node.js, CommonJS)
    index.ts               # Window management, IPC handlers, app lifecycle
    preload.ts             # Context bridge — exposes window.api to renderer
    server-manager.ts      # Spawns and manages the MCP server child process
    config-store.ts        # Persists instances, settings, audit logs
  renderer/                # React 18 UI (Vite, ESM)
    src/
      main.tsx             # React entry + router
      components/
        AppLayout.tsx      # Sidebar + main content layout
      pages/
        Dashboard.tsx      # Server status, stats, recent activity
        SetupWizard.tsx    # 8-step interactive setup wizard
        ToolBrowser.tsx    # Browse & search all 400+ tools
        AuditLog.tsx       # Filterable audit log viewer
        Instances.tsx      # Manage ServiceNow instances
        Settings.tsx       # App settings & system info
      styles/
        global.css         # Dark theme, components, utilities
      types.d.ts           # TypeScript types for window.api
    index.html             # Vite entry HTML
  electron-builder.yml     # Packaging configuration
  package.json             # Desktop-specific dependencies
  tsconfig.json            # Renderer TypeScript config
  tsconfig.main.json       # Main process TypeScript config
  vite.config.ts           # Vite bundler config
  BUILDING.md              # This file
```

## How It Works

1. **Electron main process** creates the app window and registers IPC handlers
2. **Preload script** exposes a safe `window.api` bridge to the renderer
3. **React renderer** renders the UI and calls `window.api.*` for all backend operations
4. **ServerManager** spawns the MCP server (`dist/server.js`) as a child process with the correct environment variables
5. **ConfigStore** persists instance configs and audit logs to `~/.config/nowaikit/`

The MCP server is the same one used by Claude, Cursor, and all other AI clients. The desktop app just provides a visual management layer.

## Troubleshooting

### "Server not found at ..."

Run `npm run build` in the root `nowaikit` directory first. The desktop app looks for `../dist/server.js` in development mode.

### Blank window on launch

Check the developer console (View > Toggle Developer Tools or Ctrl+Shift+I). Common causes:
- Missing `renderer/dist/` — run `npm run build:renderer`
- CSP violation — check Content-Security-Policy in `renderer/index.html`

### Windows: "This app has been blocked"

The installer isn't code-signed. Right-click > Properties > Unblock, or click "More info" > "Run anyway" on the SmartScreen dialog.
