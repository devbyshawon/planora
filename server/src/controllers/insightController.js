import { DateTime } from "luxon";
import mongoose from "mongoose";
import Task from "../models/Task.js";
import { assertWindow, materializeRecurrences } from "../utils/recurrence.js";
import { validDate } from "../utils/schedule.js";
import { summarize } from "../utils/progress.js";
import { AppError } from "../utils/errors.js";
import { updateTask, deleteTask } from "./taskController.js";
function localToday(req) {
  return DateTime.fromJSDate(req.app.locals.config.now?.() || new Date(), {
    zone: req.user.timeZone,
  }).toISODate();
}
function closedDay(req, date) {
  if (!validDate(date) || date >= localToday(req))
    throw new AppError(
      400,
      "Choose a day that has ended in your planner timezone.",
      "DAY_NOT_ENDED",
    );
}
export async function progress(req, res) {
  const { from, to, category } = req.query;
  assertWindow(from, to);
  if (
    category &&
    (!req.user.categories.some((c) => c.id === category) ||
      typeof category !== "string")
  )
    throw new AppError(400, "Choose one of your own categories.");
  const warnings = await materializeRecurrences(req.user, from, to);
  const tasks = await Task.find({
    owner: req.user._id,
    $or: [
      { "plans.date": { $gte: from, $lte: to } },
      { date: { $gte: from, $lte: to } },
    ],
  })
    .select(
      "title category date startTime endTime durationMinutes location status plans deletedAt bucketAddedAt",
    )
    .lean();
  res.json({
    ...summarize(
      tasks,
      from,
      to,
      localToday(req),
      req.user.categories,
      category,
    ),
    warnings,
  });
}
export async function dailyReview(req, res) {
  const { date } = req.query;
  closedDay(req, date);
  const warnings = await materializeRecurrences(req.user, date, date);
  const tasks = await Task.find({
    owner: req.user._id,
    location: "calendar",
    date,
    deletedAt: null,
    status: { $ne: "completed" },
    "review.date": { $ne: date },
  })
    .sort({ startMinute: 1 })
    .lean();
  res.json({ date, today: localToday(req), tasks, warnings });
}
export async function reviewTask(req, res) {
  const { date, action, expectedUpdatedAt } = req.body || {};
  closedDay(req, date);
  if (!["keep", "bucket", "delete"].includes(action))
    throw new AppError(400, "Choose keep, bucket, or delete.");
  if (!mongoose.isValidObjectId(req.params.id))
    throw new AppError(404, "Task not found.");
  const task = await Task.findOne({
    _id: req.params.id,
    owner: req.user._id,
  }).lean();
  if (!task) throw new AppError(404, "Task not found.");
  if (task.review?.date === date && task.review.action === action)
    return action === "delete" ? res.status(204).end() : res.json({ task });
  if (
    task.deletedAt ||
    task.location !== "calendar" ||
    task.date !== date ||
    task.status === "completed"
  )
    throw new AppError(
      409,
      "This task is no longer an unfinished task on that date. Reload the review.",
      "STALE_REVIEW",
    );
  req.reviewContext = { date, action };
  req.body = {
    ...(action === "bucket"
      ? { location: "bucket" }
      : { status: "not_completed" }),
    ...(expectedUpdatedAt !== undefined ? { expectedUpdatedAt } : {}),
  };
  return action === "delete" ? deleteTask(req, res) : updateTask(req, res);
}
