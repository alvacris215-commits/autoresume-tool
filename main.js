const { app, BrowserWindow, ipcMain, session, net } = require('electron');
const path = require('path');

let store;
let settingsWin = null;
let mainWin = null;
let useProxyEnabled = false;
let currentProxyConfig = {};

// electron-store is ESM-only in v10 — load dynamically
async function getStore() {
  if (!store) {
    const { default: Store } = await import('electron-store');
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

// ── IPC Handlers ─────────────────────────────────────────────

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
  // Use an isolated throwaway session so defaultSession is never touched
  const testSession = session.fromPartition('temp:proxy-test', { cache: false });
  const proxyRules = `http=${config.host}:${config.port};https=${config.host}:${config.port}`;
  await testSession.setProxy({ proxyRules });

  return new Promise((resolve) => {
    const req = net.request({
      method: 'HEAD',
      url: 'https://www.google.com',
      session: testSession,
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
  if (settingsWin) settingsWin.close();
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

// ── App lifecycle ─────────────────────────────────────────────

app.whenReady().then(async () => {
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
