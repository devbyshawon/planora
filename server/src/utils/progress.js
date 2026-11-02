import { DateTime } from "luxon";
import { plansFor } from "./tracking.js";
export function summarize(tasks, from, to, today, categories, categoryFilter) {
  const days = [],
    byCategory = new Map(),
    taskRows = [];
  const first = DateTime.fromISO(from, { zone: "UTC" }),
    length = DateTime.fromISO(to, { zone: "UTC" }).diff(first, "days").days;
  const empty = () => ({
    planned: 0,
    completed: 0,
    plannedMinutes: 0,
    completedMinutes: 0,
    movedToBucket: 0,
    bucketMoves: 0,
    rescheduled: 0,
    notCompleted: 0,
  });
  for (let i = 0; i <= length; i++)
    days.push({ date: first.plus({ days: i }).toISODate(), ...empty() });
  const daily = new Map(days.map((day) => [day.date, day])),
    total = empty();
  let legacy = false;
  function add(target, entry) {
    target.planned++;
    target.plannedMinutes += entry.durationMinutes || 0;
    if (entry.status === "completed") {
      target.completed++;
      target.completedMinutes += entry.durationMinutes || 0;
    }
    if (entry.bucketMoves > 0) {
      target.movedToBucket++;
      target.bucketMoves += entry.bucketMoves;
    }
    if (entry.status === "rescheduled") target.rescheduled++;
    if (entry.status === "not_completed") target.notCompleted++;
  }
  for (const task of tasks)
    for (const entry of plansFor(task)) {
      if (
        entry.date < from ||
        entry.date > to ||
        entry.status === "deleted" ||
        (categoryFilter && entry.category !== categoryFilter)
      )
        continue;
      legacy ||= entry.legacy === true;
      add(total, entry);
      add(daily.get(entry.date), entry);
      if (!byCategory.has(entry.category)) {
        const found = categories.find((c) => c.id === entry.category);
        byCategory.set(entry.category, {
          id: entry.category,
          name: found?.name || "Archived category",
          color: found?.color || "#8891a4",
          ...empty(),
        });
      }
      add(byCategory.get(entry.category), entry);
      taskRows.push({
        taskId: String(task._id),
        date: entry.date,
        title: entry.title || task.title,
        category: entry.category,
        status: entry.status,
        durationMinutes: entry.durationMinutes,
        bucketMoves: entry.bucketMoves || 0,
        location: task.location,
        currentDate: task.date,
        deleted: Boolean(task.deletedAt),
      });
    }
  for (const row of [...days, ...byCategory.values(), total])
    row.completionPercentage = row.planned
      ? Math.round((row.completed / row.planned) * 100)
      : 0;
  let best = 0,
    run = 0;
  for (const day of days) {
    if (day.date >= today) break;
    run = day.planned > 0 && day.completed === day.planned ? run + 1 : 0;
    best = Math.max(best, run);
  }
  const closed = days.filter((day) => day.date < today);
  let current = 0;
  for (let i = closed.length - 1; i >= 0; i--) {
    const day = closed[i];
    if (!day.planned || day.completed !== day.planned) break;
    current++;
  }
  return {
    from,
    to,
    today,
    total,
    daily: days,
    byCategory: [...byCategory.values()],
    tasks: taskRows.sort(
      (a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title),
    ),
    streak: { best, current, through: closed.at(-1)?.date || null },
    legacy,
  };
}
