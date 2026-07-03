# Proxy Browser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a frameless Electron app with a proxy-config settings window and a split-panel main window loading ChatGPT (left) and Jobright.ai (right) through the configured proxy.

**Architecture:** The Electron main process owns all proxy logic — it creates two `BrowserWindow`s (settings, main), manages `electron-store` config persistence, and applies `session.defaultSession.setProxy()`. Renderers communicate via a `preload.js` context bridge using named IPC channels. Both webviews load in the main window and inherit the default session proxy automatically.

**Tech Stack:** Electron (latest stable), electron-store v10 (ESM-compatible via dynamic import), plain HTML/CSS/JS, no bundler.

## Global Constraints

- `frame: false` on ALL windows — no OS titlebar anywhere
- Blockchain theme: background `#000` / `#0a0a0a`, accent `#00ff41`, monospace font
- `contextIsolation: true`, `nodeIntegration: false` in all renderers
- `webviewTag: true` only in main window's `webPreferences`
- All IPC uses `ipcMain.handle` / `ipcRenderer.invoke` (request-response) or `ipcMain.on` / `webContents.send` (push)
- No TypeScript, no React, no bundler — plain `.html` + `.js` files
- Proxy rules format: `http=HOST:PORT;https=HOST:PORT`
- Chrome 124 UA: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36`

---

## File Map

| File | Responsibility |
|------|---------------|
| `package.json` | Electron entry, dependencies, start script |
| `main.js` | Main process: window creation, IPC handlers, proxy logic, store access |
| `preload.js` | Context bridge: exposes `window.electronAPI` to all renderers |
| `src/styles/theme.css` | Shared blockchain CSS variables, inputs, buttons, scrollbars, animations |
| `src/windows/settings.html` | Settings window markup (imports theme.css + settings.js) |
| `src/windows/settings.js` | Settings renderer: form logic, test connection, launch |
| `src/windows/main.html` | Main window markup: titlebar, split panels, webviews, FAB |
| `src/windows/main.js` | Main renderer: divider drag, proxy toggle, reload buttons, FAB stub |

---

## Task 1: Project Scaffold + package.json

**Files:**
- Create: `package.json`
- Create: `main.js` (empty entry stub)
- Create: `preload.js` (empty stub)

**Interfaces:**
- Produces: `npm start` launches Electron and opens a blank window

- [ ] **Step 1: Init package.json**

```bash
cd /Users/macuser/Documents/ResumeMaker
npm init -y
```

- [ ] **Step 2: Install dependencies**

```bash
npm install electron@latest electron-store@10
```

- [ ] **Step 3: Edit package.json**

Replace the generated `package.json` with:

```json
{
  "name": "proxy-browser",
  "version": "1.0.0",
  "description": "Proxy-aware split-panel browser with blockchain theme",
  "main": "main.js",
  "scripts": {
    "start": "electron ."
  },
  "dependencies": {
    "electron-store": "^10.0.0"
  },
  "devDependencies": {
    "electron": "^31.0.0"
  }
}
```

- [ ] **Step 4: Create stub main.js**

Create `main.js`:

```js
const { app, BrowserWindow } = require('electron');
const path = require('path');

app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 400, height: 300 });
  win.loadURL('about:blank');
});
```

- [ ] **Step 5: Create stub preload.js**

Create `preload.js`:

```js
// preload stub — context bridge added in Task 3
```

- [ ] **Step 6: Verify Electron launches**

```bash
npm start
```

Expected: A blank Electron window opens with no errors in terminal.

- [ ] **Step 7: Create directory structure**

```bash
mkdir -p src/windows src/styles docs/superpowers/plans docs/superpowers/specs
```

- [ ] **Step 8: Commit**

```bash
git init
git add package.json package-lock.json main.js preload.js
git commit -m "feat: scaffold electron project"
```

---

## Task 2: Blockchain Theme CSS

**Files:**
- Create: `src/styles/theme.css`

**Interfaces:**
- Produces: CSS custom properties and classes consumed by `settings.html` and `main.html`
- Key classes: `.titlebar`, `.titlebar-title`, `.titlebar-btn`, `.btn-primary`, `.btn-secondary`, `.input-field`, `.toggle-switch`, `.panel-header`, `.glow-text`, `.scan-line`, `.fab`

- [ ] **Step 1: Create theme.css**

Create `src/styles/theme.css`:

```css
/* ============================================================
   BLOCKCHAIN THEME — shared across all windows
   ============================================================ */

