import mongoose from "mongoose";
import Task from "../models/Task.js";
import { AppError } from "../utils/errors.js";
import { scheduleFields, validDate } from "../utils/schedule.js";
import { materializeRecurrences } from "../utils/recurrence.js";
import { trackChange, applyTracking, eventType } from "../utils/tracking.js";
const priorities = ["low", "medium", "high"],
  statuses = ["scheduled", "completed", "not_completed"];
export const MAX_LIST_TASKS = 5000;
export function taskInput(body, previous = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new AppError(400, "Provide a JSON task object.");
  const fields = [
    "title",
    "notes",
    "category",
    "priority",
    "status",
    "location",
    "date",
    "startTime",
    "endTime",
  ];
  const data = Object.fromEntries(
    fields.map((key) => [
      key,
      body[key] === undefined ? previous[key] : body[key],
    ]),
  );
  if (
    typeof data.title !== "string" ||
    !data.title.trim() ||
    data.title.trim().length > 160
  )
    throw new AppError(400, "Title must contain 1–160 characters.");
  data.title = data.title.trim();
  data.notes ??= "";
  data.category ??= "study";
  data.priority ??= "medium";
  data.status ??= "scheduled";
  data.location ??= "calendar";
  if (typeof data.notes !== "string" || data.notes.length > 5000)
    throw new AppError(400, "Notes must be at most 5,000 characters.");
  if (
    typeof data.category !== "string" ||
    !priorities.includes(data.priority) ||
    !statuses.includes(data.status) ||
    !["calendar", "bucket"].includes(data.location)
  )
    throw new AppError(400, "Invalid category, priority, status, or location.");
  return data;
}
async function findOwned(req) {
  if (!mongoose.isValidObjectId(req.params.id))
    throw new AppError(404, "Task not found.");
  const task = await Task.findOne({
    _id: req.params.id,
    owner: req.user._id,
    deletedAt: null,
  }).select("+history");
  if (!task) throw new AppError(404, "Task not found.");
  return task;
}
async function checkOverlap(req, schedule, exceptId) {
  const query = {
    owner: req.user._id,
    location: "calendar",
    date: schedule.date,
    startMinute: { $lt: schedule.endMinute },
    endMinute: { $gt: schedule.startMinute },
    deletedAt: null,
  };
  if (exceptId) query._id = { $ne: exceptId };
  const conflicts = await Task.find(query)
    .select("title date startTime endTime")
    .lean();
  if (conflicts.length && req.body.allowOverlap !== true)
    throw new AppError(
      409,
      "This time overlaps another task. You may save anyway.",
      "OVERLAP",
      conflicts,
    );
}
export async function listTasks(req, res) {
  const { from, to, location = "calendar" } = req.query;
  if (!["calendar", "bucket"].includes(location))
    throw new AppError(400, "Invalid task location.");
  const query = { owner: req.user._id, location, deletedAt: null };
  let warnings = [];
  if (location === "calendar") {
    if (!validDate(from) || !validDate(to) || from > to)
      throw new AppError(400, "Provide a valid from/to date range.");
    query.date = { $gte: from, $lte: to };
    warnings = await materializeRecurrences(req.user, from, to);
  }
  const tasks = await Task.find(query)
    .sort(
      location === "bucket"
        ? { bucketAddedAt: -1 }
        : { date: 1, startMinute: 1 },
    )
    .limit(MAX_LIST_TASKS + 1)
    .lean();
  if (tasks.length > MAX_LIST_TASKS)
    throw new AppError(
      413,
      "This view exceeds 5,000 tasks. Use Search all tasks with filters to find and manage them, or choose a shorter calendar range.",
      "TASK_LIST_TOO_LARGE",
    );
  res.json({ tasks, warnings });
}
export async function createTask(req, res) {
  const data = taskInput(req.body);
  if (req.body.category === undefined)
    data.category = req.user.categories[0].id;
  if (!req.user.categories.some((c) => c.id === data.category))
    throw new AppError(400, "Choose one of your own categories.");
  if (data.location === "calendar") {
    Object.assign(data, scheduleFields(data, req.user.timeZone));
    await materializeRecurrences(req.user, data.date, data.date);
    await checkOverlap(req, data);
  } else {
    data.date = undefined;
    data.startTime = undefined;
    data.endTime = undefined;
    data.status = "not_completed";
    data.bucketAddedAt = new Date();
  }
  if (data.status === "completed") data.completedAt = new Date();
  const tracking = trackChange(null, data, "created");
  data.plans = tracking.plans;
  data.history = tracking.appendEvents;
  const task = await Task.create({ ...data, ...(req.offlineId ? { _id: req.offlineId } : {}), owner: req.user._id });
  res.status(201).json({ task });
}
export async function updateTask(req, res) {
  const task = await findOwned(req);
  assertFresh(req, task);
  const before = task.toObject();
  const data = taskInput(req.body, task.toObject());
  if (!req.user.categories.some((c) => c.id === data.category))
    throw new AppError(400, "Choose one of your own categories.");
  if (data.location === "calendar") {
    Object.assign(data, scheduleFields(data, req.user.timeZone));
    const scheduleChanged =
      task.location !== "calendar" ||
      ["date", "startTime", "endTime"].some((k) => data[k] !== task[k]);
    if (scheduleChanged) {
      await materializeRecurrences(req.user, data.date, data.date);
      await checkOverlap(req, data, task._id);
    }
    if (task.location === "bucket") data.status = "scheduled";
  } else {
    data.status = "not_completed";
    if (task.location === "calendar") {
      if (!task.originalSchedule?.date)
        task.originalSchedule = {
          date: task.date,
          startTime: task.startTime,
          endTime: task.endTime,
          durationMinutes: task.durationMinutes,
        };
      task.postponeCount += 1;
      task.bucketAddedAt = new Date();
    }
  }
  if (
    task.series &&
    [
      "title",
      "notes",
      "category",
      "priority",
      "date",
      "startTime",
      "endTime",
      "location",
    ].some((key) => data[key] !== task[key])
  )
    task.isException = true;
  data.completedAt =
    data.status === "completed" ? task.completedAt || new Date() : undefined;
  Object.assign(task, data);
  if (req.reviewContext) task.review = { ...req.reviewContext, at: new Date() };
  else if (
    ["date", "startTime", "endTime", "location"].some(
      (key) => before[key] !== task[key],
    ) ||
    (before.status !== task.status && task.status === "scheduled")
  )
    task.review = undefined;
  const changed = [
    "title",
    "notes",
    "category",
    "priority",
    "date",
    "startTime",
    "endTime",
    "location",
    "status",
  ].some((key) => before[key] !== task[key]);
  if (changed || req.reviewContext)
    applyTracking(
      task,
      before,
      req.reviewContext?.action === "keep"
        ? "review_kept"
        : eventType(before, task.toObject()),
      new Date(),
      req.reviewContext?.date,
    );
  await task.save();
  res.json({ task });
}
export async function deleteTask(req, res) {
  const task = await findOwned(req);
  assertFresh(req, task);
  const before = task.toObject();
  task.deletedAt = new Date();
  task.deletedReason = task.series ? "occurrence" : "normal";
  if (req.reviewContext) task.review = { ...req.reviewContext, at: new Date() };
  applyTracking(task, before, "deleted", new Date(), req.reviewContext?.date);
  await task.save();
  res.status(204).end();
}
function assertFresh(req, task) {
  const expected = req.body?.expectedUpdatedAt;
  if (
    expected !== undefined &&
    (typeof expected !== "string" || expected !== task.updatedAt?.toISOString())
  )
    throw new AppError(
      409,
      "This task changed in another view. Reload it before saving.",
      "STALE_TASK",
    );
}
export async function taskHistory(req, res) {
  if (!mongoose.isValidObjectId(req.params.id))
    throw new AppError(404, "Task not found.");
  const page = Number(req.query.page || 1);
  if (!Number.isInteger(page) || page < 1 || page > 100000)
    throw new AppError(400, "Invalid history page.");
  // Slice in MongoDB: only this page crosses the wire, even for old tasks.
  const [task] = await Task.aggregate([
    { $match: { _id: new mongoose.Types.ObjectId(req.params.id), owner: req.user._id } },
    { $project: {
      title: 1, postponeCount: 1, deletedAt: 1, originalSchedule: 1,
      total: { $size: { $ifNull: ["$history", []] } },
      events: { $slice: [{ $reverseArray: { $ifNull: ["$history", []] } }, (page - 1) * 50, 50] },
      legacy: { $or: [
        { $eq: [{ $size: { $ifNull: ["$history", []] } }, 0] },
        { $in: ["history_started", { $ifNull: ["$history.type", []] }] },
      ] },
    } },
  ]);
  if (!task) throw new AppError(404, "Task not found.");
  res.json({
    task: {
      _id: task._id,
      title: task.title,
      postponeCount: task.postponeCount,
      deletedAt: task.deletedAt,
      originalSchedule: task.originalSchedule,
    },
    events: task.events,
    page,
    total: task.total,
    pageSize: 50,
    legacy: task.legacy,
  });
}
export async function getTask(req, res) {
  const task = (await findOwned(req)).toObject();
  delete task.history;
  res.json({ task });
}
