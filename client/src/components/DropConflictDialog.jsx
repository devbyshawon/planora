import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { clock } from "../calendar.js";
export default function DropConflictDialog({
  pending,
  use24,
  busy,
  onConfirm,
  onEdit,
  onClose,
}) {
  const dialog = useRef(null);
  useEffect(() => {
    dialog.current.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="task-dialog"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="planning-form">
        <header className="drop-header">
          <h2>This time overlaps.</h2>
          <button
            className="icon-button"
            aria-label="Cancel rescheduling"
            disabled={busy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        <p>
          Move <b>{pending.task.title}</b> to {pending.body.date},{" "}
          {clock(pending.body.startTime, use24)}–
          {clock(pending.body.endTime, use24)}?
        </p>
        <div className="alert warning">
          {pending.conflicts.map((task) => (
            <p key={task._id}>
              {task.title} · {clock(task.startTime, use24)}–
              {clock(task.endTime, use24)}
            </p>
          ))}
        </div>
        <div className="library-actions">
          <button
            className="button primary"
            disabled={busy}
            onClick={onConfirm}
          >
            Save anyway
          </button>
          <button className="button" disabled={busy} onClick={onEdit}>
            Edit time
          </button>
          <button className="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </dialog>
  );
}
