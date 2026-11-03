import { assertWindow } from "./recurrence.js";
import { AppError } from "../server/src/utils/errors.js";
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
