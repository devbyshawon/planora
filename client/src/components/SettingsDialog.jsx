import { useEffect, useRef, useState } from "react";
import {
  X,
  UserRound,
  LockKeyhole,
  SlidersHorizontal,
  Tags,
  Bell,
  Pencil,
  Trash2,
} from "lucide-react";
import { api } from "../api.js";
import ReminderSettings from "./ReminderSettings.jsx";
export default function SettingsDialog({ user, onUserUpdated, onClose }) {
  const dialog = useRef(null),
    [tab, setTab] = useState("profile"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [profile, setProfile] = useState({
    name: user.name,
    email: user.email,
    currentPassword: "",
  });
  const [preferences, setPreferences] = useState({
    ...user.preferences,
    timeZone: user.timeZone,
    confirmTimezoneChange: false,
  });
  const [category, setCategory] = useState({ name: "", color: "#4268d6" }),
    [editing, setEditing] = useState(null),
    [deleting, setDeleting] = useState(null);
  useEffect(() => {
    dialog.current.showModal();
  }, []);
  async function perform(action) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  function go(next) {
    setTab(next);
    if (next === "preferences")
      setPreferences({
        ...user.preferences,
        timeZone: user.timeZone,
        confirmTimezoneChange: false,
      });
    setError("");
    setNotice("");
    setDeleting(null);
  }
  async function saveProfile(event) {
    event.preventDefault();
    await perform(async () => {
      const data = await api("/account/profile", {
        method: "PATCH",
        body: profile,
      });
      onUserUpdated(data.user);
      setProfile({ ...profile, currentPassword: "" });
      setNotice("Profile updated.");
    });
  }
  async function savePassword(event) {
    event.preventDefault();
    const form = event.currentTarget,
      body = Object.fromEntries(new FormData(form));
    if (body.newPassword !== body.confirmPassword) {
      setError("The new passwords do not match.");
      return;
    }
    await perform(async () => {
      const data = await api("/auth/change-password", { method: "POST", body });
      onUserUpdated(data.user);
      form.reset();
      setNotice("Password updated. Your other sessions have been signed out.");
    });
  }
  async function savePreferences(event) {
    event.preventDefault();
    await perform(async () => {
      const data = await api("/account/settings", {
        method: "PATCH",
        body: preferences,
      });
      onUserUpdated(data.user);
      setPreferences({
        ...data.user.preferences,
        timeZone: data.user.timeZone,
        confirmTimezoneChange: false,
      });
      setNotice("Preferences saved to your account.");
    });
  }
  async function saveCategory(event) {
    event.preventDefault();
    await perform(async () => {
      const data = await api(
        editing ? `/account/categories/${editing}` : "/account/categories",
        { method: editing ? "PATCH" : "POST", body: category },
      );
      onUserUpdated({ ...user, categories: data.categories });
      setCategory({ name: "", color: "#4268d6" });
      setEditing(null);
      setNotice("Category saved.");
    });
  }
  async function deleteCategory(id) {
    await perform(async () => {
      const data = await api(`/account/categories/${id}`, { method: "DELETE" });
      onUserUpdated({ ...user, categories: data.categories });
      setDeleting(null);
      if (editing === id) {
        setEditing(null);
        setCategory({ name: "", color: "#4268d6" });
      }
      setNotice("Category deleted.");
    });
  }
  return (
    <dialog
      className="settings-dialog"
      ref={dialog}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header className="settings-header">
        <div>
          <span className="eyebrow">YOUR PERSONAL SPACE</span>
          <h2>Settings</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Close settings"
          disabled={busy}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      <nav className="settings-tabs" aria-label="Settings sections">
        {[
          ["profile", "Profile", UserRound],
          ["security", "Security", LockKeyhole],
          ["preferences", "Preferences", SlidersHorizontal],
          ["categories", "Categories", Tags],
          ["reminders", "Reminders", Bell],
        ].map(([id, label, Icon]) => (
          <button
            key={id}
            aria-pressed={tab === id}
            className={tab === id ? "active" : ""}
            disabled={busy}
            onClick={() => go(id)}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </nav>
      <div className="settings-content">
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
        {tab === "profile" && (
          <form onSubmit={saveProfile}>
            <h3>Your details</h3>
            <label>
              Your name
              <input
                required
                maxLength={80}
                value={profile.name}
                onChange={(e) =>
                  setProfile({ ...profile, name: e.target.value })
                }
              />
            </label>
            <label>
              Email address
              <input
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                value={profile.email}
                onChange={(e) =>
                  setProfile({ ...profile, email: e.target.value })
                }
              />
            </label>
            {profile.email.trim().toLowerCase() !== user.email && (
              <label>
                Current password to change email
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  maxLength={128}
                  value={profile.currentPassword}
                  onChange={(e) =>
                    setProfile({ ...profile, currentPassword: e.target.value })
                  }
                />
                <small className="muted">
                  Changing your email signs out other sessions; changing it
                  clears its verified status.
                </small>
              </label>
            )}
            <button className="button primary" disabled={busy}>
              Save profile
            </button>
          </form>
        )}
        {tab === "profile" && (
          <section className="verification-status">
            <b>
              {user.emailVerified ? "Email verified" : "Email not yet verified"}
            </b>
            {!user.emailVerified && (
              <>
                <p className="muted">
                  Verify your current email using a link sent to {user.email}.
                  Verification does not change your password or sign in another
                  account.
                </p>
                <button
                  className="button"
                  disabled={busy}
                  onClick={() =>
                    perform(async () => {
                      const data = await api("/auth/request-verification", {
                        method: "POST",
                        body: {},
                      });
                      setNotice(data.message);
                    })
                  }
                >
                  Send verification link
                </button>
              </>
            )}
          </section>
        )}
        {tab === "reminders" && (
          <ReminderSettings user={user} onUserUpdated={onUserUpdated} />
        )}
        {tab === "security" && (
          <form onSubmit={savePassword}>
            <h3>Change password</h3>
            <p className="muted">
              Your current session stays signed in. Other sessions and existing
              recovery links are revoked.
            </p>
            <label>
              Current password
              <input
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
                maxLength={128}
              />
            </label>
            <label>
              New password
              <input
                name="newPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={72}
              />
            </label>
            <label>
              Confirm new password
              <input
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={72}
              />
            </label>
            <button className="button primary" disabled={busy}>
              Update password
            </button>
          </form>
        )}
        {tab === "preferences" && (
          <form onSubmit={savePreferences}>
            <h3>Make it yours</h3>
            <div className="field-row">
              <label>
                Appearance
                <select
                  aria-label="Appearance"
                  value={preferences.theme}
                  onChange={(e) =>
                    setPreferences({ ...preferences, theme: e.target.value })
                  }
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>
              <label>
                Time format
                <select
                  aria-label="Time format"
                  value={preferences.timeFormat}
                  onChange={(e) =>
                    setPreferences({
                      ...preferences,
                      timeFormat: e.target.value,
                    })
                  }
                >
                  <option value="12h">12-hour</option>
                  <option value="24h">24-hour</option>
                </select>
              </label>
            </div>
            <div className="field-row">
              <label>
                First day of week
                <select
                  aria-label="First day of week"
                  value={preferences.weekStartsOn}
                  onChange={(e) =>
                    setPreferences({
                      ...preferences,
                      weekStartsOn: Number(e.target.value),
                    })
                  }
                >
                  <option value={1}>Monday</option>
                  <option value={0}>Sunday</option>
                </select>
              </label>
              <label>
                Default calendar view
                <select
                  aria-label="Default calendar view"
                  value={preferences.defaultView}
                  onChange={(e) =>
                    setPreferences({
                      ...preferences,
                      defaultView: e.target.value,
                    })
                  }
                >
                  <option value="day">Day</option>
                  <option value="week">Week</option>
                  <option value="month">Month</option>
                </select>
              </label>
            </div>
            <label className="setting">
              <input
                type="checkbox"
                checked={preferences.showHourGuides}
                onChange={(e) =>
                  setPreferences({
                    ...preferences,
                    showHourGuides: e.target.checked,
                  })
                }
              />
              Show slot boundaries
            </label>
            <label>
              Default reminder lead time (minutes)
              <input
                aria-label="Default reminder lead time"
                type="number"
                min={0}
                max={1440}
                required
                value={preferences.reminderMinutes}
                onChange={(e) =>
                  setPreferences({
                    ...preferences,
                    reminderMinutes: Number(e.target.value),
                  })
                }
              />
              <small className="muted">
                Used by browser reminders when enabled in the Reminders tab.
              </small>
            </label>
            <label>
              Planner timezone
              <input
                aria-label="Planner timezone"
                value={preferences.timeZone}
                required
                onChange={(e) =>
                  setPreferences({
                    ...preferences,
                    timeZone: e.target.value,
                    confirmTimezoneChange: false,
                  })
                }
              />
            </label>
            {preferences.timeZone !== user.timeZone && (
              <div className="alert warning">
                <p>
                  Every calendar task keeps its local date and clock time. Its
                  UTC time will be recalculated for the new timezone. Invalid
                  daylight-saving times block the change. This update requires
                  Atlas or a MongoDB replica set.
                </p>
                <label className="setting">
                  <input
                    type="checkbox"
                    required
                    checked={preferences.confirmTimezoneChange}
                    onChange={(e) =>
                      setPreferences({
                        ...preferences,
                        confirmTimezoneChange: e.target.checked,
                      })
                    }
                  />
                  Keep task dates and clock times in the new timezone
                </label>
              </div>
            )}
            <button className="button primary" disabled={busy}>
              Save preferences
            </button>
          </form>
        )}
        {tab === "categories" && (
          <>
            <h3>Your categories</h3>
            <p className="muted">
              Colours follow your tasks across the calendar and bucket list.
              Reassign tasks before deleting a category they use.
            </p>
            <div className="category-list">
              {user.categories.map((c) => (
                <div className="category-row" key={c.id}>
                  <i style={{ background: c.color }} />
                  <span>{c.name}</span>
                  <button
                    className="icon-button"
                    aria-label={`Edit ${c.name}`}
                    disabled={busy}
                    onClick={() => {
                      setEditing(c.id);
                      setCategory({ name: c.name, color: c.color });
                      setDeleting(null);
                      setError("");
                    }}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="icon-button danger"
                    aria-label={`Delete ${c.name}`}
                    disabled={busy}
                    onClick={() => {
                      setDeleting(c.id);
                      setError("");
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                  {deleting === c.id && (
                    <div className="category-confirm">
                      <span>Delete {c.name}?</span>
                      <button
                        className="text-button danger"
                        disabled={busy}
                        onClick={() => deleteCategory(c.id)}
                      >
                        Confirm delete
                      </button>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => setDeleting(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <form onSubmit={saveCategory}>
              <h3>{editing ? "Edit category" : "Add a category"}</h3>
              <div className="category-fields">
                <label>
                  Category name
                  <input
                    required
                    maxLength={40}
                    value={category.name}
                    onChange={(e) =>
                      setCategory({ ...category, name: e.target.value })
                    }
                  />
                </label>
                <label>
                  Colour
                  <input
                    type="color"
                    aria-label="Category colour"
                    value={category.color}
                    onChange={(e) =>
                      setCategory({ ...category, color: e.target.value })
                    }
                  />
                </label>
              </div>
              <div className="settings-actions">
                <button className="button primary" disabled={busy}>
                  {editing ? "Save category" : "Add category"}
                </button>
                {editing && (
                  <button
                    type="button"
                    className="button"
                    disabled={busy}
                    onClick={() => {
                      setEditing(null);
                      setCategory({ name: "", color: "#4268d6" });
                    }}
                  >
                    Cancel editing
                  </button>
                )}
              </div>
            </form>
          </>
        )}
      </div>
    </dialog>
  );
}
