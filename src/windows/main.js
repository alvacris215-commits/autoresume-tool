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
  setCookieStatus('', 'Verifying session...');
  resultsDrawer.innerHTML = '<span class="spinner"></span> Checking session cookies...';
  resultsDrawer.classList.remove('has-results');

  try {
    // 1. Verify cookies exist before running the fetch
    const cookies = await window.electronAPI.getJobrightCookies();
    if (!cookies || cookies.length === 0) {
      setCookieStatus('error', 'Not logged in — please log into Jobright first');
      resultsDrawer.innerHTML = '<div class="results-placeholder"><span class="icon">&#x26A0;</span><span>No session found. Log into Jobright in the right panel first.</span></div>';
      return;
    }
    window._lastCookies = cookies;
    setCookieStatus('ready', `Session active — ${cookies.length} cookies`);
    resultsDrawer.innerHTML = '<span class="spinner"></span> Fetching job links from Jobright...';

    // 2. Run fetch inside the Jobright webview — cookies are automatically included
    //    because the webview already has the persist:jobright session.
    //    Strategy: try internal API endpoints, then fall back to DOM scraping.
    const fetchScript = `
(async () => {
  // --- Strategy 1: try known API paths ---
  const apiCandidates = [
    '/api/v2/job/list?limit=50',
    '/api/jobs/list?limit=50',
    '/api/v1/jobs/recommendations?limit=50',
    '/api/job/list?limit=50'
  ];
  for (const path of apiCandidates) {
    try {
      const r = await fetch(path, {
        credentials: 'include',
        headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
      });
      if (r.ok) {
        const d = await r.json();
        const raw = d.data || d.jobs || d.items || d.results || [];
        if (Array.isArray(raw) && raw.length) {
          const jobs = raw.slice(0, 50).map(j => ({
            title:   j.title   || j.jobTitle   || j.name       || '',
            company: j.company || j.companyName || j.employer   || '',
            url:     j.url     || j.jobUrl      || j.applyUrl   ||
                     (j.id ? window.location.origin + '/jobs/' + j.id : ''),
          })).filter(j => j.url);
          if (jobs.length) return { source: 'api', path, jobs };
        }
      }
    } catch(_) {}
  }

  // --- Strategy 2: scrape visible job links from the current page DOM ---
  const seen  = new Set();
  const jobs  = [];
  document.querySelectorAll('a[href]').forEach(a => {
    const href = a.href;
    if (!href || seen.has(href)) return;
    const isJobLink = /\\/jobs?\\/|jobright\\.ai\\/job/i.test(href);
    if (!isJobLink) return;
    seen.add(href);
    const card    = a.closest('[class*="card"],[class*="job"],[class*="item"],[class*="posting"]');
    const titleEl = a.querySelector('h2,h3,h4,[class*="title"]') ||
                    card?.querySelector('h2,h3,h4,[class*="title"]');
    const compEl  = card?.querySelector('[class*="company"],[class*="employer"],[class*="org"]');
    jobs.push({
      title:   (titleEl?.textContent || a.textContent || '').trim().split('\\n')[0].trim(),
      company: compEl?.textContent?.trim() || '',
      url:     href,
    });
  });
  return { source: 'dom', jobs: jobs.slice(0, 50) };
})()
    `;

    const result = await wvRight.executeJavaScript(fetchScript);

    if (!result || !result.jobs || result.jobs.length === 0) {
      setCookieStatus('error', 'No job links found on this page');
      resultsDrawer.innerHTML = '<div class="results-placeholder"><span class="icon">&#x1F50D;</span><span>No job links found. Try navigating to the jobs list on Jobright first.</span></div>';
      return;
    }

    window._lastJobs = result.jobs;
    const src = result.source === 'api' ? `API (${result.path})` : 'page DOM';
    setCookieStatus('ready', `${result.jobs.length} links via ${src}`);

    const rows = result.jobs.map((j, i) => `
      <div style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05)">
        <div style="display:flex;align-items:flex-start;gap:8px">
          <span style="color:var(--text-dim);font-size:10px;min-width:20px;padding-top:1px">${i + 1}</span>
          <div style="flex:1;overflow:hidden">
            <a href="${escHtml(j.url)}" title="${escHtml(j.url)}"
               onclick="openJobLink(event,'${escHtml(j.url)}')"
               style="color:var(--cyan);text-decoration:none;font-size:11px;display:block;
                      white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
              ${escHtml(j.title || j.url)}
            </a>
            ${j.company ? `<span style="font-size:10px;color:var(--text-muted)">${escHtml(j.company)}</span>` : ''}
          </div>
        </div>
      </div>`).join('');

    resultsDrawer.innerHTML = `
      <div style="margin-bottom:8px;font-size:10px;letter-spacing:1px;color:var(--teal)">
        &#x2714; ${result.jobs.length} job links found
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
