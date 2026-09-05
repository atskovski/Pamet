/* Lightweight loader keeps account-management and checkout UI off the authenticated critical bundle. */
(function (global) {
  "use strict";

  if (global.PametPlanManagementLoader) return;
  let pending = null;

  async function releaseAsset(path) {
    try {
      const response = await fetch("/dist/asset-manifest.json", { cache: "no-store" });
      if (!response.ok) return path;
      const manifest = await response.json();
      const token = manifest.generatedAt || manifest.version || "current";
      return `${path}?release=${encodeURIComponent(token)}`;
    } catch {
      return path;
    }
  }

  function load() {
    if (global.PametPlanManagement) return Promise.resolve(global.PametPlanManagement);
    if (pending) return pending;

    pending = releaseAsset("/dist/pamet.plan-management.min.js")
      .then(
        (src) =>
          new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = src;
            script.async = true;
            script.addEventListener(
              "load",
              () => (global.PametPlanManagement ? resolve(global.PametPlanManagement) : reject(new Error("Plan management did not initialize."))),
              { once: true }
            );
            script.addEventListener("error", () => reject(new Error("Plan management could not be loaded.")), { once: true });
            document.head.appendChild(script);
          })
      )
      .catch((error) => {
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
