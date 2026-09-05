/* Pamet plan management — account context, current entitlements, and upgrade/billing actions. */
(function (global) {
  "use strict";

  const Auth = global.PametAuth;
  const Store = global.PametStore;
  const catalog = global.PametPlanCatalog;
  if (!Auth || !Store || !catalog) return;

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]));
  const planByKey = (key) => catalog.plans.find((item) => item.key === key) || catalog.plans[0];
  const currentPlanKey = () => global.PametPlanComparison?.currentPlan?.() || "free";
  const nextPlanKey = (key) => key === "free" ? "pro" : key === "pro" ? "ultra" : null;

  function accountStats() {
    const user = Auth.getUser?.() || {};
    const entries = Array.isArray(Store.entries) ? Store.entries : [];
    const loggedDays = new Set(entries.map((entry) => String(entry.date || "").slice(0, 10)).filter(Boolean)).size;
    const profiles = Array.isArray(Store.profiles) ? Store.profiles.length : 1;
    const created = user.createdAt ? new Date(user.createdAt) : null;
    const validCreated = created && !Number.isNaN(+created) ? created : null;
    const accountDays = validCreated ? Math.max(0, Math.floor((Date.now() - +validCreated) / 86400000)) : null;
    const oldest = entries.reduce((value, entry) => {
      const timestamp = +new Date(entry.date);
      return Number.isFinite(timestamp) && (!value || timestamp < value) ? timestamp : value;
    }, 0);
    return { user, entries:entries.length, loggedDays, profiles, createdAt:validCreated, accountDays, oldestEntry:oldest ? new Date(oldest) : null };
  }

  function formatDate(value) {
    if (!value || Number.isNaN(+value)) return "Not available";
    return value.toLocaleDateString(undefined, { month:"short", day:"numeric", year:"numeric" });
  }
  function planFeatures(key) { return catalog.features.filter((feature) => feature[key]); }
  function uniqueNextFeatures(key) {
    const next = nextPlanKey(key);
    return next ? catalog.features.filter((feature) => feature[next] && !feature[key]) : [];
  }
  function modalRoot() {
    let root = document.querySelector("#pametPlanManagementRoot");
    if (!root) { root = document.createElement("div"); root.id = "pametPlanManagementRoot"; document.body.appendChild(root); }
    return root;
  }
  function close() { const root = document.querySelector("#pametPlanManagementRoot"); if (root) root.innerHTML = ""; }
  function status(root, message, kind = "info") {
    const node = root.querySelector("[data-plan-management-status]");
    if (!node) return;
    node.hidden = !message;
    node.className = `plan-management-status ${kind}`;
    node.textContent = message || "";
  }

  async function api(path, options = {}) {
    const baseHeaders = { "Content-Type":"application/json", ...(options.headers || {}) };
    let response = await fetch(path, { credentials:"same-origin", cache:"no-store", ...options, headers:baseHeaders });
    const credential = Auth.getBackendCredential?.();
    if (response.status === 401 && credential?.deviceKey && !baseHeaders.Authorization) {
      response = await fetch(path, { credentials:"same-origin", cache:"no-store", ...options, headers:{ ...baseHeaders, Authorization:`Bearer ${credential.deviceKey}` } });
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(body.error || `Request failed (${response.status})`); error.status = response.status; throw error; }
    return body;
  }

  function renderIncluded(features) { return features.map((feature) => `<li><span aria-hidden="true">✓</span><span>${esc(feature.label)}</span></li>`).join(""); }
  function renderAccountFacts(stats) {
    const fullName = [stats.user.firstName, stats.user.lastName].filter(Boolean).join(" ") || "Pamet member";
    const age = stats.accountDays === null ? "Account age unavailable" : `${stats.accountDays} day${stats.accountDays === 1 ? "" : "s"} with Pamet`;
    return `<div class="plan-account-grid"><div><span>Name</span><strong>${esc(fullName)}</strong></div><div><span>Email</span><strong>${esc(stats.user.email || "Not available")}</strong></div><div><span>Member since</span><strong>${esc(formatDate(stats.createdAt))}</strong></div><div><span>Pamet age</span><strong>${esc(age)}</strong></div></div>`;
  }
  function renderEasterEggs(stats, plan) {
    return `<section class="plan-account-moments" aria-label="Your Pamet history"><div><strong>${stats.entries}</strong><span>journal ${stats.entries === 1 ? "entry" : "entries"}</span></div><div><strong>${stats.loggedDays}</strong><span>distinct ${stats.loggedDays === 1 ? "day" : "days"} logged</span></div><div><strong>${stats.profiles}</strong><span>${stats.profiles === 1 ? "health profile" : "health profiles"}</span></div><div><strong>${esc(plan.positioning)}</strong><span>your Pamet chapter</span></div>${stats.oldestEntry ? `<p>Your earliest journal entry in this profile is from <strong>${esc(formatDate(stats.oldestEntry))}</strong>.</p>` : `<p>Your first tracked entry will become part of your Pamet history here.</p>`}</section>`;
  }

  async function loadBillingStatus(root) {
    try {
      const response = await api("/api/billing/status", { headers:{ Accept:"application/json" } });
      const subscription = response.user?.subscriptionStatus || "none";
      const node = root.querySelector("[data-billing-state]");
      if (node) node.textContent = subscription === "none" ? "No paid subscription is active on this account." : `Subscription status: ${subscription}`;
    } catch {
      const node = root.querySelector("[data-billing-state]");
      if (node) node.textContent = "Billing status could not be refreshed right now. Your verified in-app plan is shown above.";
    }
  }

  async function openBilling(root, button, message = "Opening secure billing…") {
    button.disabled = true; status(root, message, "info");
    try {
      const response = await api("/api/billing/portal", { method:"POST", body:"{}" });
      if (!response.url) throw new Error("Billing management could not be opened.");
      global.location.assign(response.url);
    } catch (error) {
      status(root, error.status === 401 ? "Your billing session could not be verified. Sign out and back in before changing billing details." : (error.message || "Billing management is temporarily unavailable."), "error");
      button.disabled = false;
    }
  }

  function upgradeCard(targetKey) {
    const target = planByKey(targetKey);
    const from = currentPlanKey();
    const added = catalog.features.filter((feature) => feature[targetKey] && !feature[from]).slice(0, 7);
    return `<article class="pamet-compare-card recommended plan-management-upgrade-card"><div class="pamet-plan-label ${targetKey === "ultra" ? "advanced" : ""}">${targetKey === "pro" ? "Next step" : "Advanced care preparation"}</div><h3>${esc(target.name)} · ${esc(target.positioning)}</h3><p>${esc(target.summary)}</p><div class="price">${esc(target.monthly)}/mo · ${esc(target.annual)}/yr</div><ul>${added.map((feature) => `<li>${esc(feature.label)}</li>`).join("")}</ul></article>`;
  }

  async function ensureStripe(config) {
    if (!config.publishableKey) throw new Error("Secure checkout is not configured yet.");
    if (global.Stripe) return global.Stripe;
    await new Promise((resolve, reject) => {
      const script = document.createElement("script"); script.src = "https://js.stripe.com/v3/"; script.onload = resolve; script.onerror = reject; document.head.appendChild(script);
    });
    return global.Stripe;
  }

  async function checkoutFreeToPro(root, interval) {
    const submit = root.querySelector("[data-confirm-upgrade]");
    submit.disabled = true; status(root, "Preparing secure Pro checkout…", "info");
    try {
      const config = await api("/api/billing/config", { headers:{ Accept:"application/json" } });
      if (!config.proEnabled) throw new Error("Pro checkout is temporarily unavailable.");
      const StripeCtor = await ensureStripe(config);
      const attempt = global.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const out = await api("/api/billing/create-subscription", { method:"POST", body:JSON.stringify({ plan:"pro", interval, checkoutAttemptId:attempt }) });
      root.querySelector(".plan-management-modal").innerHTML = `<header class="plan-management-head"><div><span class="plan-management-kicker">UPGRADE TO PRO</span><h2>Secure checkout</h2><p>Payment fields are provided by Stripe. Pamet does not store your card number.</p></div><button type="button" class="pamet-close" data-plan-management-close aria-label="Close">×</button></header><div id="planPaymentElement" class="pamet-payment-box"></div><div data-plan-management-status class="plan-management-status info" role="status" aria-live="polite"></div><button type="button" class="btn btn-primary btn-block" id="planConfirmPayment">Confirm Pro</button>`;
      root.querySelector("[data-plan-management-close]")?.addEventListener("click", close);
      const stripe = StripeCtor(config.publishableKey);
      const elements = stripe.elements({ clientSecret:out.clientSecret, appearance:{ theme:"stripe", variables:{ colorPrimary:"#4CAF7A", colorText:"#263638", colorDanger:"#8E3B4F", borderRadius:"10px" } } });
      const payment = elements.create("payment"); payment.mount("#planPaymentElement");
      root.querySelector("#planConfirmPayment").addEventListener("click", async () => {
        const button = root.querySelector("#planConfirmPayment"); button.disabled = true; button.textContent = "Confirming…";
        const confirmParams = { return_url:`${location.origin}${location.pathname}?billing=complete` };
        const result = out.intentType === "setup" ? await stripe.confirmSetup({ elements, confirmParams, redirect:"if_required" }) : await stripe.confirmPayment({ elements, confirmParams, redirect:"if_required" });
        if (result.error) { status(root, result.error.message || "Payment could not be confirmed.", "error"); button.disabled = false; button.textContent = "Confirm Pro"; return; }
        await api("/api/billing/sync", { method:"POST", body:"{}" });
        await global.PametEntitlements?.refresh?.();
        close(); global.PametPlanComparison?.refreshSettings?.();
      });
    } catch (error) { status(root, error.message || "Upgrade could not be started.", "error"); submit.disabled = false; }
  }

  function openUpgrade(targetKey) {
    const root = modalRoot();
    const from = currentPlanKey();
    const target = planByKey(targetKey);
    root.innerHTML = `<div class="pamet-modal-backdrop plan-management-backdrop"><section class="pamet-modal plan-management-modal" role="dialog" aria-modal="true" aria-labelledby="planUpgradeTitle"><header class="plan-management-head"><div><span class="plan-management-kicker">UPGRADE YOUR PLAN</span><h2 id="planUpgradeTitle">Upgrade to ${esc(target.name)}</h2><p>${from === "free" ? "Choose a billing interval, then complete secure checkout." : "Review Ultra, then continue to secure billing to change your existing Pro subscription."}</p></div><button type="button" class="pamet-close" data-plan-management-close aria-label="Close">×</button></header>${upgradeCard(targetKey)}<div class="pamet-billing-toggle" aria-label="Billing interval"><button class="active" data-upgrade-interval="annual">Annual · Best value</button><button data-upgrade-interval="monthly">Monthly</button></div><div data-plan-management-status class="plan-management-status info" hidden role="status" aria-live="polite"></div><div class="plan-management-actions"><button type="button" class="btn btn-ghost" data-plan-management-back>Back</button><button type="button" class="btn btn-primary" data-confirm-upgrade>Continue to ${esc(target.name)}</button></div><p class="plan-management-footnote">${from === "free" ? "Includes the current Pamet trial offer. Cancel anytime from Manage billing." : "Stripe handles the subscription change and any billing adjustment for the existing Pro subscription."}</p></section></div>`;
    root.querySelector("[data-plan-management-close]")?.addEventListener("click", close);
    root.querySelector("[data-plan-management-back]")?.addEventListener("click", open);
    let interval = "annual";
    root.querySelectorAll("[data-upgrade-interval]").forEach((button) => button.addEventListener("click", () => { interval = button.dataset.upgradeInterval; root.querySelectorAll("[data-upgrade-interval]").forEach((item) => item.classList.toggle("active", item === button)); }));
    const confirm = root.querySelector("[data-confirm-upgrade]");
    confirm?.addEventListener("click", () => from === "free" ? checkoutFreeToPro(root, interval) : openBilling(root, confirm, "Opening secure Ultra upgrade…"));
  }

  function open() {
    const key = currentPlanKey();
    const plan = planByKey(key);
    const stats = accountStats();
    const included = planFeatures(key);
    const next = uniqueNextFeatures(key);
    const nextKey = nextPlanKey(key);
    const root = modalRoot();
    root.innerHTML = `<div class="pamet-modal-backdrop plan-management-backdrop"><section class="pamet-modal plan-management-modal" role="dialog" aria-modal="true" aria-labelledby="planManagementTitle"><header class="plan-management-head"><div><span class="plan-management-kicker">YOUR PAMET ACCOUNT</span><h2 id="planManagementTitle">Manage your plan</h2><p>Review your account and what ${esc(plan.name)} includes.</p></div><button type="button" class="pamet-close" data-plan-management-close aria-label="Close">×</button></header><section class="plan-management-current"><div><span>Current plan</span><h3>${esc(plan.name)} · ${esc(plan.positioning)}</h3><p>${esc(plan.summary)}</p></div><div class="plan-management-price"><strong>${esc(plan.monthly)}${key === "free" ? "" : "/mo"}</strong>${key === "free" ? "" : `<span>${esc(plan.annual)}/yr</span>`}</div></section>${renderAccountFacts(stats)}${renderEasterEggs(stats, plan)}<section class="plan-management-features"><div class="plan-management-section-head"><div><span>Included now</span><h3>${esc(plan.name)} features</h3></div><strong>${included.length} listed features</strong></div><ul>${renderIncluded(included)}</ul></section>${next.length ? `<section class="plan-management-next"><span>What ${esc(planByKey(nextKey).name)} adds</span><p>${next.slice(0,4).map((feature) => esc(feature.label)).join(" · ")}</p></section>` : `<section class="plan-management-next complete"><span>Ultra plan</span><p>Your plan includes every feature currently listed in Pamet’s canonical plan catalog.</p></section>`}<div data-plan-management-status class="plan-management-status info" hidden role="status" aria-live="polite"></div>${key === "free" ? "" : '<p class="plan-management-billing-state" data-billing-state>Refreshing billing status…</p>'}<div class="plan-management-actions"><button type="button" class="btn btn-ghost" data-plan-management-compare>Compare all Pamet features</button>${nextKey ? `<button type="button" class="btn btn-primary" data-plan-management-upgrade>Upgrade to ${esc(planByKey(nextKey).name)}</button>` : '<button type="button" class="btn btn-primary" data-plan-management-billing>Manage billing</button>'}</div>${key === "pro" ? '<button type="button" class="data-btn plan-management-secondary-billing" data-plan-management-billing>Billing & invoices</button>' : ""}<p class="plan-management-footnote">Plan access is verified by Pamet’s server-side entitlements. Billing opens only when you choose an upgrade or billing action.</p></section></div>`;
    root.querySelectorAll("[data-plan-management-close]").forEach((button) => button.addEventListener("click", close));
    root.querySelector(".plan-management-backdrop")?.addEventListener("click", (event) => { if (event.target === event.currentTarget) close(); });
    root.querySelector("[data-plan-management-compare]")?.addEventListener("click", () => { close(); global.PametPlanComparison?.open?.(key); });
    root.querySelector("[data-plan-management-upgrade]")?.addEventListener("click", () => openUpgrade(nextKey));
    root.querySelectorAll("[data-plan-management-billing]").forEach((button) => button.addEventListener("click", () => openBilling(root, button)));
    if (key !== "free") loadBillingStatus(root);
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest?.("#upgradeBtn");
    if (!button) return;
    event.preventDefault(); event.stopImmediatePropagation(); open();
  }, true);

  global.PametPlanManagement = Object.freeze({ open, close, accountStats, planFeatures, openUpgrade });
})(window);