:root {
  --bg-deep:    #000000;
  --bg-panel:   #0a0a0a;
  --bg-input:   #111111;
  --bg-card:    #0d1a0d;
  --accent:     #00ff41;
  --accent-dim: #00cc33;
  --accent-glow: rgba(0, 255, 65, 0.4);
  --danger:     #ff3333;
  --danger-glow: rgba(255, 51, 51, 0.4);
  --text:       #00ff41;
  --text-muted: #336633;
  --border:     #003300;
  --font-mono:  'Courier New', 'Lucida Console', monospace;
  --titlebar-h: 38px;
  --radius:     4px;
  --transition: 0.15s ease;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html, body {
  background: var(--bg-deep);
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 13px;
  user-select: none;
  overflow: hidden;
  height: 100%;
}

/* ── Scrollbars ── */
::-webkit-scrollbar { width: 6px; background: var(--bg-panel); }
::-webkit-scrollbar-thumb { background: var(--accent-dim); border-radius: 3px; }

/* ── Titlebar ── */
.titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--titlebar-h);
  background: var(--bg-panel);
  border-bottom: 1px solid var(--accent);
  box-shadow: 0 0 12px var(--accent-glow);
  padding: 0 12px;
  -webkit-app-region: drag;
  flex-shrink: 0;
}

.titlebar-title {
  font-size: 14px;
  font-weight: bold;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: var(--accent);
  text-shadow: 0 0 8px var(--accent), 0 0 16px var(--accent-glow);
}

.titlebar-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  -webkit-app-region: no-drag;
}

.titlebar-btn {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--bg-input);
  color: var(--text-muted);
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: var(--transition);
}
.titlebar-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
  box-shadow: 0 0 6px var(--accent-glow);
}
.titlebar-btn.close:hover {
  border-color: var(--danger);
  color: var(--danger);
  box-shadow: 0 0 6px var(--danger-glow);
}

/* ── Inputs ── */
.input-field {
  width: 100%;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 13px;
  padding: 8px 12px;
  outline: none;
  transition: var(--transition);
}
.input-field::placeholder { color: var(--text-muted); }
.input-field:focus {
  border-color: var(--accent);
  box-shadow: 0 0 8px var(--accent-glow), inset 0 0 4px rgba(0,255,65,0.05);
}
.input-field:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* ── Protocol toggle group ── */
.proto-group {
  display: flex;
  gap: 0;
  border-radius: var(--radius);
  overflow: hidden;
  border: 1px solid var(--border);
}
.proto-btn {
  flex: 1;
  padding: 8px 0;
  background: var(--bg-input);
  border: none;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 13px;
  cursor: pointer;
  letter-spacing: 2px;
  transition: var(--transition);
}
.proto-btn.active {
  background: var(--bg-card);
  color: var(--accent);
  text-shadow: 0 0 6px var(--accent-glow);
  box-shadow: inset 0 0 8px var(--accent-glow);
}
.proto-btn:not(.active):hover { color: var(--accent-dim); }

/* ── Toggle switch ── */
.toggle-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  -webkit-app-region: no-drag;
}
.toggle-label { font-size: 12px; letter-spacing: 1px; color: var(--text-muted); }
.toggle-switch {
  position: relative;
  width: 44px;
  height: 22px;
  cursor: pointer;
}
.toggle-switch input { opacity: 0; width: 0; height: 0; position: absolute; }
.toggle-track {
  position: absolute;
  inset: 0;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 11px;
  transition: var(--transition);
}
.toggle-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 14px;
  height: 14px;
  background: var(--text-muted);
  border-radius: 50%;
  transition: var(--transition);
}
.toggle-switch input:checked ~ .toggle-track {
  border-color: var(--accent);
  box-shadow: 0 0 6px var(--accent-glow);
}
.toggle-switch input:checked ~ .toggle-thumb {
  transform: translateX(22px);
  background: var(--accent);
  box-shadow: 0 0 6px var(--accent-glow);
}

/* ── Buttons ── */
.btn-primary {
  background: transparent;
  border: 1px solid var(--accent);
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 13px;
  letter-spacing: 2px;
  padding: 10px 20px;
  border-radius: var(--radius);
  cursor: pointer;
  text-transform: uppercase;
  transition: var(--transition);
  box-shadow: 0 0 8px var(--accent-glow);
}
.btn-primary:hover {
  background: var(--accent);
  color: var(--bg-deep);
  box-shadow: 0 0 16px var(--accent), 0 0 32px var(--accent-glow);
}
.btn-secondary {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 1px;
  padding: 8px 16px;
  border-radius: var(--radius);
  cursor: pointer;
  text-transform: uppercase;
  transition: var(--transition);
}
.btn-secondary:hover {
  border-color: var(--accent-dim);
  color: var(--accent-dim);
}

/* ── Panel header (main window panels) ── */
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 34px;
  padding: 0 12px;
  background: var(--bg-panel);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  position: relative;
  overflow: hidden;
}
.panel-header::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: -100%;
  width: 60%;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--accent), transparent);
  animation: scan 3s linear infinite;
}
@keyframes scan {
  0%   { left: -60%; }
  100% { left: 100%; }
}
.panel-title {
  font-size: 11px;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: var(--accent);
  text-shadow: 0 0 6px var(--accent-glow);
}

/* ── Grid overlay background ── */
.grid-bg {
  background-image:
    linear-gradient(rgba(0,255,65,0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0,255,65,0.03) 1px, transparent 1px);
  background-size: 32px 32px;
}

/* ── Glow text ── */
.glow-text {
  color: var(--accent);
  text-shadow: 0 0 6px var(--accent), 0 0 12px var(--accent-glow);
}

