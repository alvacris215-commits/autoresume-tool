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
    setCookieStatus('ready', `Session active — ${cookies.length} cookies`);
    resultsDrawer.innerHTML = '<span class="spinner"></span> Scraping external job links...';

    // Grab the current URL so the script inside the webview can use its query params
    const currentPageUrl = wvRight.getURL ? wvRight.getURL() : 'https://jobright.ai';

    // Script runs inside persist:jobright — session cookies auto-attached.
    // Goal: find external apply links (not jobright.ai, not linkedin.com).
    // Strategy 1 — look for "Apply" / "Easy Apply" buttons and follow href.
    // Strategy 2 — look for data attributes that hold external URLs.
    // Strategy 3 — look for any anchor whose href is an external domain.
    const fetchScript = `
(async () => {
  const MAX = ${maxLinks};
  const pageUrl = ${JSON.stringify(currentPageUrl)};

  // Helpers
  const isExternal = href => {
    try {
      const u = new URL(href);
      const h = u.hostname.toLowerCase();
      // exclude jobright itself, linkedin, and blank/javascript links
      return u.protocol.startsWith('http') &&
             !h.includes('jobright') &&
             !h.includes('linkedin') &&
             !h.includes('javascript');
    } catch(_) { return false; }
  };

  const seen = new Set();
  const jobs = [];

  const addJob = (url, title, company) => {
    if (!url || seen.has(url) || !isExternal(url)) return;
    seen.add(url);
    jobs.push({
      title:   (title   || '').trim().replace(/\\s+/g, ' ').split('\\n')[0].trim(),
      company: (company || '').trim().replace(/\\s+/g, ' ').split('\\n')[0].trim(),
      url,
    });
  };

  // Strategy 1: data attributes that hold external apply URLs
  document.querySelectorAll('[data-apply-url],[data-external-url],[data-job-url],[data-url]').forEach(el => {
    const url = el.dataset.applyUrl || el.dataset.externalUrl || el.dataset.jobUrl || el.dataset.url;
    const card = el.closest('[class*="card"],[class*="job"],[class*="item"],[class*="posting"]');
    const title   = card?.querySelector('[class*="title"],h2,h3,h4')?.textContent || '';
    const company = card?.querySelector('[class*="company"],[class*="employer"]')?.textContent || '';
    addJob(url, title, company);
  });

  // Strategy 2: <a> tags — external href + sibling context for title/company
  document.querySelectorAll('a[href]').forEach(a => {
    const href = a.href;
    if (!isExternal(href)) return;
    const card    = a.closest('[class*="card"],[class*="job"],[class*="item"],[class*="posting"]');
    const titleEl = card?.querySelector('[class*="title"],h2,h3,h4') || a;
    const compEl  = card?.querySelector('[class*="company"],[class*="employer"]');
    addJob(href, titleEl.textContent, compEl?.textContent || '');
  });

  // Strategy 3: try Jobright API with current page query params
  if (jobs.length < MAX) {
    try {
      const q = new URL(pageUrl).search;
      const apiPaths = [
        '/api/v2/job/list' + q,
        '/api/jobs/list'   + q,
      ];
      for (const path of apiPaths) {
        const r = await fetch(path, {
          credentials: 'include',
          headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
        });
        if (!r.ok) continue;
        const d = await r.json();
        const raw = d.data || d.jobs || d.items || d.results || [];
        if (!Array.isArray(raw) || !raw.length) continue;
        raw.forEach(j => {
          const url = j.externalUrl || j.applyUrl || j.externalApplyUrl || j.jobUrl || '';
          addJob(url, j.title || j.jobTitle || '', j.company || j.companyName || '');
        });
        if (jobs.length) break;
      }
    } catch(_) {}
  }

  return { jobs: jobs.slice(0, MAX), total: jobs.length };
})()
    `;

    const result = await wvRight.executeJavaScript(fetchScript);

    if (!result || !result.jobs || result.jobs.length === 0) {
      setCookieStatus('error', 'No external links found on this page');
      resultsDrawer.innerHTML = '<div class="results-placeholder"><span class="icon">&#x1F50D;</span><span>No external apply links found. Navigate to the Jobright job list first, then try again.</span></div>';
      return;
    }

    window._lastJobs = result.jobs;
    const truncNote = result.total > maxLinks ? ` (capped at ${maxLinks})` : '';
    setCookieStatus('ready', `${result.jobs.length} external links${truncNote}`);

    const rows = result.jobs.map((j, i) => `
      <div style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05)">
        <div style="display:flex;align-items:flex-start;gap:8px">
          <span style="color:var(--text-dim);font-size:10px;min-width:18px;padding-top:2px">${i + 1}</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:10px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
              ${escHtml(new URL(j.url).hostname)}
            </div>
            <a href="${escHtml(j.url)}" title="${escHtml(j.url)}"
               onclick="event.preventDefault();navigator.clipboard.writeText('${escHtml(j.url)}')"
               style="color:var(--cyan);text-decoration:none;font-size:11px;display:block;
                      white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:copy">
              ${escHtml(j.title || j.url)}
            </a>
            ${j.company ? `<span style="font-size:10px;color:var(--text-muted)">${escHtml(j.company)}</span>` : ''}
          </div>
        </div>
      </div>`).join('');

    resultsDrawer.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-size:10px;letter-spacing:1px;color:var(--teal)">&#x2714; ${result.jobs.length} external links — click to copy</span>
      </div>
      ${rows}`;
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
