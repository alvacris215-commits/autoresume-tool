'use strict';

const leftPanel      = document.getElementById('leftPanel');
const divider        = document.getElementById('divider');
const splitContainer = document.getElementById('splitContainer');
const wvLeft         = document.getElementById('wvLeft');
const wvRight        = document.getElementById('wvRight');
const proxyToggle    = document.getElementById('proxyToggle');
const proxyDot       = document.getElementById('proxyDot');
const proxyLabel     = document.getElementById('proxyStatusLabel');

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

(async () => {
  const config = await window.electronAPI.getProxyConfig();
  if (config) updateProxyUI(config.useProxy || false);
})();

// ── Divider drag ─────────────────────────────────────────────

let divDragging  = false;
let divStartX    = 0;
let divStartWidth = 0;

divider.addEventListener('mousedown', (e) => {
  divDragging   = true;
  divStartX     = e.clientX;
  divStartWidth = leftPanel.getBoundingClientRect().width;
  divider.classList.add('dragging');
  document.body.style.cursor     = 'col-resize';
  document.body.style.userSelect = 'none';
});

document.addEventListener('mousemove', (e) => {
  if (!divDragging) return;
  const containerWidth = splitContainer.getBoundingClientRect().width;
  const delta    = e.clientX - divStartX;
  const newWidth = Math.max(200, Math.min(containerWidth - 200 - 4, divStartWidth + delta));
  leftPanel.style.flex = `0 0 ${newWidth}px`;
});

document.addEventListener('mouseup', () => {
  if (!divDragging) return;
  divDragging = false;
  divider.classList.remove('dragging');
  document.body.style.cursor     = '';
  document.body.style.userSelect = '';
});

// ── Reload buttons ───────────────────────────────────────────

document.getElementById('reloadLeft').addEventListener('click',  () => wvLeft.reload());
document.getElementById('reloadRight').addEventListener('click', () => wvRight.reload());

// ── Loading bars ─────────────────────────────────────────────

function wireLoadingBar(webview, bar) {
  webview.addEventListener('did-start-loading', () => {
    bar.style.width   = '70%';
    bar.style.opacity = '1';
  });
  webview.addEventListener('did-stop-loading', () => {
    bar.style.width = '100%';
    setTimeout(() => { bar.style.opacity = '0'; bar.style.width = '0'; }, 400);
  });
}
wireLoadingBar(wvLeft,  document.getElementById('loadingLeft'));
wireLoadingBar(wvRight, document.getElementById('loadingRight'));

// ── FAB + Tool Modal ─────────────────────────────────────────

const fabBtn    = document.getElementById('fabBtn');
const toolModal = document.getElementById('toolModal');

fabBtn.addEventListener('click', () => {
  const isOpen = toolModal.classList.toggle('visible');
  fabBtn.classList.toggle('active', isOpen);
});

document.getElementById('tmClose').addEventListener('click', () => {
  toolModal.classList.remove('visible');
  fabBtn.classList.remove('active');
});

// ── Tabs ─────────────────────────────────────────────────────

document.querySelectorAll('.tm-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tm-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tm-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

// ── Find Links flow ───────────────────────────────────────────

const alertOverlay  = document.getElementById('alertOverlay');
const alertFilterEl = document.getElementById('alertFilterInfo');
const cookieStatus  = document.getElementById('cookieStatus');
const cookieStatusTxt = document.getElementById('cookieStatusText');
const resultsDrawer = document.getElementById('resultsDrawer');

function setCookieStatus(state, msg) {
  cookieStatus.className = 'cookie-status' + (state ? ' ' + state : '');
  cookieStatusTxt.textContent = msg;
}

document.getElementById('btnFindLinks').addEventListener('click', () => {
  // Populate filter info — read the Jobright webview URL for context
  const currentUrl = wvRight.getURL ? wvRight.getURL() : 'https://jobright.ai';
  alertFilterEl.textContent = 'Current Jobright URL: ' + currentUrl;
  alertOverlay.classList.add('visible');
});

document.getElementById('alertCancel').addEventListener('click', () => {
  alertOverlay.classList.remove('visible');
});

document.getElementById('alertConfirm').addEventListener('click', async () => {
  alertOverlay.classList.remove('visible');
  setCookieStatus('', 'Fetching cookies...');
  resultsDrawer.innerHTML = '<span class="spinner"></span> Fetching Jobright session cookies...';
  resultsDrawer.classList.remove('has-results');

  try {
    const cookies = await window.electronAPI.getJobrightCookies();

    if (!cookies || cookies.length === 0) {
      setCookieStatus('error', 'No cookies found — please log in to Jobright first');
      resultsDrawer.innerHTML = '<div class="results-placeholder"><span class="icon">&#x26A0;</span><span>No cookies found. Log into Jobright in the right panel first.</span></div>';
      return;
    }

    setCookieStatus('ready', `${cookies.length} cookies loaded`);

    // Display cookie names in results drawer
    const cookieLines = cookies
      .map(c => `<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.04)"><span style="color:var(--cyan)">${escHtml(c.name)}</span><span style="opacity:0.5;font-size:10px">${c.domain || ''}</span></div>`)
      .join('');

    resultsDrawer.innerHTML = `
      <div style="margin-bottom:10px;font-size:10px;letter-spacing:1px;color:var(--teal)">&#x2714; ${cookies.length} session cookies captured</div>
      ${cookieLines}
      <div style="margin-top:12px">
        <button onclick="copyCookiesToClipboard()" class="find-links-btn" style="padding:8px">&#x1F4CB; Copy as Cookie Header</button>
      </div>`;
    resultsDrawer.classList.add('has-results');

    // Store cookies for the copy handler
    window._lastCookies = cookies;

  } catch (err) {
    setCookieStatus('error', 'Error: ' + err.message);
    resultsDrawer.innerHTML = `<div class="results-placeholder"><span class="icon">&#x274C;</span><span>${escHtml(err.message)}</span></div>`;
  }
});

// Global copy helper called from inline onclick
window.copyCookiesToClipboard = async () => {
  if (!window._lastCookies || window._lastCookies.length === 0) return;
  const header = window._lastCookies.map(c => `${c.name}=${c.value}`).join('; ');
  try {
    await navigator.clipboard.writeText(header);
    setCookieStatus('ready', `Copied ${window._lastCookies.length} cookies to clipboard`);
  } catch (e) {
    setCookieStatus('error', 'Clipboard error: ' + e.message);
  }
};

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Titlebar controls ────────────────────────────────────────

document.getElementById('btnMin').addEventListener('click',   () => window.electronAPI.minimize());
document.getElementById('btnMax').addEventListener('click',   () => window.electronAPI.maximize());
document.getElementById('btnClose').addEventListener('click', () => window.electronAPI.close());