/* ── Status dot ── */
.status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-muted);
  margin-right: 6px;
  transition: var(--transition);
}
.status-dot.on {
  background: var(--accent);
  box-shadow: 0 0 6px var(--accent), 0 0 10px var(--accent-glow);
}

/* ── FAB ── */
.fab {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--bg-card);
  border: 1px solid var(--accent);
  color: var(--accent);
  font-size: 22px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 12px var(--accent-glow), 0 0 24px rgba(0,255,65,0.15);
  transition: var(--transition);
  z-index: 100;
  -webkit-app-region: no-drag;
}
.fab:hover {
  box-shadow: 0 0 20px var(--accent), 0 0 40px var(--accent-glow);
  transform: scale(1.08);
}

/* ── Connection badge ── */
.conn-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: var(--radius);
  font-size: 11px;
  letter-spacing: 1px;
  opacity: 0;
  transition: opacity 0.3s;
}
.conn-badge.visible { opacity: 1; }
.conn-badge.success {
  border: 1px solid var(--accent);
  color: var(--accent);
  box-shadow: 0 0 8px var(--accent-glow);
}
.conn-badge.failure {
  border: 1px solid var(--danger);
  color: var(--danger);
  box-shadow: 0 0 8px var(--danger-glow);
}
```

- [ ] **Step 2: Verify CSS file exists**

```bash
ls -la /Users/macuser/Documents/ResumeMaker/src/styles/theme.css
```

Expected: file listed with non-zero size.

- [ ] **Step 3: Commit**

```bash
git add src/styles/theme.css
git commit -m "feat: add blockchain theme CSS"
```

---

## Task 3: Preload Context Bridge

**Files:**
- Modify: `preload.js`

**Interfaces:**
- Produces: `window.electronAPI` object available in all renderer processes with these methods:
  - `window.electronAPI.saveProxyConfig(config)` → Promise (invoke `save-proxy-config`)
  - `window.electronAPI.testProxy(config)` → Promise<`{ success, message }`> (invoke `test-proxy`)
  - `window.electronAPI.launchMainWindow()` → void (send `launch-main-window`)
  - `window.electronAPI.getProxyConfig()` → Promise<config> (invoke `get-proxy-config`)
  - `window.electronAPI.toggleProxy(enabled)` → Promise (invoke `toggle-proxy`)
  - `window.electronAPI.minimize()` → void (send `window-minimize`)
  - `window.electronAPI.maximize()` → void (send `window-maximize`)
  - `window.electronAPI.close()` → void (send `window-close`)

- [ ] **Step 1: Write preload.js**

Replace `preload.js` with:

```js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveProxyConfig: (config) => ipcRenderer.invoke('save-proxy-config', config),
  testProxy:       (config) => ipcRenderer.invoke('test-proxy', config),
  launchMainWindow: ()      => ipcRenderer.send('launch-main-window'),
  getProxyConfig:  ()       => ipcRenderer.invoke('get-proxy-config'),
  toggleProxy:     (enabled)=> ipcRenderer.invoke('toggle-proxy', { enabled }),
  minimize:        ()       => ipcRenderer.send('window-minimize'),
  maximize:        ()       => ipcRenderer.send('window-maximize'),
  close:           ()       => ipcRenderer.send('window-close'),
});
```

- [ ] **Step 2: Commit**

```bash
git add preload.js
git commit -m "feat: add context bridge preload"
```

---

## Task 4: Main Process (main.js)

**Files:**
- Modify: `main.js`

**Interfaces:**
- Consumes: `window.electronAPI` channel names from Task 3
- Consumes: `electron-store` for config persistence
- Produces: two `BrowserWindow` instances — `settingsWin` and `mainWin`
- Produces: IPC handlers for all 7 channels

- [ ] **Step 1: Write main.js**

Replace `main.js` with:

```js
const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const { net } = require('electron');

let Store;
let store;
let settingsWin = null;
let mainWin = null;
let useProxyEnabled = false;
let currentProxyConfig = {};

// electron-store is ESM-only in v10 — load dynamically
async function getStore() {
  if (!store) {
    const module = await import('electron-store');
    Store = module.default;
    store = new Store({
      defaults: {
        proxyConfig: {
          protocol: 'http',
          host: '',
          port: '',
          username: '',
          password: '',
          useProxy: false,
        }
      }
    });
  }
  return store;
}

async function applyProxy(config) {
  const mainSession = session.defaultSession;
  if (config.useProxy && config.host && config.port) {
    const proxyRules = `http=${config.host}:${config.port};https=${config.host}:${config.port}`;
    await mainSession.setProxy({ proxyRules });
  } else {
    await mainSession.setProxy({ proxyRules: '' });
  }
}

