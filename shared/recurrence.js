import { DateTime } from "luxon";
import { validDate, scheduleFields } from "../server/src/utils/schedule.js";
import { validateRange } from "./calendar.js";
import { AppError } from "../server/src/utils/errors.js";
export function recurrenceInput(body, previous = {}) {
  const startDate = body.date ?? body.startDate ?? previous.startDate;
  const rule = body.recurrence ?? body;
  if (typeof rule !== "object" || Array.isArray(rule))
    throw new AppError(400, "Provide a valid repeat rule.");
  const frequency = rule.frequency ?? previous.frequency;
  const endDate =
    rule.endDate === undefined
      ? (previous.endDate ?? null)
      : rule.endDate || null;
  let weekdays = rule.weekdays ?? previous.weekdays ?? [];
  if (
    !validDate(startDate) ||
    !["daily", "weekdays", "weekly", "monthly"].includes(frequency)
  )
    throw new AppError(400, "Choose a valid start date and repeat pattern.");
  if (endDate !== null && (!validDate(endDate) || endDate < startDate))
    throw new AppError(
      400,
      "Repeat end date must be on or after the start date.",
    );
  if (
    !Array.isArray(weekdays) ||
    weekdays.length > 7 ||
    weekdays.some((v) => !Number.isInteger(v) || v < 1 || v > 7)
  )
    throw new AppError(400, "Choose valid weekdays.");
  weekdays = [...new Set(weekdays)].sort();
  if (frequency === "weekdays" && !weekdays.length)
    throw new AppError(400, "Choose at least one weekday.");
  const startTime = body.startTime ?? previous.startTime,
    endTime = body.endTime ?? previous.endTime;
  try {
    validateRange(startTime, endTime);
  } catch (err) {
    throw new AppError(400, err.message);
  }
  return { startDate, endDate, frequency, weekdays, startTime, endTime };
}
export function occursOn(series, date) {
  if (date < series.startDate || (series.endDate && date > series.endDate))
    return false;
  const day = DateTime.fromISO(date, { zone: "UTC" }),
    anchor = DateTime.fromISO(series.startDate, { zone: "UTC" });
  if (!day.isValid) return false;
  if (series.frequency === "daily") return true;
  if (series.frequency === "weekdays")
    return series.weekdays.includes(day.weekday);
  if (series.frequency === "weekly") return day.weekday === anchor.weekday;
  return day.day === anchor.day; // A 31st-of-month rule skips months without a 31st.
}
export function assertWindow(from, to) {
  if (
    !validDate(from) ||
    !validDate(to) ||
    from > to ||
    DateTime.fromISO(to, { zone: "UTC" }).diff(
      DateTime.fromISO(from, { zone: "UTC" }),
      "days",
    ).days > 365
  )
    throw new AppError(400, "Choose a date range of at most 366 days.");
}
export function candidatesFor(series, from, to, timeZone) {
  assertWindow(from, to);
  const tasks = [],
    warnings = [];
  const first = DateTime.fromISO(from, { zone: "UTC" }),
    days = DateTime.fromISO(to, { zone: "UTC" }).diff(first, "days").days;
  for (let offset = 0; offset <= days; offset++) {
    const date = first.plus({ days: offset }).toISODate();
    if (occursOn(series, date)) {
      try {
        tasks.push({
          title: series.title,
          notes: series.notes,
          category: series.category,
          priority: series.priority,
          ...scheduleFields(
            { date, startTime: series.startTime, endTime: series.endTime },
            timeZone,
          ),
          location: "calendar",
          status: "scheduled",
          owner: series.owner,
          series: series._id,
          occurrenceDate: date,
          isException: false,
        });
      } catch (err) {
        warnings.push({
          code: "INVALID_OCCURRENCE",
          date,
          title: series.title,
          message: err.message,
        });
      }
    }
  }
  return { tasks, warnings };
}
export const previewEnd = (startDate) =>
  DateTime.fromISO(startDate, { zone: "UTC" }).plus({ days: 89 }).toISODate();
