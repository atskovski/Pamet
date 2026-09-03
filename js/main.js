/* Pamet v1.2.2 production entrypoint. Keep dependency order explicit here. */
const PAMET_VERSION = '1.2.2';
window.PametVersion = PAMET_VERSION;

import "./auth.js";
import "./store.js";
import "./app.js";
import "./account-switch-v1.2.0.js";
import "./v1.0.3.js";
import "./feedback-v1.0.3.js";
import "./phase2.js";
import "./notifications-v1.1.0.js";
import "./e2e-sync-v1.1.0.js";
import "./qr-v1.2.0.js";
import "./security-v1.1.0.js";
import "./release-v1.1.0.js";

function applyReleaseVersion(version) {
  const normalized = String(version || '').trim() || PAMET_VERSION;
  window.PametVersion = normalized;
  document.querySelectorAll('.footer-line').forEach((footer) => {
    footer.textContent = `Pamet v${normalized} · Your health history, finally useful.`;
  });
}

applyReleaseVersion(PAMET_VERSION);
fetch('/api/health', { credentials: 'same-origin', cache: 'no-store' })
  .then((response) => response.ok ? response.json() : null)
  .then((health) => {
    if (health && health.version) applyReleaseVersion(health.version);
  })
  .catch(() => { /* the bundled version remains the offline fallback */ });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js?v=1220').catch(() => { /* core local-first use remains available without SW registration */ });
  });
}