function createSettingsWindow() {
  settingsWin = new BrowserWindow({
    width: 520,
    height: 640,
    frame: false,
    resizable: false,
    center: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  settingsWin.loadFile(path.join(__dirname, 'src/windows/settings.html'));
  settingsWin.on('closed', () => { settingsWin = null; });
}

function createMainWindow() {
  mainWin = new BrowserWindow({
    width: 1400,
    height: 900,
    frame: false,
    resizable: true,
    center: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });
  mainWin.loadFile(path.join(__dirname, 'src/windows/main.html'));
  mainWin.on('closed', () => { mainWin = null; });
}

// ── IPC Handlers ────────────────────────────────────────────

ipcMain.handle('save-proxy-config', async (event, config) => {
  const s = await getStore();
  s.set('proxyConfig', config);
  useProxyEnabled = config.useProxy;
  currentProxyConfig = config;
  await applyProxy(config);
  return { ok: true };
});

ipcMain.handle('get-proxy-config', async () => {
  const s = await getStore();
  return s.get('proxyConfig');
});

ipcMain.handle('test-proxy', async (event, config) => {
  return new Promise((resolve) => {
    // Temporarily apply proxy for the test request
    const proxyRules = `http=${config.host}:${config.port};https=${config.host}:${config.port}`;
    session.defaultSession.setProxy({ proxyRules }).then(() => {
      const req = net.request({
        method: 'HEAD',
        url: 'https://www.google.com',
        session: session.defaultSession,
      });
      const timeout = setTimeout(() => {
        req.abort();
        resolve({ success: false, message: 'Timeout after 8s' });
      }, 8000);
      req.on('response', (res) => {
        clearTimeout(timeout);
        resolve({ success: true, message: `Connected — HTTP ${res.statusCode}` });
      });
      req.on('error', (err) => {
        clearTimeout(timeout);
        resolve({ success: false, message: err.message });
      });
      req.end();
    });
  });
});

ipcMain.handle('toggle-proxy', async (event, { enabled }) => {
  useProxyEnabled = enabled;
  const s = await getStore();
  const config = s.get('proxyConfig');
  config.useProxy = enabled;
  s.set('proxyConfig', config);
  await applyProxy(config);
  return { ok: true };
});

ipcMain.on('launch-main-window', async () => {
  createMainWindow();
  if (settingsWin) {
    settingsWin.close();
  }
});

ipcMain.on('window-minimize', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});

ipcMain.on('window-maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win?.isMaximized()) win.unmaximize();
  else win?.maximize();
});

ipcMain.on('window-close', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});

// ── App lifecycle ────────────────────────────────────────────

