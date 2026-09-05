/* Pamet v1.6.8 production entrypoint. Keep dependency order explicit here. */
const PAMET_VERSION = '1.6.8';
window.PametVersion = PAMET_VERSION;
window.PametLoadedVersion = PAMET_VERSION;

/* Install the broad-observer performance guard before feature modules register observers. */
import "./performance.js";
import "./auth.js";
import "./oauth-login.js";
import "./plan-catalog.generated.js";
import "./store.js";
import "./plan-comparison.js";
import "./platform-foundation.js";
import "./icons.js";
import "./app.js";
import "./home-dashboard.js";
import "./home-dashboard-lifecycle.js";
import "./account-switch.js";
import "./billing-sharing.js";
/* Paid feature modules below must consume the server-verified, fail-closed plan boundary. */
import "./entitlement-guard.js";
import "./observation-engine.js";
import "./log-experience.js";
import "./feedback.js";
import "./care-planning.js";
import "./care-workspace.js";
import "./notifications.js";
import "./platform-experience.js";
import "./encrypted-sync.js";
import "./qr-sharing.js";
import "./security.js";
import "./login-experience.js";
import "./product-clarity.js";
import "./insights.js";
import "./interaction-controller.js";
import "./experience.js";
import "./care-ux.js";
import "./ui-ux.js";
import "./care-sharing-enhancements.js";
import "./legal-support.js";
import "./version-update.js";

/*
 * The v1.5 Insights workspace replaces the legacy Patterns markup when it renders.
 * app.js still owns the tab state and performs one legacy render synchronously when
 * the Patterns tab is selected. If Insights has already replaced that markup (for
 * example after fresh-account lifecycle events), restore the four legacy targets
 * only for that synchronous handoff. Insights then performs the visible render on
 * the same navigation event and replaces this hidden compatibility bridge.
 */
function bridgeLegacyPatternRender() {
  const screen = document.querySelector('#screen-patterns');
  const host = screen?.querySelector('.content-col');
  if (!host) return;

  const required = [
    ['span', 'patternDaysCount'],
    ['span', 'patternSummary'],
    ['div', 'patternsUpgrade'],
    ['div', 'patternList']
  ];
  if (required.every(([, id]) => document.getElementById(id))) return;

  let bridge = screen.querySelector('[data-legacy-pattern-bridge]');
  if (!bridge) {
    bridge = document.createElement('div');
    bridge.hidden = true;
    bridge.setAttribute('aria-hidden', 'true');
    bridge.dataset.legacyPatternBridge = 'true';
    host.appendChild(bridge);
  }
  required.forEach(([tag, id]) => {
    if (document.getElementById(id)) return;
    const element = document.createElement(tag);
    element.id = id;
    bridge.appendChild(element);
  });
}

document.addEventListener('click', (event) => {
  if (event.target.closest?.('[data-tab="patterns"], [data-nav="patterns"]')) bridgeLegacyPatternRender();
}, true);

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

function checkServerRelease() {
  fetch('/api/health', { credentials: 'same-origin', cache: 'no-store' })
    .then((response) => response.ok ? response.json() : null)
    .then((health) => {
      if (!health?.version) return;
      window.PametServerVersion = health.version;
      if (health.version !== PAMET_VERSION) window.PametOfferVersionUpdate?.(health.version);
    })
    .catch(() => {});
}

protectReleaseFooter();

/* Release identity is non-critical startup work. Let the first interactive frame render before calling the edge. */
window.addEventListener('load', () => {
  if ('requestIdleCallback' in window) window.requestIdleCallback(checkServerRelease, { timeout: 1500 });
  else setTimeout(checkServerRelease, 250);
}, { once: true });

/* Release-specific worker URL + updateViaCache:none prevents old PWA shells from masking a new release. */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js?v=1680', { updateViaCache: 'none' })
      .then((registration) => registration.update().catch(() => {}))
      .catch(() => {});
  }, { once: true });
}
