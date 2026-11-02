import { useEffect, useMemo, useRef, useState } from "react";
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { X, Download, FileText, CalendarDays, Table2 } from "lucide-react";
import { api, downloadExport } from "../api.js";
import { asDate, dateKey } from "../calendar.js";
export default function ExportDialog({ selected, view, user, onClose }) {
  const dialog = useRef(null),
    controller = useRef(null);
  const [anchor, setAnchor] = useState(selected),
    [period, setPeriod] = useState(view),
    [category, setCategory] = useState(""),
    [status, setStatus] = useState(""),
    [format, setFormat] = useState("pdf"),
    [includeNotes, setIncludeNotes] = useState(true),
    [reminder, setReminder] = useState("10"),
    [customFrom, setCustomFrom] = useState(selected),
    [customTo, setCustomTo] = useState(selected),
    [preview, setPreview] = useState(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const range = useMemo(() => {
    const date = asDate(anchor),
      weekStartsOn = user.preferences.weekStartsOn;
    return period === "custom"
      ? { from: customFrom, to: customTo }
      : period === "day"
        ? { from: anchor, to: anchor }
        : period === "week"
          ? {
              from: dateKey(startOfWeek(date, { weekStartsOn })),
              to: dateKey(endOfWeek(date, { weekStartsOn })),
            }
          : {
              from: dateKey(startOfMonth(date)),
              to: dateKey(endOfMonth(date)),
            };
  }, [period, anchor, customFrom, customTo, user.preferences.weekStartsOn]);
  const options = useMemo(
    () => ({
      ...range,
      period,
      category,
      status,
      includeNotes,
      reminderMinutes: reminder === "none" ? null : Number(reminder),
    }),
    [range, period, category, status, includeNotes, reminder],
  );
  useEffect(() => {
    dialog.current.showModal();
    return () => controller.current?.abort();
  }, []);
  useEffect(() => {
    const request = new AbortController();
    setLoading(true);
    setPreview(null);
    setError("");
    setNotice("");
    api("/exports/preview", {
      method: "POST",
      body: options,
      signal: request.signal,
    })
      .then((data) => {
        if (!request.signal.aborted) setPreview(data);
      })
      .catch((err) => {
        if (err.name !== "AbortError") setError(err.message);
      })
      .finally(() => {
        if (!request.signal.aborted) setLoading(false);
      });
    return () => request.abort();
  }, [options]);
  async function download() {
    setBusy(true);
    setError("");
    setNotice("");
    controller.current = new AbortController();
    try {
      const result = await downloadExport(
        { ...options, format },
        controller.current.signal,
      );
      setNotice(
        `${result.filename} is ready. ${result.count} task(s) exported.${result.warnings ? " Review the scheduling warnings below." : ""}`,
      );
    } catch (err) {
      if (err.name !== "AbortError") setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      className="planning-dialog export-dialog"
      aria-labelledby="export-title"
      ref={dialog}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header className="settings-header">
        <div>
          <span className="eyebrow">TAKE YOUR PLANS WITH YOU</span>
          <h2 id="export-title">Download schedule</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Close schedule downloads"
          disabled={busy}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      <div className="planning-form">
        <fieldset disabled={busy} className="export-fields">
          <div
            className="export-formats"
            role="group"
            aria-label="Download format"
          >
            {[
              ["pdf", FileText, "PDF", "Printable agenda"],
              ["csv", Table2, "CSV", "Spreadsheet rows"],
              ["ics", CalendarDays, "ICS", "Calendar with alerts"],
            ].map(([value, Icon, label, hint]) => (
              <button
                type="button"
                key={value}
                className={`export-format ${format === value ? "selected" : ""}`}
                aria-pressed={format === value}
                onClick={() => {
                  setFormat(value);
                  setNotice("");
                }}
              >
                <Icon size={23} />
                <b>{label}</b>
                <small>{hint}</small>
              </button>
            ))}
          </div>
          <div className="progress-controls">
            <label>
              Period
              <select
                aria-label="Export period"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              >
                <option value="day">Day</option>
                <option value="week">Week</option>
                <option value="month">Month</option>
                <option value="custom">Custom range</option>
              </select>
            </label>
            {period !== "custom" && (
              <label>
                Reference date
                <input
                  aria-label="Export reference date"
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
                aria-label="Export category"
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
            <label>
              Status
              <select
                aria-label="Export status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">All statuses</option>
                <option value="scheduled">Scheduled</option>
                <option value="completed">Completed</option>
                <option value="not_completed">Not completed</option>
              </select>
            </label>
          </div>
          {period === "custom" && (
            <div className="form-row">
              <label>
                From
                <input
                  aria-label="Export from"
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                />
              </label>
              <label>
                To
                <input
                  aria-label="Export to"
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                />
              </label>
            </div>
          )}
          <label className="export-checkbox">
            <input
              type="checkbox"
              checked={includeNotes}
              onChange={(e) => setIncludeNotes(e.target.checked)}
            />
            Include task notes
          </label>
          {format === "ics" && (
            <label>
              Calendar reminder
              <select
                aria-label="ICS reminder"
                value={reminder}
                onChange={(e) => setReminder(e.target.value)}
              >
                <option value="none">No reminder</option>
                <option value="0">At start time</option>
                {[5, 10, 15, 30, 60].map((n) => (
                  <option key={n} value={n}>
                    {n} minutes before
                  </option>
                ))}
              </select>
            </label>
          )}
        </fieldset>
        <div className="export-summary" aria-live="polite">
          {loading ? (
            <p role="status">Checking your schedule…</p>
          ) : preview ? (
            <>
              <b>
                {preview.count} task{preview.count === 1 ? "" : "s"} ·{" "}
                {Math.floor(preview.totalMinutes / 60)}h{" "}
                {preview.totalMinutes % 60}m
              </b>
              <span>
                {range.from} → {range.to}
              </span>
              <small>{preview.timeZone} · Current calendar tasks</small>
            </>
          ) : (
            <p>Choose a valid range to preview the download.</p>
          )}
        </div>
        <p className="muted export-help">
          Bucket items and deleted tasks are excluded. Week exports follow your
          saved week start. Month exports include only that month. Overlapping
          task durations are added.
        </p>
        {format === "ics" && (
          <p className="muted export-help">
            ICS is a snapshot of this range. Repeat rules stop at its end;
            edited or completed occurrences are separate events. Importing a new
            snapshot does not remove events imported earlier. Calendar apps
            control alert delivery; completed tasks have no alerts.
          </p>
        )}
        {format === "csv" && (
          <p className="muted export-help">
            CSV uses UTF-8 and exact 24-hour times. Cells that could be formulas
            start with an apostrophe for spreadsheet safety.
          </p>
        )}
        {format === "pdf" && (
          <p className="muted export-help">
            PDF is a printable agenda with exact 24-hour times. Latin and
            Bengali fonts are included; unsupported characters appear as Unicode
            codes.
          </p>
        )}
        {preview?.warningCount > 0 && (
          <div className="alert warning">
            <b>{preview.warningCount} scheduling warning(s)</b>
            <ul>
              {preview.warnings.slice(0, 8).map((warning, index) => (
                <li key={index}>
                  {warning.date ? `${warning.date}: ` : ""}
                  {warning.message}
                </li>
              ))}
            </ul>
            {preview.warningCount > 8 && (
              <small>Open the calendar for the remaining warnings.</small>
            )}
          </div>
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
        <div className="export-actions">
          <button className="button" disabled={busy} onClick={onClose}>
            Close
          </button>
          <button
            className="button primary"
            disabled={loading || busy || !preview}
            onClick={download}
          >
            <Download size={17} />
            {busy ? "Preparing download…" : `Download ${format.toUpperCase()}`}
          </button>
        </div>
      </div>
    </dialog>
  );
}