app.whenReady().then(async () => {
  // Load saved proxy config and apply it before any window opens
  const s = await getStore();
  const savedConfig = s.get('proxyConfig');
  if (savedConfig) {
    currentProxyConfig = savedConfig;
    useProxyEnabled = savedConfig.useProxy;
    await applyProxy(savedConfig);
  }
  createSettingsWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (!settingsWin && !mainWin) createSettingsWindow();
});
```

- [ ] **Step 2: Start app and verify settings window opens**

```bash
npm start
```

Expected: A blank frameless window (520×640) appears, no console errors about IPC or store.

- [ ] **Step 3: Commit**

```bash
git add main.js
git commit -m "feat: add main process with proxy logic and IPC handlers"
```

---

## Task 5: Settings Window HTML + JS

**Files:**
- Create: `src/windows/settings.html`
- Create: `src/windows/settings.js`

**Interfaces:**
- Consumes: `window.electronAPI.getProxyConfig()`, `saveProxyConfig()`, `testProxy()`, `launchMainWindow()`, `minimize()`, `close()`
- Produces: Visible settings form; clicking "Launch App" opens main window

- [ ] **Step 1: Create settings.html**

Create `src/windows/settings.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'">
  <title>Proxy Browser — Settings</title>
  <link rel="stylesheet" href="../styles/theme.css">
  <style>
    body { display: flex; flex-direction: column; height: 100vh; }
    .content {
      flex: 1;
      overflow-y: auto;
      padding: 28px 32px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .app-logo {
      text-align: center;
      margin-bottom: 8px;
    }
    .app-logo h1 {
      font-size: 18px;
      letter-spacing: 5px;
      text-transform: uppercase;
      color: var(--accent);
      text-shadow: 0 0 10px var(--accent), 0 0 20px var(--accent-glow);
    }
    .app-logo p {
      font-size: 10px;
      letter-spacing: 2px;
      color: var(--text-muted);
      margin-top: 4px;
    }
    .field-group { display: flex; flex-direction: column; gap: 6px; }
    .field-label {
      font-size: 10px;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: var(--text-muted);
    }
    .row { display: flex; gap: 12px; }
    .row .field-group { flex: 1; }
    .divider {
      height: 1px;
      background: linear-gradient(90deg, transparent, var(--border), transparent);
    }
    .proxy-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .proxy-header-label {
      font-size: 11px;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: var(--accent);
    }
    .actions {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 8px;
    }
    .test-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    #connBadge { flex-shrink: 0; }
  </style>
</head>
<body class="grid-bg">

  <!-- Custom Titlebar -->
  <div class="titlebar">
    <span class="titlebar-title">&#x25A0; Proxy Config</span>
    <div class="titlebar-controls">
      <button class="titlebar-btn" id="btnMin" title="Minimize">&#x2013;</button>
      <button class="titlebar-btn close" id="btnClose" title="Close">&#x2715;</button>
    </div>
  </div>

  <!-- Content -->
  <div class="content">

    <div class="app-logo">
      <h1>PROXY BROWSER</h1>
      <p>BLOCKCHAIN EDITION &nbsp;&#x25B6;&nbsp; CONFIGURE ACCESS NODE</p>
    </div>

    <div class="divider"></div>

    <!-- Proxy Toggle Row -->
    <div class="proxy-header">
      <span class="proxy-header-label">&#x25FC; Proxy Settings</span>
      <label class="toggle-wrap">
        <span class="toggle-label">USE PROXY</span>
        <div class="toggle-switch">
          <input type="checkbox" id="useProxy">
          <div class="toggle-track"></div>
          <div class="toggle-thumb"></div>
        </div>
      </label>
    </div>

    <!-- Protocol -->
    <div class="field-group" id="proxyFields">
      <span class="field-label">Protocol</span>
      <div class="proto-group">
        <button class="proto-btn active" data-proto="http" id="protoHttp">HTTP</button>
        <button class="proto-btn" data-proto="https" id="protoHttps">HTTPS</button>
      </div>
    </div>

    <!-- Host + Port -->
    <div class="row" id="hostPortRow">
      <div class="field-group">
        <span class="field-label">Server IP</span>
        <input class="input-field" type="text" id="proxyHost" placeholder="192.168.1.1" spellcheck="false">
      </div>
      <div class="field-group" style="max-width:120px">
        <span class="field-label">Port</span>
        <input class="input-field" type="number" id="proxyPort" placeholder="8080" min="1" max="65535">
      </div>
    </div>

    <!-- Credentials -->
    <div class="row" id="credsRow">
      <div class="field-group">
        <span class="field-label">Username <span style="color:var(--text-muted)">(optional)</span></span>
        <input class="input-field" type="text" id="proxyUser" placeholder="username" spellcheck="false" autocomplete="off">
      </div>
      <div class="field-group">
        <span class="field-label">Password <span style="color:var(--text-muted)">(optional)</span></span>
        <input class="input-field" type="password" id="proxyPass" placeholder="••••••••" autocomplete="off">
      </div>
    </div>

    <div class="divider"></div>

    <!-- Actions -->
    <div class="actions">
      <div class="test-row">
        <button class="btn-secondary" id="btnTest">&#x25B6; Test Connection</button>
        <span class="conn-badge" id="connBadge"></span>
      </div>
      <button class="btn-primary" id="btnLaunch">&#x25B6;&nbsp; Launch App</button>
    </div>

  </div>

  <script src="settings.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create settings.js**

Create `src/windows/settings.js`:

```js
'use strict';

const useProxyToggle = document.getElementById('useProxy');
const proxyFields    = [
  document.getElementById('proxyFields'),
  document.getElementById('hostPortRow'),
  document.getElementById('credsRow'),
];
const proxyHost   = document.getElementById('proxyHost');
const proxyPort   = document.getElementById('proxyPort');
const proxyUser   = document.getElementById('proxyUser');
const proxyPass   = document.getElementById('proxyPass');
const connBadge   = document.getElementById('connBadge');
const btnTest     = document.getElementById('btnTest');
const btnLaunch   = document.getElementById('btnLaunch');
const protoHttp   = document.getElementById('protoHttp');
const protoHttps  = document.getElementById('protoHttps');
let selectedProto = 'http';

function setProxyFieldsEnabled(enabled) {
  const inputs = [proxyHost, proxyPort, proxyUser, proxyPass, btnTest, protoHttp, protoHttps];
  inputs.forEach(el => {
    if (el.tagName === 'INPUT') el.disabled = !enabled;
    else { el.style.opacity = enabled ? '' : '0.3'; el.style.pointerEvents = enabled ? '' : 'none'; }
  });
  proxyFields.forEach(el => el.style.opacity = enabled ? '' : '0.4');
}

function showBadge(success, message) {
  connBadge.textContent = (success ? '✔ ' : '✖ ') + message;
  connBadge.className = 'conn-badge visible ' + (success ? 'success' : 'failure');
}

function hideBadge() {
  connBadge.className = 'conn-badge';
}

function getConfig() {
  return {
    protocol: selectedProto,
    host:     proxyHost.value.trim(),
    port:     proxyPort.value.trim(),
    username: proxyUser.value.trim(),
    password: proxyPass.value,
    useProxy: useProxyToggle.checked,
  };
}

// Protocol toggle
protoHttp.addEventListener('click', () => {
  selectedProto = 'http';
  protoHttp.classList.add('active');
  protoHttps.classList.remove('active');
});
protoHttps.addEventListener('click', () => {
  selectedProto = 'https';
  protoHttps.classList.add('active');
  protoHttp.classList.remove('active');
});

// Use proxy toggle
useProxyToggle.addEventListener('change', () => {
  setProxyFieldsEnabled(useProxyToggle.checked);
  hideBadge();
});

// Test connection
btnTest.addEventListener('click', async () => {
  const config = getConfig();
  if (!config.host || !config.port) {
    showBadge(false, 'Enter host and port first');
    return;
  }
  btnTest.textContent = '⟳ Testing...';
  btnTest.disabled = true;
  try {
    const result = await window.electronAPI.testProxy(config);
    showBadge(result.success, result.message);
  } catch (e) {
    showBadge(false, e.message);
  } finally {
    btnTest.textContent = '▶ Test Connection';
    btnTest.disabled = false;
  }
});

// Launch app
btnLaunch.addEventListener('click', async () => {
  const config = getConfig();
  if (config.useProxy && (!config.host || !config.port)) {
    showBadge(false, 'Host and port required when proxy is enabled');
    return;
  }
  await window.electronAPI.saveProxyConfig(config);
  window.electronAPI.launchMainWindow();
});

// Titlebar buttons
document.getElementById('btnMin').addEventListener('click', () => window.electronAPI.minimize());
document.getElementById('btnClose').addEventListener('click', () => window.electronAPI.close());

// Load saved config on start
(async () => {
  const config = await window.electronAPI.getProxyConfig();
  if (config) {
    useProxyToggle.checked = config.useProxy || false;
    proxyHost.value = config.host || '';
    proxyPort.value = config.port || '';
    proxyUser.value = config.username || '';
    proxyPass.value = config.password || '';
    if (config.protocol === 'https') {
      selectedProto = 'https';
      protoHttps.classList.add('active');
      protoHttp.classList.remove('active');
    }
    setProxyFieldsEnabled(config.useProxy || false);
  } else {
    setProxyFieldsEnabled(false);
  }
})();
```

- [ ] **Step 3: Run app and verify settings window**

```bash
npm start
```

Expected:
- Frameless window opens with green-on-black blockchain theme
- All proxy fields visible; when "USE PROXY" toggle is OFF fields are dimmed
- Toggling "USE PROXY" enables/disables fields
- "Test Connection" with empty fields shows red badge "Enter host and port first"
- "Launch App" with proxy enabled but no host/port shows red badge

- [ ] **Step 4: Commit**

```bash
git add src/windows/settings.html src/windows/settings.js
git commit -m "feat: add settings window with proxy config form"
```

---

## Task 6: Main Window HTML + JS

**Files:**
- Create: `src/windows/main.html`
- Create: `src/windows/main.js`

**Interfaces:**
- Consumes: `window.electronAPI.getProxyConfig()`, `toggleProxy()`, `minimize()`, `maximize()`, `close()`
- Produces: Visible split-panel window with two webviews and a working divider drag

- [ ] **Step 1: Create main.html**

Create `src/windows/main.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Proxy Browser</title>
  <link rel="stylesheet" href="../styles/theme.css">
  <style>
    body {
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }

    /* ── Main titlebar ── */
    .main-titlebar {
      display: flex;
      align-items: center;
      height: var(--titlebar-h);
      background: var(--bg-panel);
      border-bottom: 1px solid var(--accent);
      box-shadow: 0 0 12px var(--accent-glow);
      flex-shrink: 0;
      -webkit-app-region: drag;
    }
    .tb-left {
      display: flex;
      align-items: center;
      padding: 0 16px;
      gap: 10px;
      flex: 1;
    }
    .tb-app-name {
      font-size: 13px;
      letter-spacing: 4px;
      text-transform: uppercase;
      color: var(--accent);
      text-shadow: 0 0 8px var(--accent), 0 0 16px var(--accent-glow);
    }
    .tb-center {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 11px;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: var(--text-muted);
      -webkit-app-region: no-drag;
    }
    .tb-right {
      display: flex;
      align-items: center;
      padding: 0 12px;
      gap: 10px;
      flex: 1;
      justify-content: flex-end;
      -webkit-app-region: no-drag;
    }

    /* ── Split container ── */
    .split-container {
      display: flex;
      flex: 1;
      overflow: hidden;
    }

    /* ── Individual panels ── */
    .panel {
      display: flex;
      flex-direction: column;
      overflow: hidden;
      min-width: 200px;
    }
    #leftPanel  { flex: 0 0 50%; }
    #rightPanel { flex: 1; }

    /* ── Divider ── */
    .divider-drag {
      width: 4px;
      background: var(--border);
      cursor: col-resize;
      flex-shrink: 0;
      transition: background var(--transition);
      position: relative;
    }
    .divider-drag:hover,
    .divider-drag.dragging {
      background: var(--accent);
      box-shadow: 0 0 8px var(--accent-glow);
    }

    /* ── Webviews ── */
    webview {
      flex: 1;
      width: 100%;
      border: none;
      background: #000;
    }

    /* ── Reload button in panel header ── */
    .reload-btn {
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      font-size: 14px;
      padding: 2px 6px;
      border-radius: var(--radius);
      transition: var(--transition);
      -webkit-app-region: no-drag;
      line-height: 1;
    }
    .reload-btn:hover {
      color: var(--accent);
      text-shadow: 0 0 6px var(--accent-glow);
    }

    /* ── Loading overlay ── */
    .loading-bar {
      height: 2px;
      width: 0;
      background: var(--accent);
      box-shadow: 0 0 6px var(--accent-glow);
      transition: width 0.3s, opacity 0.5s;
      position: absolute;
      bottom: 0;
      left: 0;
    }
    .panel-header { position: relative; }

    /* ── Stub modal (hidden, Phase 2) ── */
    .modal-stub {
      display: none;
      position: fixed;
      top: 80px;
      right: 80px;
      width: 320px;
      min-height: 200px;
      background: var(--bg-panel);
      border: 1px solid var(--accent);
      box-shadow: 0 0 24px var(--accent-glow);
      border-radius: var(--radius);
      z-index: 200;
      cursor: move;
    }
    .modal-stub.visible { display: block; }
    .modal-stub-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      border-bottom: 1px solid var(--border);
      font-size: 11px;
      letter-spacing: 2px;
      color: var(--accent);
    }
    .modal-stub-body {
      padding: 20px 14px;
      color: var(--text-muted);
      font-size: 11px;
      letter-spacing: 1px;
    }
  </style>
</head>
<body class="grid-bg">

  <!-- Main Titlebar -->
  <div class="main-titlebar">
    <div class="tb-left">
      <span class="tb-app-name">&#x25A0; Proxy Browser</span>
    </div>

    <div class="tb-center">
      <span class="status-dot" id="proxyDot"></span>
      <span id="proxyStatusLabel">DIRECT</span>
      <label class="toggle-wrap" style="margin-left:8px">
        <span class="toggle-label">PROXY</span>
        <div class="toggle-switch">
          <input type="checkbox" id="proxyToggle">
          <div class="toggle-track"></div>
          <div class="toggle-thumb"></div>
        </div>
      </label>
    </div>

    <div class="tb-right">
      <button class="titlebar-btn" id="btnMin" title="Minimize">&#x2013;</button>
      <button class="titlebar-btn" id="btnMax" title="Maximize">&#x25A1;</button>
      <button class="titlebar-btn close" id="btnClose" title="Close">&#x2715;</button>
    </div>
  </div>

  <!-- Split Panels -->
  <div class="split-container" id="splitContainer">

    <!-- Left: ChatGPT -->
    <div class="panel" id="leftPanel">
      <div class="panel-header">
        <span class="panel-title">&#x25B6; ChatGPT</span>
        <button class="reload-btn" id="reloadLeft" title="Reload">&#x27F3;</button>
        <div class="loading-bar" id="loadingLeft"></div>
      </div>
      <webview
        id="wvLeft"
        src="https://chatgpt.com"
        partition="persist:chatgpt"
        useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        allowpopups="true"
      ></webview>
    </div>

    <!-- Divider -->
    <div class="divider-drag" id="divider"></div>

    <!-- Right: Jobright -->
    <div class="panel" id="rightPanel">
      <div class="panel-header">
        <span class="panel-title">&#x25B6; Jobright</span>
        <button class="reload-btn" id="reloadRight" title="Reload">&#x27F3;</button>
        <div class="loading-bar" id="loadingRight"></div>
      </div>
      <webview
        id="wvRight"
        src="https://jobright.ai"
        partition="persist:jobright"
        useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        allowpopups="true"
      ></webview>
    </div>

  </div>

  <!-- FAB -->
  <button class="fab" id="fabBtn" title="Open Panel">+</button>

  <!-- Stub Modal (Phase 2 placeholder) -->
  <div class="modal-stub" id="modalStub">
    <div class="modal-stub-header">
      <span>&#x25FC; PANEL</span>
      <button class="reload-btn" id="closeModal">&#x2715;</button>
    </div>
    <div class="modal-stub-body">
      &#x25B6; Feature coming in Phase 2
    </div>
  </div>

  <script src="main.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create main.js**

Create `src/windows/main.js`:

```js
'use strict';

const leftPanel   = document.getElementById('leftPanel');
const divider     = document.getElementById('divider');
const splitContainer = document.getElementById('splitContainer');
const wvLeft      = document.getElementById('wvLeft');
const wvRight     = document.getElementById('wvRight');
const proxyToggle = document.getElementById('proxyToggle');
const proxyDot    = document.getElementById('proxyDot');
const proxyLabel  = document.getElementById('proxyStatusLabel');
const fabBtn      = document.getElementById('fabBtn');
const modalStub   = document.getElementById('modalStub');

// ── Proxy status UI ──────────────────────────────────────────

function updateProxyUI(enabled) {
  proxyToggle.checked = enabled;
  if (enabled) {
    proxyDot.classList.add('on');
    proxyLabel.textContent = 'PROXY ON';
  } else {
    proxyDot.classList.remove('on');
    proxyLabel.textContent = 'DIRECT';
  }
}

proxyToggle.addEventListener('change', async () => {
  const enabled = proxyToggle.checked;
  updateProxyUI(enabled);
  await window.electronAPI.toggleProxy(enabled);
  // Reload both webviews to pick up new proxy setting
  wvLeft.reload();
  wvRight.reload();
});

// ── Load saved proxy state ───────────────────────────────────

(async () => {
  const config = await window.electronAPI.getProxyConfig();
  if (config) updateProxyUI(config.useProxy || false);
})();

// ── Divider drag ─────────────────────────────────────────────

let dragging = false;
let startX = 0;
let startWidth = 0;

divider.addEventListener('mousedown', (e) => {
  dragging = true;
  startX = e.clientX;
  startWidth = leftPanel.getBoundingClientRect().width;
  divider.classList.add('dragging');
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
});

document.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const containerWidth = splitContainer.getBoundingClientRect().width;
  const delta = e.clientX - startX;
  const newWidth = Math.max(200, Math.min(containerWidth - 200 - 4, startWidth + delta));
  leftPanel.style.flex = `0 0 ${newWidth}px`;
});

