import { useEffect, useMemo, useState, useRef } from "react";
import { addDays, addMonths, addWeeks, format } from "date-fns";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  Archive,
  LogOut,
  Sun,
  Moon,
  CheckCircle2,
  Clock,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Repeat2,
  Files,
  BarChart3,
  ClipboardCheck,
  ShieldCheck,
  Cloud,
  Download,
} from "lucide-react";
import { api } from "./api.js";
import { asDate, dateKey, todayIn, visibleDays } from "./calendar.js";
import AuthScreen from "./components/AuthScreen.jsx";
import Calendar from "./components/Calendar.jsx";
import TaskDialog from "./components/TaskDialog.jsx";
import SettingsDialog from "./components/SettingsDialog.jsx";
import ResetPasswordScreen from "./components/ResetPasswordScreen.jsx";
import GlobalSearchDialog from "./components/GlobalSearchDialog.jsx";
import PlanningLibraryDialog from "./components/PlanningLibraryDialog.jsx";
import ReviewDialog from "./components/ReviewDialog.jsx";
import ProgressDialog from "./components/ProgressDialog.jsx";
import TaskHistoryDialog from "./components/TaskHistoryDialog.jsx";
import DropConflictDialog from "./components/DropConflictDialog.jsx";
import ExportDialog from "./components/ExportDialog.jsx";
import GoogleCalendarDialog from "./components/GoogleCalendarDialog.jsx";
import AdminDialog from "./components/AdminDialog.jsx";
import VerificationScreen from "./components/VerificationScreen.jsx";
import MiniMonth from "./components/MiniMonth.jsx";
import useBrowserReminders from "./useBrowserReminders.js";
import { startTaskDrag } from "./drag.js";
import { minutes } from "../../shared/calendar.js";
import { slotPreset } from "../../shared/slots.js";
import { minuteClock } from "./calendar.js";
export default function App() {
  const [user, setUser] = useState(null),
    [checking, setChecking] = useState(true),
    [initialError, setInitialError] = useState(""),
    [authMode, setAuthMode] = useState("register"),
    [verificationToken, setVerificationToken] = useState(
      () =>
        new URLSearchParams(window.location.hash.slice(1)).get(
          "verify-email",
        ) || "",
    ),
    [resetToken, setResetToken] = useState(
      () =>
        new URLSearchParams(window.location.hash.slice(1)).get(
          "reset-password",
        ) || "",
    );
  useEffect(() => {
    if (resetToken || verificationToken)
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
  }, [resetToken, verificationToken]);
  useEffect(() => {
    const readRecoveryLink = () => {
      const token = new URLSearchParams(window.location.hash.slice(1)).get(
        "reset-password",
      );
      if (token) setResetToken(token);
      const verification = new URLSearchParams(
        window.location.hash.slice(1),
      ).get("verify-email");
      if (verification) setVerificationToken(verification);
    };
    window.addEventListener("hashchange", readRecoveryLink);
    return () => window.removeEventListener("hashchange", readRecoveryLink);
  }, []);
  useEffect(() => {
    if (resetToken || verificationToken) {
      setChecking(false);
      return;
    }
    let current = true;
    api("/auth/me")
      .then((data) => {
        if (current) setUser(data.user);
      })
      .catch((err) => {
        if (current && err.status !== 401) setInitialError(err.message);
      })
      .finally(() => {
        if (current) setChecking(false);
      });
    return () => {
      current = false;
    };
  }, []);
  if (verificationToken)
    return (
      <VerificationScreen
        token={verificationToken}
        onBack={() => {
          setVerificationToken("");
          setAuthMode("login");
          setUser(null);
          setChecking(false);
        }}
      />
    );
  if (resetToken)
    return (
      <ResetPasswordScreen
        token={resetToken}
        onBack={() => {
          setResetToken("");
          setUser(null);
          setChecking(false);
          setAuthMode("login");
          setInitialError("");
        }}
      />
    );
  if (checking)
    return <div className="loading-screen">Opening your planning space…</div>;
  if (initialError)
    return (
      <div className="loading-screen">
        <h2>Planora needs its backend.</h2>
        <p>{initialError}</p>
        <p>
          Start both servers with <code>npm run dev</code>, then reload.
        </p>
        <button
          className="button primary"
          onClick={() => window.location.reload()}
        >
          Try again
        </button>
      </div>
    );
  return user ? (
    <Planner
      key={user.id}
      user={user}
      onUserUpdated={setUser}
      onLogout={() => {
        setUser(null);
        setAuthMode("login");
      }}
    />
  ) : (
    <AuthScreen onAuth={setUser} initialMode={authMode} />
  );
}
function Planner({ user, onLogout, onUserUpdated: commitUser }) {
  function onUserUpdated(next) {
    commitUser(next);
    try {
      localStorage.setItem(
        "planora-account-updated",
        `${next.id}:${Date.now()}:${Math.random()}`,
      );
    } catch {}
  }
  useEffect(() => {
    let current = true;
    async function refreshAccount() {
      try {
        const data = await api("/auth/me");
        if (current) commitUser(data.user);
      } catch (error) {
        if (current && [401, 403].includes(error.status)) onLogout();
      }
    }
    const changed = (event) => {
      if (!event || event.key === "planora-account-updated") refreshAccount();
    };
    const timer = setInterval(refreshAccount, 60000);
    window.addEventListener("focus", refreshAccount);
    window.addEventListener("storage", changed);
    return () => {
      current = false;
      clearInterval(timer);
      window.removeEventListener("focus", refreshAccount);
      window.removeEventListener("storage", changed);
    };
  }, [user.id]);
  const [, setClockTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setClockTick((v) => v + 1), 60000);
    return () => clearInterval(timer);
  }, []);
  const today = todayIn(user.timeZone);
  const yesterday = dateKey(addDays(asDate(today), -1));
  const [selected, setSelected] = useState(today),
    [view, setView] = useState(user.preferences.defaultView),
    [tasks, setTasks] = useState([]),
    [bucket, setBucket] = useState([]),
    [version, setVersion] = useState(0),
    [modal, setModal] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(""),
    [priority, setPriority] = useState("all"),
    [categories, setCategories] = useState(user.categories.map((c) => c.id)),
    [sidebar, setSidebar] = useState(() => window.innerWidth > 600),
    [bucketOpen, setBucketOpen] = useState(false),
    [settingsOpen, setSettingsOpen] = useState(false),
    [adminOpen, setAdminOpen] = useState(false),
    [globalSearchOpen, setGlobalSearchOpen] = useState(false),
    [libraryKind, setLibraryKind] = useState(null),
    [scheduleWarnings, setScheduleWarnings] = useState([]),
    [planningNotice, setPlanningNotice] = useState(""),
    [focusTask, setFocusTask] = useState(null),
    [reviewDate, setReviewDate] = useState(null),
    [reviewCount, setReviewCount] = useState(0),
    [progressOpen, setProgressOpen] = useState(false),
    [exportOpen, setExportOpen] = useState(false),
    [googleCallback, setGoogleCallback] = useState(() =>
      new URLSearchParams(window.location.search).get("google"),
    ),
    [googleOpen, setGoogleOpen] = useState(() =>
      new URLSearchParams(window.location.search).has("google"),
    ),
    [historyId, setHistoryId] = useState(null),
    [bucketTrayOpen, setBucketTrayOpen] = useState(false),
    [pendingDrop, setPendingDrop] = useState(null),
    [bucketSort, setBucketSort] = useState("priority"),
    [bucketAge, setBucketAge] = useState("all");
  useEffect(() => {
    if (googleCallback) {
      const url = new URL(window.location.href);
      url.searchParams.delete("google");
      window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    }
  }, [googleCallback]);
  const reminderMessage = useBrowserReminders(user, {
    onSessionExpired: onLogout,
    onOpen: (id) => openTaskById(id).catch((error) => setError(error.message)),
  });
  const dark = user.preferences.theme === "dark",
    use24 = user.preferences.timeFormat === "24h",
    guides = user.preferences.showHourGuides;
  const knownCategories = useRef(user.categories.map((c) => c.id));
  const categoryIds = user.categories.map((c) => c.id).join("|");
  useEffect(() => {
    const ids = user.categories.map((c) => c.id),
      previousIds = knownCategories.current;
    setCategories((current) => [
      ...current.filter((id) => ids.includes(id)),
      ...ids.filter((id) => !previousIds.includes(id)),
    ]);
    knownCategories.current = ids;
  }, [categoryIds]);
  useEffect(() => {
    setView(user.preferences.defaultView);
  }, [user.preferences.defaultView]);
  const days = useMemo(
    () => visibleDays(selected, view, user.preferences.weekStartsOn),
    [selected, view, user.preferences.weekStartsOn],
  );
  const from = dateKey(days[0]),
    to = dateKey(days.at(-1));
  useEffect(() => {
    const narrow = window.matchMedia("(max-width: 600px)");
    const updateSidebar = (event) => setSidebar(!event.matches);
    narrow.addEventListener("change", updateSidebar);
    return () => narrow.removeEventListener("change", updateSidebar);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    return () => {
      document.documentElement.removeAttribute("data-theme");
    };
  }, [dark]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    Promise.all([
      api(`/tasks?from=${from}&to=${to}`, { signal: controller.signal }),
      api("/tasks?location=bucket", { signal: controller.signal }),
    ])
      .then(([scheduled, pending]) => {
        if (!controller.signal.aborted) {
          setTasks(scheduled.tasks);
          setBucket(pending.tasks);
          setScheduleWarnings(scheduled.warnings || []);
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          if (err.status === 401) onLogout();
          else setError(err.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [from, to, version, user.timeZone]);
  useEffect(() => {
    const controller = new AbortController();
    api(`/insights/review?date=${yesterday}`, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setReviewCount(data.tasks.length);
      })
      .catch((err) => {
        if (err.name !== "AbortError") setReviewCount(0);
      });
    return () => controller.abort();
  }, [yesterday, version, user.timeZone]);
  const matches = (task) =>
    categories.includes(task.category) &&
    (priority === "all" || task.priority === priority) &&
    `${task.title} ${task.notes} ${user.categories.find((c) => c.id === task.category)?.name || ""}`
      .toLowerCase()
      .includes(search.toLowerCase());
  const filtered = tasks.filter(matches),
    bucketFiltered = bucket
      .filter(matches)
      .filter(
        (task) =>
          bucketAge === "all" ||
          Date.now() -
            new Date(task.bucketAddedAt || task.createdAt).getTime() >=
            Number(bucketAge) * 86400000,
      )
      .sort((a, b) => {
        if (bucketSort === "newest")
          return (
            new Date(b.bucketAddedAt || b.createdAt) -
            new Date(a.bucketAddedAt || a.createdAt)
          );
        if (bucketSort === "oldest")
          return (
            new Date(a.bucketAddedAt || a.createdAt) -
            new Date(b.bucketAddedAt || b.createdAt)
          );
        if (bucketSort === "original")
          return (a.originalSchedule?.date || a.date || "9999").localeCompare(
            b.originalSchedule?.date || b.date || "9999",
          );
        if (bucketSort === "postponed")
          return b.postponeCount - a.postponeCount;
        return (
          { high: 0, medium: 1, low: 2 }[a.priority] -
          { high: 0, medium: 1, low: 2 }[b.priority]
        );
      });
  const summaryTasks = filtered.filter(
    (t) => view !== "month" || t.date.slice(0, 7) === selected.slice(0, 7),
  );
  const completed = summaryTasks.filter((t) => t.status === "completed"),
    planned = summaryTasks.reduce((sum, t) => sum + t.durationMinutes, 0),
    completedTime = completed.reduce((sum, t) => sum + t.durationMinutes, 0);
  function move(direction) {
    const fn =
      view === "day" ? addDays : view === "week" ? addWeeks : addMonths;
    setSelected(dateKey(fn(asDate(selected), direction)));
  }
  function openDay(value) {
    setSelected(value);
    setView("day");
  }
  function create(preset = {}) {
    setModal({ date: selected, ...preset });
  }
  function planningSaved(result) {
    setVersion((v) => v + 1);
    if (result?.warnings?.length)
      setPlanningNotice(
        result.warnings.map((w) => `${w.date || ""} ${w.message}`).join(" "),
      );
  }
  async function openTaskById(id) {
    const data = await api(`/tasks/${id}`);
    openSearchResult(data.task);
  }
  async function toggleCompletion(task) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api(`/tasks/${task._id}`, {
        method: "PATCH",
        body: {
          status: task.status === "completed" ? "scheduled" : "completed",
          expectedUpdatedAt: task.updatedAt,
        },
      });
      planningSaved();
    } catch (err) {
      setError(err.message);
      setVersion((v) => v + 1);
    } finally {
      setBusy(false);
    }
  }
  async function applyDrop(pending, allowOverlap = false) {
    setBusy(true);
    setError("");
    try {
      await api(`/tasks/${pending.task._id}`, {
        method: "PATCH",
        body: { ...pending.body, allowOverlap },
      });
      setPendingDrop(null);
      setFocusTask({
        ...pending.task,
        ...pending.body,
        startMinute: minutes(pending.body.startTime),
      });
      planningSaved();
    } catch (err) {
      if (err.code === "OVERLAP")
        setPendingDrop({ ...pending, conflicts: err.details });
      else {
        setPendingDrop(null);
        setError(err.message);
        setVersion((v) => v + 1);
      }
    } finally {
      setBusy(false);
    }
  }
  function dropTask(id, date, minute) {
    if (busy) return;
    const task = [...tasks, ...bucket].find((item) => item._id === id);
    if (!task) {
      setError("That task is no longer loaded. Reload the view and try again.");
      return;
    }
    if (!task.startTime || !task.endTime) {
      setModal({ ...task, location: "calendar", date, ...slotPreset(minute ?? 540) });
      return;
    }
    const length = minutes(task.endTime) - minutes(task.startTime);
    const start =
      minute === undefined
        ? task.startTime
          ? minutes(task.startTime)
          : 555
        : Math.max(0, minute);
    if (start + length > 1439) {
      setError(
        "This task will not fit before midnight. Drop it earlier or choose its times in the editor.",
      );
      return;
    }
    applyDrop({
      task,
      body: {
        location: "calendar",
        date,
        startTime: minuteClock(start),
        endTime: minuteClock(start + length),
        expectedUpdatedAt: task.updatedAt,
      },
    });
  }
  async function editSeries(id) {
    const { series } = await api(`/series/${id}`);
    setModal({
      seriesEditorId: series._id,
      title: series.title,
      notes: series.notes,
      category: series.category,
      priority: series.priority,
      date: series.startDate,
      startTime: series.startTime,
      endTime: series.endTime,
      recurrence: {
        frequency: series.frequency,
        weekdays: series.weekdays,
        endDate: series.endDate || "",
      },
    });
  }
  function useTemplate(template) {
    create({
      templateId: template._id,
      title: template.title,
      notes: template.notes,
      category: template.category,
      priority: template.priority,
      startTime: template.startTime,
      endTime: template.endTime,
    });
  }
  function openSearchResult(task) {
    setSearch("");
    setPriority("all");
    setCategories((current) =>
      current.includes(task.category) ? current : [...current, task.category],
    );
    if (task.location === "bucket") setBucketOpen(true);
    else {
      setSelected(task.date);
      setView("day");
      setBucketOpen(false);
      setFocusTask(task);
    }
    setModal(task);
  }
  async function saveQuickPreferences(values) {
    setBusy(true);
    setError("");
    try {
      const data = await api("/account/settings", {
        method: "PATCH",
        body: values,
      });
      onUserUpdated(data.user);
    } catch (err) {
      if (err.status === 401) onLogout();
      else setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    try {
      await api("/auth/logout", { method: "POST" });
      onLogout();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  const heading =
    view === "day"
      ? format(asDate(selected), "EEEE, MMMM d")
      : format(asDate(selected), "MMMM yyyy");
  return (
    <div className="planner">
      <header className="topbar">
        <div className="brand">
          <span className="brand-icon">
            <CalendarDays size={23} />
          </span>
          Planora<span className="starter-badge">v0.8.1</span>
        </div>
        <div className="topbar-right">
          <span className="timezone-label">{user.timeZone}</span>
          <button
            className="icon-button"
            title={dark ? "Light mode" : "Dark mode"}
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
            disabled={busy}
            onClick={() =>
              saveQuickPreferences({ theme: dark ? "light" : "dark" })
            }
          >
            {dark ? <Sun size={19} /> : <Moon size={19} />}
          </button>
          <span className="avatar" title={user.name}>
            {user.name.slice(0, 1).toUpperCase()}
          </span>
          <button
            className="icon-button"
            aria-label="Open settings"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings size={19} />
          </button>
          <button
            className="icon-button"
            aria-label="Sign out"
            disabled={busy}
            onClick={logout}
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>
      <div className={`planner-body ${sidebar ? "" : "sidebar-hidden"}`}>
        <aside className="sidebar">
          <button
            className="button primary create-button"
            onClick={() => create()}
          >
            <Plus size={20} />
            Create task
          </button>
          <div className="sidebar-label">YOUR SPACE</div>
          <button
            className={`nav-item ${!bucketOpen ? "active" : ""}`}
            onClick={() => setBucketOpen(false)}
          >
            <CalendarDays size={19} />
            My calendar
          </button>
          <button
            className={`nav-item ${bucketOpen ? "active" : ""}`}
            onClick={() => setBucketOpen(true)}
          >
            <Archive size={19} />
            Bucket list<span className="count">{bucket.length}</span>
          </button>
          <button
            className="nav-item"
            onClick={() => setGlobalSearchOpen(true)}
          >
            <Search size={18} />
            Search all tasks
          </button>
          <button className="nav-item" onClick={() => setLibraryKind("series")}>
            <Repeat2 size={18} />
            Recurring tasks
          </button>
          <button
            className="nav-item"
            onClick={() => setLibraryKind("templates")}
          >
            <Files size={18} />
            Task templates
          </button>
          <button
            className="nav-item"
            onClick={() =>
              setReviewDate(selected < today ? selected : yesterday)
            }
          >
            <ClipboardCheck size={18} />
            Daily review
            {reviewCount > 0 && <span className="count">{reviewCount}</span>}
          </button>
          <button className="nav-item" onClick={() => setProgressOpen(true)}>
            <BarChart3 size={18} />
            Progress summary
          </button>
          <button className="nav-item" onClick={() => setExportOpen(true)}>
            <Download size={18} />
            Download schedule
          </button>
          <button className="nav-item" onClick={() => setGoogleOpen(true)}>
            <Cloud size={18} />
            Google Calendar
          </button>
          {user.role === "admin" && (
            <button className="nav-item" onClick={() => setAdminOpen(true)}>
              <ShieldCheck size={18} />
              Administration
            </button>
          )}
          <div className="sidebar-section">
            <MiniMonth selected={selected} today={today} weekStartsOn={user.preferences.weekStartsOn} onSelect={(date) => { setSelected(date); setBucketOpen(false); }} />
            <label className="sidebar-label" htmlFor="jump-date">
              JUMP TO DATE
            </label>
            <input
              id="jump-date"
              type="date"
              value={selected}
              onChange={(e) => {
                if (e.target.value) setSelected(e.target.value);
              }}
            />
            <button
              className="text-button tomorrow"
              onClick={() => {
                setSelected(dateKey(addDays(asDate(today), 1)));
                setBucketOpen(false);
              }}
            >
              Plan tomorrow →
            </button>
          </div>
          <div className="sidebar-section">
            <div className="sidebar-label">MY CATEGORIES</div>
            {user.categories.map((c) => (
              <label className="category-toggle" key={c.id}>
                <input
                  type="checkbox"
                  checked={categories.includes(c.id)}
                  onChange={() =>
                    setCategories((current) =>
                      current.includes(c.id)
                        ? current.filter((id) => id !== c.id)
                        : [...current, c.id],
                    )
                  }
                  style={{ accentColor: c.color }}
                />
                <span>{c.name}</span>
                <i style={{ background: c.color }} />
              </label>
            ))}
          </div>
          <div className="sidebar-section">
            <div className="sidebar-label">DISPLAY</div>
            <label className="setting">
              <input
                type="checkbox"
                checked={use24}
                disabled={busy}
                onChange={(e) =>
                  saveQuickPreferences({
                    timeFormat: e.target.checked ? "24h" : "12h",
                  })
                }
              />
              24-hour clock
            </label>
            <label className="setting">
              <input
                type="checkbox"
                checked={guides}
                disabled={busy}
                onChange={(e) =>
                  saveQuickPreferences({ showHourGuides: e.target.checked })
                }
              />
              Slot boundaries
            </label>
            <small className="muted">
              Display preferences are saved to your account.
            </small>
          </div>
          <div className="sidebar-bottom">
            <span className="eyebrow">ONE THING AT A TIME</span>
            <p>
              A little progress
              <br />
              is still progress.
            </p>
            <span className="muted">Planora · v0.8.1</span>
          </div>
        </aside>
        <main className="workspace">
          <div className="workspace-title">
            <div>
              <div className="eyebrow">YOUR DAY, YOUR TIME</div>
              <h1>
                {bucketOpen ? "Good things, for later." : heading}
                <span className="title-dot">.</span>
              </h1>
            </div>
            <button
              className="icon-button"
              aria-label={sidebar ? "Hide sidebar" : "Show sidebar"}
              onClick={() => setSidebar(!sidebar)}
            >
              {sidebar ? (
                <PanelLeftClose size={21} />
              ) : (
                <PanelLeftOpen size={21} />
              )}
            </button>
          </div>
          <div className="summary-row">
            <div>
              <CheckCircle2 size={19} />
              <b>
                {completed.length}
                <span> / {summaryTasks.length}</span>
              </b>
              <span>tasks completed</span>
            </div>
            <div>
              <Clock size={19} />
              <b>
                {Math.floor(planned / 60)}h {planned % 60}m
              </b>
              <span>planned · {completedTime}m completed</span>
            </div>
            <div className="summary-progress">
              <span>
                {summaryTasks.length
                  ? Math.round((completed.length / summaryTasks.length) * 100)
                  : 0}
                % complete
              </span>
              <div>
                <i
                  style={{
                    width: `${summaryTasks.length ? (completed.length / summaryTasks.length) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          </div>
          {reviewCount > 0 && (
            <div className="review-reminder">
              <span>
                {reviewCount} unfinished task(s) from {yesterday} need a
                decision.
              </span>
              <button
                className="text-button"
                onClick={() => setReviewDate(yesterday)}
              >
                Review yesterday
              </button>
            </div>
          )}
          <div className="toolbar">
            <div className="date-controls">
              <button
                className="button"
                onClick={() => {
                  setSelected(today);
                  setBucketOpen(false);
                }}
              >
                Today
              </button>
              <button
                className="icon-button"
                aria-label="Previous period"
                onClick={() => move(-1)}
              >
                <ChevronLeft size={20} />
              </button>
              <button
                className="icon-button"
                aria-label="Next period"
                onClick={() => move(1)}
              >
                <ChevronRight size={20} />
              </button>
            </div>
            <div className="search">
              <Search size={17} />
              <input
                aria-label="Search tasks in the visible period or bucket list"
                placeholder="Search this view…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className="priority-filter"
              aria-label="Filter priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              <option value="all">All priorities</option>
              <option value="high">High priority</option>
              <option value="medium">Medium priority</option>
              <option value="low">Low priority</option>
            </select>
            {!bucketOpen && (
              <div className="view-switch" aria-label="Calendar view">
                {["day", "week", "month"].map((value) => (
                  <button
                    key={value}
                    aria-pressed={view === value}
                    className={view === value ? "selected" : ""}
                    onClick={() => setView(value)}
                  >
                    {value[0].toUpperCase() + value.slice(1)}
                  </button>
                ))}
              </div>
            )}
          </div>
          {!bucketOpen && (
            <button
              className={`button tray-toggle ${bucketTrayOpen ? "tray-active" : ""}`}
              onClick={() => setBucketTrayOpen(!bucketTrayOpen)}
            >
              <Archive size={16} />
              Bucket tray
            </button>
          )}
          {error && (
            <div className="alert error" role="alert">
              {error}{" "}
              <button
                className="text-button"
                onClick={() => setVersion((v) => v + 1)}
              >
                Retry
              </button>
            </div>
          )}
          {loading && (
            <div className="loading-bar" role="status">
              Loading your tasks…
            </div>
          )}
          {planningNotice && (
            <div className="alert warning">
              {planningNotice}{" "}
              <button
                className="text-button"
                onClick={() => setPlanningNotice("")}
              >
                Dismiss
              </button>
            </div>
          )}
          {scheduleWarnings.length > 0 && (
            <div className="alert warning schedule-warnings" role="status">
              {scheduleWarnings.slice(0, 3).map((warning, index) => (
                <p key={index}>
                  {warning.date || warning.dates?.slice(0, 3).join(", ")}{" "}
                  {warning.message}
                </p>
              ))}
              {scheduleWarnings.length > 3 && (
                <small>
                  {scheduleWarnings.length - 3} more schedule warning(s) in this
                  range.
                </small>
              )}
            </div>
          )}
          {bucketOpen ? (
            <section className="bucket-view">
              <div className="bucket-intro">
                <p>
                  A place for unfinished tasks and ideas. Give one a new time
                  when you’re ready.
                </p>
                <button
                  className="button"
                  onClick={() => create({ location: "bucket" })}
                >
                  <Plus size={17} />
                  Add an idea
                </button>
              </div>
              <div className="bucket-options">
                <label>
                  Sort bucket list
                  <select
                    aria-label="Sort bucket list"
                    value={bucketSort}
                    onChange={(e) => setBucketSort(e.target.value)}
                  >
                    <option value="priority">Priority</option>
                    <option value="oldest">Oldest added</option>
                    <option value="newest">Newest added</option>
                    <option value="original">Original date</option>
                    <option value="postponed">Most postponed</option>
                  </select>
                </label>
                <label>
                  Bucket age
                  <select
                    aria-label="Bucket age"
                    value={bucketAge}
                    onChange={(e) => setBucketAge(e.target.value)}
                  >
                    <option value="all">Any age</option>
                    <option value="7">7+ days</option>
                    <option value="30">30+ days</option>
                  </select>
                </label>
              </div>
              {!bucketFiltered.length ? (
                <div className="empty-state">
                  <Archive size={34} />
                  <h2>
                    {bucket.length
                      ? "No matching tasks"
                      : "A little breathing room."}
                  </h2>
                  <p>
                    {bucket.length
                      ? "Try changing your search or filters."
                      : "Your bucket list is empty. Add an idea, or move a task here from its editor."}
                  </p>
                </div>
              ) : (
                <div className="bucket-grid">
                  {bucketFiltered.map((task) => (
                    <button
                      className="bucket-card"
                      draggable
                      onDragStart={(event) => startTaskDrag(event, task)}
                      key={task._id}
                      onClick={() => setModal(task)}
                    >
                      <span
                        className="category-chip"
                        style={{
                          color: user.categories.find(
                            (c) => c.id === task.category,
                          )?.color,
                        }}
                      >
                        {user.categories.find((c) => c.id === task.category)
                          ?.name || "Category"}{" "}
                        <span>· {task.priority}</span>
                      </span>
                      <h3>{task.title}</h3>
                      <p>{task.notes || "No notes yet."}</p>
                      <footer>
                        <span>
                          {task.originalSchedule?.date
                            ? `From ${task.originalSchedule.date}`
                            : "Unscheduled idea"}{" "}
                          · Postponed {task.postponeCount}×
                        </span>
                        <span>Open →</span>
                      </footer>
                    </button>
                  ))}
                </div>
              )}
            </section>
          ) : (
            <>
              {bucketTrayOpen && (
                <section
                  className="bucket-tray"
                  aria-label="Draggable bucket items"
                >
                  <div>
                    <b>Pending work</b>
                    <small>
                      Drag onto a slot to use its start time. Choose a duration for undated ideas.
                    </small>
                  </div>
                  <div className="bucket-tray-items">
                    {!bucketFiltered.length && (
                      <span className="muted">No matching bucket items.</span>
                    )}
                    {bucketFiltered.map((task) => (
                      <button
                        key={task._id}
                        className="bucket-tray-item"
                        draggable
                        onDragStart={(event) => startTaskDrag(event, task)}
                        onClick={() => setModal(task)}
                      >
                        <i
                          style={{
                            background: user.categories.find(
                              (c) => c.id === task.category,
                            )?.color,
                          }}
                        />
                        {task.title}
                      </button>
                    ))}
                  </div>
                </section>
              )}
              <Calendar
                view={view}
                days={days}
                selected={selected}
                today={today}
                tasks={filtered}
                onOpen={setModal}
                onCreate={create}
                onDay={openDay}
                use24={use24}
                showGuides={guides}
                categories={user.categories}
                focusTask={focusTask}
                onDropTask={dropTask}
                onToggleCompletion={toggleCompletion}
              />
            </>
          )}
          {reminderMessage && (
            <p className="reminder-runtime" role="status">
              {reminderMessage}
            </p>
          )}
          <div className="workspace-foot">
            <span>
              {bucketOpen
                ? "Filter or sort your pending work."
                : "Click to plan. Drag a task to move it."}
            </span>
            <span>{user.name.split(" ")[0]}’s personal space</span>
          </div>
        </main>
      </div>
      {modal && (
        <TaskDialog
          key={
            modal.seriesEditorId || modal._id || modal.templateId || "new-task"
          }
          task={modal}
          categories={user.categories}
          today={selected}
          use24={use24}
          onClose={() => setModal(null)}
          onSaved={planningSaved}
          onEditSeries={editSeries}
          onHistory={setHistoryId}
        />
      )}
      {adminOpen && user.role === "admin" && (
        <AdminDialog user={user} onClose={() => setAdminOpen(false)} />
      )}
      {settingsOpen && (
        <SettingsDialog
          user={user}
          onUserUpdated={onUserUpdated}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {globalSearchOpen && (
        <GlobalSearchDialog
          categories={user.categories}
          selected={selected}
          use24={use24}
          onOpen={openSearchResult}
          onClose={() => setGlobalSearchOpen(false)}
        />
      )}
      {libraryKind && (
        <PlanningLibraryDialog
          key={libraryKind}
          kind={libraryKind}
          categories={user.categories}
          use24={use24}
          onUse={useTemplate}
          onEditSeries={editSeries}
          onNewSeries={() =>
            create({
              recurrence: {
                frequency: "daily",
                weekdays: [1, 2, 3, 4, 5],
                endDate: "",
              },
            })
          }
          onSaved={planningSaved}
          onClose={() => setLibraryKind(null)}
        />
      )}
      {reviewDate && (
        <ReviewDialog
          date={reviewDate}
          yesterday={yesterday}
          use24={use24}
          onSaved={planningSaved}
          onClose={() => setReviewDate(null)}
        />
      )}
      {progressOpen && (
        <ProgressDialog
          selected={selected}
          view={view}
          weekStartsOn={user.preferences.weekStartsOn}
          categories={user.categories}
          onOpenTask={openTaskById}
          onHistory={setHistoryId}
          onClose={() => setProgressOpen(false)}
        />
      )}
      {exportOpen && (
        <ExportDialog
          selected={selected}
          view={view}
          user={user}
          onClose={() => setExportOpen(false)}
        />
      )}
      {googleOpen && (
        <GoogleCalendarDialog
          selected={selected}
          view={view}
          user={user}
          callback={googleCallback}
          onClose={() => {
            setGoogleOpen(false);
            setGoogleCallback(null);
          }}
        />
      )}
      {historyId && (
        <TaskHistoryDialog
          key={historyId}
          taskId={historyId}
          use24={use24}
          timeZone={user.timeZone}
          onClose={() => setHistoryId(null)}
        />
      )}
      {pendingDrop && (
        <DropConflictDialog
          pending={pendingDrop}
          use24={use24}
          busy={busy}
          onConfirm={() => applyDrop(pendingDrop, true)}
          onEdit={() => {
            setModal({ ...pendingDrop.task, ...pendingDrop.body });
            setPendingDrop(null);
          }}
          onClose={() => setPendingDrop(null)}
        />
      )}
    </div>
  );
}
