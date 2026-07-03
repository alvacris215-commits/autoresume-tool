# Proxy Browser — Design Spec
**Date:** 2026-07-03

## Overview

An Electron desktop app that acts as a proxy-aware split-panel browser. Left panel loads ChatGPT, right panel loads Jobright.ai. A settings window lets the user configure an optional HTTP/HTTPS proxy before entering the main view. Blockchain aesthetic throughout (black + green, glowing effects).

---

## Architecture

```
ResumeMaker/
├── main.js                        # Electron main process: window management, IPC, proxy setup
├── preload.js                     # Context bridge — exposes safe IPC to renderers
├── src/
│   ├── windows/
│   │   ├── settings.html          # Settings window markup
│   │   ├── settings.js            # Settings renderer logic
│   │   ├── main.html              # Main split-view window markup
│   │   └── main.js                # Main renderer logic
│   └── styles/
│       └── theme.css              # Shared blockchain theme
├── package.json
└── docs/superpowers/specs/
```

### Process Flow

1. App starts → `BrowserWindow` opens `settings.html` (frameless)
2. User configures proxy (or skips) → clicks "Launch App"
3. Main process: saves config via `electron-store`, applies proxy to `session.defaultSession`
4. `main.html` window opens; settings window closes
5. Both webviews inherit `defaultSession` proxy automatically

---

## Proxy Strategy

- **Session:** `session.defaultSession.setProxy()` (Option B — shared session)
- **Why shared is fine:** ChatGPT and Jobright are different domains; no cookie conflict risk
- **Toggle:** `useProxyEnabled` boolean — when false, clears proxy with `{ proxyRules: '' }`
- **Proxy rules format:** `http=HOST:PORT;https=HOST:PORT`
- **Config persisted:** via `electron-store` so settings survive restart

```js
// Applied in main process before main window opens (and on toggle)
if (useProxyEnabled && config.proxyHost && config.proxyPort) {
  const proxyRules = `http=${config.proxyHost}:${config.proxyPort};https=${config.proxyHost}:${config.proxyPort}`;
  await session.defaultSession.setProxy({ proxyRules });
} else {
  await session.defaultSession.setProxy({ proxyRules: '' });
}
```

---

## Settings Window

### Window Config
- `frame: false` — no OS titlebar
- `width: 520`, `height: 640`, centered
- `resizable: false`

### Custom Titlebar
- Drag region spanning full width (`-webkit-app-region: drag`)
- App name left-aligned (glowing green)
- Minimize + Close buttons right-aligned (`-webkit-app-region: no-drag`)

### Fields
| Field | Type | Notes |
|-------|------|-------|
| Protocol | Toggle buttons | `HTTP` / `HTTPS` |
| Server IP | Text input | Placeholder: `192.168.1.1` |
| Port | Number input | Placeholder: `8080`, range 1–65535 |
| Username | Text input | Optional |
| Password | Password input | Optional |
| Use Proxy | Toggle switch | Enables/disables all proxy fields |

### Actions
- **Test Connection** button — sends `HEAD https://www.google.com` through configured proxy via IPC → main process. Shows inline badge: glowing green "Connected" or red "Failed"
- **Launch App** button — validates inputs if "Use Proxy" is on, saves config, fires `ipc: launch-main-window`

### Styling
- Background: `#0a0a0a`
- Input borders: `#00ff41` with `box-shadow` glow on focus
- Font: monospace (`'Courier New'` or `'JetBrains Mono'`)
- Inputs dark: `#111` bg, `#00ff41` text

---

## Main Window

### Window Config
- `frame: false`
- `width: 1400`, `height: 900`, resizable
- `webviewTag: true` in `webPreferences`

### Custom Titlebar
- Left: App logo/name ("PROXY BROWSER") glowing green
- Center: Proxy status indicator — green dot "PROXY ON" / grey dot "DIRECT"
- Right: Proxy toggle switch + minimize/maximize/close buttons

### Split Layout
- Two equal panels separated by a draggable divider (`4px` wide, green glow on hover)
- Initial split: 50/50
- Dragging the divider resizes panels (mouse drag on main process or CSS flex + JS)

### Left Panel — ChatGPT
- Panel header: "ChatGPT" label + reload icon button
- `<webview src="https://chatgpt.com" partition="persist:chatgpt">`
- `useragent`: Chrome 124 real UA string
- `allowpopups="true"`

### Right Panel — Jobright
- Panel header: "Jobright" label + reload icon button  
- `<webview src="https://jobright.ai" partition="persist:jobright">`
- Same UA and allowpopups settings

### Floating Modal (FAB — placeholder)
- Bottom-right corner: circular `+` button, glowing green
- Will expand into a draggable modal (details TBD by user)
- For now: renders the button and a stub empty modal shell (hidden)

### Blockchain Visual Theme
- Background: `#000` with subtle green grid overlay (`linear-gradient` CSS)
- Scan line animation on panel headers
- Green glow (`text-shadow`, `box-shadow`) on active/focused elements
- Matrix-style font for labels and headers

---

## IPC Channels

| Channel | Direction | Payload | Purpose |
|---------|-----------|---------|---------|
| `save-proxy-config` | renderer → main | `{ protocol, host, port, username, password, useProxy }` | Save + apply proxy |
| `test-proxy` | renderer → main | `{ protocol, host, port, username, password }` | Test connection |
| `test-proxy-result` | main → renderer | `{ success, message }` | Return test result |
| `launch-main-window` | renderer → main | — | Open main window |
| `toggle-proxy` | renderer → main | `{ enabled }` | Toggle proxy on/off in main window |
| `get-proxy-config` | renderer → main | — | Fetch saved config on load |
| `proxy-config-response` | main → renderer | config object | Return saved config |

---

## Tech Stack

- **Electron** (latest stable)
- **electron-store** — persistent config storage
- **Native CSS** — no framework, hand-crafted blockchain theme
- **No bundler** — plain HTML/JS/CSS for simplicity

---

## Out of Scope (Phase 1)

- Floating modal contents (defined by user in Phase 2)
- Multiple proxy profiles
- Tab management within webviews
- Packaging / auto-update