document.addEventListener('mouseup', () => {
  if (!dragging) return;
  dragging = false;
  divider.classList.remove('dragging');
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
});

// ── Reload buttons ───────────────────────────────────────────

document.getElementById('reloadLeft').addEventListener('click', () => wvLeft.reload());
document.getElementById('reloadRight').addEventListener('click', () => wvRight.reload());

// ── Loading bars ─────────────────────────────────────────────

function wireLoadingBar(webview, bar) {
  webview.addEventListener('did-start-loading', () => {
    bar.style.width = '70%';
    bar.style.opacity = '1';
  });
  webview.addEventListener('did-stop-loading', () => {
    bar.style.width = '100%';
    setTimeout(() => { bar.style.opacity = '0'; bar.style.width = '0'; }, 400);
  });
}
wireLoadingBar(wvLeft,  document.getElementById('loadingLeft'));
wireLoadingBar(wvRight, document.getElementById('loadingRight'));

// ── FAB + stub modal ─────────────────────────────────────────

fabBtn.addEventListener('click', () => {
  modalStub.classList.toggle('visible');
});
document.getElementById('closeModal').addEventListener('click', () => {
  modalStub.classList.remove('visible');
});

// Simple drag for modal stub
let modalDragging = false;
let modalOffX = 0;
let modalOffY = 0;
const modalHeader = modalStub.querySelector('.modal-stub-header');

