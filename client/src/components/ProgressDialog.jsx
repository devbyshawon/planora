import { useEffect, useMemo, useRef, useState } from "react";
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { X, History, ArrowUpRight } from "lucide-react";
import { api } from "../api.js";
import { asDate, dateKey } from "../calendar.js";
const duration = (minutes) => `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
export default function ProgressDialog({
  selected,
  view,
  weekStartsOn,
  categories,
  onOpenTask,
  onHistory,
  onClose,
}) {
  const dialog = useRef(null),
    [anchor, setAnchor] = useState(selected),
    [period, setPeriod] = useState(view),
    [category, setCategory] = useState(""),
    [data, setData] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [drill, setDrill] = useState(null),
    [limit, setLimit] = useState(50),
    [opening, setOpening] = useState(false);
  const range = useMemo(() => {
    const date = asDate(anchor);
    return period === "day"
      ? { from: anchor, to: anchor }
      : period === "week"
        ? {
            from: dateKey(startOfWeek(date, { weekStartsOn })),
            to: dateKey(endOfWeek(date, { weekStartsOn })),
          }
        : { from: dateKey(startOfMonth(date)), to: dateKey(endOfMonth(date)) };
  }, [anchor, period, weekStartsOn]);
  useEffect(() => {
    dialog.current.showModal();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setDrill(null);
    setLimit(50);
    api(
      `/insights/progress?${new URLSearchParams({ ...range, ...(category ? { category } : {}) })}`,
      { signal: controller.signal },
    )
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
  }, [range.from, range.to, category]);
  async function open(row) {
    setOpening(true);
    setError("");
    try {
      await onOpenTask(row.taskId);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setOpening(false);
    }
  }
  const rows =
    data?.tasks.filter(
      (row) =>
        !drill ||
        ((!drill.date || row.date === drill.date) &&
          (!drill.category || row.category === drill.category)),
    ) || [];
  return (
    <dialog
      className="planning-dialog progress-dialog"
      ref={dialog}
      onCancel={(e) => {
        e.preventDefault();
        if (!opening) onClose();
      }}
    >
      <header className="settings-header">
        <div>
          <span className="eyebrow">SEE HOW YOUR TIME ADDS UP</span>
          <h2>Progress summary</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Close progress summary"
          disabled={opening}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      <div className="planning-form">
        <div className="progress-controls">
          <label>
            Reference date
            <input
              type="date"
              value={anchor}
              onChange={(e) => {
                if (e.target.value) setAnchor(e.target.value);
              }}
            />
          </label>
          <label>
            Period
            <select
              aria-label="Progress period"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            >
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
            </select>
          </label>
          <label>
            Category
            <select
              aria-label="Progress category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="muted">
          {range.from} → {range.to}
        </p>
        {loading && <p role="status">Adding up your plans…</p>}
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        {data && !loading && (
          <>
            <div className="progress-metrics">
              {[
                ["Planned task slots", data.total.planned],
                ["Completed", data.total.completed],
                ["Moved to bucket", data.total.movedToBucket],
                ["Completion", `${data.total.completionPercentage}%`],
              ].map(([label, value]) => (
                <div key={label}>
                  <b>{value}</b>
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <div className="time-comparison">
              <div>
                <span>Planned time</span>
                <b>{duration(data.total.plannedMinutes)}</b>
              </div>
              <div>
                <span>Completed time</span>
                <b>{duration(data.total.completedMinutes)}</b>
              </div>
            </div>
            <small className="muted">
              A task planned on two different days counts once on each day.
              Overlapping task durations are added. Deleted tasks are excluded.
            </small>
            <div className="streak-row">
              <span>
                <b>{data.streak.best}</b> best streak in this period
              </span>
              <span>
                <b>{data.streak.current}</b> consecutive completed days
                {data.streak.through ? ` through ${data.streak.through}` : ""}
              </span>
            </div>
            <small className="muted">
              Streaks use ended days only. A day with no planned tasks breaks
              the streak.
            </small>
            {data.legacy && (
              <div className="alert warning">
                Older tasks use their saved schedule. Detailed movement history
                starts with Stage 4.
              </div>
            )}
            <h3>By category</h3>
            {!data.byCategory.length && (
              <p className="muted">No scheduled tasks in this range.</p>
            )}
            {data.byCategory.map((row) => (
              <button
                className="category-progress"
                key={row.id}
                onClick={() => {
                  setDrill({ category: row.id });
                  setLimit(50);
                }}
              >
                <div>
                  <i style={{ background: row.color }} />
                  <b>{row.name}</b>
                  <span>
                    {row.completed}/{row.planned} · {row.completionPercentage}%
                  </span>
                </div>
                <span className="progress-track">
                  <i
                    style={{
                      width: `${row.completionPercentage}%`,
                      background: row.color,
                    }}
                  />
                </span>
                <small>
                  {duration(row.completedMinutes)} completed /{" "}
                  {duration(row.plannedMinutes)} planned
                </small>
              </button>
            ))}
            <h3>Daily breakdown</h3>
            <div className="daily-breakdown">
              <div className="daily-breakdown-head">
                <span>Date</span>
                <span>Done / planned</span>
                <span>Time completed</span>
                <span>Bucket moves</span>
              </div>
              {data.daily.map((row) => (
                <button
                  key={row.date}
                  onClick={() => {
                    setDrill({ date: row.date });
                    setLimit(50);
                  }}
                >
                  <span>{row.date}</span>
                  <span>
                    {row.completed}/{row.planned}
                  </span>
                  <span>{duration(row.completedMinutes)}</span>
                  <span>{row.bucketMoves}</span>
                </button>
              ))}
            </div>
            <div className="results-heading">
              <h3>
                {drill?.date
                  ? `Tasks planned on ${drill.date}`
                  : drill?.category
                    ? "Tasks in this category"
                    : "Tasks behind the numbers"}
              </h3>
              {drill && (
                <button
                  className="text-button"
                  onClick={() => {
                    setDrill(null);
                    setLimit(50);
                  }}
                >
                  Show all
                </button>
              )}
            </div>
            {rows.slice(0, limit).map((row) => (
              <article
                key={`${row.taskId}-${row.date}`}
                className="progress-task-row"
              >
                <div>
                  <b>{row.title}</b>
                  <small>
                    {row.date} · {row.status.replaceAll("_", " ")} ·{" "}
                    {duration(row.durationMinutes)}
                    {row.bucketMoves
                      ? ` · ${row.bucketMoves} bucket move(s)`
                      : ""}
                  </small>
                </div>
                <button
                  className="icon-button"
                  aria-label={`View history of ${row.title}`}
                  onClick={() => onHistory(row.taskId)}
                >
                  <History size={17} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`Open current task ${row.title}`}
                  disabled={opening || row.deleted}
                  onClick={() => open(row)}
                >
                  <ArrowUpRight size={17} />
                </button>
              </article>
            ))}
            {rows.length > limit && (
              <button
                className="button"
                onClick={() => setLimit((v) => v + 50)}
              >
                Show 50 more
              </button>
            )}
          </>
        )}
      </div>
    </dialog>
  );
}
