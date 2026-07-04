const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveProxyConfig:  (config)  => ipcRenderer.invoke('save-proxy-config', config),
  testProxy:        (config)  => ipcRenderer.invoke('test-proxy', config),
  launchMainWindow: ()        => ipcRenderer.send('launch-main-window'),
  getProxyConfig:   ()        => ipcRenderer.invoke('get-proxy-config'),
  toggleProxy:      (enabled) => ipcRenderer.invoke('toggle-proxy', { enabled }),
  minimize:         ()        => ipcRenderer.send('window-minimize'),
  maximize:         ()        => ipcRenderer.send('window-maximize'),
  close:            ()        => ipcRenderer.send('window-close'),
  getJobrightCookies: ()      => ipcRenderer.invoke('get-jobright-cookies'),
  logJson:            (label, data) => ipcRenderer.invoke('log-json', { label, data }),
});