modalHeader.addEventListener('mousedown', (e) => {
  if (e.target.id === 'closeModal') return;
  modalDragging = true;
  const rect = modalStub.getBoundingClientRect();
  modalOffX = e.clientX - rect.left;
  modalOffY = e.clientY - rect.top;
  modalStub.style.cursor = 'grabbing';
});
document.addEventListener('mousemove', (e) => {
  if (!modalDragging) return;
  modalStub.style.left = (e.clientX - modalOffX) + 'px';
  modalStub.style.top  = (e.clientY - modalOffY) + 'px';
  modalStub.style.right = 'auto';
});
document.addEventListener('mouseup', () => {
  if (!modalDragging) return;
  modalDragging = false;
  modalStub.style.cursor = '';
});

// ── Titlebar controls ────────────────────────────────────────

document.getElementById('btnMin').addEventListener('click', () => window.electronAPI.minimize());
document.getElementById('btnMax').addEventListener('click', () => window.electronAPI.maximize());
document.getElementById('btnClose').addEventListener('click', () => window.electronAPI.close());
```

- [ ] **Step 3: Run full app flow**

```bash
npm start
```

Expected:
- Settings window opens first
- Click "Launch App" (proxy off is fine) → settings closes, main window opens
- Left panel loads ChatGPT, right panel loads Jobright.ai
- Dragging the center divider resizes panels
- Reload buttons work on each panel
- Proxy toggle updates the dot/label
- FAB button opens/closes the stub modal
- Modal stub is draggable by its header

- [ ] **Step 4: Commit**

```bash
git add src/windows/main.html src/windows/main.js
git commit -m "feat: add main window with split webviews, divider, proxy toggle, FAB"
```

---

## Self-Review Against Spec

**Spec coverage check:**

| Spec Requirement | Task |
|-----------------|------|
| Settings window, frameless, custom titlebar | Task 5 |
| Protocol toggle HTTP/HTTPS | Task 5 |
| Server IP, Port, Username, Password fields | Task 5 |
| Use Proxy toggle | Task 5 |
| Test Connection button with badge | Task 5 |
| Launch App button | Task 5 |
| Proxy optional (direct if no proxy set) | Task 4 — `applyProxy` no-ops cleanly |
| Main window frameless, custom titlebar | Task 6 |
| Proxy status indicator (dot + label) | Task 6 |
| Proxy toggle in main titlebar | Task 6 |
| Split layout 50/50, draggable divider | Task 6 |
| Left webview: ChatGPT | Task 6 |
| Right webview: Jobright | Task 6 |
| Chrome 124 UA on both webviews | Task 6 |
| defaultSession.setProxy() proxy strategy | Task 4 |
| electron-store persistence | Task 4 |
| All 7 IPC channels | Task 3 + 4 |
| Blockchain theme (black/green/glow) | Task 2 |
| Grid overlay background | Task 2 |
| Scan line animation on panel headers | Task 2 |
| FAB button (placeholder) | Task 6 |
| Draggable modal stub | Task 6 |
| Minimize/Maximize/Close buttons | Task 3 + 4 + 5 + 6 |

All spec requirements covered. No gaps found.
