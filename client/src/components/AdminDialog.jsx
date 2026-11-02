import { useEffect, useRef, useState } from "react";
import { X, LockKeyhole, ShieldCheck, Plus, Trash2 } from "lucide-react";
import { api } from "../api.js";
export default function AdminDialog({ user, onClose }) {
  const dialog = useRef(null),
    [unlocked, setUnlocked] = useState(false),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [password, setPassword] = useState(""),
    [tab, setTab] = useState("accounts"),
    [summary, setSummary] = useState(null),
    [results, setResults] = useState(null),
    [q, setQ] = useState(""),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState(""),
    [page, setPage] = useState(1),
    [auditPage, setAuditPage] = useState(1),
    [settings, setSettings] = useState(null),
    [confirm, setConfirm] = useState(null),
    [version, setVersion] = useState(0),
    [audit, setAudit] = useState(null);
  useEffect(() => {
    dialog.current.showModal();
    let active = true;
    api("/admin/access")
      .then((data) => {
        if (active) setUnlocked(data.unlocked);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!unlocked) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    Promise.all([
      api("/admin/summary", { signal: controller.signal }),
      api(
        `/admin/users?${new URLSearchParams({ q: query, status, page: String(page) })}`,
        { signal: controller.signal },
      ),
      api("/admin/defaults", { signal: controller.signal }),
      api(`/admin/audit?page=${auditPage}`, { signal: controller.signal }),
    ])
      .then(([s, r, d, a]) => {
        if (!controller.signal.aborted) {
          setSummary(s);
          setResults(r);
          setSettings(d.settings);
          setAudit(a);
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          if (err.code === "ADMIN_LOCKED") setUnlocked(false);
          setError(err.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [unlocked, query, status, page, auditPage, version]);
  async function perform(fn) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (err) {
      if (err.code === "ADMIN_LOCKED") setUnlocked(false);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  function unlock(event) {
    event.preventDefault();
    perform(async () => {
      await api("/admin/unlock", { method: "POST", body: { password } });
      setPassword("");
      setUnlocked(true);
    });
  }
  function lock() {
    perform(async () => {
      await api("/admin/lock", { method: "POST", body: {} });
      setUnlocked(false);
      setPassword("");
      setSummary(null);
      setResults(null);
      setSettings(null);
      setAudit(null);
    });
  }
  function changeStatus() {
    perform(async () => {
      await api(`/admin/users/${confirm.id}/status`, {
        method: "PATCH",
        body: {
          status: confirm.status === "active" ? "suspended" : "active",
          expectedUpdatedAt: confirm.updatedAt,
        },
      });
      setConfirm(null);
      setVersion((v) => v + 1);
      setNotice("Account status updated. Existing sessions were revoked.");
    });
  }
  function saveDefaults(event) {
    event.preventDefault();
    perform(async () => {
      const { revision, ...body } = settings;
      const data = await api("/admin/defaults", {
        method: "PATCH",
        body: { ...body, expectedRevision: revision },
      });
      setSettings(data.settings);
      setNotice(
        "Site settings saved. New-account defaults do not overwrite existing accounts.",
      );
      setVersion((v) => v + 1);
    });
  }
  return (
    <dialog
      className="planning-dialog admin-dialog"
      aria-labelledby="admin-title"
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header className="settings-header">
        <div>
          <span className="eyebrow">PROTECTED ADMINISTRATION</span>
          <h2 id="admin-title">Administration</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Close administration"
          disabled={busy}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      <div className="planning-form">
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
        {loading && !unlocked && (
          <p role="status">Checking administrator access…</p>
        )}
        {!unlocked && !loading && (
          <form onSubmit={unlock}>
            <LockKeyhole size={25} />
            <h3>Unlock administration</h3>
            <p className="muted">
              Enter your current password. Access unlocks for 15 minutes in this
              browser and ends when your account session is revoked.
            </p>
            <label>
              Administrator password
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                maxLength={128}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button className="button primary" disabled={busy}>
              Unlock administration
            </button>
          </form>
        )}
        {unlocked && (
          <>
            <div className="results-heading">
              <span>
                <ShieldCheck size={16} /> Administrator access
              </span>
              <button className="button" disabled={busy} onClick={lock}>
                Lock administration
              </button>
            </div>
            <nav className="settings-tabs" aria-label="Administration sections">
              {[
                ["accounts", "Accounts"],
                ["defaults", "Site settings"],
                ["audit", "Activity"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  aria-pressed={tab === value}
                  className={tab === value ? "active" : ""}
                  disabled={busy}
                  onClick={() => {
                    setTab(value);
                    setError("");
                    setNotice("");
                  }}
                >
                  {label}
                </button>
              ))}
            </nav>
            {summary && (
              <div className="progress-metrics">
                {[
                  ["Accounts", summary.total],
                  ["Active", summary.active],
                  ["Suspended", summary.suspended],
                  ["Email verified", summary.verified],
                ].map(([label, value]) => (
                  <div key={label}>
                    <b>{value}</b>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            )}
            {loading && <p role="status">Loading administration…</p>}
            {tab === "accounts" && (
              <>
                <form
                  className="admin-search"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setPage(1);
                    setQuery(q);
                  }}
                >
                  <label>
                    Find an account
                    <input
                      aria-label="Find an account"
                      value={q}
                      maxLength={100}
                      onChange={(e) => setQ(e.target.value)}
                    />
                  </label>
                  <button className="button" disabled={busy}>
                    Search
                  </button>
                  <label>
                    Status
                    <select
                      aria-label="Account status filter"
                      value={status}
                      onChange={(e) => {
                        setStatus(e.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="">All accounts</option>
                      <option value="active">Active</option>
                      <option value="suspended">Suspended</option>
                    </select>
                  </label>
                </form>
                <p className="muted">
                  Account administration does not expose personal tasks, notes,
                  passwords, recovery links, or Google tokens. Administrator
                  roles are assigned using the local setup command.
                </p>
                {results?.users.map((account) => (
                  <article className="admin-account" key={account.id}>
                    <div>
                      <b>{account.name}</b>
                      <span>{account.email}</span>
                      <small>
                        {account.role} · {account.status} ·{" "}
                        {account.verified
                          ? "Email verified"
                          : "Email unverified"}
                      </small>
                    </div>
                    {account.role !== "admin" && account.id !== user.id && (
                      <button
                        className="button"
                        disabled={busy || loading}
                        onClick={() => setConfirm(account)}
                      >
                        {account.status === "active" ? "Suspend" : "Reactivate"}
                      </button>
                    )}
                  </article>
                ))}
                {results && !results.users.length && (
                  <p>No matching accounts.</p>
                )}
                {results && (
                  <div className="admin-pagination">
                    <button
                      className="button"
                      disabled={busy || page <= 1}
                      onClick={() => setPage((v) => v - 1)}
                    >
                      Previous
                    </button>
                    <span>
                      Page {page} · {results.total} accounts
                    </span>
                    <button
                      className="button"
                      disabled={busy || page * 25 >= results.total}
                      onClick={() => setPage((v) => v + 1)}
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
            {tab === "defaults" && settings && (
              <form onSubmit={saveDefaults}>
                <h3>Site controls</h3>
                <label className="setting">
                  <input
                    type="checkbox"
                    checked={settings.registrationOpen}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        registrationOpen: e.target.checked,
                      })
                    }
                  />
                  Allow new account registration
                </label>
                <label className="setting">
                  <input
                    type="checkbox"
                    checked={settings.browserRemindersAllowed}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        browserRemindersAllowed: e.target.checked,
                      })
                    }
                  />
                  Allow browser reminders
                </label>
                <h3>Defaults for new accounts</h3>
                <p className="muted">
                  These defaults apply at registration. Existing accounts keep
                  their timezone, categories, and preferences. New users must
                  enable notifications themselves.
                </p>
                <label>
                  Default planner timezone
                  <input
                    aria-label="Default planner timezone"
                    required
                    value={settings.defaultTimeZone}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        defaultTimeZone: e.target.value,
                      })
                    }
                  />
                </label>
                <div className="field-row">
                  <label>
                    Default week start
                    <select
                      aria-label="Default week start"
                      value={settings.defaultPreferences.weekStartsOn}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          defaultPreferences: {
                            ...settings.defaultPreferences,
                            weekStartsOn: Number(e.target.value),
                          },
                        })
                      }
                    >
                      <option value={1}>Monday</option>
                      <option value={0}>Sunday</option>
                    </select>
                  </label>
                  <label>
                    Default reminder minutes
                    <input
                      aria-label="New account reminder minutes"
                      type="number"
                      required
                      min={0}
                      max={1440}
                      value={settings.defaultPreferences.reminderMinutes}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          defaultPreferences: {
                            ...settings.defaultPreferences,
                            reminderMinutes: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </label>
                </div>
                <div className="field-row">
                  <label>
                    Default appearance
                    <select
                      value={settings.defaultPreferences.theme}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          defaultPreferences: {
                            ...settings.defaultPreferences,
                            theme: e.target.value,
                          },
                        })
                      }
                    >
                      <option value="light">Light</option>
                      <option value="dark">Dark</option>
                    </select>
                  </label>
                  <label>
                    Default view
                    <select
                      value={settings.defaultPreferences.defaultView}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          defaultPreferences: {
                            ...settings.defaultPreferences,
                            defaultView: e.target.value,
                          },
                        })
                      }
                    >
                      {["day", "week", "month"].map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <h3>Starter categories</h3>
                {settings.defaultCategories.map((category, index) => (
                  <div className="admin-starter" key={index}>
                    <input
                      aria-label={`Starter category ${index + 1}`}
                      required
                      maxLength={40}
                      value={category.name}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          defaultCategories: settings.defaultCategories.map(
                            (c, i) =>
                              i === index ? { ...c, name: e.target.value } : c,
                          ),
                        })
                      }
                    />
                    <input
                      aria-label={`Starter color ${index + 1}`}
                      type="color"
                      value={category.color}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          defaultCategories: settings.defaultCategories.map(
                            (c, i) =>
                              i === index ? { ...c, color: e.target.value } : c,
                          ),
                        })
                      }
                    />
                    <button
                      className="icon-button"
                      type="button"
                      aria-label={`Remove starter category ${index + 1}`}
                      disabled={settings.defaultCategories.length <= 1}
                      onClick={() =>
                        setSettings({
                          ...settings,
                          defaultCategories: settings.defaultCategories.filter(
                            (_, i) => i !== index,
                          ),
                        })
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="button"
                  disabled={settings.defaultCategories.length >= 20}
                  onClick={() =>
                    setSettings({
                      ...settings,
                      defaultCategories: [
                        ...settings.defaultCategories,
                        { name: "New category", color: "#4268d6" },
                      ],
                    })
                  }
                >
                  <Plus size={16} />
                  Add starter category
                </button>
                <button className="button primary" disabled={busy || loading}>
                  Save site settings
                </button>
              </form>
            )}
            {tab === "audit" && (
              <>
                <h3>Recent administrative activity</h3>
                <p className="muted">
                  Account IDs identify the actor and target;
                  personal task content and secrets are excluded.
                </p>
                {audit?.events.map((event) => (
                  <article className="admin-account" key={event._id}>
                    <div>
                      <b>{event.action.replaceAll("_", " ")}</b>
                      <small>
                        {new Date(event.at).toLocaleString()} ·{" "}
                        {event.from
                          ? `${event.from} → ${event.to}`
                          : `Revision ${event.revision ?? "—"}`}
                      </small>
                      <small>
                        Actor: {event.actor || "Local operator"}
                        {event.target ? ` · Target: ${event.target}` : ""}
                      </small>
                    </div>
                  </article>
                ))}
                {audit && (
                  <div className="search-pagination">
                    <button className="button" disabled={busy || loading || auditPage <= 1} onClick={() => setAuditPage(p => p - 1)}>Newer</button>
                    <span className="muted">Page {audit.page} · {audit.total} records</span>
                    <button className="button" disabled={busy || loading || auditPage * audit.pageSize >= audit.total} onClick={() => setAuditPage(p => p + 1)}>Older</button>
                  </div>
                )}
              </>
            )}
            {confirm && (
              <div className="alert warning">
                <b>
                  {confirm.status === "active" ? "Suspend" : "Reactivate"}{" "}
                  {confirm.email}?
                </b>
                <p>
                  Existing sessions will be revoked. Account data is retained.
                </p>
                <div className="reminder-actions">
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() => setConfirm(null)}
                  >
                    Cancel
                  </button>
                  <button
                    className="button danger"
                    disabled={busy}
                    onClick={changeStatus}
                  >
                    Confirm account status change
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </dialog>
  );
}
