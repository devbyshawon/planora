import { DateTime } from "luxon";
import mongoose from "mongoose";
import { trackChange } from "./tracking.js";
import Task from "../models/Task.js";
import RecurrenceSeries from "../models/RecurrenceSeries.js";
import { validDate, scheduleFields } from "./schedule.js";
import { validateRange } from "../../../shared/calendar.js";
import { AppError } from "./errors.js";
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
export async function conflictsFor(tasks, owner, exceptSeries, session) {
  if (!tasks.length) return [];
  const query = {
    owner,
    location: "calendar",
    deletedAt: null,
    date: { $in: tasks.map((t) => t.date) },
  };
  if (exceptSeries) query.series = { $ne: exceptSeries };
  let cursor = Task.find(query)
    .select("title date startTime endTime startMinute endMinute")
    .lean();
  if (session) cursor = cursor.session(session);
  const existing = await cursor,
    conflicts = [];
  const byDate = new Map();
  for (const task of existing) {
    if (!byDate.has(task.date)) byDate.set(task.date, []);
    byDate.get(task.date).push(task);
  }
  for (const next of tasks)
    for (const task of byDate.get(next.date) || [])
      if (
        String(next._id) !== String(task._id) &&
        task.date === next.date &&
        task.startMinute < next.endMinute &&
        next.startMinute < task.endMinute
      )
        conflicts.push(task);
  return [
    ...new Map(conflicts.map((task) => [String(task._id), task])).values(),
  ];
}
export async function insertCandidates(tasks, session) {
  if (!tasks.length) return;
  const operations = tasks.map((task) => ({
    updateOne: {
      filter: {
        owner: task.owner,
        series: task.series,
        occurrenceDate: task.occurrenceDate,
      },
      update: {
        $setOnInsert: {
          ...task,
          plans: trackChange(null, task, "created").plans,
          history: trackChange(null, task, "created").appendEvents,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      upsert: true,
    },
  }));
  try {
    await Task.bulkWrite(operations, {
      ordered: false,
      timestamps: false,
      ...(session ? { session } : {}),
    });
  } catch (err) {
    if (
      session ||
      !err.writeErrors?.length ||
      !err.writeErrors.every((e) => e.code === 11000)
    )
      throw err;
  }
}
export async function materializeRecurrences(user, from, to) {
  assertWindow(from, to);
  const series = await RecurrenceSeries.find({
    owner: user._id,
    deletedAt: null,
    startDate: { $lte: to },
    $or: [{ endDate: null }, { endDate: { $gte: from } }],
  });
  const warnings = [];
  for (const item of series) {
    let generated;
    await mongoose.connection.transaction(async (session) => {
      const current = await RecurrenceSeries.findOne({
        _id: item._id,
        owner: user._id,
        deletedAt: null,
      }).session(session);
      if (!current) {
        generated = null;
        return;
      }
      await RecurrenceSeries.updateOne(
        { _id: item._id },
        { $inc: { generationRevision: 1 } },
        { session },
      );
      generated = candidatesFor(current, from, to, user.timeZone);
      await insertCandidates(generated.tasks, session);
    });
    if (!generated) continue;
    warnings.push(...generated.warnings);
    const actual = await Task.find({
      owner: user._id,
      series: item._id,
      location: "calendar",
      deletedAt: null,
      date: { $gte: from, $lte: to },
    }).lean();
    const conflicts = await conflictsFor(actual, user._id);
    if (conflicts.length)
      warnings.push({
        code: "RECURRING_OVERLAP",
        title: item.title,
        message: `${item.title} overlaps ${conflicts.length} other task(s) in this range.`,
        dates: [...new Set(conflicts.map((t) => t.date))],
      });
  }
  return warnings;
}
export const previewEnd = (startDate) =>
  DateTime.fromISO(startDate, { zone: "UTC" }).plus({ days: 89 }).toISODate();
