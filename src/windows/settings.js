'use strict';

const useProxyToggle = document.getElementById('useProxy');
const proxyFields    = [
  document.getElementById('proxyFields'),
  document.getElementById('hostPortRow'),
  document.getElementById('credsRow'),
];
const proxyHost  = document.getElementById('proxyHost');
const proxyPort  = document.getElementById('proxyPort');
const proxyUser  = document.getElementById('proxyUser');
const proxyPass  = document.getElementById('proxyPass');
const connBadge  = document.getElementById('connBadge');
const btnTest    = document.getElementById('btnTest');
const btnLaunch  = document.getElementById('btnLaunch');
const protoHttp  = document.getElementById('protoHttp');
const protoHttps = document.getElementById('protoHttps');
let selectedProto = 'http';

function setProxyFieldsEnabled(enabled) {
  const inputs = [proxyHost, proxyPort, proxyUser, proxyPass];
  inputs.forEach(el => { el.disabled = !enabled; });
  [btnTest, protoHttp, protoHttps].forEach(el => {
    el.style.opacity = enabled ? '' : '0.3';
    el.style.pointerEvents = enabled ? '' : 'none';
  });
  proxyFields.forEach(el => { el.style.opacity = enabled ? '' : '0.4'; });
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
