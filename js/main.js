/* Pamet v1.5.1 production entrypoint. Keep dependency order explicit here. */
const PAMET_VERSION = '1.5.1';
window.PametVersion = PAMET_VERSION;
window.PametLoadedVersion = PAMET_VERSION;

/* Install the broad-observer performance guard before feature modules register observers. */
import "./performance-v1.5.1.js";
import "./auth.js";
import "./store.js";
import "./icons-v1.5.0.js";
import "./app.js";
import "./account-switch-v1.2.0.js";
import "./v1.0.3.js";
import "./feedback-v1.0.3.js";
import "./phase2.js";
import "./care-workspace-v1.3.0.js";
import "./notifications-v1.1.0.js";
import "./e2e-sync-v1.1.0.js";
import "./qr-v1.2.0.js";
import "./security-v1.1.0.js";
import "./release-v1.1.0.js";
import "./product-clarity-v1.4.0.js";
import "./insights-v1.5.0.js";
import "./experience-v1.5.0.js";
import "./care-ux-v1.5.1.js";
import "./version-update.js";

function releaseFooterText(version = PAMET_VERSION) {
  const normalized = String(version || '').trim() || PAMET_VERSION;
  return `Pamet v${normalized} · Your health history, finally useful.`;
}

function applyReleaseVersion(version = PAMET_VERSION) {
  const text = releaseFooterText(version);
  document.querySelectorAll('.footer-line').forEach((footer) => {
    if (footer.textContent !== text) footer.textContent = text;
  });
}

function protectReleaseFooter() {
  applyReleaseVersion(PAMET_VERSION);
  const observer = new MutationObserver((mutations) => {
    if (!mutations.some((mutation) => mutation.target?.closest?.('.footer-line') || mutation.target?.classList?.contains?.('footer-line'))) return;
    applyReleaseVersion(PAMET_VERSION);
  });
  document.querySelectorAll('.footer-line').forEach((footer) => observer.observe(footer, { childList: true, characterData: true, subtree: true }));
  document.addEventListener('pamet:settings-rendered', () => applyReleaseVersion(PAMET_VERSION));
}

protectReleaseFooter();
fetch('/api/health', { credentials: 'same-origin', cache: 'no-store' })
  .then((response) => response.ok ? response.json() : null)
  .then((health) => {
    if (!health?.version) return;
    window.PametServerVersion = health.version;
    if (health.version !== PAMET_VERSION) window.PametOfferVersionUpdate?.(health.version);
  })
  .catch(() => {});

/* Register from the external bundle so production CSP can keep inline scripts disabled. */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js?v=1511').catch(() => {});
  });
}
