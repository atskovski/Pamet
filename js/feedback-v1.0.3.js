/* Pamet v1.2.0 — privacy-minimal product feedback */
(function () {
  "use strict";

  const A = window.PametAuth;
  const form = document.querySelector("#feedbackForm");
  const open = document.querySelector("#openFeedback");
  const cancel = document.querySelector("#cancelFeedback");
  const status = document.querySelector("#feedbackStatus");
  if (!A || !form || !open || !cancel || !status) return;
  let statusTimer;

  status.setAttribute("aria-live", "polite");

  function setStatus(message, isError, autoHideMs = 0) {
    clearTimeout(statusTimer);
    status.textContent = message;
    status.hidden = !message;
    status.classList.toggle("error", !!isError);
    status.classList.toggle("feedback-success", !!message && !isError && message.startsWith("Thanks"));
    if (message && autoHideMs > 0) statusTimer = setTimeout(() => setStatus("", false), autoHideMs);
  }

  function setOpen(value) {
    form.hidden = !value;
    open.setAttribute("aria-expanded", String(value));
    if (value) {
      setStatus("", false);
      document.querySelector("#feedbackMessage").focus();
    }
  }

  async function request(path, options) {
    const response = await fetch(path, { credentials: "same-origin", ...options, headers: { "Content-Type": "application/json", ...(options?.headers || {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "Pamet could not save your feedback.");
    return body;
  }

  open.setAttribute("aria-controls", "feedbackForm");
  open.setAttribute("aria-expanded", "false");
  open.addEventListener("click", () => setOpen(form.hidden));
  cancel.addEventListener("click", () => {
    form.reset();
    setStatus("", false);
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
      appVersion: "1.2.0",
      screen: "settings"
    };

    submit.disabled = true;
    setStatus("Sending…", false);
    try {
      await request("/api/auth/session", { method: "GET" });
      await request("/api/feedback", { method: "POST", body: JSON.stringify(payload) });
      form.reset();
      form.hidden = true;
      open.setAttribute("aria-expanded", "false");
      open.textContent = "Share more feedback";
      setStatus("Thanks — your feedback was saved without account or health details.", false, 5000);
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      submit.disabled = false;
    }
  });

  // Email features stay out of the interface until the deployment enables them.
  fetch("/api/billing/config", { credentials: "same-origin" })
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
