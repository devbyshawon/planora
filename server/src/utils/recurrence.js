import { DateTime } from "luxon";
import mongoose from "mongoose";
import { trackChange } from "./tracking.js";
import Task from "../models/Task.js";
import RecurrenceSeries from "../models/RecurrenceSeries.js";
import { validDate, scheduleFields } from "./schedule.js";
import { validateRange } from "../../../shared/calendar.js";
import { AppError } from "./errors.js";
import { recurrenceInput, occursOn, assertWindow, candidatesFor, previewEnd } from "../../../shared/recurrence.js";
export { recurrenceInput, occursOn, assertWindow, candidatesFor, previewEnd };
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
