const { app, BrowserWindow, ipcMain, session, net } = require('electron');
const path = require('path');
const fs = require('fs');

// ── Logger ────────────────────────────────────────────────────
const logFile = path.join(__dirname, 'logs', `app-${new Date().toISOString().slice(0,10)}.log`);

function log(level, ...args) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')}`;
  console.log(line);
  try { fs.appendFileSync(logFile, line + '\n'); } catch (_) {}
}
const logger = {
  info:  (...a) => log('INFO ', ...a),
  warn:  (...a) => log('WARN ', ...a),
  error: (...a) => log('ERROR', ...a),
  proxy: (...a) => log('PROXY', ...a),
};

// Catch unhandled errors and log them
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception:', err.message, err.stack);
});
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', reason);
});

logger.info('App starting, log file:', logFile);

// ── State ─────────────────────────────────────────────────────
let store;
let settingsWin = null;
let mainWin     = null;
let useProxyEnabled   = false;
let currentProxyConfig = {};

// Partitions used by the two webviews — proxy must be set on ALL of these
const WEBVIEW_PARTITIONS = ['persist:chatgpt', 'persist:jobright'];

// ── Store ─────────────────────────────────────────────────────
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

// ── Proxy ─────────────────────────────────────────────────────
async function applyProxy(config) {
  // Must apply to defaultSession AND every webview partition
  const sessions = [
    session.defaultSession,
    ...WEBVIEW_PARTITIONS.map(p => session.fromPartition(p)),
  ];

  if (config.useProxy && config.host && config.port) {
    const proxyRules = `http=${config.host}:${config.port};https=${config.host}:${config.port}`;
    logger.proxy('Applying proxy rules:', proxyRules, 'to', sessions.length, 'sessions');
    for (const sess of sessions) {
      await sess.setProxy({ proxyRules });
      logger.proxy('setProxy OK on partition:', sess === session.defaultSession ? 'default' : 'webview');
    }
    // Wire credential handler on each session (needed when proxy requires auth)
    if (config.username) {
      for (const sess of sessions) {
        sess.removeAllListeners('login');
        sess.on('login', (event, authInfo, callback) => {
          if (authInfo.isProxy) {
            logger.proxy('Proxy auth challenge — providing credentials for:', authInfo.host);
            event.preventDefault();
            callback(config.username, config.password || '');
          }
        });
      }
      logger.proxy('Proxy auth handler registered (username:', config.username + ')');
    }
  } else {
    logger.proxy('Clearing proxy on', sessions.length, 'sessions');
    for (const sess of sessions) {
      await sess.setProxy({ proxyRules: '' });
    }
  }
}

// ── Windows ───────────────────────────────────────────────────
function createSettingsWindow() {
  logger.info('Creating settings window');
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
  settingsWin.on('closed', () => {
    logger.info('Settings window closed');
    settingsWin = null;
  });
}

function createMainWindow() {
  logger.info('Creating main window');
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
  mainWin.webContents.on('did-finish-load', () => logger.info('Main window loaded'));
  mainWin.on('closed', () => {
    logger.info('Main window closed');
    mainWin = null;
  });
}

// ── IPC Handlers ─────────────────────────────────────────────

ipcMain.handle('save-proxy-config', async (event, config) => {
  logger.info('save-proxy-config called, useProxy:', config.useProxy, 'host:', config.host, 'port:', config.port);
  const s = await getStore();
  s.set('proxyConfig', config);
  useProxyEnabled    = config.useProxy;
  currentProxyConfig = config;
  await applyProxy(config);
  return { ok: true };
});

ipcMain.handle('get-proxy-config', async () => {
  const s = await getStore();
  const config = s.get('proxyConfig');
  logger.info('get-proxy-config returning useProxy:', config.useProxy);
  return config;
});

ipcMain.handle('test-proxy', async (event, config) => {
  logger.proxy('Testing proxy:', config.host + ':' + config.port);
  // Throwaway session — never pollutes defaultSession or webview sessions
  const testSession = session.fromPartition('temp:proxy-test-' + Date.now(), { cache: false });
  const proxyRules  = `http=${config.host}:${config.port};https=${config.host}:${config.port}`;
  await testSession.setProxy({ proxyRules });

  if (config.username) {
    testSession.on('login', (ev, authInfo, callback) => {
      if (authInfo.isProxy) { ev.preventDefault(); callback(config.username, config.password || ''); }
    });
  }

  return new Promise((resolve) => {
    const req = net.request({ method: 'HEAD', url: 'https://www.google.com', session: testSession });
    const timeout = setTimeout(() => {
      req.abort();
      logger.proxy('Test timed out');
      resolve({ success: false, message: 'Timeout after 8s' });
    }, 8000);
    req.on('response', (res) => {
      clearTimeout(timeout);
      logger.proxy('Test succeeded, status:', res.statusCode);
      resolve({ success: true, message: `Connected — HTTP ${res.statusCode}` });
    });
    req.on('error', (err) => {
      clearTimeout(timeout);
      logger.proxy('Test failed:', err.message);
      resolve({ success: false, message: err.message });
    });
    req.end();
  });
});

ipcMain.handle('toggle-proxy', async (event, { enabled }) => {
  logger.info('toggle-proxy:', enabled);
  useProxyEnabled = enabled;
  const s = await getStore();
  const config = s.get('proxyConfig');
  config.useProxy = enabled;
  s.set('proxyConfig', config);
  await applyProxy(config);
  return { ok: true };
});

ipcMain.on('launch-main-window', async () => {
  logger.info('launch-main-window received, proxy enabled:', useProxyEnabled);
  // Proxy must already be applied before the webview sessions are created.
  // Re-apply now so persist: sessions get the rules before first load.
  await applyProxy(currentProxyConfig);
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
  logger.info('app ready');
  const s = await getStore();
  const savedConfig = s.get('proxyConfig');
  if (savedConfig) {
    currentProxyConfig = savedConfig;
    useProxyEnabled    = savedConfig.useProxy;
    logger.info('Loaded saved config, useProxy:', savedConfig.useProxy);
    await applyProxy(savedConfig);
  }
  createSettingsWindow();
});

app.on('window-all-closed', () => {
  logger.info('All windows closed');
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (!settingsWin && !mainWin) createSettingsWindow();
});
