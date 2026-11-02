import { useEffect, useRef, useState } from "react";
import { X, History, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "../api.js";
import { clock } from "../calendar.js";
const labels = {
  created: "Task created",
  history_started: "History tracking started",
  moved_to_bucket: "Moved to bucket",
  rescheduled: "Rescheduled",
  completed: "Marked completed",
  reopened: "Completion status changed",
  edited: "Task edited",
  deleted: "Task deleted",
  review_kept: "Reviewed: kept not completed",
  series_updated: "Recurring series updated",
  series_removed: "Removed by repeat rule change",
  series_deleted: "Recurring series deleted",
  timezone_changed: "Timezone changed",
};
export default function TaskHistoryDialog({
  taskId,
  use24,
  timeZone,
  onClose,
}) {
  const dialog = useRef(null),
    [page, setPage] = useState(1),
    [data, setData] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    dialog.current.showModal();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    api(`/tasks/${taskId}/history?page=${page}`, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((err) => {
        if (err.name !== "AbortError") setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [taskId, page]);
  function describe(value) {
    if (!value) return "";
    if (value.location === "bucket")
      return `Bucket list${value.date ? ` · previously ${value.date}` : ""}`;
    return `${value.date || ""} ${clock(value.startTime, use24)}–${clock(value.endTime, use24)} · ${(value.status || "").replaceAll("_", " ")}${value.timeZone && value.timeZone !== timeZone ? ` · ${value.timeZone}` : ""}`;
  }
  const stamp = (value) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  return (
    <dialog
      ref={dialog}
      className="planning-dialog history-dialog"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header className="settings-header">
        <div>
          <span className="eyebrow">EVERY STEP, KEPT IN VIEW</span>
          <h2>Task history</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Close task history"
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
        {loading && <p role="status">Loading history…</p>}
        {data && (
          <>
            <h3>{data.task.title}</h3>
            <p className="muted">
              Postponed {data.task.postponeCount} time(s).{" "}
              {data.task.originalSchedule?.date &&
                `First scheduled: ${data.task.originalSchedule.date}, ${clock(data.task.originalSchedule.startTime, use24)}–${clock(data.task.originalSchedule.endTime, use24)}.`}
            </p>
            {data.legacy && (
              <div className="alert warning">
                Detailed history starts with Stage 4. Earlier moves cannot be
                reconstructed; the existing postponement count is retained.
              </div>
            )}
            {!loading && !data.events.length && (
              <p className="muted">
                No detailed events have been recorded yet.
              </p>
            )}
            {data.events.map((event) => (
              <article className="history-event" key={event._id}>
                <span className="history-symbol">
                  <History size={15} />
                </span>
                <div>
                  <b>{labels[event.type] || event.type}</b>
                  <time>{stamp(event.at)}</time>
                  {event.from && (
                    <p>
                      <span>From</span>
                      {describe(event.from)}
                    </p>
                  )}
                  {event.to && (
                    <p>
                      <span>To</span>
                      {describe(event.to)}
                    </p>
                  )}
                  {event.reviewDate && (
                    <small className="muted">
                      Review for {event.reviewDate}
                    </small>
                  )}
                </div>
              </article>
            ))}
            <div className="search-pagination">
              <button
                className="button"
                disabled={loading || page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft size={16} />
                Newer
              </button>
              <span className="muted">Page {page}</span>
              <button
                className="button"
                disabled={loading || page * data.pageSize >= data.total}
                onClick={() => setPage((p) => p + 1)}
              >
                Older
                <ChevronRight size={16} />
              </button>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
