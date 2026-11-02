import { useEffect, useRef, useState } from "react";
import { X, Plus, Pencil, Trash2, CalendarPlus, Repeat2 } from "lucide-react";
import { api } from "../api.js";
import { clock } from "../calendar.js";
export default function PlanningLibraryDialog({
  kind,
  categories,
  use24,
  onUse,
  onEditSeries,
  onNewSeries,
  onSaved,
  onClose,
}) {
  const dialog = useRef(null),
    isSeries = kind === "series";
  const [items, setItems] = useState([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState(null),
    [editor, setEditor] = useState(null),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    dialog.current.showModal();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    api(`/${kind}`, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setItems(data[kind]);
      })
      .catch((err) => {
        if (err.name !== "AbortError") setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [kind, revision]);
  async function remove(id) {
    setBusy(true);
    setError("");
    try {
      await api(`/${kind}/${id}`, { method: "DELETE" });
      setConfirm(null);
      setRevision((v) => v + 1);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(editor._id ? `/templates/${editor._id}` : "/templates", {
        method: editor._id ? "PATCH" : "POST",
        body: editor,
      });
      setEditor(null);
      setRevision((v) => v + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function editSeries(id) {
    setBusy(true);
    setError("");
    try {
      await onEditSeries(id);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      className="planning-dialog"
      ref={dialog}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header className="settings-header">
        <div>
          <span className="eyebrow">MAKE THE ROUTINE EASIER</span>
          <h2>{isSeries ? "Recurring tasks" : "Task templates"}</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Close planning library"
          disabled={busy}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      <div className="planning-form">
        <p className="muted">
          {isSeries
            ? "Each occurrence has its own progress. Whole-series edits preserve completed and individually changed occurrences."
            : "Save a favourite task once, then place it on any day. Every use creates an independent task."}
        </p>
        <button
          className="button primary"
          disabled={busy}
          onClick={() =>
            isSeries
              ? (onNewSeries(), onClose())
              : setEditor({
                  name: "",
                  title: "",
                  notes: "",
                  category: categories[0].id,
                  priority: "medium",
                  startTime: "09:15",
                  endTime: "09:55",
                })
          }
        >
          <Plus size={18} />
          {isSeries ? "New recurring task" : "New template"}
        </button>
        {loading && <p role="status">Loading…</p>}
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        {!loading && !items.length && (
          <p className="muted">
            {isSeries
              ? "No recurring tasks yet."
              : "No templates yet. Add one here or save a task as a template."}
          </p>
        )}
        {items.map((item) => (
          <article className="library-card" key={item._id}>
            <div className="library-card-title">
              <i
                style={{
                  background: categories.find((c) => c.id === item.category)
                    ?.color,
                }}
              />
              <h3>{isSeries ? item.title : item.name}</h3>
            </div>
            <p>
              {clock(item.startTime, use24)}–{clock(item.endTime, use24)} ·{" "}
              {categories.find((c) => c.id === item.category)?.name}
            </p>
            {isSeries && (
              <p>
                <Repeat2 size={13} />
                {item.frequency === "weekdays"
                  ? `Selected weekdays (${item.weekdays.join(", ")})`
                  : item.frequency}{" "}
                · {item.startDate} → {item.endDate || "No end date"}
              </p>
            )}
            <div className="library-actions">
              {!isSeries && (
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => {
                    onUse(item);
                    onClose();
                  }}
                >
                  <CalendarPlus size={15} />
                  Use template
                </button>
              )}
              <button
                className="button"
                disabled={busy}
                onClick={() =>
                  isSeries ? editSeries(item._id) : setEditor({ ...item })
                }
              >
                <Pencil size={15} />
                {isSeries ? "Edit series" : "Edit template"}
              </button>
              <button
                className="icon-button danger"
                disabled={busy}
                aria-label={`Delete ${isSeries ? "series" : "template"} ${isSeries ? item.title : item.name}`}
                onClick={() => setConfirm(item._id)}
              >
                <Trash2 size={16} />
              </button>
            </div>
            {confirm === item._id && (
              <div className="alert warning">
                {isSeries
                  ? "Delete this entire series and all its occurrences, including bucket items?"
                  : "Delete this template? Existing tasks will stay."}
                <div className="library-actions">
                  <button
                    className="text-button danger"
                    disabled={busy}
                    onClick={() => remove(item._id)}
                  >
                    Confirm deletion
                  </button>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => setConfirm(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </article>
        ))}
        {editor && (
          <form className="template-editor" onSubmit={save}>
            <h3>{editor._id ? "Edit template" : "New template"}</h3>
            <label>
              Template name
              <input
                required
                maxLength={160}
                value={editor.name}
                onChange={(e) => setEditor({ ...editor, name: e.target.value })}
              />
            </label>
            <label>
              Default task title
              <input
                required
                maxLength={160}
                value={editor.title}
                onChange={(e) =>
                  setEditor({ ...editor, title: e.target.value })
                }
              />
            </label>
            <div className="field-row">
              <label>
                Template start time
                <input
                  type="time"
                  step="60"
                  required
                  value={editor.startTime}
                  onChange={(e) =>
                    setEditor({ ...editor, startTime: e.target.value })
                  }
                />
              </label>
              <label>
                Template end time
                <input
                  type="time"
                  step="60"
                  required
                  value={editor.endTime}
                  onChange={(e) =>
                    setEditor({ ...editor, endTime: e.target.value })
                  }
                />
              </label>
            </div>
            <div className="field-row">
              <label>
                Category
                <select
                  aria-label="Template category"
                  value={editor.category}
                  onChange={(e) =>
                    setEditor({ ...editor, category: e.target.value })
                  }
                >
                  {categories.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Priority
                <select
                  aria-label="Template priority"
                  value={editor.priority}
                  onChange={(e) =>
                    setEditor({ ...editor, priority: e.target.value })
                  }
                >
                  {["low", "medium", "high"].map((v) => (
                    <option value={v} key={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Template notes
              <textarea
                rows={3}
                maxLength={5000}
                value={editor.notes}
                onChange={(e) =>
                  setEditor({ ...editor, notes: e.target.value })
                }
              />
            </label>
            <div className="library-actions">
              <button className="button primary" disabled={busy}>
                Save template
              </button>
              <button
                className="button"
                type="button"
                disabled={busy}
                onClick={() => setEditor(null)}
              >
                Cancel editing
              </button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}
