import { DateTime } from "luxon";
import { createHash } from "node:crypto";
import mongoose from "mongoose";
import Task from "../models/Task.js";
import ReminderDelivery from "../models/ReminderDelivery.js";
import { siteSettings } from "../utils/site.js";
import { materializeRecurrences } from "../utils/recurrence.js";
import { AppError } from "../utils/errors.js";
export const REMINDER_GRACE_MS = 120000;
const nowFor = (req) => new Date(req.app.locals.config.now?.() || new Date());
export const reminderKey = (task, lead) =>
  createHash("sha256")
    .update(`${task._id}:${new Date(task.startsAt).getTime()}:${lead}`)
    .digest("hex");
function enabled(user, site) {
  return Boolean(
    user.preferences?.remindersEnabled && site.browserRemindersAllowed,
  );
}
function validDue(task, lead, now) {
  const start = new Date(task.startsAt).getTime(),
    due = start - lead * 60000;
  return (
    Number.isFinite(due) &&
    due <= now.getTime() &&
    due >= now.getTime() - REMINDER_GRACE_MS &&
    (lead === 0 || start > now.getTime())
  );
}
export async function upcomingReminders(req, res) {
  const now = nowFor(req),
    site = await siteSettings(),
    lead = req.user.preferences.reminderMinutes;
  if (!enabled(req.user, site))
    return res.json({
      enabled: false,
      allowed: site.browserRemindersAllowed,
      serverTime: now.toISOString(),
      reminders: [],
    });
  const low = new Date(now.getTime() - REMINDER_GRACE_MS + lead * 60000),
    high = new Date(now.getTime() + (lead + 60) * 60000);
  await materializeRecurrences(
    req.user,
    DateTime.fromJSDate(low, { zone: req.user.timeZone }).toISODate(),
    DateTime.fromJSDate(high, { zone: req.user.timeZone }).toISODate(),
  );
  const tasks = await Task.find({
    owner: req.user._id,
    location: "calendar",
    deletedAt: null,
    status: { $ne: "completed" },
    startsAt: { $gte: low, $lte: high },
  })
    .select("_id title date startTime timeZone startsAt")
    .sort({ startsAt: 1, _id: 1 })
    .limit(5001)
    .lean();
  if (tasks.length > 5000)
    throw new AppError(
      413,
      "More than 5,000 reminders fall in the next hour. Reduce the scheduled task count.",
      "REMINDER_LIMIT",
    );
  res.json({
    enabled: true,
    allowed: true,
    lead,
    serverTime: now.toISOString(),
    reminders: tasks.map((task) => ({
      taskId: String(task._id),
      title: task.title,
      date: task.date,
      startTime: task.startTime,
      timeZone: task.timeZone,
      startsAt: task.startsAt,
      dueAt: new Date(
        new Date(task.startsAt).getTime() - lead * 60000,
      ).toISOString(),
      key: reminderKey(task, lead),
    })),
  });
}
export async function claimReminder(req, res) {
  const body = req.body;
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    !mongoose.isValidObjectId(body.taskId) ||
    typeof body.deviceId !== "string" ||
    !/^[a-zA-Z0-9_-]{16,100}$/.test(body.deviceId) ||
    typeof body.key !== "string" ||
    !/^[a-f0-9]{64}$/.test(body.key)
  )
    throw new AppError(400, "Invalid reminder request.");
  const now = nowFor(req),
    site = await siteSettings(),
    lead = req.user.preferences.reminderMinutes;
  if (!enabled(req.user, site))
    throw new AppError(
      409,
      "Browser reminders are disabled.",
      "REMINDERS_DISABLED",
    );
  const task = await Task.findOne({
    _id: body.taskId,
    owner: req.user._id,
    location: "calendar",
    deletedAt: null,
    status: { $ne: "completed" },
  }).lean();
  if (!task) throw new AppError(404, "The reminder task is no longer pending.");
  const key = reminderKey(task, lead);
  if (body.key !== key)
    throw new AppError(
      409,
      "The task time or reminder setting changed. Refresh reminders.",
      "STALE_REMINDER",
    );
  if (!validDue(task, lead, now))
    throw new AppError(
      409,
      "This reminder is not due or its delivery window has passed.",
      "REMINDER_NOT_DUE",
    );
  try {
    await ReminderDelivery.create({
      owner: req.user._id,
      deviceId: body.deviceId,
      key,
      task: task._id,
      claimedAt: now,
      expiresAt: new Date(new Date(task.startsAt).getTime() + 2 * 86400000),
    });
  } catch (error) {
    if (error.code === 11000) return res.json({ claimed: false });
    throw error;
  }
  res
    .status(201)
    .json({
      claimed: true,
      reminder: {
        taskId: String(task._id),
        title: task.title,
        date: task.date,
        startTime: task.startTime,
        timeZone: task.timeZone,
        key,
      },
    });
}
