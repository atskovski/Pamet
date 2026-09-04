/* Pamet plan comparison — renders the canonical Free / Pro / Ultra catalog. */
(function (global) {
  "use strict";

  const catalog = global.PametPlanCatalog;
  if (!catalog || !Array.isArray(catalog.plans) || !Array.isArray(catalog.features)) return;

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const plan = (key) => catalog.plans.find((item) => item.key === key) || catalog.plans[0];
  const currentPlan = () => plan(global.PametStore?.settings?.plan || global.PametStore?._settings?.plan || "free").key;
  let settingsGuard = false;
  let settingsObserver;

  function cardMarkup(item, activePlan) {
    const active = item.key === activePlan;
    return `<article class="plan-card${active ? " active" : ""}" data-plan-card="${esc(item.key)}"><div class="plan-card-head"><div><h4>${esc(item.name)} · ${esc(item.positioning)}</h4><p class="plan-card-price">${esc(item.monthly)}${item.key === "free" ? "" : "/mo"}</p></div>${active ? '<span class="plan-current-badge">Current plan</span>' : ""}</div><p class="plan-card-summary">${esc(item.summary)}${item.key === "free" ? "" : ` · ${esc(item.annual)}/yr`}</p></article>`;
  }

  function matrixMarkup(activePlan) {
    const header = catalog.plans.map((item) => `<th scope="col" class="${item.key === activePlan ? "current-plan-column" : ""}">${esc(item.name)}<span class="plan-matrix-pricing">${esc(item.monthly)}${item.key === "free" ? "" : "/mo"} · ${esc(item.annual)}${item.key === "free" ? "" : "/yr"}</span></th>`).join("");
    const rows = catalog.features.map((feature) => `<tr><th scope="row">${esc(feature.label)}</th>${catalog.plans.map((item) => `<td class="${item.key === activePlan ? "current-plan-column" : ""}"><span class="${feature[item.key] ? "plan-matrix-yes" : "plan-matrix-no"}" aria-label="${feature[item.key] ? "Included" : "Not included"}">${feature[item.key] ? "✓" : "—"}</span></td>`).join("")}</tr>`).join("");
    return `<table class="plan-matrix-table"><thead><tr><th scope="col">Feature</th>${header}</tr></thead><tbody>${rows}</tbody></table>`;
  }

  function ensureDialog(activePlan) {
    let dialog = document.querySelector("#pametPlanMatrixDialog");
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.id = "pametPlanMatrixDialog";
      dialog.className = "plan-matrix-dialog";
      document.body.appendChild(dialog);
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) dialog.close();
      });
    }
    dialog.innerHTML = `<div class="plan-matrix-shell"><header class="plan-matrix-head"><div><h2>Compare all Pamet features</h2><p>Free tracks your history. Pro adds deeper interpretation and sharing. Ultra adds advanced preparation and multi-profile care tools.</p></div><button type="button" class="plan-matrix-close" data-plan-matrix-close aria-label="Close plan comparison">×</button></header><div class="plan-matrix-scroll">${matrixMarkup(activePlan)}</div><footer class="plan-matrix-foot">This display comes from Pamet’s canonical plan catalog. Paid access is enforced separately by the server and verified Stripe state.</footer></div>`;
    dialog.querySelector("[data-plan-matrix-close]")?.addEventListener("click", () => dialog.close());
    return dialog;
  }

  function open(activePlan = currentPlan()) {
    const dialog = ensureDialog(plan(activePlan).key);
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function observePlanContainer(container) {
    settingsObserver?.observe(container, { childList: true, subtree: true, characterData: true });
  }

  function render(container, activePlan = currentPlan()) {
    if (!container) return;
    const normalized = plan(activePlan).key;
    settingsGuard = true;
    // MutationObserver callbacks run after the current stack. A boolean guard alone
    // therefore cannot distinguish Pamet's own render from a later external render;
    // disconnect while writing so our own innerHTML cannot recursively starve the
    // browser event loop before DOMContentLoaded.
    settingsObserver?.disconnect();
    try {
      container.innerHTML = `${catalog.plans.map((item) => cardMarkup(item, normalized)).join("")}<div class="plan-full-compare"><button type="button" class="btn btn-primary" data-open-plan-matrix>See full feature comparison</button></div>`;
      container.querySelector("[data-open-plan-matrix]")?.addEventListener("click", () => open(normalized));
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
    if (line) {
      const item = plan(activePlan);
      line.textContent = `${item.name} · ${item.positioning}`;
    }
    const upgrade = document.querySelector("#upgradeBtn");
    if (upgrade) upgrade.textContent = activePlan === "free" ? "Compare Pamet plans" : "Manage your plan";
  }

  function observeSettings() {
    const container = document.querySelector("#planCompare");
    if (!container || settingsObserver) return;
    settingsObserver = new MutationObserver(() => {
      if (settingsGuard) return;
      queueMicrotask(refreshSettings);
    });
    observePlanContainer(container);
    refreshSettings();
  }

  function differentiatedFeatures(key) {
    return catalog.features.filter((feature) => feature[key] && (key === "pro" ? !feature.free : !feature.pro)).slice(0, 5);
  }

  function augmentBillingModal() {
    const root = document.querySelector("#pametModalRoot");
    const modal = root?.querySelector(".pamet-modal");
    if (!modal || modal.querySelector(".pamet-modal-title")?.textContent?.trim() !== "Compare Pamet plans") return;
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
      button.textContent = "See full Free, Pro & Ultra feature matrix";
      button.addEventListener("click", () => open(currentPlan()));
      const reassurance = modal.querySelector(".pamet-reassurance");
      if (reassurance) reassurance.before(button);
      else modal.appendChild(button);
    }
  }

  const modalObserver = new MutationObserver(() => augmentBillingModal());
  if (document.body) modalObserver.observe(document.body, { childList: true, subtree: true });
  else document.addEventListener("DOMContentLoaded", () => modalObserver.observe(document.body, { childList: true, subtree: true }), { once: true });

  document.addEventListener("DOMContentLoaded", observeSettings, { once: true });
  document.addEventListener("pamet:settings-rendered", () => queueMicrotask(() => { observeSettings(); refreshSettings(); }));
  document.querySelectorAll(".tab[data-tab]").forEach((tab) => tab.addEventListener("click", () => requestAnimationFrame(refreshSettings)));
  queueMicrotask(observeSettings);

  global.PametPlanComparison = Object.freeze({ catalog, render, open, plan, refreshSettings });
})(window);
