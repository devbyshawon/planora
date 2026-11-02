import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
} from "date-fns";
import {
  X,
  RefreshCw,
  Link2,
  Unplug,
  Pause,
  Play,
  ExternalLink,
} from "lucide-react";
import { api } from "../api.js";
import { asDate, dateKey, todayIn } from "../calendar.js";
export default function GoogleCalendarDialog({
  selected,
  view,
  user,
  callback,
  onClose,
}) {
  const dialog = useRef(null),
    stop = useRef(false),
    alive = useRef(true);
  const [data, setData] = useState(null),
    [run, setRun] = useState(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [disconnectConfirm, setDisconnectConfirm] = useState(false),
    [anchor, setAnchor] = useState(selected),
    [period, setPeriod] = useState(view),
    [category, setCategory] = useState(""),
    [customFrom, setCustomFrom] = useState(selected),
    [customTo, setCustomTo] = useState(selected),
    [calendarId, setCalendarId] = useState(""),
    [extraItems, setExtraItems] = useState([]);
  const range = useMemo(() => {
    const date = asDate(anchor),
      weekStartsOn = user.preferences.weekStartsOn;
    if (period === "custom") return { from: customFrom, to: customTo };
    if (period === "upcoming") {
      const today = todayIn(user.timeZone);
      return { from: today, to: dateKey(addDays(asDate(today), 29)) };
    }
    if (period === "day") return { from: anchor, to: anchor };
    if (period === "week")
      return {
        from: dateKey(startOfWeek(date, { weekStartsOn })),
        to: dateKey(endOfWeek(date, { weekStartsOn })),
      };
    return { from: dateKey(startOfMonth(date)), to: dateKey(endOfMonth(date)) };
  }, [
    period,
    anchor,
    customFrom,
    customTo,
    user.preferences.weekStartsOn,
    user.timeZone,
  ]);
  const callbacks = {
    connected: "Google Calendar is connected. Choose a range to sync.",
    denied: "Google connection was cancelled. No tasks were synced.",
    expired:
      "The connection link expired or was opened in another browser. Connect again.",
    failed:
      "Google connection could not be completed. Check setup and connect again.",
    permission:
      "Google Calendar permission was not granted. Connect again and approve the requested Calendar permission.",
    refresh:
      "Google did not provide offline access. Connect again and approve access.",
    account:
      "A different Google account was selected. Disconnect before switching accounts.",
    calendar:
      "Google is connected, but the Planora calendar needs setup below.",
    sign_in: "Sign in to Planora, then connect Google Calendar again.",
  };
  useEffect(() => {
    alive.current = true;
    stop.current = false;
    dialog.current.showModal();
    if (callback)
      setNotice(callbacks[callback] || "Check your Google connection below.");
    const controller = new AbortController();
    api("/google/status", { signal: controller.signal })
      .then((result) => {
        if (alive.current && !controller.signal.aborted) {
          setData(result);
          setRun(result.run);
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError" && alive.current) setError(err.message);
      })
      .finally(() => {
        if (alive.current && !controller.signal.aborted) setLoading(false);
      });
    return () => {
      alive.current = false;
      stop.current = true;
      controller.abort();
    };
  }, []);
  async function refresh() {
    const result = await api("/google/status");
    if (alive.current) {
      setData(result);
      setRun(result.run);
      setExtraItems([]);
    }
    return result;
  }
  async function action(fn) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (err) {
      if (alive.current) setError(err.message);
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function connect() {
    await action(async () => {
      const result = await api("/google/connect", { method: "POST", body: {} });
      window.location.assign(result.url);
    });
  }
  async function process(initial) {
    stop.current = false;
    let current = initial;
    while (alive.current && !stop.current && current.status === "ready") {
      const result = await api(`/google/jobs/${current.id}/step`, {
        method: "POST",
        body: {},
      });
      current = result.run;
      if (alive.current) {
        setRun(current);
        setExtraItems([]);
      }
      if (current.needsReconnect) {
        stop.current = true;
        await refresh();
        break;
      }
      if (current.status === "ready" && !stop.current)
        await new Promise((resolve) => setTimeout(resolve, 350));
    }
    if (alive.current)
      setNotice(
        current.status === "complete"
          ? "Sync finished. Review the task results below."
          : "Paused. Resume to continue the remaining tasks.",
      );
  }
  function start() {
    action(async () => {
      const result = await api("/google/sync", {
        method: "POST",
        body: { ...range, category },
      });
      setRun(result.run);
      setExtraItems([]);
      await process(result.run);
    });
  }
  function resume() {
    action(async () => {
      const result = await api(`/google/jobs/${run.id}`);
      setRun(result.run);
      await process(result.run);
    });
  }
  function retry() {
    action(async () => {
      const result = await api(`/google/jobs/${run.id}/retry`, {
        method: "POST",
        body: {},
      });
      setRun(result.run);
      await process(result.run);
    });
  }
  function cancel() {
    action(async () => {
      const result = await api(`/google/jobs/${run.id}/cancel`, {
        method: "POST",
        body: {},
      });
      setRun(result.run);
      setNotice("Remaining tasks cancelled. Events already synced were kept.");
    });
  }
  function disconnect() {
    action(async () => {
      const result = await api("/google/disconnect", {
        method: "POST",
        body: {},
      });
      setDisconnectConfirm(false);
      await refresh();
      setNotice(result.message);
    });
  }
  function calendar(body) {
    action(async () => {
      await api("/google/calendar", { method: "POST", body });
      await refresh();
      setNotice("Your Planora calendar is ready.");
    });
  }
  async function more() {
    await action(async () => {
      const page =
        Math.floor(((run.items?.length || 0) + extraItems.length) / 50) + 1;
      const result = await api(`/google/jobs/${run.id}?page=${page}`);
      setExtraItems((items) => [...items, ...result.run.items]);
    });
  }
  const items = [...(run?.items || []), ...extraItems],
    ready =
      data?.configured &&
      data.connected &&
      data.calendarReady &&
      !data.needsReconnect;
  return (
    <dialog
      className="planning-dialog google-dialog"
      aria-labelledby="google-title"
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault();
        if (busy) stop.current = true;
        else onClose();
      }}
    >
      <header className="settings-header">
        <div>
          <span className="eyebrow">YOUR PLANS, IN GOOGLE CALENDAR</span>
          <h2 id="google-title">Google Calendar</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Close Google Calendar"
          disabled={busy}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      <div className="planning-form">
        {loading && <p role="status">Checking your Google connection…</p>}
        {data && (
          <>
            <div
              className={`google-connection ${data.connected ? "connected" : ""}`}
            >
              <div>
                <b>
                  {data.connected
                    ? data.needsReconnect
                      ? "Reconnect required"
                      : "Connected"
                    : "Not connected"}
                </b>
                <small>
                  {data.connected
                    ? data.email
                    : "Connect the Google account you want to use."}
                </small>
              </div>
              {data.connected && (
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => setDisconnectConfirm(true)}
                >
                  <Unplug size={16} />
                  Disconnect
                </button>
              )}
            </div>
            {data.connected && !data.needsReconnect && (
              <button
                className="text-button"
                disabled={busy || !data.configured}
                onClick={connect}
              >
                Reconnect Google Calendar
              </button>
            )}
            {!data.configured && (
              <div className="alert warning">
                Google Calendar is not configured on this installation. Complete
                the setup in UPGRADE_STAGE6.md, then restart the server.
              </div>
            )}
            {(!data.connected || data.needsReconnect) && (
              <button
                className="button primary"
                disabled={busy || !data.configured}
                onClick={connect}
              >
                <Link2 size={17} />
                {data.needsReconnect
                  ? "Reconnect Google Calendar"
                  : "Connect Google Calendar"}
              </button>
            )}
            <p className="muted google-help">
              Planora uses a separate calendar named Planora. It requests
              permission for calendars created by this app and basic Google
              identity. Sync sends task titles, notes, categories, statuses, and
              times to that calendar.
            </p>
            {data.connected && !data.calendarReady && !data.needsReconnect && (
              <div className="google-calendar-setup">
                <h3>Finish calendar setup</h3>
                {data.calendarPending ? (
                  <>
                    <p>
                      Google may have already created your calendar. Check
                      Google Calendar first. If it exists, copy its Calendar ID
                      from its settings and enter it here.
                    </p>
                    <label>
                      Existing Planora calendar ID
                      <input
                        value={calendarId}
                        onChange={(e) => setCalendarId(e.target.value)}
                      />
                    </label>
                    <button
                      className="button"
                      disabled={busy || !calendarId.trim()}
                      onClick={() =>
                        calendar({ calendarId: calendarId.trim() })
                      }
                    >
                      Use existing Planora calendar
                    </button>
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => calendar({ confirmNew: true })}
                    >
                      I checked — create another Planora calendar
                    </button>
                  </>
                ) : (
                  <button
                    className="button primary"
                    disabled={busy}
                    onClick={() => calendar({})}
                  >
                    Create Planora calendar
                  </button>
                )}
              </div>
            )}
            {ready && (
              <>
                <fieldset
                  disabled={busy || run?.status === "ready"}
                  className="export-fields"
                >
                  <div className="progress-controls">
                    <label>
                      Period
                      <select
                        aria-label="Google sync period"
                        value={period}
                        onChange={(e) => setPeriod(e.target.value)}
                      >
                        <option value="day">Day</option>
                        <option value="week">Week</option>
                        <option value="month">Month</option>
                        <option value="upcoming">Upcoming 30 days</option>
                        <option value="custom">Custom range</option>
                      </select>
                    </label>
                    {!["custom", "upcoming"].includes(period) && (
                      <label>
                        Reference date
                        <input
                          aria-label="Google sync reference date"
                          type="date"
                          value={anchor}
                          onChange={(e) => {
                            if (e.target.value) setAnchor(e.target.value);
                          }}
                        />
                      </label>
                    )}
                    <label>
                      Category
                      <select
                        aria-label="Google sync category"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                      >
                        <option value="">All categories</option>
                        {user.categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {period === "custom" && (
                    <div className="form-row">
                      <label>
                        From
                        <input
                          aria-label="Google sync from"
                          type="date"
                          value={customFrom}
                          onChange={(e) => setCustomFrom(e.target.value)}
                        />
                      </label>
                      <label>
                        To
                        <input
                          aria-label="Google sync to"
                          type="date"
                          value={customTo}
                          onChange={(e) => setCustomTo(e.target.value)}
                        />
                      </label>
                    </div>
                  )}
                </fieldset>
                <div className="export-summary">
                  <b>
                    {range.from} → {range.to}
                  </b>
                  <small>{user.timeZone} · Planora → Google</small>
                </div>
                <p className="muted google-help">
                  Sync updates current calendar tasks and previously linked
                  events last synced in this range/category. A moved task can
                  therefore be updated outside this range. Bucket/deleted tasks
                  remove their linked events. Recurring occurrences sync
                  individually. Pending tasks receive a 10-minute popup
                  reminder; completed tasks receive none.
                </p>
                <p className="muted google-help">
                  Run sync again after changing tasks. Changes made directly in
                  Google stay in Google until the next sync overwrites
                  Planora-managed fields. Unlinked Google events are left alone.
                </p>
                {run?.status !== "ready" && (
                  <button
                    className="button primary"
                    disabled={busy}
                    onClick={start}
                  >
                    <RefreshCw size={17} />
                    Start sync
                  </button>
                )}
              </>
            )}
            {run && (
              <section className="google-results" aria-live="polite">
                <div className="results-heading">
                  <h3>
                    {run.status === "ready"
                      ? busy
                        ? "Syncing…"
                        : "Sync paused"
                      : run.status === "cancelled"
                        ? "Sync cancelled"
                        : "Latest sync"}
                  </h3>
                  <span>
                    {run.total - run.counts.pending} / {run.total} processed
                  </span>
                </div>
                <p className="muted">
                  {run.from} → {run.to}
                </p>
                <div className="google-counts">
                  <span>{run.counts.synced} synced</span>
                  <span>{run.counts.unchanged} unchanged</span>
                  <span>{run.counts.removed} removed</span>
                  <span>{run.counts.failed} failed</span>
                </div>
                {run.warningCount > 0 && (
                  <div className="alert warning">
                    {run.warningCount} scheduling warning(s). Check the Planora
                    calendar for overlaps and skipped clock-change occurrences.
                  </div>
                )}
                <div className="google-job-actions">
                  {busy && run.status === "ready" && (
                    <button
                      className="button"
                      onClick={() => {
                        stop.current = true;
                        setNotice("Pausing after the current task finishes…");
                      }}
                    >
                      <Pause size={16} />
                      Pause
                    </button>
                  )}
                  {!busy && ready && run.status === "ready" && (
                    <>
                      <button className="button primary" onClick={resume}>
                        <Play size={16} />
                        Resume sync
                      </button>
                      <button className="button" onClick={cancel}>
                        Cancel remaining
                      </button>
                    </>
                  )}
                  {!busy &&
                    ready &&
                    run.status !== "cancelled" &&
                    run.counts.failed > 0 && (
                      <button className="button" onClick={retry}>
                        Retry failed tasks
                      </button>
                    )}
                </div>
                {items.map((item) => (
                  <article
                    className={`google-result ${item.status === "failed" ? "failed" : ""}`}
                    key={item.taskId}
                  >
                    <div>
                      <b>{item.title}</b>
                      <small>{item.message || "Waiting to sync."}</small>
                    </div>
                    <span className="google-item-status">{item.status}</span>
                  </article>
                ))}
                {items.length < run.total && (
                  <button className="button" disabled={busy} onClick={more}>
                    Show 50 more
                  </button>
                )}
              </section>
            )}
            {disconnectConfirm && (
              <div className="alert warning">
                <b>Disconnect Google Calendar?</b>
                <p>
                  This removes saved Google tokens and cancels unfinished sync.
                  The Google calendar and its events will remain.
                </p>
                <div className="google-job-actions">
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() => setDisconnectConfirm(false)}
                  >
                    Keep connected
                  </button>
                  <button
                    className="button danger"
                    disabled={busy}
                    onClick={disconnect}
                  >
                    Yes, disconnect
                  </button>
                </div>
              </div>
            )}
            {data.connected && (
              <a
                className="google-external"
                href="https://calendar.google.com/"
                target="_blank"
                rel="noreferrer"
              >
                Open Google Calendar <ExternalLink size={14} />
              </a>
            )}
          </>
        )}
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
        <small className="muted">
          Closing this dialog or page pauses sync after an in-flight task
          finishes. Resume from this dialog later. Google and device
          notification settings control reminder delivery.
        </small>
      </div>
    </dialog>
  );
}
