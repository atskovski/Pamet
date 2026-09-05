/* Lightweight loader keeps account-management and checkout UI off the authenticated critical bundle. */
(function (global) {
  "use strict";

  if (global.PametPlanManagementLoader) return;
  let pending = null;

  function load() {
    if (global.PametPlanManagement) return Promise.resolve(global.PametPlanManagement);
    if (pending) return pending;

    pending = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/dist/pamet.plan-management.min.js";
      script.async = true;
      script.addEventListener(
        "load",
        () => (global.PametPlanManagement ? resolve(global.PametPlanManagement) : reject(new Error("Plan management did not initialize."))),
        { once: true }
      );
      script.addEventListener("error", () => reject(new Error("Plan management could not be loaded.")), { once: true });
      document.head.appendChild(script);
    }).catch((error) => {
      pending = null;
      throw error;
    });

    return pending;
  }

  function open() {
    return load().then((management) => management.open());
  }

  document.addEventListener(
    "click",
    (event) => {
      const button = event.target.closest?.("#upgradeBtn");
      if (!button) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      open().catch(() => {});
    },
    true
  );

  global.PametPlanManagementLoader = Object.freeze({ load, open });
})(window);
