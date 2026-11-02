import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import User from "../models/User.js";
import AdminAudit from "../models/AdminAudit.js";
import SiteSettings from "../models/SiteSettings.js";
import { AppError } from "../utils/errors.js";
import {
  siteSettings,
  safeSite,
  defaultsInput,
  withAccountLock,
} from "../utils/site.js";
import {
  adminUnlocked,
  unlockAdmin,
  ADMIN_COOKIE,
  adminCookieOptions,
} from "../middleware/admin.js";
import { escapeRegex } from "./searchController.js";
export function adminAccess(req, res) {
  res.json({ unlocked: adminUnlocked(req) });
}
export async function adminUnlock(req, res) {
  const password = req.body?.password;
  if (typeof password !== "string" || !password || password.length > 128)
    throw new AppError(400, "Enter your current password.");
  const user = await User.findById(req.user._id).select("+passwordHash");
  if (!(await bcrypt.compare(password, user.passwordHash)))
    throw new AppError(
      400,
      "Current password is incorrect.",
      "INVALID_PASSWORD",
    );
  unlockAdmin(req, res);
  res.json({ unlocked: true, expiresInMinutes: 15 });
}
export function adminLock(req, res) {
  const { maxAge, ...options } = adminCookieOptions(req.app.locals.config);
  res.clearCookie(ADMIN_COOKIE, options);
  res.json({ unlocked: false });
}
export async function adminSummary(req, res) {
  const [total, suspended, admins, verified] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ status: "suspended" }),
    User.countDocuments({ role: "admin" }),
    User.countDocuments({ emailVerifiedAt: { $type: "date" } }),
  ]);
  res.json({ total, active: total - suspended, suspended, admins, verified });
}
export async function adminUsers(req, res) {
  const { q = "", status = "", role = "", page = "1" } = req.query;
  if (
    [q, status, role, page].some((v) => typeof v !== "string") ||
    q.length > 100 ||
    !["", "active", "suspended"].includes(status) ||
    !["", "user", "admin"].includes(role) ||
    !/^\d+$/.test(page) ||
    Number(page) < 1 ||
    Number(page) > 100000
  )
    throw new AppError(400, "Invalid account filters.");
  const clauses = [];
  if (q.trim())
    clauses.push({
      $or: [
        { name: { $regex: escapeRegex(q.trim()), $options: "i" } },
        { email: { $regex: escapeRegex(q.trim()), $options: "i" } },
      ],
    });
  if (status === "active") clauses.push({ status: { $ne: "suspended" } });
  else if (status) clauses.push({ status });
  if (role === "user") clauses.push({ role: { $ne: "admin" } });
  else if (role) clauses.push({ role });
  const query = clauses.length ? { $and: clauses } : {},
    total = await User.countDocuments(query);
  const users = await User.find(query)
    .select("name email role status emailVerifiedAt createdAt updatedAt")
    .sort({ createdAt: -1, _id: -1 })
    .skip((Number(page) - 1) * 25)
    .limit(25)
    .lean();
  res.json({
    total,
    page: Number(page),
    pageSize: 25,
    users: users.map((u) => ({
      id: String(u._id),
      name: u.name,
      email: u.email,
      role: u.role || "user",
      status: u.status || "active",
      verified: Boolean(u.emailVerifiedAt),
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    })),
  });
}
export async function adminStatus(req, res) {
  if (!mongoose.isValidObjectId(req.params.id))
    throw new AppError(404, "Account not found.");
  if (String(req.user._id) === req.params.id)
    throw new AppError(409, "You cannot change your own account status.");
  const body = req.body;
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some(
      (k) => !["status", "expectedUpdatedAt"].includes(k),
    ) ||
    !["active", "suspended"].includes(body.status) ||
    typeof body.expectedUpdatedAt !== "string" ||
    !Number.isFinite(Date.parse(body.expectedUpdatedAt))
  )
    throw new AppError(
      400,
      "Choose an account status and include its current version.",
    );
  await withAccountLock(req.app, req.params.id, async () => {
    // The transaction keeps the status change and administrative audit together.
    await siteSettings();
    await mongoose.connection.transaction(async (session) => {
      const user = await User.findById(req.params.id).session(session);
      if (!user) throw new AppError(404, "Account not found.");
      if (user.role === "admin")
        throw new AppError(
          409,
          "Administrator accounts cannot be suspended from this screen. Manage their roles using the local administrator command.",
        );
      if (
        user.updatedAt.toISOString() !==
        new Date(body.expectedUpdatedAt).toISOString()
      )
        throw new AppError(
          409,
          "This account changed. Refresh the account list.",
          "STALE_ACCOUNT",
        );
      if (user.status === body.status) return;
      const before = user.status || "active";
      user.status = body.status;
      user.tokenVersion++;
      user.resetTokenHash = undefined;
      user.resetExpiresAt = undefined;
      await user.save({ session });
      await AdminAudit.create(
        [
          {
            actor: req.user._id,
            target: user._id,
            action: "account_status",
            from: before,
            to: user.status,
          },
        ],
        { session },
      );
    });
  });
  res.json({ updated: true });
}
export async function adminDefaults(req, res) {
  res.json({ settings: safeSite(await siteSettings()) });
}
export async function updateDefaults(req, res) {
  const previous = await siteSettings(),
    body = req.body;
  if (!Number.isInteger(body?.expectedRevision))
    throw new AppError(400, "Include the current settings revision.");
  const next = defaultsInput(body, previous);
  let updated;
  await mongoose.connection.transaction(async (session) => {
    updated = await SiteSettings.findOneAndUpdate(
      { _id: "site", revision: body.expectedRevision },
      { $set: next, $inc: { revision: 1 } },
      { new: true, runValidators: true, session },
    );
    if (!updated)
      throw new AppError(
        409,
        "Site settings changed. Refresh before saving.",
        "STALE_SITE_SETTINGS",
      );
    await AdminAudit.create(
      [
        {
          actor: req.user._id,
          action: "site_settings",
          revision: updated.revision,
        },
      ],
      { session },
    );
  });
  res.json({ settings: safeSite(updated) });
}
export async function adminAudit(req, res) {
  const page = req.query.page ?? "1";
  if (
    typeof page !== "string" ||
    !/^\d+$/.test(page) ||
    Number(page) < 1 ||
    Number(page) > 100000
  )
    throw new AppError(400, "Invalid audit page.");
  const total = await AdminAudit.countDocuments(),
    events = await AdminAudit.find()
      .sort({ at: -1, _id: -1 })
      .skip((Number(page) - 1) * 50)
      .limit(50)
      .lean();
  res.json({ events, total, page: Number(page), pageSize: 50 });
}
