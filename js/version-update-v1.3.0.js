/* Pamet safe release update prompt. Never clears local journal/site data. */
(() => {
  const CHECK_INTERVAL_MS = 15 * 60 * 1000;
  const DISMISS_KEY = 'pamet:update-dismissed-version';
  let latestVersion = null;
  let checkTimer = null;

  function loadedVersion() {
    return window.PametLoadedVersion || window.PametVersion || '0.0.0';
  }

  function compareVersions(a, b) {
    const pa = String(a || '').split('.').map((n) => Number(n) || 0);
    const pb = String(b || '').split('.').map((n) => Number(n) || 0);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i += 1) {
      const av = pa[i] || 0;
      const bv = pb[i] || 0;
      if (av > bv) return 1;
      if (av < bv) return -1;
    }
    return 0;
  }

  function removePrompt() {
    document.getElementById('pametVersionUpdate')?.remove();
  }

  function showPrompt(version) {
    if (!version || compareVersions(version, loadedVersion()) <= 0) return;
    if (sessionStorage.getItem(DISMISS_KEY) === version) return;
    latestVersion = version;
    if (document.getElementById('pametVersionUpdate')) return;

    const wrap = document.createElement('aside');
    wrap.id = 'pametVersionUpdate';
    wrap.className = 'pamet-version-update';
    wrap.setAttribute('role', 'status');
    wrap.setAttribute('aria-live', 'polite');
    wrap.innerHTML = `
      <div class="pamet-version-update__copy">
        <strong>New Pamet version available</strong>
        <span>Version ${version} is ready. Updating refreshes the app only and does not clear your saved Pamet data.</span>
      </div>
      <div class="pamet-version-update__actions">
        <button type="button" class="btn btn-ghost" data-update-later>Later</button>
        <button type="button" class="btn btn-primary" data-update-now>Update now</button>
      </div>`;

    wrap.querySelector('[data-update-later]').addEventListener('click', () => {
      sessionStorage.setItem(DISMISS_KEY, version);
      removePrompt();
    });
    wrap.querySelector('[data-update-now]').addEventListener('click', () => applyUpdate(version));
    document.body.appendChild(wrap);
  }

  async function checkServerVersion() {
    try {
      const response = await fetch(`/api/health?release_check=${Date.now()}`, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      });
      if (!response.ok) return;
      const health = await response.json();
      if (health?.version) {
        window.PametServerVersion = health.version;
        showPrompt(health.version);
      }
    } catch {
      // Offline/local-first use continues without an update check.
    }
  }

  async function applyUpdate(version) {
    const button = document.querySelector('#pametVersionUpdate [data-update-now]');
    if (button) {
      button.disabled = true;
      button.textContent = 'Updating…';
    }

    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          await registration.update().catch(() => {});
          if (registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      }
    } finally {
      const target = new URL(window.location.href);
      target.searchParams.set('pamet_release', version || latestVersion || Date.now());
      window.location.replace(target.toString());
    }
  }

  window.PametOfferVersionUpdate = showPrompt;
  window.PametCheckForUpdate = checkServerVersion;

  window.addEventListener('load', () => {
    checkServerVersion();
    clearInterval(checkTimer);
    checkTimer = setInterval(checkServerVersion, CHECK_INTERVAL_MS);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkServerVersion();
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (latestVersion && compareVersions(latestVersion, loadedVersion()) > 0) {
        const target = new URL(window.location.href);
        target.searchParams.set('pamet_release', latestVersion);
        window.location.replace(target.toString());
      }
    });
  }
})();
