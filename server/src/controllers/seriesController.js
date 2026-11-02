import mongoose from "mongoose";
import RecurrenceSeries from "../models/RecurrenceSeries.js";
import Task from "../models/Task.js";
import { taskInput } from "./taskController.js";
import {
  recurrenceInput,
  candidatesFor,
  conflictsFor,
  insertCandidates,
  occursOn,
  previewEnd,
} from "../utils/recurrence.js";
import { scheduleFields } from "../utils/schedule.js";
import { AppError } from "../utils/errors.js";
import { trackChange } from "../utils/tracking.js";
function input(req, previous = {}) {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body))
    throw new AppError(400, "Provide a JSON recurring task.");
  const data = taskInput(
    { ...req.body, date: req.body.date ?? previous.startDate },
    previous,
  );
  if (req.body.category === undefined && !previous.category)
    data.category = req.user.categories[0].id;
  if (!req.user.categories.some((c) => c.id === data.category))
    throw new AppError(400, "Choose one of your own categories.");
  return {
    title: data.title,
    notes: data.notes,
    category: data.category,
    priority: data.priority,
    ...recurrenceInput(req.body, previous),
  };
}
async function owned(req) {
  if (!mongoose.isValidObjectId(req.params.id))
    throw new AppError(404, "Recurring series not found.");
  const series = await RecurrenceSeries.findOne({
    _id: req.params.id,
    owner: req.user._id,
    deletedAt: null,
  });
  if (!series) throw new AppError(404, "Recurring series not found.");
  return series;
}
async function transaction(action) {
  try {
    return await mongoose.connection.transaction(action);
  } catch (err) {
    if (err.code === 20 || err.codeName === "IllegalOperation")
      throw new AppError(
        409,
        "Recurring series changes require MongoDB Atlas or a replica-set MongoDB deployment.",
        "TRANSACTION_REQUIRED",
      );
    throw err;
  }
}
function requireConsent(req, conflicts) {
  if (conflicts.length && req.body.allowOverlap !== true)
    throw new AppError(
      409,
      "Some recurring occurrences overlap other tasks. Save anyway to accept these series overlaps.",
      "OVERLAP",
      conflicts.slice(0, 50),
    );
}
export async function listSeries(req, res) {
  res.json({
    series: await RecurrenceSeries.find({
      owner: req.user._id,
      deletedAt: null,
    })
      .sort({ createdAt: -1 })
      .lean(),
  });
}
export async function getSeries(req, res) {
  res.json({ series: await owned(req) });
}
export async function createSeries(req, res) {
  const values = input(req);
  if (
    (await RecurrenceSeries.countDocuments({
      owner: req.user._id,
      deletedAt: null,
    })) >= 50
  )
    throw new AppError(400, "Keep at most 50 active recurring series.");
  const series = new RecurrenceSeries({ ...values, owner: req.user._id });
  const generated = candidatesFor(
    series,
    series.startDate,
    previewEnd(series.startDate),
    req.user.timeZone,
  );
  if (!generated.tasks.length)
    throw new AppError(
      400,
      "This repeat rule has no valid occurrence in its first 90 days. Adjust the dates or weekdays.",
    );
  // Include lazily generated tasks from other series in the overlap check.
  const { materializeRecurrences } = await import("../utils/recurrence.js");
  await materializeRecurrences(
    req.user,
    series.startDate,
    previewEnd(series.startDate),
  );
  requireConsent(req, await conflictsFor(generated.tasks, req.user._id));
  await transaction(async (session) => {
    await series.save({ session });
    await insertCandidates(generated.tasks, session);
  });
  res.status(201).json({ series, warnings: generated.warnings });
}
export async function updateSeries(req, res) {
  const previous = await owned(req),
    values = input(req, previous.toObject());
  const proposed = { ...previous.toObject(), ...values },
    generated = candidatesFor(
      proposed,
      values.startDate,
      previewEnd(values.startDate),
      req.user.timeZone,
    );
  const { materializeRecurrences } = await import("../utils/recurrence.js");
  await materializeRecurrences(
    req.user,
    values.startDate,
    previewEnd(values.startDate),
  );
  const existing = await Task.find({
    owner: req.user._id,
    series: previous._id,
    $or: [{ deletedAt: null }, { deletedReason: "rule" }],
  }).select("+history");
  const updates = [];
  for (const task of existing) {
    if (
      task.isException ||
      task.location === "bucket" ||
      task.status === "completed"
    )
      continue;
    if (!occursOn(proposed, task.occurrenceDate)) {
      updates.push({
        updateOne: {
          filter: { _id: task._id },
          update: { $set: { deletedAt: new Date(), deletedReason: "rule" } },
        },
      });
      continue;
    }
    let schedule;
    try {
      schedule = scheduleFields(
        {
          date: task.occurrenceDate,
          startTime: values.startTime,
          endTime: values.endTime,
        },
        req.user.timeZone,
      );
    } catch {
      throw new AppError(
        409,
        `The occurrence on ${task.occurrenceDate} is invalid in this timezone. Choose another time.`,
      );
    }
    updates.push({
      updateOne: {
        filter: { _id: task._id },
        update: {
          $set: {
            ...schedule,
            title: values.title,
            notes: values.notes,
            category: values.category,
            priority: values.priority,
          },
          $unset: { deletedAt: 1, deletedReason: 1 },
        },
      },
    });
  }
  const changedTasks = updates
    .filter((u) => u.updateOne.update.$set.startsAt)
    .map((u) => u.updateOne.update.$set);
  const protectedTasks = existing.filter(
    (t) => t.isException || t.status === "completed",
  );
  const checks = [
    ...generated.tasks.filter(
      (t) => !protectedTasks.some((p) => p.occurrenceDate === t.occurrenceDate),
    ),
    ...changedTasks,
  ];
  const conflicts = await conflictsFor(checks, req.user._id, previous._id);
  for (const next of checks)
    for (const task of protectedTasks)
      if (
        !task.deletedAt &&
        task.location === "calendar" &&
        task.date === next.date &&
        task.startMinute < next.endMinute &&
        next.startMinute < task.endMinute
      )
        conflicts.push(task);
  requireConsent(req, [
    ...new Map(conflicts.map((t) => [String(t._id), t])).values(),
  ]);
  for (const operation of updates) {
    const change = operation.updateOne,
      task = existing.find((t) => String(t._id) === String(change.filter._id)),
      before = task.toObject(),
      next = { ...before, ...change.update.$set };
    for (const key of Object.keys(change.update.$unset || {})) delete next[key];
    const tracking = trackChange(
      before,
      next,
      next.deletedAt ? "series_removed" : "series_updated",
    );
    change.update.$set.plans = tracking.plans;
    change.update.$push = { history: { $each: tracking.appendEvents } };
  }
  await transaction(async (session) => {
    await RecurrenceSeries.updateOne(
      { _id: previous._id, owner: req.user._id },
      { $set: values },
      { session, runValidators: true },
    );
    if (updates.length) await Task.bulkWrite(updates, { session });
    await insertCandidates(generated.tasks, session);
  });
  res.json({
    series: await RecurrenceSeries.findById(previous._id),
    warnings: generated.warnings,
  });
}
export async function deleteSeries(req, res) {
  const series = await owned(req);
  await transaction(async (session) => {
    await RecurrenceSeries.updateOne(
      { _id: series._id },
      { $set: { deletedAt: new Date() } },
      { session },
    );
    const tasks = await Task.find({
      owner: req.user._id,
      series: series._id,
      deletedAt: null,
    })
      .select("+history")
      .session(session);
    const operations = tasks.map((task) => {
      const before = task.toObject(),
        next = { ...before, deletedAt: new Date(), deletedReason: "series" },
        tracking = trackChange(before, next, "series_deleted");
      return {
        updateOne: {
          filter: { _id: task._id, owner: req.user._id },
          update: {
            $set: {
              deletedAt: next.deletedAt,
              deletedReason: "series",
              plans: tracking.plans,
            },
            $push: { history: { $each: tracking.appendEvents } },
          },
        },
      };
    });
    if (operations.length) await Task.bulkWrite(operations, { session });
  });
  res.status(204).end();
}
