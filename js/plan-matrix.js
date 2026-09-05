/* Deferred Pamet plan matrix — full Free / Pro / Ultra comparison off the critical feature bundle. */
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

  const GROUPS = [
    { key: "tracking", label: "Track and review", ids: ["logging", "calendar", "visitBrief"] },
    { key: "insights", label: "Understand patterns", ids: ["insights", "unlimitedHistory", "correlations", "whatChanged", "medicationTiming"] },
    { key: "sharing", label: "Share and coordinate", ids: ["sharing", "appointmentWorkspace", "multipleProfiles", "advancedVisitBrief", "encryptedSync"] },
    { key: "account", label: "Account and experience", ids: ["themeAccessibility", "accountSecurity", "push", "weeklyDigest", "noAds"] }
  ];

  function featureGroup(feature) {
    return GROUPS.find((group) => group.ids.includes(feature.id)) || { key: "other", label: "More Pamet features", ids: [] };
  }

  function groupedFeatures() {
    const order = [...GROUPS.map((group) => group.key), "other"];
    const groups = new Map(order.map((key) => [key, []]));
    catalog.features.forEach((feature) => groups.get(featureGroup(feature).key).push(feature));
    return order
      .map((key) => {
        const group = key === "other" ? { key, label: "More Pamet features" } : GROUPS.find((item) => item.key === key);
        return { ...group, features: groups.get(key) };
      })
      .filter((group) => group.features.length);
  }

  function planOverviewMarkup(activePlan) {
    return `<div class="plan-matrix-overview">${catalog.plans
      .map((item) => {
        const included = catalog.features.filter((feature) => feature[item.key]).length;
        return `<article class="plan-matrix-plan${item.key === activePlan ? " current" : ""}">
          <div class="plan-matrix-plan-title">
            <div><span>${esc(item.positioning)}</span><h3>${esc(item.name)}</h3></div>
            ${item.key === activePlan ? '<span class="plan-current-badge">Current plan</span>' : ""}
          </div>
          <p>${esc(item.summary)}</p>
          <strong>${esc(item.monthly)}${item.key === "free" ? "" : "/mo"}</strong>
          <small>${item.key === "free" ? "No subscription" : `${esc(item.annual)}/yr`} · ${included} listed features</small>
        </article>`;
      })
      .join("")}</div>`;
  }

  function matrixMarkup(activePlan) {
    const header = catalog.plans
      .map(
        (item) => `<th scope="col" class="${item.key === activePlan ? "current-plan-column" : ""}">
          ${esc(item.name)}
          <span class="plan-matrix-pricing">${esc(item.monthly)}${item.key === "free" ? "" : "/mo"}</span>
        </th>`
      )
      .join("");

    const rows = groupedFeatures()
      .map((group) => {
        const category = `<tr class="plan-matrix-group"><th scope="rowgroup" colspan="4">${esc(group.label)}</th></tr>`;
        const features = group.features
          .map(
            (feature) => `<tr data-plan-feature="${esc(feature.id)}">
              <th scope="row">${esc(feature.label)}</th>
              ${catalog.plans
                .map(
                  (item) => `<td class="${item.key === activePlan ? "current-plan-column" : ""}">
                    <span class="${feature[item.key] ? "plan-matrix-yes" : "plan-matrix-no"}" aria-label="${feature[item.key] ? "Included" : "Not included"}">${feature[item.key] ? "✓" : "—"}</span>
                  </td>`
                )
                .join("")}
            </tr>`
          )
          .join("");
        return category + features;
      })
      .join("");

    return `<div class="plan-matrix-legend"><span><strong>✓</strong> Included</span><span><strong>—</strong> Not included</span><span>${catalog.features.length} current catalog features</span></div>
      <table class="plan-matrix-table">
        <thead><tr><th scope="col">Feature</th>${header}</tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  function changeSummary(activePlan) {
    const nextKey = activePlan === "free" ? "pro" : activePlan === "pro" ? "ultra" : null;
    if (!nextKey) {
      return `<div class="plan-matrix-delta complete"><strong>Ultra includes the full current catalog</strong><span>Every feature currently listed in Pamet’s plan contract is included with Ultra.</span></div>`;
    }
    const extras = catalog.features.filter((feature) => feature[nextKey] && !feature[activePlan]);
    return `<div class="plan-matrix-delta"><strong>What ${esc(plan(nextKey).name)} adds</strong><span>${extras.length ? extras.map((feature) => esc(feature.label)).join(" · ") : "No additional catalog features."}</span></div>`;
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

    const active = plan(activePlan).key;
    dialog.innerHTML = `<div class="plan-matrix-shell">
      <header class="plan-matrix-head">
        <div>
          <span class="plan-matrix-kicker">PAMET PLAN CATALOG</span>
          <h2>Compare all Pamet features</h2>
          <p>See Free, Pro, and Ultra side by side. This list is generated from the same canonical plan catalog Pamet uses for product copy and entitlement checks.</p>
        </div>
        <button type="button" class="plan-matrix-close" data-plan-matrix-close aria-label="Close plan comparison">×</button>
      </header>
      <div class="plan-matrix-scroll">
        ${planOverviewMarkup(active)}
        ${changeSummary(active)}
        ${matrixMarkup(active)}
      </div>
      <footer class="plan-matrix-foot">
        <span><strong>Always current by design.</strong> Plan and feature changes must update Pamet’s canonical catalog; CI rejects generated-catalog drift.</span>
        ${active === "free" ? "" : '<button type="button" class="btn btn-primary" data-plan-matrix-manage>Manage your current plan</button>'}
      </footer>
    </div>`;

    dialog.querySelector("[data-plan-matrix-close]")?.addEventListener("click", () => dialog.close());
    dialog.querySelector("[data-plan-matrix-manage]")?.addEventListener("click", () => {
      dialog.close();
      if (global.PametPlanManagement) global.PametPlanManagement.open();
      else global.PametPlanManagementLoader?.open?.();
    });
    return dialog;
  }

  function open(activePlan = global.PametPlanComparison?.currentPlan?.() || "free") {
    const dialog = ensureDialog(plan(activePlan).key);
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  global.PametPlanMatrix = Object.freeze({ open });
})(window);
