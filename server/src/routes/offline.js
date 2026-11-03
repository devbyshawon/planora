import { Router } from "express";
import mongoose from "mongoose";
import { createHash } from "node:crypto";
import { requireAuth, safeUser } from "../middleware/auth.js";
import Task from "../models/Task.js";
import Receipt from "../models/OfflineOperation.js";
import User from "../models/User.js";
import { taskInput } from "../controllers/taskController.js";
import { scheduleFields } from "../utils/schedule.js";
import { trackChange, applyTracking, eventType } from "../utils/tracking.js";
import { AppError } from "../utils/errors.js";
import { materializeRecurrences } from "../utils/recurrence.js";
import { DateTime } from "luxon";
import { offlineData } from "../utils/offlineSnapshot.js";
import { applyOfflineAction } from "../controllers/offlineActionController.js";
import { siteSettings } from "../utils/site.js";
import { googleStatus } from "../controllers/googleController.js";
const router = Router();
router.use(requireAuth);
router.get("/snapshot", async (req, res) => {
  const today = DateTime.now().setZone(req.user.timeZone);
  const from = today.minus({ days: 30 }).toISODate(), to = today.plus({ days: 90 }).toISODate();
  await materializeRecurrences(req.user, from, to);
  const snapshot = await offlineData(req.user._id);
  const tasks = snapshot.tasks;
  if (tasks.length > 5000) throw new AppError(413, "Offline mode supports up to 5,000 saved tasks. Your online data is unchanged.");
  const site = await siteSettings();
  let google;
  await googleStatus(req,{ json(value) { google=value; } });
  res.json({ ...snapshot, googleStatus: google, publicSettings: { registrationOpen: site.registrationOpen, defaultTimeZone: site.defaultTimeZone, browserRemindersAllowed: site.browserRemindersAllowed }, savedAt: new Date().toISOString(), recurrenceFrom: from, recurrenceTo: to });
});
const serializedAction = action => async (req, res) => { try { await action(req, res); } finally { req.releaseAccountLock?.(); } };
router.post("/actions", serializedAction(applyOfflineAction));
router.post("/operations", serializedAction(async (req, res) => {
  const op = req.body;
  if (!op || !/^[a-f0-9-]{36}$/.test(op.id) || !/^[a-f0-9]{24}$/.test(op.taskId) || !["create", "update", "delete"].includes(op.kind) || typeof op.timeZone !== "string")
    throw new AppError(400, "Invalid offline operation.");
  const fingerprint = createHash("sha256").update(JSON.stringify(op)).digest("hex");
  const acknowledged = await Receipt.findOne({ owner: req.user._id, operationId: op.id });
  if (acknowledged) {
    if (acknowledged.fingerprint !== fingerprint) throw new AppError(409, "This offline operation was already used with different content.", "OFFLINE_CONFLICT");
    return res.json({ taskId: String(acknowledged.task), updatedAt: acknowledged.updatedAt });
  }
  // Match ordinary task scheduling: prepare recurring occurrences before overlap
  // checks, outside the atomic task/receipt transaction.
  if (op.kind !== "delete" && op.body?.location === "calendar") {
    scheduleFields(op.body, req.user.timeZone);
    await materializeRecurrences(req.user, op.body.date, op.body.date);
  }
  let result;
  await mongoose.connection.transaction(async session => {
    const prior = await Receipt.findOne({ owner: req.user._id, operationId: op.id }).session(session);
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw new AppError(409, "This offline operation was already used with different content.", "OFFLINE_CONFLICT");
      result = { taskId: String(prior.task), updatedAt: prior.updatedAt };
      return;
    }
    const user = await User.findById(req.user._id).session(session);
    if (!user || user.tokenVersion !== req.user.tokenVersion || user.status === "suspended") throw new AppError(401, "Sign in again before syncing.");
    if (op.timeZone !== user.timeZone) throw new AppError(409, "Your account timezone changed. Export your offline backup before reviewing these changes.", "OFFLINE_CONFLICT");
    let task = await Task.findOne({ _id: op.taskId, owner: user._id }).select("+history").session(session);
    if (op.kind === "create") {
      if (task || await Task.exists({ _id: op.taskId }).session(session)) throw new AppError(409, "Offline task identifier already exists.", "OFFLINE_CONFLICT");
    } else {
      if (!task || task.deletedAt) throw new AppError(409, "This task was deleted on the server. Your offline changes are preserved.", "OFFLINE_CONFLICT");
      let expected = op.expectedUpdatedAt;
      if (op.parentId) {
        const parent = await Receipt.findOne({ owner: user._id, operationId: op.parentId, task: task._id }).session(session);
        if (!parent) throw new AppError(409, "An earlier offline operation must sync first.", "OFFLINE_CONFLICT");
        expected = parent.updatedAt;
      }
      if (typeof expected !== "string" || task.updatedAt.toISOString() !== expected)
        throw new AppError(409, "This task changed in another view or device. Sync paused; export a backup and review the conflict.", "OFFLINE_CONFLICT");
    }
    const before = task?.toObject();
    const now = new Date(Math.max(Date.now(), (task?.updatedAt?.getTime() || 0) + 1));
    if (op.kind === "delete") {
      task.deletedAt = now;
      task.deletedReason = task.series ? "occurrence" : "normal";
      applyTracking(task, before, "deleted", now);
    } else {
      const data = taskInput(op.body, before);
      if (!user.categories.some(c => c.id === data.category)) throw new AppError(409, "An offline task uses a category that is no longer available.", "OFFLINE_CONFLICT");
      if (data.location === "calendar") {
        Object.assign(data, scheduleFields(data, user.timeZone));
        const changed = !task || task.location !== "calendar" || ["date", "startTime", "endTime"].some(k => data[k] !== task[k]);
        if (changed && op.allowOverlap !== true) {
          const overlaps = await Task.findOne({ owner: user._id, _id: { $ne: op.taskId }, deletedAt: null, location: "calendar", date: data.date, startMinute: { $lt: data.endMinute }, endMinute: { $gt: data.startMinute } }).session(session);
          if (overlaps) throw new AppError(409, "Offline schedule overlaps an existing task. Review before allowing overlaps.", "OFFLINE_CONFLICT");
        }
        if (task?.location === "bucket") data.status = "scheduled";
      } else {
        data.status = "not_completed";
        if (task?.location === "calendar") {
          task.originalSchedule ||= { date: task.date, startTime: task.startTime, endTime: task.endTime, durationMinutes: task.durationMinutes };
          task.postponeCount += 1;
          task.bucketAddedAt = now;
        } else if (!task) {
          data.date = data.startTime = data.endTime = undefined;
          data.bucketAddedAt = now;
        }
      }
      data.completedAt = data.status === "completed" ? task?.completedAt || now : undefined;
      if (!task) {
        const tracked = trackChange(null, data, "created", now);
        task = new Task({ ...data, _id: op.taskId, owner: user._id, createdAt: now, plans: tracked.plans, history: tracked.appendEvents });
      } else {
        if (task.series && ["title", "notes", "category", "priority", "date", "startTime", "endTime", "location"].some(k => data[k] !== task[k])) task.isException = true;
        Object.assign(task, data);
        task.review = undefined;
        applyTracking(task, before, eventType(before, task.toObject()), now);
      }
    }
    task.updatedAt = now;
    await task.save({ session, timestamps: false });
    result = { taskId: String(task._id), updatedAt: task.updatedAt.toISOString() };
    await Receipt.create([{ owner: user._id, operationId: op.id, fingerprint, task: task._id, updatedAt: result.updatedAt }], { session });
  });
  res.json(result);
}));
export default router;
