import { useEffect, useRef, useState } from "react";
import { X, Archive, Check, Trash2 } from "lucide-react";
import { api } from "../api.js";
import { clock } from "../calendar.js";
export default function ReviewDialog({
  date: initialDate,
  yesterday,
  use24,
  onSaved,
  onClose,
}) {
  const dialog = useRef(null),
    [date, setDate] = useState(initialDate),
    [tasks, setTasks] = useState([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0),
    [deleting, setDeleting] = useState(null);
  useEffect(() => {
    dialog.current.showModal();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api(`/insights/review?date=${date}`, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setTasks(data.tasks);
      })
      .catch((err) => {
        if (err.name !== "AbortError") setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [date, revision]);
  async function decide(task, action) {
    setBusy(true);
    setError("");
    try {
      await api(`/insights/review/${task._id}`, {
        method: "POST",
        body: { date, action, expectedUpdatedAt: task.updatedAt },
      });
      setDeleting(null);
      setRevision((v) => v + 1);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="planning-dialog"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header className="settings-header">
        <div>
          <span className="eyebrow">MAKE PEACE WITH THE UNFINISHED</span>
          <h2>Daily review</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Close daily review"
          disabled={busy}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      <div className="planning-form">
        <p className="muted">
          Choose what happens to each unfinished task. Nothing moves
          automatically.
        </p>
        <label>
          Review date
          <input
            type="date"
            required
            max={yesterday}
            value={date}
            disabled={busy}
            onChange={(e) => {
              if (e.target.value) {
                setDate(e.target.value);
                setDeleting(null);
              }
            }}
          />
        </label>
        {loading && <p role="status">Loading unfinished tasks…</p>}
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        {!loading && !error && !tasks.length && (
          <div className="review-empty">
            <Check size={30} />
            <h3>All reviewed.</h3>
            <p>
              There are no unfinished tasks waiting for a decision on this day.
            </p>
          </div>
        )}
        {!loading &&
          tasks.map((task) => (
            <article key={task._id} className="library-card review-card">
              <h3>{task.title}</h3>
              <p>
                {clock(task.startTime, use24)}–{clock(task.endTime, use24)} ·{" "}
                {task.priority} priority
                {task.series ? " · Recurring occurrence" : ""}
              </p>
              {task.notes && <p>{task.notes}</p>}
              <div className="library-actions">
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => decide(task, "bucket")}
                >
                  <Archive size={15} />
                  Move to bucket
                </button>
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => decide(task, "keep")}
                >
                  <Check size={15} />
                  Keep not completed
                </button>
                <button
                  className="icon-button danger"
                  aria-label={`Delete reviewed task ${task.title}`}
                  disabled={busy}
                  onClick={() => setDeleting(task._id)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              {deleting === task._id && (
                <div className="alert warning">
                  Delete this task{task.series ? " occurrence" : ""}?{" "}
                  <button
                    className="text-button danger"
                    disabled={busy}
                    onClick={() => decide(task, "delete")}
                  >
                    Yes, delete task
                  </button>{" "}
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => setDeleting(null)}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </article>
          ))}
      </div>
    </dialog>
  );
}
