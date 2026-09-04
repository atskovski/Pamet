/* Pamet plan comparison — renders the canonical Free / Pro / Ultra catalog. */
(function (global) {
  "use strict";

  const catalog = global.PametPlanCatalog;
  if (!catalog || !Array.isArray(catalog.plans) || !Array.isArray(catalog.features)) return;

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const plan = (key) => catalog.plans.find((item) => item.key === key) || catalog.plans[0];

  function cardMarkup(item, currentPlan) {
    const active = item.key === currentPlan;
    return `<article class="plan-card${active ? " active" : ""}" data-plan-card="${esc(item.key)}"><div class="plan-card-head"><div><h4>${esc(item.name)} · ${esc(item.positioning)}</h4><p class="plan-card-price">${esc(item.monthly)}${item.key === "free" ? "" : "/mo"}</p></div>${active ? '<span class="plan-current-badge">Current plan</span>' : ""}</div><p class="plan-card-summary">${esc(item.summary)}${item.key === "free" ? "" : ` · ${esc(item.annual)}/yr`}</p></article>`;
  }

  function matrixMarkup(currentPlan) {
    const header = catalog.plans.map((item) => `<th scope="col" class="${item.key === currentPlan ? "current-plan-column" : ""}">${esc(item.name)}<span class="plan-matrix-pricing">${esc(item.monthly)}${item.key === "free" ? "" : "/mo"} · ${esc(item.annual)}${item.key === "free" ? "" : "/yr"}</span></th>`).join("");
    const rows = catalog.features.map((feature) => `<tr><th scope="row">${esc(feature.label)}</th>${catalog.plans.map((item) => `<td class="${item.key === currentPlan ? "current-plan-column" : ""}"><span class="${feature[item.key] ? "plan-matrix-yes" : "plan-matrix-no"}" aria-label="${feature[item.key] ? "Included" : "Not included"}">${feature[item.key] ? "✓" : "—"}</span></td>`).join("")}</tr>`).join("");
    return `<table class="plan-matrix-table"><thead><tr><th scope="col">Feature</th>${header}</tr></thead><tbody>${rows}</tbody></table>`;
  }

  function ensureDialog(currentPlan) {
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
    dialog.innerHTML = `<div class="plan-matrix-shell"><header class="plan-matrix-head"><div><h2>Compare all Pamet features</h2><p>Free tracks your history. Pro adds deeper interpretation and sharing. Ultra adds advanced preparation and multi-profile care tools.</p></div><button type="button" class="plan-matrix-close" data-plan-matrix-close aria-label="Close plan comparison">×</button></header><div class="plan-matrix-scroll">${matrixMarkup(currentPlan)}</div><footer class="plan-matrix-foot">Plan availability shown here comes from Pamet’s canonical plan catalog. Paid access is still enforced by the server and verified billing state.</footer></div>`;
    dialog.querySelector("[data-plan-matrix-close]")?.addEventListener("click", () => dialog.close());
    return dialog;
  }

  function open(currentPlan) {
    const dialog = ensureDialog(currentPlan);
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function render(container, currentPlan = "free") {
    if (!container) return;
    const normalized = plan(currentPlan).key;
    container.innerHTML = `${catalog.plans.map((item) => cardMarkup(item, normalized)).join("")}<div class="plan-full-compare"><button type="button" class="btn btn-primary" data-open-plan-matrix>See full feature comparison</button></div>`;
    container.querySelector("[data-open-plan-matrix]")?.addEventListener("click", () => open(normalized));
  }

  global.PametPlanComparison = Object.freeze({ catalog, render, open, plan });
})(window);
