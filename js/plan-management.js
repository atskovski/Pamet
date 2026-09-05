/* Pamet plan management — account context, current entitlements, and billing actions. */
(function (global) {
  "use strict";

  const Auth = global.PametAuth;
  const Store = global.PametStore;
  const catalog = global.PametPlanCatalog;
  if (!Auth || !Store || !catalog) return;

  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;"
        })[char]
    );

  const planByKey = (key) => catalog.plans.find((item) => item.key === key) || catalog.plans[0];
  const currentPlanKey = () => global.PametPlanComparison?.currentPlan?.() || "free";

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

    return {
      user,
      entries: entries.length,
      loggedDays,
      profiles,
      createdAt: validCreated,
      accountDays,
      oldestEntry: oldest ? new Date(oldest) : null
    };
  }

  function formatDate(value) {
    if (!value || Number.isNaN(+value)) return "Not available";
    return value.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function planFeatures(key) {
    return catalog.features.filter((feature) => feature[key]);
  }

  function uniqueNextFeatures(key) {
    if (key === "ultra") return [];
    const next = key === "free" ? "pro" : "ultra";
    return catalog.features.filter((feature) => feature[next] && !feature[key]);
  }

  function modalRoot() {
    let root = document.querySelector("#pametPlanManagementRoot");
    if (!root) {
      root = document.createElement("div");
      root.id = "pametPlanManagementRoot";
      document.body.appendChild(root);
    }
    return root;
  }

  function close() {
    const root = document.querySelector("#pametPlanManagementRoot");
    if (root) root.innerHTML = "";
  }

  function status(root, message, kind = "info") {
    const node = root.querySelector("[data-plan-management-status]");
    if (!node) return;
    node.hidden = !message;
    node.className = `plan-management-status ${kind}`;
    node.textContent = message || "";
  }

  async function api(path, options = {}) {
    const credential = Auth.getBackendCredential?.();
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (credential?.deviceKey) headers.Authorization = `Bearer ${credential.deviceKey}`;
    const response = await fetch(path, {
      credentials: "same-origin",
      cache: "no-store",
      ...options,
      headers
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body.error || `Request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return body;
  }

  function renderIncluded(features) {
    return features.map((feature) => `<li><span aria-hidden="true">✓</span><span>${esc(feature.label)}</span></li>`).join("");
  }

  function renderAccountFacts(stats) {
    const fullName = [stats.user.firstName, stats.user.lastName].filter(Boolean).join(" ") || "Pamet member";
    const age = stats.accountDays === null ? "Account age unavailable" : `${stats.accountDays} day${stats.accountDays === 1 ? "" : "s"} with Pamet`;
    return `<div class="plan-account-grid">
      <div><span>Name</span><strong>${esc(fullName)}</strong></div>
      <div><span>Email</span><strong>${esc(stats.user.email || "Not available")}</strong></div>
      <div><span>Member since</span><strong>${esc(formatDate(stats.createdAt))}</strong></div>
      <div><span>Pamet age</span><strong>${esc(age)}</strong></div>
    </div>`;
  }

  function renderEasterEggs(stats, plan) {
    return `<section class="plan-account-moments" aria-label="Your Pamet history">
      <div><strong>${stats.entries}</strong><span>journal ${stats.entries === 1 ? "entry" : "entries"}</span></div>
      <div><strong>${stats.loggedDays}</strong><span>distinct ${stats.loggedDays === 1 ? "day" : "days"} logged</span></div>
      <div><strong>${stats.profiles}</strong><span>${stats.profiles === 1 ? "health profile" : "health profiles"}</span></div>
      <div><strong>${esc(plan.positioning)}</strong><span>your Pamet chapter</span></div>
      ${stats.oldestEntry ? `<p>Your earliest journal entry in this profile is from <strong>${esc(formatDate(stats.oldestEntry))}</strong>.</p>` : `<p>Your first tracked entry will become part of your Pamet history here.</p>`}
    </section>`;
  }

  async function loadBillingStatus(root) {
    try {
      const response = await api("/api/billing/status", { headers: { Accept: "application/json" } });
      const subscription = response.user?.subscriptionStatus || "none";
      const label = subscription === "none" ? "No paid billing subscription on this account" : `Subscription status: ${subscription}`;
      const node = root.querySelector("[data-billing-state]");
      if (node) node.textContent = label;
    } catch (error) {
      const node = root.querySelector("[data-billing-state]");
      if (node) node.textContent = "Billing status could not be refreshed right now. Your verified in-app plan is shown above.";
    }
  }

  async function openBillingPortal(root, button) {
    button.disabled = true;
    status(root, "Opening your secure Stripe billing portal…", "info");
    try {
      const response = await api("/api/billing/portal", { method: "POST", body: "{}" });
      if (!response.url) throw new Error("Billing portal URL was not returned.");
      global.location.assign(response.url);
    } catch (error) {
      const message =
        error.status === 401
          ? "Your billing session could not be verified. Your Pamet account is still open here; sign out and back in before changing billing details."
          : error.message || "Billing management is temporarily unavailable.";
      status(root, message, "error");
      button.disabled = false;
    }
  }

  function open() {
    const key = currentPlanKey();
    if (key === "free") {
      global.PametPlanComparison?.open?.(key);
      return;
    }

    const plan = planByKey(key);
    const stats = accountStats();
    const included = planFeatures(key);
    const next = uniqueNextFeatures(key);
    const root = modalRoot();
    root.innerHTML = `<div class="pamet-modal-backdrop plan-management-backdrop">
      <section class="pamet-modal plan-management-modal" role="dialog" aria-modal="true" aria-labelledby="planManagementTitle">
        <header class="plan-management-head">
          <div>
            <span class="plan-management-kicker">YOUR PAMET ACCOUNT</span>
            <h2 id="planManagementTitle">Manage your plan</h2>
            <p>Review your account, what ${esc(plan.name)} includes, and billing options without leaving Pamet until you choose to.</p>
          </div>
          <button type="button" class="pamet-close" data-plan-management-close aria-label="Close">×</button>
        </header>

        <section class="plan-management-current">
          <div>
            <span>Current plan</span>
            <h3>${esc(plan.name)} · ${esc(plan.positioning)}</h3>
            <p>${esc(plan.summary)}</p>
          </div>
          <div class="plan-management-price"><strong>${esc(plan.monthly)}/mo</strong><span>${esc(plan.annual)}/yr</span></div>
        </section>

        ${renderAccountFacts(stats)}
        ${renderEasterEggs(stats, plan)}

        <section class="plan-management-features">
          <div class="plan-management-section-head">
            <div><span>Included now</span><h3>${esc(plan.name)} features</h3></div>
            <strong>${included.length} listed features</strong>
          </div>
          <ul>${renderIncluded(included)}</ul>
        </section>

        ${
          next.length
            ? `<section class="plan-management-next"><span>What Ultra adds</span><p>${next
                .slice(0, 4)
                .map((feature) => esc(feature.label))
                .join(" · ")}</p></section>`
            : `<section class="plan-management-next complete"><span>Ultra plan</span><p>Your plan includes every feature currently listed in Pamet’s canonical plan catalog.</p></section>`
        }

        <div data-plan-management-status class="plan-management-status info" hidden role="status" aria-live="polite"></div>
        <p class="plan-management-billing-state" data-billing-state>Refreshing billing status…</p>
        <div class="plan-management-actions">
          <button type="button" class="btn btn-ghost" data-plan-management-compare>Compare all Pamet features</button>
          <button type="button" class="btn btn-primary" data-plan-management-billing>Open Stripe billing portal</button>
        </div>
        <p class="plan-management-footnote">Plan access is verified by Pamet’s server-side entitlements. Stripe is only opened when you explicitly choose billing management.</p>
      </section>
    </div>`;

    root.querySelectorAll("[data-plan-management-close]").forEach((button) => button.addEventListener("click", close));
    root.querySelector(".plan-management-backdrop")?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget) close();
    });
    root.querySelector("[data-plan-management-compare]")?.addEventListener("click", () => {
      close();
      global.PametPlanComparison?.open?.(key);
    });
    const billing = root.querySelector("[data-plan-management-billing]");
    billing?.addEventListener("click", () => openBillingPortal(root, billing));
    loadBillingStatus(root);
  }

  document.addEventListener(
    "click",
    (event) => {
      const button = event.target.closest?.("#upgradeBtn");
      if (!button || currentPlanKey() === "free") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      open();
    },
    true
  );

  global.PametPlanManagement = Object.freeze({ open, close, accountStats, planFeatures });
})(window);
