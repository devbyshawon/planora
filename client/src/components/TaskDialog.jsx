import { useEffect, useRef, useState } from "react";
import { X, Trash2, Copy, Archive, CalendarPlus } from "lucide-react";
import { validateRange } from "../../../shared/calendar.js";
import { withDuration } from "../../../shared/slots.js";
import { api } from "../api.js";
import { clock } from "../calendar.js";
const noRepeat = () => ({
  frequency: "none",
  weekdays: [1, 2, 3, 4, 5],
  endDate: "",
});
export default function TaskDialog({
  task,
  onClose,
  onSaved,
  today,
  use24,
  categories,
  onEditSeries,
  onHistory,
}) {
  const dialog = useRef(null);
  const [data, setData] = useState({
    title: "",
    notes: "",
    category: categories[0].id,
    priority: "medium",
    status: "scheduled",
    location: "calendar",
    date: today,
    startTime: "09:00",
    endTime: "09:30",
    recurrence: noRepeat(),
    ...task,
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [conflicts, setConflicts] = useState(null),
    [confirmDelete, setConfirmDelete] = useState(false),
    [deleteScope, setDeleteScope] = useState("occurrence");
  const exists = Boolean(data._id),
    bucket = data.location === "bucket",
    editingSeries = Boolean(data.seriesEditorId),
    repeating = !bucket && !exists && data.recurrence.frequency !== "none";
  useEffect(() => {
    dialog.current.showModal();
  }, []);
  function change(key, value) {
    setData((current) => ({ ...current, [key]: value }));
    setError("");
    setConflicts(null);
  }
  function changeRule(key, value) {
    setData((current) => ({
      ...current,
      recurrence: { ...current.recurrence, [key]: value },
    }));
    setError("");
    setConflicts(null);
  }
  function setDuration(duration) {
    try {
      const range = withDuration(data.startTime, duration);
      setData(current => ({ ...current, ...range }));
      setError("");
      setConflicts(null);
    } catch (err) { setError(err.message); }
  }
  function canUseDuration(duration) {
    try { withDuration(data.startTime, duration); return true; } catch { return false; }
  }
  let currentDuration;
  try { currentDuration = validateRange(data.startTime, data.endTime).durationMinutes; } catch {}
  async function save(event, allowOverlap = false) {
    event?.preventDefault();
    setError("");
    if (!bucket) {
      try {
        validateRange(data.startTime, data.endTime);
      } catch (err) {
        setError(err.message);
        return;
      }
    }
    setBusy(true);
    try {
      const fields = [
        "title",
        "notes",
        "category",
        "priority",
        "status",
        "location",
        "date",
        "startTime",
        "endTime",
      ];
      const body = Object.fromEntries(fields.map((key) => [key, data[key]]));
      const path = editingSeries
        ? `/series/${data.seriesEditorId}`
        : exists
          ? `/tasks/${data._id}`
          : repeating
            ? "/series"
            : data.templateId
              ? `/templates/${data.templateId}/apply`
              : "/tasks";
      const result = await api(path, {
        method: exists || editingSeries ? "PATCH" : "POST",
        body: {
          ...body,
          allowOverlap,
          ...(exists ? { expectedUpdatedAt: data.updatedAt } : {}),
          ...(repeating || editingSeries
            ? { recurrence: data.recurrence }
            : {}),
        },
      });
      onSaved(result);
      onClose();
    } catch (err) {
      if (err.code === "OVERLAP") setConflicts(err.details);
      else setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    try {
      await api(
        deleteScope === "series"
          ? `/series/${data.series}`
          : `/tasks/${data._id}`,
        { method: "DELETE", body: { expectedUpdatedAt: data.updatedAt } },
      );
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function saveAsTemplate() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api("/templates", {
        method: "POST",
        body: {
          name: data.title,
          title: data.title,
          notes: data.notes,
          category: data.category,
          priority: data.priority,
          startTime: data.startTime,
          endTime: data.endTime,
        },
      });
      setNotice("Template saved. Open Task templates to reuse it.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function editSeries() {
    setBusy(true);
    setError("");
    try {
      await onEditSeries(data.series);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="task-dialog"
      aria-labelledby="task-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(e) => {
        if (e.target === dialog.current && !busy) onClose();
      }}
    >
      <form onSubmit={save}>
        <header>
          <div>
            <span className="eyebrow">
              {bucket ? "A LITTLE LATER" : "MAKE TIME FOR IT"}
            </span>
            <h2 id="task-dialog-title">
              {editingSeries
                ? "Edit recurring series"
                : exists
                  ? "Edit task"
                  : bucket
                    ? "New bucket item"
                    : repeating
                      ? "New recurring task"
                      : "New task"}
            </h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close"
            disabled={busy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        {data.series && (
          <div className="alert recurring-info">
            <b>Recurring occurrence · {data.occurrenceDate}</b>
            <p>
              Changes here affect only this occurrence. Completion is tracked
              separately for each day.
            </p>
            <div className="library-actions">
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={editSeries}
              >
                Edit whole series
              </button>
              <button
                type="button"
                className="text-button danger"
                disabled={busy}
                onClick={() => {
                  setDeleteScope("series");
                  setConfirmDelete(true);
                }}
              >
                Delete entire series
              </button>
            </div>
          </div>
        )}
        {editingSeries && (
          <p className="muted">
            Update the repeat rule and uncompleted, unmodified occurrences.
            Completed tasks and individual edits stay intact.
          </p>
        )}
        <label>
          Task title
          <input
            autoFocus
            required
            maxLength={160}
            value={data.title}
            onChange={(e) => change("title", e.target.value)}
            placeholder="What would you like to do?"
          />
        </label>
        {!bucket && (
          <>
            <label>
              {editingSeries ? "Series start date" : "Date"}
              <input
                aria-label={editingSeries ? "Series start date" : "Date"}
                type="date"
                required
                value={data.date || today}
                onChange={(e) => change("date", e.target.value)}
              />
            </label>
            <div className="field-row">
              <label>
                Start time
                <input
                  type="time"
                  step="60"
                  required
                  value={data.startTime}
                  onChange={(e) => change("startTime", e.target.value)}
                />
              </label>
              <label>
                End time
                <input
                  type="time"
                  step="60"
                  required
                  value={data.endTime}
                  onChange={(e) => change("endTime", e.target.value)}
                />
              </label>
            </div>
            <div className="slot-duration-controls" role="group" aria-label="Quick slot duration">
              {[30, 60, 120].map(duration => (
                <button type="button" className="button" key={duration} disabled={busy || !canUseDuration(duration)} aria-pressed={currentDuration === duration} onClick={() => setDuration(duration)}>
                  {duration === 30 ? "30 min" : duration === 60 ? "1 hour" : "2 hours"}
                </button>
              ))}
              <span className="muted">{currentDuration ? `${currentDuration} minutes` : "Choose valid times"}</span>
            </div>
            <small className="muted">
              Use a shortcut or enter any start and end times. Overnight work needs two entries.
            </small>
          </>
        )}
        <div className="field-row">
          <label>
            Category
            <select
              aria-label="Category"
              value={data.category}
              onChange={(e) => change("category", e.target.value)}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Priority
            <select
              aria-label="Priority"
              value={data.priority}
              onChange={(e) => change("priority", e.target.value)}
            >
              {["low", "medium", "high"].map((p) => (
                <option key={p} value={p}>
                  {p[0].toUpperCase() + p.slice(1)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!bucket && !editingSeries && !repeating && (
          <label>
            Status
            <select
              aria-label="Status"
              value={data.status}
              onChange={(e) => change("status", e.target.value)}
            >
              <option value="scheduled">Scheduled</option>
              <option value="completed">Completed</option>
              <option value="not_completed">Not completed</option>
            </select>
          </label>
        )}
        {!bucket && !exists && (
          <div className="recurrence-fields">
            <label>
              Repeat
              <select
                aria-label="Repeat"
                value={data.recurrence.frequency}
                onChange={(e) => changeRule("frequency", e.target.value)}
              >
                {!editingSeries && (
                  <option value="none">Does not repeat</option>
                )}
                <option value="daily">Every day</option>
                <option value="weekdays">Selected weekdays</option>
                <option value="weekly">
                  Every week on the starting weekday
                </option>
                <option value="monthly">Every month on the same date</option>
              </select>
            </label>
            {data.recurrence.frequency === "weekdays" && (
              <fieldset className="weekday-picker">
                <legend>Repeat on</legend>
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                  (label, index) => (
                    <label key={label}>
                      <input
                        type="checkbox"
                        checked={data.recurrence.weekdays.includes(index + 1)}
                        onChange={() => {
                          const day = index + 1;
                          changeRule(
                            "weekdays",
                            data.recurrence.weekdays.includes(day)
                              ? data.recurrence.weekdays.filter(
                                  (d) => d !== day,
                                )
                              : [...data.recurrence.weekdays, day],
                          );
                        }}
                      />
                      {label}
                    </label>
                  ),
                )}
              </fieldset>
            )}
            {data.recurrence.frequency !== "none" && (
              <>
                <label>
                  Repeat until (optional)
                  <input
                    type="date"
                    min={data.date}
                    value={data.recurrence.endDate || ""}
                    onChange={(e) => changeRule("endDate", e.target.value)}
                  />
                </label>
                <small className="muted">
                  No end date means ongoing. Dates are generated as you view or
                  search them. Invalid daylight-saving dates and missing monthly
                  dates are skipped. Future overlaps are reported in the
                  calendar.
                </small>
              </>
            )}
          </div>
        )}
        <label>
          Notes
          <textarea
            rows={3}
            maxLength={5000}
            value={data.notes}
            onChange={(e) => change("notes", e.target.value)}
            placeholder="A few details, a link, a little motivation…"
          />
        </label>
        {exists && (
          <button
            className="text-button template-save"
            type="button"
            disabled={busy}
            onClick={() => onHistory(data._id)}
          >
            View task history
          </button>
        )}
        {data.postponeCount > 0 && (
          <small className="muted">
            Postponed {data.postponeCount} time(s). First scheduled:{" "}
            {data.originalSchedule?.date}.
          </small>
        )}
        {conflicts && (
          <div className="alert warning" role="alert">
            <b>This overlaps:</b>
            {conflicts.map((c) => (
              <p key={c._id}>
                {c.date} · {c.title} · {clock(c.startTime, use24)}–
                {clock(c.endTime, use24)}
              </p>
            ))}
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => save(null, true)}
            >
              Save anyway
            </button>
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
        {!bucket && !editingSeries && (
          <button
            type="button"
            className="text-button template-save"
            disabled={busy || !data.title.trim()}
            onClick={saveAsTemplate}
          >
            Save as template
          </button>
        )}
        {confirmDelete && (
          <div className="alert warning">
            {deleteScope === "series"
              ? "Delete the entire series and all occurrences, including bucket items?"
              : data.series
                ? "Delete only this occurrence? It will not be regenerated."
                : "Delete this task from your planner? Its recorded history will be retained."}{" "}
            <button
              type="button"
              className="text-button danger"
              disabled={busy}
              onClick={remove}
            >
              {deleteScope === "series" ? "Yes, delete series" : "Yes, delete"}
            </button>{" "}
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </button>
          </div>
        )}
        <footer>
          <div className="task-tools">
            {exists && (
              <>
                <button
                  type="button"
                  className="icon-button danger"
                  aria-label="Delete task"
                  disabled={busy}
                  onClick={() => {
                    setDeleteScope("occurrence");
                    setConfirmDelete(true);
                  }}
                >
                  <Trash2 size={18} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Duplicate task"
                  disabled={busy}
                  onClick={() => {
                    setData({
                      ...data,
                      _id: undefined,
                      title: `${data.title.slice(0, 150)} (copy)`,
                      status: "scheduled",
                      postponeCount: 0,
                      originalSchedule: undefined,
                      series: undefined,
                      occurrenceDate: undefined,
                      templateId: undefined,
                      isException: false,
                      recurrence: noRepeat(),
                    });
                    setConflicts(null);
                    setConfirmDelete(false);
                    setNotice("");
                  }}
                >
                  <Copy size={18} />
                </button>
              </>
            )}
            {!editingSeries && (
              <button
                type="button"
                className="button subtle"
                disabled={busy}
                onClick={() => {
                  change("location", bucket ? "calendar" : "bucket");
                  setConfirmDelete(false);
                }}
              >
                {bucket ? <CalendarPlus size={17} /> : <Archive size={17} />}{" "}
                {bucket ? "Schedule" : "Bucket list"}
              </button>
            )}
          </div>
          <button className="button primary" disabled={busy}>
            {busy
              ? "Saving…"
              : editingSeries
                ? "Save series"
                : exists
                  ? "Save changes"
                  : repeating
                    ? "Create series"
                    : "Create task"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
