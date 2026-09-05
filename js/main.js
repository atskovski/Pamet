/* Pamet v1.6.9 performance-first production bootstrap. */
const PAMET_VERSION = '1.6.9';
window.PametVersion = PAMET_VERSION;
window.PametLoadedVersion = PAMET_VERSION;

/* Security, local-data integrity, and signed-out experience stay eager. */
import "./performance.js";
import "./performance-rum.js";
import "./auth.js";
import "./oauth-login.js";
import "./plan-catalog.generated.js";
import "./store.js";
import "./store-performance.js";
import "./platform-foundation.js";
import "./icons.js";
import "./app.js";
import "./account-switch.js";
import "./entitlement-guard.js";
import "./security.js";
import "./login-experience.js";
import "./legal-support.js";
import "./version-update.js";

const featureUrls = () => ({
  js: document.querySelector('meta[name="pamet-features-js"]')?.content || '/dist/pamet.features.min.js',
  css: document.querySelector('meta[name="pamet-features-css"]')?.content || '/dist/pamet.features.min.css'
});
let featureLoadPromise = null;

function loadStylesheet(href) {
  if (!href) return Promise.resolve();
  const existing = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).find((link) => link.href === new URL(href, location.href).href);
  if (existing) return Promise.resolve();
  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.pametAuthenticatedStyles = 'true';
    link.addEventListener('load', resolve, { once: true });
    link.addEventListener('error', resolve, { once: true });
    document.head.appendChild(link);
  });
}

function loadScript(src) {
  if (!src || window.PametAuthenticatedFeaturesLoaded) return Promise.resolve();
  const existing = document.querySelector('script[data-pamet-authenticated-features]');
  if (existing) return new Promise((resolve) => {
    if (window.PametAuthenticatedFeaturesLoaded) resolve();
    else window.addEventListener('pamet:authenticated-features-ready', resolve, { once: true });
  });
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.pametAuthenticatedFeatures = 'true';
    script.addEventListener('load', resolve, { once: true });
    script.addEventListener('error', () => reject(new Error('Pamet feature bundle failed to load.')), { once: true });
    document.head.appendChild(script);
  });
}

function loadAuthenticatedFeatures() {
  if (window.PametAuthenticatedFeaturesLoaded) return Promise.resolve();
  if (featureLoadPromise) return featureLoadPromise;
  const urls = featureUrls();
  featureLoadPromise = Promise.all([loadStylesheet(urls.css), loadScript(urls.js)])
    .then(() => undefined)
    .catch((error) => {
      featureLoadPromise = null;
      console.warn('pamet_feature_bundle_load_failed', { message: error.message });
      throw error;
    });
  return featureLoadPromise;
}
window.PametLoadAuthenticatedFeatures = loadAuthenticatedFeatures;

function prefetchAuthenticatedFeatures() {
  if (window.PametAuth?.isAuthed?.() || navigator.connection?.saveData || /(^|-)2g$/.test(navigator.connection?.effectiveType || '')) return;
  const urls = featureUrls();
  for (const [href, as] of [[urls.css, 'style'], [urls.js, 'script']]) {
    if (!href || document.querySelector(`link[data-pamet-prefetch="${as}"]`)) continue;
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.as = as;
    link.href = href;
    link.dataset.pametPrefetch = as;
    document.head.appendChild(link);
  }
}

/* Warm the post-login path only after the user starts interacting with sign-in. */
const loginForm = document.querySelector('#loginForm');
loginForm?.addEventListener('focusin', prefetchAuthenticatedFeatures, { once: true });
loginForm?.addEventListener('pointerdown', prefetchAuthenticatedFeatures, { once: true, passive: true });
for (const eventName of ['pamet:login', 'pamet:registered']) {
  window.addEventListener(eventName, () => loadAuthenticatedFeatures().catch(() => {}));
}
if (window.PametAuth?.isAuthed?.()) loadAuthenticatedFeatures().catch(() => {});

/*
 * The v1.5 Insights workspace replaces the legacy Patterns markup when it renders.
 * app.js still owns tab state and performs one legacy render synchronously when
 * Patterns is selected. Restore the hidden targets only for that handoff.
 */
function bridgeLegacyPatternRender() {
  const screen = document.querySelector('#screen-patterns');
  const host = screen?.querySelector('.content-col');
  if (!host) return;
  const required = [['span', 'patternDaysCount'], ['span', 'patternSummary'], ['div', 'patternsUpgrade'], ['div', 'patternList']];
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
  document.querySelectorAll('.footer-line').forEach((footer) => { if (footer.textContent !== text) footer.textContent = text; });
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
window.addEventListener('load', () => {
  if ('requestIdleCallback' in window) window.requestIdleCallback(checkServerRelease, { timeout: 1500 });
  else setTimeout(checkServerRelease, 250);
}, { once: true });
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js?v=1691', { updateViaCache: 'none' })
      .then((registration) => registration.update().catch(() => {}))
      .catch(() => {});
  }, { once: true });
}
