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
  const currentUrl = wvRight.getURL ? wvRight.getURL() : 'https://jobright.ai';

  // Parse URL query params as filter info for the confirm dialog
  let filterText = '';
  try {
    const params = new URL(currentUrl).searchParams;
    const parts = [];
    params.forEach((v, k) => { if (v) parts.push(`${k}: ${v}`); });
    filterText = parts.length ? parts.join('  |  ') : 'No filters detected';
  } catch (_) {
    filterText = currentUrl;
  }
  alertFilterEl.textContent = filterText;
  alertOverlay.classList.add('visible');
});

document.getElementById('alertCancel').addEventListener('click', () => {
  alertOverlay.classList.remove('visible');
});

document.getElementById('alertConfirm').addEventListener('click', async () => {
  alertOverlay.classList.remove('visible');

  const maxLinks = Math.max(1, parseInt(document.getElementById('maxLinksInput').value, 10) || 20);

  setCookieStatus('', 'Verifying session...');
  resultsDrawer.innerHTML = '<span class="spinner"></span> Checking session...';
  resultsDrawer.classList.remove('has-results');

  try {
    const cookies = await window.electronAPI.getJobrightCookies();
    if (!cookies || cookies.length === 0) {
      setCookieStatus('error', 'Not logged in — log into Jobright first');
      resultsDrawer.innerHTML = '<div class="results-placeholder"><span class="icon">&#x26A0;</span><span>No session found. Log into Jobright in the right panel first.</span></div>';
      return;
    }
    window._lastCookies = cookies;

    // Build search URL from current Jobright page — preserves all filters + sortCondition
    const currentPageUrl = wvRight.getURL ? wvRight.getURL() : 'https://jobright.ai/jobs/search';
    let searchUrl;
    try {
      const u = new URL(currentPageUrl);
      // Force sortCondition=1 (most recent) and set position=0
      u.searchParams.set('sortCondition', '1');
      u.searchParams.set('position', '0');
      searchUrl = u.toString();
    } catch (_) {
      searchUrl = currentPageUrl;
    }

    setCookieStatus('ready', `Session active — ${cookies.length} cookies`);
    resultsDrawer.innerHTML = '<span class="spinner"></span> Fetching Jobright search API...';

    // Run the GET fetch inside the Jobright webview so session cookies are auto-attached
    const fetchScript = `
(async () => {
  const url = ${JSON.stringify(searchUrl)};
  const res = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers: {
      'Accept': 'application/json, text/plain, */*',
      'X-Requested-With': 'XMLHttpRequest',
    }
  });
  const status = res.status;
  const contentType = res.headers.get('content-type') || '';
  let body;
  if (contentType.includes('application/json')) {
    body = await res.json();
  } else {
    body = await res.text();
  }
  return { status, contentType, body };
})()
    `;

    const raw = await wvRight.executeJavaScript(fetchScript);

    // Log the full raw response to logs/ so we can inspect the structure
    const logResult = await window.electronAPI.logJson(
      `Jobright search API — status ${raw.status} — ${searchUrl}`,
      raw.body
    );

    if (raw.status !== 200) {
      setCookieStatus('error', `API returned ${raw.status}`);
      resultsDrawer.innerHTML = `
        <div class="results-placeholder">
          <span class="icon">&#x26A0;</span>
          <span>API returned HTTP ${raw.status}.<br>Raw response logged to:<br>
            <span style="color:var(--cyan);word-break:break-all">${escHtml(logResult.file || 'logs/')}</span>
          </span>
        </div>`;
      return;
    }

    setCookieStatus('ready', `Response logged — HTTP ${raw.status}`);
    resultsDrawer.innerHTML = `
      <div style="padding:10px;line-height:1.8;font-size:11px">
        <div style="color:var(--teal);margin-bottom:8px">&#x2714; Response received — HTTP ${raw.status}</div>
        <div style="color:var(--text-muted);margin-bottom:4px">Log file:</div>
        <div style="color:var(--cyan);word-break:break-all;margin-bottom:12px">${escHtml(logResult.file || 'logs/')}</div>
        <div style="color:var(--text-muted);margin-bottom:4px">Content-Type:</div>
        <div style="color:var(--text);margin-bottom:12px">${escHtml(raw.contentType)}</div>
        <div style="color:var(--text-muted);margin-bottom:4px">Top-level keys in response:</div>
        <div style="color:var(--gold)">
          ${typeof raw.body === 'object' && raw.body !== null
            ? Object.keys(raw.body).map(k => `<span style="margin-right:10px">${escHtml(k)}</span>`).join('')
            : escHtml(String(raw.body).slice(0, 200))
          }
        </div>
        <div style="margin-top:12px;color:var(--text-muted);font-size:10px">
          Check the log file and tell me which field contains the job links.
        </div>
      </div>`;
    resultsDrawer.classList.add('has-results');

  } catch (err) {
    setCookieStatus('error', 'Error: ' + err.message);
    resultsDrawer.innerHTML = `<div class="results-placeholder"><span class="icon">&#x274C;</span><span>${escHtml(err.message)}</span></div>`;
  }
});

// Open a job link inside the Jobright webview
window.openJobLink = (event, url) => {
  event.preventDefault();
  wvRight.loadURL(url);
};

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
