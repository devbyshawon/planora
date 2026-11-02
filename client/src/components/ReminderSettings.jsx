import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { api } from "../api.js";
export default function ReminderSettings({ user, onUserUpdated }) {
  const supported =
    typeof Notification !== "undefined" && window.isSecureContext;
  const [permission, setPermission] = useState(
      supported ? Notification.permission : "unsupported",
    ),
    [enabled, setEnabled] = useState(
      Boolean(user.preferences.remindersEnabled),
    ),
    [lead, setLead] = useState(user.preferences.reminderMinutes),
    [allowed, setAllowed] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    api("/public/settings")
      .then((data) => {
        if (active) setAllowed(data.browserRemindersAllowed);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  async function allow() {
    setError("");
    setNotice("");
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      window.dispatchEvent(new Event("planora-notification-permission"));
      if (result !== "granted")
        setNotice(
          "Notifications were not allowed. You can change this in your browser site settings.",
        );
    } catch {
      setError("This browser could not request notification permission.");
    }
  }
  function test() {
    setError("");
    setNotice("");
    try {
      const n = new Notification("Planora test reminder", {
        body: "Your browser can display Planora notifications.",
        tag: "planora-test",
      });
      n.onclick = () => n.close();
      setNotice(
        "Test notification requested. If it did not appear, check browser and operating-system notification settings.",
      );
    } catch {
      setError(
        "This browser cannot display page notifications. Use a supported desktop browser.",
      );
    }
  }
  async function save(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (enabled && permission !== "granted") {
      setError(
        "Allow notifications in this browser before enabling reminders.",
      );
      return;
    }
    setBusy(true);
    try {
      const data = await api("/account/settings", {
        method: "PATCH",
        body: { remindersEnabled: enabled, reminderMinutes: Number(lead) },
      });
      onUserUpdated(data.user);
      setNotice("Reminder preferences saved to your account.");
      window.dispatchEvent(new Event("planora-notification-permission"));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="reminder-settings">
      <h3>Browser reminders</h3>
      <p className="muted">
        Planora must stay open in at least one tab. A sleeping computer, closed
        browser, or restricted background tab can miss reminders. These are
        separate from Google Calendar alarms.
      </p>
      <div className="reminder-permission">
        <Bell size={19} />
        <span>
          Permission: <b>{permission}</b>
        </span>
      </div>
      {!allowed && (
        <div className="alert warning">
          Browser reminders are currently paused by an administrator. Your saved
          preference is retained.
        </div>
      )}
      <div className="reminder-actions">
        <button
          className="button"
          type="button"
          disabled={!supported || permission === "granted" || busy}
          onClick={allow}
        >
          Allow notifications
        </button>
        <button
          className="button"
          type="button"
          disabled={!supported || permission !== "granted" || busy}
          onClick={test}
        >
          Send test notification
        </button>
      </div>
      <form onSubmit={save}>
        <label className="setting">
          <input
            type="checkbox"
            checked={enabled}
            disabled={busy}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Enable browser reminders for my account
        </label>
        <label>
          Remind me before a task (minutes)
          <input
            aria-label="Browser reminder lead time"
            type="number"
            min={0}
            max={1440}
            required
            value={lead}
            onChange={(e) => setLead(e.target.value)}
          />
          <small className="muted">
            0 means at start time. This does not change the fixed Google sync
            reminder.
          </small>
        </label>
        <button className="button primary" disabled={busy}>
          Save reminder settings
        </button>
      </form>
      <small className="muted">
        Each browser/device can show one reminder per task start and lead time.
        Tabs in the same browser share a delivery claim. Missed alerts are only
        eligible for a two-minute catch-up window.
      </small>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="alert success" role="status">
          {notice}
        </div>
      )}
    </section>
  );
}
