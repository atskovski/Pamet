/* Pamet v1.2.1 production entrypoint. Keep dependency order explicit here. */
const PAMET_VERSION = '1.2.1';
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

const releaseFooter = document.querySelector('.footer-line');
if (releaseFooter) releaseFooter.textContent = `Pamet v${PAMET_VERSION} · Your health history, finally useful.`;

// Keep PWA registration in the external bundle so the production CSP can block
// executable inline scripts without silently disabling install/offline updates.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js?v=1210').catch(() => { /* core local-first use remains available without SW registration */ });
  });
}
