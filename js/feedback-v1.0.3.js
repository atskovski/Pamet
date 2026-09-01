/* Pamet v1.0.3 — privacy-minimal product feedback */
(function () {
  "use strict";

  const A = window.PametAuth;
  const form = document.querySelector("#feedbackForm");
  const open = document.querySelector("#openFeedback");
  const cancel = document.querySelector("#cancelFeedback");
  const status = document.querySelector("#feedbackStatus");
  if (!A || !form || !open || !cancel || !status) return;

  function setStatus(message, isError) {
    status.textContent = message;
    status.hidden = !message;
    status.classList.toggle("error", !!isError);
  }

  function setOpen(value) {
    form.hidden = !value;
    open.setAttribute("aria-expanded", String(value));
    if (value) document.querySelector("#feedbackMessage").focus();
    else setStatus("", false);
  }

  async function request(path, options) {
    const credential = A.getBackendCredential && A.getBackendCredential();
    if (!credential || !credential.deviceKey) throw new Error("Log in before sending feedback.");
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${credential.deviceKey}` };
    const response = await fetch(path, { ...options, headers });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "Pamet could not save your feedback.");
    return body;
  }

  open.setAttribute("aria-controls", "feedbackForm");
  open.setAttribute("aria-expanded", "false");
  open.addEventListener("click", () => setOpen(form.hidden));
  cancel.addEventListener("click", () => {
    form.reset();
    setOpen(false);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    const rating = form.querySelector('input[name="feedbackRating"]:checked');
    const payload = {
      category: document.querySelector("#feedbackCategory").value,
      rating: rating ? Number(rating.value) : null,
      message: document.querySelector("#feedbackMessage").value.trim(),
      appVersion: "1.0.3",
      screen: "settings"
    };

    submit.disabled = true;
    setStatus("Sending…", false);
    try {
      const credential = A.getBackendCredential();
      await fetch("/api/account/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${credential.deviceKey}` },
        body: JSON.stringify({ ...credential, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" })
      });
      await request("/api/feedback", { method: "POST", body: JSON.stringify(payload) });
      form.reset();
      setStatus("Thanks — your feedback was saved without account or health details.", false);
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      submit.disabled = false;
    }
  });

  // Email features stay out of the interface until the deployment enables them.
  fetch("/api/billing/config")
    .then((response) => response.ok ? response.json() : null)
    .then((config) => {
      if (!config || config.emailEnabled) return;
      const digest = document.querySelector("#setWeeklyDigest");
      const row = digest && digest.closest(".setting-row");
      if (digest) digest.checked = false;
      if (row) row.classList.add("pamet-removed-setting");
    })
    .catch(() => { /* The local-first journal does not depend on backend config. */ });
})();
