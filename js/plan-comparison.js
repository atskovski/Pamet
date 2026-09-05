/* Pamet plan comparison — lightweight settings cards with deferred full matrix. */
(function (global) {
  "use strict";

  const catalog = global.PametPlanCatalog;
  if (!catalog || !Array.isArray(catalog.plans) || !Array.isArray(catalog.features)) return;

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
  const plan = (key) => catalog.plans.find((item) => item.key === key) || catalog.plans[0];
  const currentPlan = () => {
    const entitlements = global.PametEntitlements?.snapshot?.();
    const key = entitlements?.verified === true
      ? entitlements.plan
      : (global.PametStore?.settings?.plan || global.PametStore?._settings?.plan || "free");
    return plan(key).key;
  };

  let settingsGuard = false;
  let settingsObserver;
  let modalRootObserver;
  let matrixPending = null;

  function cardMarkup(item, activePlan) {
    const active = item.key === activePlan;
    const included = catalog.features.filter((feature) => feature[item.key]).length;
    return `<article class="plan-card${active ? " active" : ""}" data-plan-card="${esc(item.key)}">
      <div class="plan-card-head">
        <div>
          <span class="plan-card-position">${esc(item.positioning)}</span>
          <h4>${esc(item.name)}</h4>
          <p class="plan-card-price">${esc(item.monthly)}${item.key === "free" ? "" : "/mo"}</p>
        </div>
        ${active ? '<span class="plan-current-badge">Current plan</span>' : ""}
      </div>
      <p class="plan-card-summary">${esc(item.summary)}</p>
      <span class="plan-card-count">${included} of ${catalog.features.length} listed features</span>
    </article>`;
  }

  function loadMatrix() {
    if (global.PametPlanMatrix) return Promise.resolve(global.PametPlanMatrix);
    if (matrixPending) return matrixPending;
    matrixPending = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/dist/pamet.plan-matrix.min.js";
      script.async = true;
      script.addEventListener("load", () => (global.PametPlanMatrix ? resolve(global.PametPlanMatrix) : reject(new Error("Plan matrix did not initialize."))), { once:true });
      script.addEventListener("error", () => reject(new Error("Plan comparison could not be loaded.")), { once:true });
      document.head.appendChild(script);
    }).catch((error) => { matrixPending = null; throw error; });
    return matrixPending;
  }

  function open(activePlan = currentPlan()) {
    const normalized = plan(activePlan).key;
    return loadMatrix().then((matrix) => matrix.open(normalized));
  }

  function observePlanContainer(container) { settingsObserver?.observe(container, { childList:true, subtree:true, characterData:true }); }

  function render(container, activePlan = currentPlan()) {
    if (!container) return;
    const normalized = plan(activePlan).key;
    settingsGuard = true;
    settingsObserver?.disconnect();
    try {
      container.innerHTML = `${catalog.plans.map((item) => cardMarkup(item, normalized)).join("")}<div class="plan-full-compare"><button type="button" class="btn btn-ghost" data-open-plan-matrix>Compare all plans</button></div>`;
      container.querySelector("[data-open-plan-matrix]")?.addEventListener("click", () => open(normalized).catch(() => {}));
    } finally {
      settingsGuard = false;
      if (settingsObserver) observePlanContainer(container);
    }
  }

  function refreshSettings() {
    const container = document.querySelector("#planCompare");
    if (!container) return;
    const activePlan = currentPlan();
    render(container, activePlan);
    const line = document.querySelector("#planLineText");
    if (line) { const item = plan(activePlan); line.textContent = `${item.name} · ${item.positioning}`; }
    const upgrade = document.querySelector("#upgradeBtn");
    if (upgrade) upgrade.textContent = activePlan === "free" ? "Upgrade to Pro" : activePlan === "pro" ? "Upgrade to Ultra" : "Manage your plan";
  }

  function observeSettings() {
    const container = document.querySelector("#planCompare");
    if (!container || settingsObserver) return;
    settingsObserver = new MutationObserver(() => { if (settingsGuard) return; queueMicrotask(refreshSettings); });
    observePlanContainer(container);
    refreshSettings();
  }

  function differentiatedFeatures(key) { return catalog.features.filter((feature) => feature[key] && (key === "pro" ? !feature.free : !feature.pro)).slice(0, 5); }

  function augmentBillingModal() {
    const root = document.querySelector("#pametModalRoot");
    const modal = root?.querySelector(".pamet-modal");
    if (!modal || modal.querySelector(".pamet-modal-title")?.textContent?.trim() !== "Compare Pamet plans") return;
    modal.classList.add("plan-upgrade-modal");
    modal.querySelectorAll("[data-plan]").forEach((button) => {
      const key = button.dataset.plan;
      const item = plan(key);
      const card = button.closest(".pamet-compare-card");
      if (!card || !["pro", "ultra"].includes(key)) return;
      const heading = card.querySelector("h3");
      const summary = card.querySelector("p");
      const price = card.querySelector(".price");
      const list = card.querySelector("ul");
      if (heading && heading.textContent !== `${item.name} · ${item.positioning}`) heading.textContent = `${item.name} · ${item.positioning}`;
      if (summary && summary.textContent !== item.summary) summary.textContent = item.summary;
      if (price && price.textContent !== `${item.monthly}/mo · ${item.annual}/yr`) price.textContent = `${item.monthly}/mo · ${item.annual}/yr`;
      const features = differentiatedFeatures(key).map((feature) => `<li>${esc(feature.label)}</li>`).join("");
      if (list && list.innerHTML !== features) list.innerHTML = features;
    });
    if (!modal.querySelector("[data-open-full-plan-matrix]")) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn btn-primary btn-block plan-modal-full-button";
      button.dataset.openFullPlanMatrix = "1";
      button.textContent = "Compare all plan features";
      button.addEventListener("click", () => open(currentPlan()).catch(() => {}));
      const reassurance = modal.querySelector(".pamet-reassurance");
      if (reassurance) reassurance.before(button); else modal.appendChild(button);
    }
  }

  function connectModalObserver() {
    const root = document.querySelector("#pametModalRoot");
    if (!root || root.dataset.pametPlanObserver === "1") return;
    root.dataset.pametPlanObserver = "1";
    modalRootObserver = new MutationObserver(() => augmentBillingModal());
    modalRootObserver.observe(root, { childList:true, subtree:true });
    augmentBillingModal();
  }
  function installModalObserver() {
    connectModalObserver();
    const bodyObserver = new MutationObserver(() => connectModalObserver());
    bodyObserver.observe(document.body, { childList:true });
  }

  document.addEventListener("DOMContentLoaded", observeSettings, { once:true });
  document.addEventListener("pamet:settings-rendered", () => queueMicrotask(() => { observeSettings(); refreshSettings(); }));
  global.addEventListener("pamet:entitlements", () => queueMicrotask(refreshSettings));
  document.querySelectorAll(".tab[data-tab]").forEach((tab) => tab.addEventListener("click", () => requestAnimationFrame(refreshSettings)));
  if (document.body) installModalObserver(); else document.addEventListener("DOMContentLoaded", installModalObserver, { once:true });
  queueMicrotask(observeSettings);

  global.PametPlanComparison = Object.freeze({ catalog, render, open, plan, refreshSettings, currentPlan });
})(window);
