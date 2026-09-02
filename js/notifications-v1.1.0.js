/* Pamet v1.1.0 — consent-based local and closed-app Web Push notifications. */
(function () {
  "use strict";
  const S = window.PametStore;
  if (!S) return;
  let dailyTimer;

  function authHeaders() {
    const credential = window.PametAuth?.getBackendCredential?.();
    return credential?.deviceKey ? { "Content-Type": "application/json", Authorization: `Bearer ${credential.deviceKey}` } : null;
  }

  function applicationKey(value) {
    const padding = "=".repeat((4 - value.length % 4) % 4);
    const raw = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(raw, (char) => char.charCodeAt(0));
  }

  async function syncPush(enabled) {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    const headers = authHeaders(); if (!headers) return;
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!enabled) {
      if (subscription) {
        await fetch("/api/notifications/subscriptions", { method: "DELETE", headers, body: JSON.stringify({ endpoint: subscription.endpoint }) });
        await subscription.unsubscribe();
      }
      return;
    }
    const config = await fetch("/api/notifications/config").then((response) => response.json());
    if (!config.enabled || !config.publicKey) return;
    if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationKey(config.publicKey) });
    await fetch("/api/notifications/subscriptions", { method: "POST", headers, body: JSON.stringify({ subscription: subscription.toJSON(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", reminderHour: 20 }) });
  }

  function inApp(title, body) {
    let notice = document.querySelector("#pametNotification");
    if (!notice) {
      notice = document.createElement("aside");
      notice.id = "pametNotification";
      notice.className = "pamet-notification";
      notice.setAttribute("role", "status");
      document.body.appendChild(notice);
    }
    notice.innerHTML = `<strong>${title}</strong><span>${body}</span><button type="button" aria-label="Dismiss notification">×</button>`;
    notice.querySelector("button").onclick = () => notice.remove();
    setTimeout(() => notice.remove(), 12000);
  }

  async function notify(title, body) {
    inApp(title, body);
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    try {
      const registration = await navigator.serviceWorker?.ready;
      if (registration) await registration.showNotification(title, { body, icon: "/assets/icon-192.png", badge: "/assets/icon-192.png", tag: `pamet-${title}`, renotify: false });
      else new Notification(title, { body, icon: "/assets/icon-192.png" });
    } catch { /* The in-app notice remains the reliable fallback. */ }
  }

  function scheduleDaily() {
    clearTimeout(dailyTimer);
    if (!S.settings.dailyReminder) return;
    const now = new Date(), next = new Date();
    next.setHours(20, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    dailyTimer = setTimeout(() => {
      notify("Time for a quick Pamet check-in", "Take a moment to record how you felt today. Small entries build a clearer health history.");
      scheduleDaily();
    }, next - now);
  }

  async function permissionFor(toggle) {
    if (!toggle.checked || !("Notification" in window) || Notification.permission !== "default") return;
    const permission = await Notification.requestPermission();
    if (permission === "denied") inApp("Notifications remain in Pamet", "Your browser blocked system notifications. Pamet will still show notices while the app is open.");
  }

  function patternSignature() {
    return JSON.stringify((S.patterns ? S.patterns() : []).map((pattern) => pattern.title).sort());
  }

  function checkPatterns() {
    if (!S.settings.patternAlerts) return;
    const key = "pamet_pattern_signature_v105", before = localStorage.getItem(key) || "[]", after = patternSignature();
    localStorage.setItem(key, after);
    if (before !== "[]" && before !== after) notify("Pamet found a new observation", "Your recent entries may show a new pattern. Open Insights to review it. Pamet observes; it does not diagnose.");
  }

  window.addEventListener("load", () => {
    const daily = document.querySelector("#setDailyReminder"), patterns = document.querySelector("#setPatternAlerts");
    daily?.addEventListener("change", async () => { await permissionFor(daily); try { await syncPush(daily.checked); } catch { inApp("Notification setup needs attention", "Pamet will keep using in-app reminders until closed-app notifications are available."); } scheduleDaily(); });
    patterns?.addEventListener("change", async () => { await permissionFor(patterns); localStorage.setItem("pamet_pattern_signature_v105", patternSignature()); });
    scheduleDaily();
    if (!localStorage.getItem("pamet_pattern_signature_v105")) localStorage.setItem("pamet_pattern_signature_v105", patternSignature());
  });
  window.addEventListener("pamet:entry-saved", () => setTimeout(checkPatterns, 50));
})();
