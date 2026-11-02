import { api } from "./api.js";
const STORAGE_KEY = "planora-reminder-device";
export function reminderDevice(storage = localStorage, cryptoApi = crypto) {
  let id = storage.getItem(STORAGE_KEY);
  if (!id || !/^[a-zA-Z0-9_-]{16,100}$/.test(id)) {
    id = cryptoApi.randomUUID();
    storage.setItem(STORAGE_KEY, id);
  }
  return id;
}
export const dueReminders = (items, now) =>
  items
    .filter((item) => {
      const due = Date.parse(item.dueAt);
      return Number.isFinite(due) && due <= now && due >= now - 120000;
    })
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
export function startReminders({
  userId,
  onOpen,
  onSessionExpired,
  onStatus,
  request = api,
  surface = window,
}) {
  const NativeNotification = surface.Notification;
  if (!surface.isSecureContext || !NativeNotification) {
    onStatus(
      "Browser reminders need a supported browser and HTTPS or localhost.",
    );
    return () => {};
  }
  if (NativeNotification.permission !== "granted") {
    onStatus(
      "Allow notifications in Settings → Reminders to receive alerts here.",
    );
    return () => {};
  }
  let deviceId;
  try {
    deviceId = reminderDevice(surface.localStorage, surface.crypto);
  } catch {
    onStatus(
      "Browser storage must be available to prevent duplicate reminders.",
    );
    return () => {};
  }
  let alive = true,
    items = [],
    offset = 0,
    working = false,
    fetching = false,
    retryAfter = 0;
  const attempted = new Set(),
    notifications = new Set();
  const expired = (error) => {
    if ([401, 403].includes(error.status)) {
      onSessionExpired();
      return true;
    }
    return false;
  };
  async function poll() {
    if (!alive || fetching) return;
    fetching = true;
    try {
      const result = await request("/reminders/upcoming");
      if (!alive) return;
      offset = Date.parse(result.serverTime) - Date.now();
      items = result.enabled ? result.reminders : [];
      onStatus(
        result.enabled
          ? "Browser reminders are active while Planora stays open."
          : result.allowed
            ? "Reminders are turned off in your account settings."
            : "Browser reminders are paused by an administrator.",
      );
    } catch (error) {
      if (alive && !expired(error)) onStatus(error.message);
    } finally {
      fetching = false;
    }
  }
  async function tick() {
    if (
      !alive ||
      working ||
      Date.now() < retryAfter ||
      NativeNotification.permission !== "granted"
    )
      return;
    const item = dueReminders(items, Date.now() + offset).find(
      (value) => !attempted.has(value.key),
    );
    if (!item) return;
    working = true;
    attempted.add(item.key);
    try {
      const result = await request("/reminders/claim", {
        method: "POST",
        body: { taskId: item.taskId, deviceId, key: item.key },
      });
      if (
        !alive ||
        !result.claimed ||
        NativeNotification.permission !== "granted"
      )
        return;
      const current = result.reminder;
      const notification = new NativeNotification("Planora reminder", {
        body: `${current.title}\n${current.date} · ${current.startTime} (${current.timeZone})`,
        tag: `planora-${userId}-${current.key}`,
      });
      notifications.add(notification);
      notification.onclick = () => {
        if (!alive) return;
        surface.focus();
        onOpen(current.taskId);
        notification.close();
        notifications.delete(notification);
      };
      notification.onclose = () => notifications.delete(notification);
    } catch (error) {
      if (!alive || expired(error)) return;
      if (error.status === 429 || !error.status || error.status >= 500) {
        attempted.delete(item.key);
        retryAfter = Date.now() + 15000;
      }
      if (
        error.code === "REMINDER_NOT_DUE" ||
        error.code === "STALE_REMINDER"
      ) {
        await poll();
      }
      onStatus(
        error.message ||
          "This browser could not display a notification. Use the test notification in Settings.",
      );
    } finally {
      working = false;
    }
  }
  const pollTimer = surface.setInterval(poll, 45000),
    tickTimer = surface.setInterval(tick, 1000);
  poll().then(tick);
  return () => {
    alive = false;
    surface.clearInterval(pollTimer);
    surface.clearInterval(tickTimer);
    notifications.forEach((n) => n.close());
    notifications.clear();
  };
}
