import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { IANAZone } from "luxon";
import { randomBytes } from "node:crypto";
import User from "../models/User.js";
import Task from "../models/Task.js";
import RecurrenceSeries from "../models/RecurrenceSeries.js";
import Template from "../models/Template.js";
import { trackChange } from "../utils/tracking.js";
import { safeUser, setSession } from "../middleware/auth.js";
import { AppError } from "../utils/errors.js";
import { scheduleFields } from "../utils/schedule.js";
function bodyObject(body) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new AppError(400, "Provide a JSON object.");
}
export async function updateProfile(req, res) {
  bodyObject(req.body);
  const { name, email, currentPassword } = req.body;
  const updates = {};
  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim() || name.trim().length > 80)
      throw new AppError(400, "Name must contain 1–80 characters.");
    updates.name = name.trim();
  }
  // Email validation is also enforced by express-validator before this handler.
  if (email !== undefined && email !== req.user.email) {
    const existing = await User.findById(req.user._id).select("+passwordHash");
    if (
      typeof currentPassword !== "string" ||
      !(await bcrypt.compare(currentPassword, existing.passwordHash))
    )
      throw new AppError(
        400,
        "Enter your current password to change your email.",
        "INVALID_PASSWORD",
      );
    updates.email = email;
    const user = await User.findOneAndUpdate(
      {
        _id: req.user._id,
        tokenVersion: req.user.tokenVersion,
        passwordHash: existing.passwordHash,
      },
      {
        $set: updates,
        $inc: { tokenVersion: 1 },
        $unset: {
          resetTokenHash: 1,
          resetExpiresAt: 1,
          resetRequestedAt: 1,
          emailVerifiedAt: 1,
          verificationTokenHash: 1,
          verificationExpiresAt: 1,
          verificationRequestedAt: 1,
        },
      },
      { new: true, runValidators: true },
    );
    if (!user) throw new AppError(409, "Your account changed. Sign in again.");
    setSession(res, user, req.app.locals.config);
    return res.json({ user: safeUser(user) });
  }
  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $set: updates },
    { new: true, runValidators: true },
  );
  res.json({ user: safeUser(user) });
}
function settingsInput(body) {
  const values = {};
  const rules = {
    theme: (v) => ["light", "dark"].includes(v),
    timeFormat: (v) => ["12h", "24h"].includes(v),
    weekStartsOn: (v) => [0, 1].includes(v),
    showHourGuides: (v) => typeof v === "boolean",
    defaultView: (v) => ["day", "week", "month"].includes(v),
    reminderMinutes: (v) => Number.isInteger(v) && v >= 0 && v <= 1440,
    remindersEnabled: (v) => typeof v === "boolean",
  };
  for (const [key, valid] of Object.entries(rules))
    if (body[key] !== undefined) {
      if (!valid(body[key])) throw new AppError(400, `Invalid ${key} setting.`);
      values[`preferences.${key}`] = body[key];
    }
  return values;
}
export async function updateSettings(req, res) {
  bodyObject(req.body);
  const updates = settingsInput(req.body);
  const timeZone = req.body.timeZone ?? req.user.timeZone;
  if (typeof timeZone !== "string" || !IANAZone.isValidZone(timeZone))
    throw new AppError(400, "Choose a valid IANA timezone.");
  let user;
  if (timeZone !== req.user.timeZone) {
    if (req.body.confirmTimezoneChange !== true)
      throw new AppError(
        409,
        "Confirm that all tasks should keep their local dates and clock times in the new timezone.",
        "TIMEZONE_CONFIRMATION_REQUIRED",
      );
    try {
      await mongoose.connection.transaction(async (session) => {
        user = await User.findOneAndUpdate(
          {
            _id: req.user._id,
            timeZone: req.user.timeZone,
            tokenVersion: req.user.tokenVersion,
          },
          { $set: { ...updates, timeZone } },
          { new: true, runValidators: true, session },
        );
        if (!user)
          throw new AppError(
            409,
            "Your settings changed in another session. Reload and retry.",
          );
        const tasks = await Task.find({
          owner: req.user._id,
          location: "calendar",
          deletedAt: null,
        })
          .select("+history")
          .session(session);
        const operations = tasks.map((task) => {
          let schedule;
          try {
            schedule = scheduleFields(task, timeZone);
          } catch {
            throw new AppError(
              409,
              `The task “${task.title}” on ${task.date} is invalid in that timezone. Reschedule it before changing timezone.`,
              "TIMEZONE_TASK_CONFLICT",
            );
          }
          const tracking = trackChange(
            task.toObject(),
            { ...task.toObject(), ...schedule },
            "timezone_changed",
          );
          return {
            updateOne: {
              filter: { _id: task._id, owner: req.user._id },
              update: {
                $set: { ...schedule, plans: tracking.plans },
                $push: { history: { $each: tracking.appendEvents } },
              },
            },
          };
        });
        if (operations.length) await Task.bulkWrite(operations, { session });
      });
    } catch (error) {
      if (error.code === 20 || error.codeName === "IllegalOperation")
        throw new AppError(
          409,
          "Timezone changes require MongoDB Atlas or a replica-set MongoDB deployment.",
          "TRANSACTION_REQUIRED",
        );
      throw error;
    }
  } else
    user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true, runValidators: true },
    );
  res.json({ user: safeUser(user) });
}
function categoryInput(body) {
  bodyObject(body);
  const { name, color } = body;
  if (typeof name !== "string" || !name.trim() || name.trim().length > 40)
    throw new AppError(400, "Category name must contain 1–40 characters.");
  if (typeof color !== "string" || !/^#[a-f0-9]{6}$/i.test(color))
    throw new AppError(400, "Use a six-digit hex colour.");
  return { name: name.trim(), color: color.toLowerCase() };
}
export async function listCategories(req, res) {
  res.json({ categories: safeUser(req.user).categories });
}
export async function createCategory(req, res) {
  const values = categoryInput(req.body),
    id = `cat_${randomBytes(12).toString("hex")}`;
  const user = await User.findOneAndUpdate(
    {
      _id: req.user._id,
      "categories.49": { $exists: false },
      categories: {
        $not: {
          $elemMatch: {
            name: {
              $regex: `^${values.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
              $options: "i",
            },
          },
        },
      },
    },
    { $push: { categories: { id, ...values } } },
    { new: true, runValidators: true },
  );
  if (!user)
    throw new AppError(
      409,
      "Choose a unique category name. An account can have at most 50 categories.",
    );
  res.status(201).json({ categories: safeUser(user).categories });
}
export async function updateCategory(req, res) {
  const values = categoryInput(req.body),
    category = req.user.categories.find((c) => c.id === req.params.id);
  if (!category) throw new AppError(404, "Category not found.");
  const duplicate = req.user.categories.some(
    (c) =>
      c.id !== category.id &&
      c.name.toLowerCase() === values.name.toLowerCase(),
  );
  if (duplicate) throw new AppError(409, "Choose a unique category name.");
  const escaped = values.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const user = await User.findOneAndUpdate(
    {
      _id: req.user._id,
      "categories.id": category.id,
      categories: {
        $not: {
          $elemMatch: {
            id: { $ne: category.id },
            name: { $regex: `^${escaped}$`, $options: "i" },
          },
        },
      },
    },
    {
      $set: {
        "categories.$[entry].name": values.name,
        "categories.$[entry].color": values.color,
      },
    },
    {
      arrayFilters: [{ "entry.id": category.id }],
      new: true,
      runValidators: true,
    },
  );
  if (!user)
    throw new AppError(409, "Your categories changed. Reload and retry.");
  res.json({ categories: safeUser(user).categories });
}
export async function deleteCategory(req, res) {
  if (!req.user.categories.some((c) => c.id === req.params.id))
    throw new AppError(404, "Category not found.");
  if (req.user.categories.length < 2)
    throw new AppError(409, "Keep at least one category.");
  if (
    (await Task.exists({
      owner: req.user._id,
      category: req.params.id,
      deletedAt: null,
    })) ||
    (await RecurrenceSeries.exists({
      owner: req.user._id,
      category: req.params.id,
      deletedAt: null,
    })) ||
    (await Template.exists({ owner: req.user._id, category: req.params.id }))
  )
    throw new AppError(
      409,
      "This category is used by tasks, recurring series, or templates. Reassign them before deleting it.",
      "CATEGORY_IN_USE",
    );
  const user = await User.findOneAndUpdate(
    { _id: req.user._id, "categories.1": { $exists: true } },
    { $pull: { categories: { id: req.params.id } } },
    { new: true },
  );
  if (!user) throw new AppError(409, "Keep at least one category.");
  res.json({ categories: safeUser(user).categories });
}
