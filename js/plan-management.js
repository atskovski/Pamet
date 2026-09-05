/* Pamet plan management — account context, plan comparison, and upgrade/billing actions. */
(function (global) {
  "use strict";

  const Auth = global.PametAuth;
  const Store = global.PametStore;
  const catalog = global.PametPlanCatalog;
  if (!Auth || !Store || !catalog) return;

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const planByKey = (key) => catalog.plans.find((item) => item.key === key) || catalog.plans[0];
  const currentPlanKey = () => global.PametPlanComparison?.currentPlan?.() || "free";
  const upgradeKeys = (key) => (key === "free" ? ["pro", "ultra"] : key === "pro" ? ["ultra"] : []);

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
  function addedFeatures(fromKey, targetKey) {
    return catalog.features.filter((feature) => feature[targetKey] && !feature[fromKey]);
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
    const baseHeaders = { "Content-Type": "application/json", ...(options.headers || {}) };
    let response = await fetch(path, { credentials: "same-origin", cache: "no-store", ...options, headers: baseHeaders });
    const credential = Auth.getBackendCredential?.();
    if (response.status === 401 && credential?.deviceKey && !baseHeaders.Authorization) {
      response = await fetch(path, {
        credentials: "same-origin",
        cache: "no-store",
        ...options,
        headers: { ...baseHeaders, Authorization: `Bearer ${credential.deviceKey}` }
      });
    }
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
    const earliest = stats.oldestEntry
      ? `<p>Your earliest journal entry in this profile is from <strong>${esc(formatDate(stats.oldestEntry))}</strong>.</p>`
      : `<p>Your first tracked entry will become part of your Pamet history here.</p>`;
    return `<section class="plan-account-moments" aria-label="Your Pamet history">
      <div><strong>${stats.entries}</strong><span>journal ${stats.entries === 1 ? "entry" : "entries"}</span></div>
      <div><strong>${stats.loggedDays}</strong><span>distinct ${stats.loggedDays === 1 ? "day" : "days"} logged</span></div>
      <div><strong>${stats.profiles}</strong><span>${stats.profiles === 1 ? "health profile" : "health profiles"}</span></div>
      <div><strong>${esc(plan.positioning)}</strong><span>your Pamet chapter</span></div>
      ${earliest}
    </section>`;
  }

  function featureSection(key, options = {}) {
    const item = planByKey(key);
    const included = planFeatures(key);
    const current = options.current === true;
    const action = options.action === true;
    const preferred = options.preferred === true;
    return `<section class="plan-management-features plan-management-plan-detail${action ? " plan-management-upgrade-card" : ""}${current ? " current" : ""}${preferred ? " preferred" : ""}" data-plan-detail="${esc(key)}">
      <div class="plan-management-section-head">
        <div>
          <span>${current ? "Included now" : "Upgrade option"}</span>
          <h3>${esc(item.name)} · ${esc(item.positioning)}</h3>
        </div>
        <div class="plan-management-plan-meta">
          <strong>${esc(item.monthly)}${key === "free" ? "" : "/mo"}</strong>
          ${key === "free" ? "" : `<small>${esc(item.annual)}/yr</small>`}
        </div>
      </div>
      <p class="plan-management-plan-summary">${esc(item.summary)}</p>
      <ul>${renderIncluded(included)}</ul>
      ${
        action
          ? `<button type="button" class="btn btn-primary plan-management-plan-action" data-upgrade-target="${esc(key)}">${esc(options.actionLabel || `Upgrade to ${item.name}`)}</button>`
          : ""
      }
    </section>`;
  }

  async function loadBillingStatus(root) {
    try {
      const response = await api("/api/billing/status", { headers: { Accept: "application/json" } });
      const subscription = response.user?.subscriptionStatus || "none";
      const node = root.querySelector("[data-billing-state]");
      if (node) {
        node.textContent = subscription === "none" ? "No paid subscription is active on this account." : `Subscription status: ${subscription}`;
      }
    } catch {
      const node = root.querySelector("[data-billing-state]");
      if (node) node.textContent = "Billing status could not be refreshed right now. Your verified in-app plan is shown above.";
    }
  }

  async function openBilling(root, button, message = "Opening secure billing…") {
    button.disabled = true;
    status(root, message, "info");
    try {
      const response = await api("/api/billing/portal", { method: "POST", body: "{}" });
      if (!response.url) throw new Error("Billing management could not be opened.");
      global.location.assign(response.url);
    } catch (error) {
      status(
        root,
        error.status === 401
          ? "Your billing session could not be verified. Sign out and back in before changing billing details."
          : error.message || "Billing management is temporarily unavailable.",
        "error"
      );
      button.disabled = false;
    }
  }

  async function ensureStripe(config) {
    if (!config.publishableKey) throw new Error("Secure checkout is not configured yet.");
    if (global.Stripe) return global.Stripe;
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://js.stripe.com/v3/";
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
    return global.Stripe;
  }

  async function checkoutFreeToPlan(root, targetKey, interval, trigger) {
    const target = planByKey(targetKey);
    trigger.disabled = true;
    status(root, `Preparing secure ${target.name} checkout…`, "info");
    try {
      const config = await api("/api/billing/config", { headers: { Accept: "application/json" } });
      const enabledKey = `${targetKey}Enabled`;
      if (!config[enabledKey]) throw new Error(`${target.name} checkout is temporarily unavailable.`);
      const StripeCtor = await ensureStripe(config);
      const attempt = global.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const out = await api("/api/billing/create-subscription", {
        method: "POST",
        body: JSON.stringify({ plan: targetKey, interval, checkoutAttemptId: attempt })
      });
      root.querySelector(".plan-management-modal").innerHTML = `<header class="plan-management-head plan-management-head-with-back">
        <button type="button" class="plan-flow-back" data-plan-management-checkout-back aria-label="Back to plan choices">←</button>
        <div>
          <span class="plan-management-kicker">UPGRADE TO ${esc(target.name.toUpperCase())}</span>
          <h2>Secure checkout</h2>
          <p>Payment fields are provided by Stripe. Pamet does not store your card number.</p>
        </div>
        <button type="button" class="pamet-close" data-plan-management-close aria-label="Close">×</button>
      </header>
      <section class="plan-management-checkout-summary">
        <strong>${esc(target.name)} · ${esc(target.positioning)}</strong>
        <span>${esc(target.monthly)}/mo · ${esc(target.annual)}/yr</span>
      </section>
      <div id="planPaymentElement" class="pamet-payment-box"></div>
      <div data-plan-management-status class="plan-management-status info" role="status" aria-live="polite"></div>
      <div class="plan-management-checkout-actions">
        <button type="button" class="btn btn-primary btn-block" id="planConfirmPayment">Confirm ${esc(target.name)}</button>
      </div>`;
      root.querySelector("[data-plan-management-close]")?.addEventListener("click", close);
      root.querySelector("[data-plan-management-checkout-back]")?.addEventListener("click", () => openUpgrade(targetKey));
      const stripe = StripeCtor(config.publishableKey);
      const elements = stripe.elements({
        clientSecret: out.clientSecret,
        appearance: {
          theme: "stripe",
          variables: { colorPrimary: "#4CAF7A", colorText: "#263638", colorDanger: "#8E3B4F", borderRadius: "10px" }
        }
      });
      const payment = elements.create("payment");
      payment.mount("#planPaymentElement");
      root.querySelector("#planConfirmPayment").addEventListener("click", async () => {
        const button = root.querySelector("#planConfirmPayment");
        button.disabled = true;
        button.textContent = "Confirming…";
        const confirmParams = { return_url: `${location.origin}${location.pathname}?billing=complete` };
        const result =
          out.intentType === "setup"
            ? await stripe.confirmSetup({ elements, confirmParams, redirect: "if_required" })
            : await stripe.confirmPayment({ elements, confirmParams, redirect: "if_required" });
        if (result.error) {
          status(root, result.error.message || "Payment could not be confirmed.", "error");
          button.disabled = false;
          button.textContent = `Confirm ${target.name}`;
          return;
        }
        await api("/api/billing/sync", { method: "POST", body: "{}" });
        await global.PametEntitlements?.refresh?.();
        close();
        global.PametPlanComparison?.refreshSettings?.();
      });
    } catch (error) {
      status(root, error.message || "Upgrade could not be started.", "error");
      trigger.disabled = false;
    }
  }

  function openUpgrade(preferredKey = null) {
    const root = modalRoot();
    const from = currentPlanKey();
    const targets = upgradeKeys(from);
    if (!targets.length) {
      open();
      return;
    }
    const title = from === "free" ? "Upgrade to Pro or Ultra" : "Upgrade to Ultra";
    const intro =
      from === "free"
        ? "Compare both paid plans, choose monthly or annual billing, then continue with the plan that fits you."
        : "Compare what Pro includes now with everything Ultra adds before continuing to secure billing.";
    const billingInterval =
      from === "free"
        ? `<div class="pamet-billing-toggle plan-management-billing-toggle" aria-label="Billing interval">
            <button class="active" data-upgrade-interval="annual">Annual · Best value</button>
            <button data-upgrade-interval="monthly">Monthly</button>
          </div>`
        : "";
    const targetSections = targets
      .map((key) =>
        featureSection(key, {
          action: true,
          preferred: preferredKey === key,
          actionLabel: from === "pro" ? "Continue to Ultra" : `Upgrade to ${planByKey(key).name}`
        })
      )
      .join("");
    root.innerHTML = `<div class="pamet-modal-backdrop plan-management-backdrop">
      <section class="pamet-modal plan-management-modal plan-management-upgrade-modal" role="dialog" aria-modal="true" aria-labelledby="planUpgradeTitle">
        <header class="plan-management-head plan-management-head-with-back">
          <button type="button" class="plan-flow-back" data-plan-management-back aria-label="Back to Manage your plan">←</button>
          <div>
            <span class="plan-management-kicker">UPGRADE YOUR PLAN</span>
            <h2 id="planUpgradeTitle">${title}</h2>
            <p>${intro}</p>
          </div>
          <button type="button" class="pamet-close" data-plan-management-close aria-label="Close">×</button>
        </header>
        <div class="plan-management-upgrade-body">
          ${featureSection(from, { current: true })}
          ${billingInterval}
          <div class="plan-management-upgrade-grid">${targetSections}</div>
        </div>
        <div data-plan-management-status class="plan-management-status info" hidden role="status" aria-live="polite"></div>
        <p class="plan-management-footnote">${
          from === "free"
            ? "Choose either Pro or Ultra. You can review plan details here before secure checkout."
            : "Your existing Pro subscription is changed through secure billing only after you choose Upgrade to Ultra."
        }</p>
      </section>
    </div>`;
    root.querySelector("[data-plan-management-close]")?.addEventListener("click", close);
    root.querySelector("[data-plan-management-back]")?.addEventListener("click", open);
    let interval = "annual";
    root.querySelectorAll("[data-upgrade-interval]").forEach((button) =>
      button.addEventListener("click", () => {
        interval = button.dataset.upgradeInterval;
        root.querySelectorAll("[data-upgrade-interval]").forEach((item) => item.classList.toggle("active", item === button));
      })
    );
    root.querySelectorAll("[data-upgrade-target]").forEach((button) =>
      button.addEventListener("click", () => {
        const targetKey = button.dataset.upgradeTarget;
        if (from === "free") checkoutFreeToPlan(root, targetKey, interval, button);
        else openBilling(root, button, "Opening secure Ultra upgrade…");
      })
    );
    if (preferredKey) {
      requestAnimationFrame(() => root.querySelector(`[data-plan-detail="${preferredKey}"]`)?.scrollIntoView({ block: "nearest" }));
    }
  }

  function upgradeSummary(key) {
    if (key === "free") {
      const pro = addedFeatures("free", "pro")
        .slice(0, 4)
        .map((feature) => esc(feature.label))
        .join(" · ");
      const ultra = addedFeatures("free", "ultra")
        .filter((feature) => !feature.pro)
        .slice(0, 4)
        .map((feature) => esc(feature.label))
        .join(" · ");
      return `<section class="plan-management-next">
        <span>Upgrade options</span>
        <p><strong>Pro:</strong> ${pro}</p>
        <p><strong>Ultra:</strong> ${ultra}</p>
      </section>`;
    }
    if (key === "pro") {
      const ultra = addedFeatures("pro", "ultra");
      return `<section class="plan-management-next">
        <span>What Ultra adds</span>
        <p>${ultra.map((feature) => esc(feature.label)).join(" · ")}</p>
      </section>`;
    }
    return `<section class="plan-management-next complete">
      <span>Ultra plan</span>
      <p>Your plan includes every feature currently listed for Pamet.</p>
    </section>`;
  }

  function open() {
    const key = currentPlanKey();
    const plan = planByKey(key);
    const stats = accountStats();
    const included = planFeatures(key);
    const root = modalRoot();
    const billingState = key === "free" ? "" : '<p class="plan-management-billing-state" data-billing-state>Refreshing billing status…</p>';
    const primaryAction =
      key === "free"
        ? '<button type="button" class="btn btn-primary" data-plan-management-upgrade>Upgrade to Pro or Ultra</button>'
        : key === "pro"
          ? '<button type="button" class="btn btn-primary" data-plan-management-upgrade>Upgrade to Ultra</button>'
          : '<button type="button" class="btn btn-primary" data-plan-management-billing>Manage billing</button>';
    const secondaryBilling =
      key === "pro" ? '<button type="button" class="data-btn plan-management-secondary-billing" data-plan-management-billing>Billing & invoices</button>' : "";
    root.innerHTML = `<div class="pamet-modal-backdrop plan-management-backdrop">
      <section class="pamet-modal plan-management-modal" role="dialog" aria-modal="true" aria-labelledby="planManagementTitle">
        <header class="plan-management-head plan-management-head-with-back">
          <button type="button" class="plan-flow-back" data-plan-management-back-settings aria-label="Back to Settings">←</button>
          <div>
            <span class="plan-management-kicker">YOUR PAMET ACCOUNT</span>
            <h2 id="planManagementTitle">Manage your plan</h2>
            <p>Review your account, compare plan features, and choose an upgrade when you are ready.</p>
          </div>
          <button type="button" class="pamet-close" data-plan-management-close aria-label="Close">×</button>
        </header>
        <section class="plan-management-current">
          <div>
            <span>Current plan</span>
            <h3>${esc(plan.name)} · ${esc(plan.positioning)}</h3>
            <p>${esc(plan.summary)}</p>
          </div>
          <div class="plan-management-price">
            <strong>${esc(plan.monthly)}${key === "free" ? "" : "/mo"}</strong>
            ${key === "free" ? "" : `<span>${esc(plan.annual)}/yr</span>`}
          </div>
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
        ${upgradeSummary(key)}
        <div data-plan-management-status class="plan-management-status info" hidden role="status" aria-live="polite"></div>
        ${billingState}
        <div class="plan-management-actions">
          <button type="button" class="btn btn-ghost" data-plan-management-compare>Compare all Pamet features</button>
          ${primaryAction}
        </div>
        ${secondaryBilling}
        <p class="plan-management-footnote">Review plans in Pamet first. Secure billing opens only after you choose a purchase or billing action.</p>
      </section>
    </div>`;
    root.querySelectorAll("[data-plan-management-close]").forEach((button) => button.addEventListener("click", close));
    root.querySelector("[data-plan-management-back-settings]")?.addEventListener("click", close);
    root.querySelector(".plan-management-backdrop")?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget) close();
    });
    root.querySelector("[data-plan-management-compare]")?.addEventListener("click", () => {
      close();
      global.PametPlanComparison?.open?.(key);
    });
    root.querySelector("[data-plan-management-upgrade]")?.addEventListener("click", () => openUpgrade());
    root.querySelectorAll("[data-plan-management-billing]").forEach((button) => button.addEventListener("click", () => openBilling(root, button)));
    if (key !== "free") loadBillingStatus(root);
  }

  document.addEventListener(
    "click",
    (event) => {
      const button = event.target.closest?.("#upgradeBtn");
      if (!button) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      open();
    },
    true
  );

  global.PametPlanManagement = Object.freeze({ open, close, accountStats, planFeatures, openUpgrade });
})(window);
