'use strict';

const leftPanel      = document.getElementById('leftPanel');
const divider        = document.getElementById('divider');
const splitContainer = document.getElementById('splitContainer');
const wvLeft         = document.getElementById('wvLeft');
const wvRight        = document.getElementById('wvRight');
const proxyToggle    = document.getElementById('proxyToggle');
const proxyDot       = document.getElementById('proxyDot');
const proxyLabel     = document.getElementById('proxyStatusLabel');
const fabBtn         = document.getElementById('fabBtn');
const modalStub      = document.getElementById('modalStub');
const modalHeader    = document.getElementById('modalHeader');

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
  wvLeft.reload();
  wvRight.reload();
});

// Load saved proxy state
(async () => {
  const config = await window.electronAPI.getProxyConfig();
  if (config) updateProxyUI(config.useProxy || false);
})();

// ── Divider drag ─────────────────────────────────────────────

let divDragging = false;
let divStartX = 0;
let divStartWidth = 0;

divider.addEventListener('mousedown', (e) => {
  divDragging = true;
  divStartX = e.clientX;
  divStartWidth = leftPanel.getBoundingClientRect().width;
  divider.classList.add('dragging');
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
});

document.addEventListener('mousemove', (e) => {
  if (!divDragging) return;
  const containerWidth = splitContainer.getBoundingClientRect().width;
  const delta = e.clientX - divStartX;
  const newWidth = Math.max(200, Math.min(containerWidth - 200 - 4, divStartWidth + delta));
  leftPanel.style.flex = `0 0 ${newWidth}px`;
});

document.addEventListener('mouseup', () => {
  if (!divDragging) return;
  divDragging = false;
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
document.getElementById('closeModal').addEventListener('click', (e) => {
  e.stopPropagation();
  modalStub.classList.remove('visible');
});

// Draggable modal
let modalDragging = false;
let modalOffX = 0;
let modalOffY = 0;

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
  modalStub.style.left  = (e.clientX - modalOffX) + 'px';
  modalStub.style.top   = (e.clientY - modalOffY) + 'px';
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
