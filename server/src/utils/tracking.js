export function snapshot(task) {
  if (!task) return undefined;
  return Object.fromEntries(
    [
      "date",
      "startTime",
      "endTime",
      "durationMinutes",
      "location",
      "status",
      "category",
      "title",
      "priority",
      "timeZone",
    ]
      .filter((key) => task[key] !== undefined)
      .map((key) => [key, task[key]]),
  );
}
function fallbackPlan(task) {
  if (
    !task?.date ||
    !Number.isFinite(task.durationMinutes) ||
    task.durationMinutes <= 0
  )
    return [];
  return [
    {
      date: task.date,
      startTime: task.startTime,
      endTime: task.endTime,
      durationMinutes: task.durationMinutes,
      category: task.category,
      title: task.title,
      status: task.deletedAt
        ? "deleted"
        : task.location === "bucket"
          ? "moved_to_bucket"
          : task.status,
      bucketMoves: task.location === "bucket" ? 1 : 0,
      legacy: true,
    },
  ];
}
export function plansFor(task) {
  return task?.plans?.length
    ? task.plans.map((p) => ({ ...p }))
    : fallbackPlan(task);
}
// One ledger entry per task/date. History retains every transition, including
// repeated moves on the same date, while the ledger describes its latest outcome.
export function trackChange(previous, next, type, at = new Date(), reviewDate) {
  const plans = plansFor(previous),
    appendEvents = [];
  if (next.deletedAt) for (const plan of plans) plan.status = "deleted";
  if (previous && !previous.history?.length)
    appendEvents.push({ type: "history_started", at, to: snapshot(previous) });
  function put(task, status) {
    if (
      !task?.date ||
      !Number.isFinite(task.durationMinutes) ||
      task.durationMinutes <= 0
    )
      return;
    let entry = plans.find((p) => p.date === task.date);
    if (!entry) {
      entry = { date: task.date, bucketMoves: 0, legacy: false };
      plans.push(entry);
    }
    Object.assign(entry, {
      startTime: task.startTime,
      endTime: task.endTime,
      durationMinutes: task.durationMinutes,
      category: task.category,
      title: task.title,
      status,
    });
    if (type === "moved_to_bucket" && previous?.date === entry.date)
      entry.bucketMoves = (entry.bucketMoves || 0) + 1;
  }
  if (previous?.location === "calendar") {
    if (next.deletedAt) put(previous, "deleted");
    else if (next.location === "bucket") put(previous, "moved_to_bucket");
    else if (next.date !== previous.date) put(previous, "rescheduled");
  }
  if (next.location === "calendar")
    put(next, next.deletedAt ? "deleted" : next.status);
  appendEvents.push({
    type,
    at,
    from: snapshot(previous),
    to: snapshot(next),
    ...(reviewDate ? { reviewDate } : {}),
  });
  return { plans, appendEvents };
}
export function eventType(previous, next) {
  if (previous.location === "calendar" && next.location === "bucket")
    return "moved_to_bucket";
  if (
    (previous.location === "bucket" && next.location === "calendar") ||
    ["date", "startTime", "endTime"].some((key) => previous[key] !== next[key])
  )
    return "rescheduled";
  if (previous.status !== next.status)
    return next.status === "completed" ? "completed" : "reopened";
  return "edited";
}
export function applyTracking(task, previous, type, at, reviewDate) {
  const tracked = trackChange(previous, task.toObject(), type, at, reviewDate);
  task.plans = tracked.plans;
  task.history.push(...tracked.appendEvents);
}
