import { useEffect, useRef, useState } from "react";
import { Search, X, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "../api.js";
import { clock } from "../calendar.js";
export default function GlobalSearchDialog({
  categories,
  selected,
  use24,
  onOpen,
  onClose,
}) {
  const dialog = useRef(null),
    request = useRef(null),
    year = selected.slice(0, 4);
  const [filters, setFilters] = useState({
      q: "",
      from: `${year}-01-01`,
      to: `${year}-12-31`,
      category: "",
      priority: "",
      status: "",
      location: "all",
    }),
    [result, setResult] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    dialog.current.showModal();
    return () => request.current?.abort();
  }, []);
  function change(key, value) {
    setFilters({ ...filters, [key]: value });
    setResult(null);
  }
  async function search(event, page = 1) {
    event?.preventDefault();
    request.current?.abort();
    const current = new AbortController();
    request.current = current;
    setBusy(true);
    setError("");
    try {
      const query = new URLSearchParams(
        Object.fromEntries(
          Object.entries({ ...filters, page: String(page) }).filter(
            ([, v]) => v !== "",
          ),
        ),
      );
      const data = await api(`/tasks/search?${query}`, {
        signal: current.signal,
      });
      if (!current.signal.aborted) setResult(data);
    } catch (err) {
      if (err.name !== "AbortError") setError(err.message);
    } finally {
      if (!current.signal.aborted) setBusy(false);
    }
  }
  return (
    <dialog
      className="planning-dialog search-dialog"
      ref={dialog}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header className="settings-header">
        <div>
          <span className="eyebrow">FIND YOUR NEXT STEP</span>
          <h2>Search all tasks</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Close global search"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      <form className="planning-form" onSubmit={search}>
        <label>
          Search title, notes, or category
          <input
            autoFocus
            maxLength={200}
            value={filters.q}
            onChange={(e) => change("q", e.target.value)}
            placeholder="Paper reading, gym, research…"
          />
        </label>
        <div className="field-row">
          <label>
            From date
            <input
              type="date"
              required
              value={filters.from}
              onChange={(e) => change("from", e.target.value)}
            />
          </label>
          <label>
            To date
            <input
              type="date"
              required
              value={filters.to}
              onChange={(e) => change("to", e.target.value)}
            />
          </label>
        </div>
        <div className="search-filter-grid">
          <label>
            Category
            <select
              aria-label="Search category"
              value={filters.category}
              onChange={(e) => change("category", e.target.value)}
            >
              <option value="">All categories</option>
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
              aria-label="Search priority"
              value={filters.priority}
              onChange={(e) => change("priority", e.target.value)}
            >
              <option value="">All priorities</option>
              {["low", "medium", "high"].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select
              aria-label="Search status"
              value={filters.status}
              onChange={(e) => change("status", e.target.value)}
            >
              <option value="">All statuses</option>
              <option value="scheduled">Scheduled</option>
              <option value="completed">Completed</option>
              <option value="not_completed">Not completed</option>
            </select>
          </label>
          <label>
            Location
            <select
              aria-label="Search location"
              value={filters.location}
              onChange={(e) => change("location", e.target.value)}
            >
              <option value="all">All tasks</option>
              <option value="calendar">Calendar</option>
              <option value="bucket">Bucket list</option>
            </select>
          </label>
        </div>
        <small className="muted">
          Search up to 366 days at a time. Recurring occurrences are generated
          in that range. Bucket items are included regardless of date.
        </small>
        <button className="button primary" disabled={busy}>
          <Search size={17} />
          {busy ? "Searching…" : "Search tasks"}
        </button>
      </form>
      {error && (
        <div className="alert error planning-message" role="alert">
          {error}
        </div>
      )}
      {result && (
        <section className="search-results">
          <div className="results-heading">
            <b>{result.total} result(s)</b>
            <span>Page {result.page}</span>
          </div>
          {!result.tasks.length && (
            <p className="muted">
              No matching tasks. Try another date range or filter.
            </p>
          )}
          {result.tasks.map((task) => (
            <button
              className="search-result"
              key={task._id}
              onClick={() => {
                onOpen(task);
                onClose();
              }}
            >
              <i
                style={{
                  background: categories.find((c) => c.id === task.category)
                    ?.color,
                }}
              />
              <div>
                <b>{task.title}</b>
                <span>
                  {task.location === "bucket"
                    ? "Bucket list"
                    : `${task.date} · ${clock(task.startTime, use24)}–${clock(task.endTime, use24)}`}{" "}
                  · {task.priority} · {task.status.replaceAll("_", " ")}
                </span>
                <small>{task.notes}</small>
              </div>
              <span>Open →</span>
            </button>
          ))}
          {result.warnings?.length > 0 && (
            <p className="muted">
              {result.warnings.length} recurring schedule warning(s). Open the
              matching date in the calendar to review them.
            </p>
          )}
          <div className="search-pagination">
            <button
              className="button"
              disabled={busy || result.page === 1}
              onClick={() => search(null, result.page - 1)}
            >
              <ChevronLeft size={16} />
              Previous
            </button>
            <button
              className="button"
              disabled={busy || result.page * result.pageSize >= result.total}
              onClick={() => search(null, result.page + 1)}
            >
              Next
              <ChevronRight size={16} />
            </button>
          </div>
        </section>
      )}
    </dialog>
  );
}
