import Task from "../../models/Task.js";
import RecurrenceSeries from "../../models/RecurrenceSeries.js";
import { assertWindow, materializeRecurrences } from "../recurrence.js";
import { AppError } from "../errors.js";
export const MAX_EXPORT_TASKS = 5000;
export function exportInput(body) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new AppError(400, "Provide export options.");
  const {
    from,
    to,
    category = "",
    status = "",
    period = "custom",
    includeNotes = true,
    reminderMinutes = 10,
  } = body;
  assertWindow(from, to);
  if (
    typeof category !== "string" ||
    typeof status !== "string" ||
    !["", "scheduled", "completed", "not_completed"].includes(status) ||
    !["day", "week", "month", "custom"].includes(period) ||
    typeof includeNotes !== "boolean"
  )
    throw new AppError(400, "Invalid export filters.");
  if (
    reminderMinutes !== null &&
    (!Number.isInteger(reminderMinutes) ||
      reminderMinutes < 0 ||
      reminderMinutes > 1440)
  )
    throw new AppError(400, "Choose no reminder or 0-1440 minutes.");
  return { from, to, category, status, period, includeNotes, reminderMinutes };
}
export async function exportData(user, options, generatedAt = new Date()) {
  if (
    options.category &&
    !user.categories.some((c) => c.id === options.category)
  )
    throw new AppError(400, "Choose one of your own categories.");
  const warnings = await materializeRecurrences(user, options.from, options.to);
  const filter = {
    owner: user._id,
    deletedAt: null,
    location: "calendar",
    date: { $gte: options.from, $lte: options.to },
    ...(options.category ? { category: options.category } : {}),
    ...(options.status ? { status: options.status } : {}),
  };
  const tasks = await Task.find(filter)
    .select("-plans")
    .sort({ date: 1, startMinute: 1, _id: 1 })
    .limit(MAX_EXPORT_TASKS + 1)
    .lean();
  if (tasks.length > MAX_EXPORT_TASKS)
    throw new AppError(
      413,
      "This export exceeds 5,000 tasks. Choose a shorter range or a category filter.",
      "EXPORT_TOO_LARGE",
    );
  const series = await RecurrenceSeries.find({
    owner: user._id,
    deletedAt: null,
    _id: {
      $in: [
        ...new Set(tasks.filter((t) => t.series).map((t) => String(t.series))),
      ],
    },
  }).lean();
  return {
    options,
    tasks,
    series,
    timeZone: user.timeZone,
    ownerId: String(user._id),
    categories: user.categories.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
    })),
    generatedAt: new Date(generatedAt),
    warnings,
  };
}
export const categoryName = (data, id) =>
  data.categories.find((c) => c.id === id)?.name || id;
export const statusName = (status) =>
  ({
    scheduled: "Scheduled",
    completed: "Completed",
    not_completed: "Not completed",
  })[status] || status;
export function exportPreview(data) {
  return {
    count: data.tasks.length,
    totalMinutes: data.tasks.reduce((sum, t) => sum + t.durationMinutes, 0),
    timeZone: data.timeZone,
    from: data.options.from,
    to: data.options.to,
    generatedAt: data.generatedAt.toISOString(),
    warnings: data.warnings.slice(0, 50),
    warningCount: data.warnings.length,
  };
}
