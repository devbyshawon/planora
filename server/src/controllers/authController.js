import bcrypt from "bcryptjs";
import { IANAZone } from "luxon";
import User from "../models/User.js";
import { AppError } from "../utils/errors.js";
import { safeUser, setSession, sessionOptions } from "../middleware/auth.js";
import { randomBytes, createHash } from "node:crypto";
import { checkPassword } from "../utils/password.js";
import { siteSettings } from "../utils/site.js";
import { ADMIN_COOKIE } from "../middleware/admin.js";
export async function register(req, res) {
  const site = await siteSettings();
  if (!site.registrationOpen)
    throw new AppError(
      403,
      "New account registration is currently closed.",
      "REGISTRATION_CLOSED",
    );
  const { name, email, password, timeZone = site.defaultTimeZone } = req.body;
  checkPassword(password);
  if (!IANAZone.isValidZone(timeZone))
    throw new AppError(400, "Choose a valid IANA timezone.");
  if (Buffer.byteLength(password, "utf8") > 72)
    throw new AppError(400, "Password must be at most 72 UTF-8 bytes.");
  const user = await User.create({
    name,
    email,
    passwordHash: await bcrypt.hash(password, 12),
    timeZone,
    preferences: { ...site.defaultPreferences, remindersEnabled: false },
    categories: site.defaultCategories.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
    })),
  });
  setSession(res, user, req.app.locals.config);
  res.status(201).json({ user: safeUser(user) });
}
export async function login(req, res) {
  const user = await User.findOne({ email: req.body.email }).select(
    "+passwordHash",
  );
  // A hash is checked even for missing accounts to reduce timing differences.
  const hash =
    user?.passwordHash ||
    "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxPHdRZVypQtVwue45v/Jt6fMXS";
  const valid = await bcrypt.compare(req.body.password, hash);
  if (!user || !valid)
    throw new AppError(
      401,
      "Email or password is incorrect.",
      "INVALID_CREDENTIALS",
    );
  if (user.status === "suspended")
    throw new AppError(
      403,
      "This account is suspended. Contact an administrator.",
      "ACCOUNT_SUSPENDED",
    );
  setSession(res, user, req.app.locals.config);
  res.json({ user: safeUser(user) });
}
export async function logout(req, res) {
  await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });
  const { maxAge, ...options } = sessionOptions(req.app.locals.config);
  res.clearCookie("planora_session", options);
  res.clearCookie(ADMIN_COOKIE, options);
  res.status(204).end();
}
export async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  checkPassword(newPassword);
  const user = await User.findById(req.user._id).select("+passwordHash");
  if (!(await bcrypt.compare(currentPassword, user.passwordHash)))
    throw new AppError(
      400,
      "Current password is incorrect.",
      "INVALID_PASSWORD",
    );
  if (await bcrypt.compare(newPassword, user.passwordHash))
    throw new AppError(
      400,
      "Choose a password different from your current one.",
    );
  const nextHash = await bcrypt.hash(newPassword, 12);
  const updated = await User.findOneAndUpdate(
    {
      _id: user._id,
      passwordHash: user.passwordHash,
      tokenVersion: req.user.tokenVersion,
    },
    {
      $set: { passwordHash: nextHash },
      $inc: { tokenVersion: 1 },
      $unset: { resetTokenHash: 1, resetExpiresAt: 1, resetRequestedAt: 1 },
    },
    { new: true },
  );
  if (!updated)
    throw new AppError(
      409,
      "Your account changed. Sign in again before retrying.",
    );
  setSession(res, updated, req.app.locals.config);
  res.json({ user: safeUser(updated) });
}
const hashToken = (token) => createHash("sha256").update(token).digest("hex");
export async function forgotPassword(req, res) {
  const send = req.app.locals.config.sendResetMail;
  if (!send)
    throw new AppError(
      503,
      "Password recovery is not configured. Set up email delivery on the server.",
      "MAIL_NOT_CONFIGURED",
    );
  const now = new Date(),
    token = randomBytes(32).toString("hex"),
    tokenHash = hashToken(token);
  const user = await User.findOneAndUpdate(
    {
      email: req.body.email,
      $or: [
        { resetRequestedAt: { $exists: false } },
        { resetRequestedAt: { $lt: new Date(now.getTime() - 60000) } },
      ],
    },
    {
      $set: {
        resetTokenHash: tokenHash,
        resetExpiresAt: new Date(now.getTime() + 15 * 60000),
        resetRequestedAt: now,
      },
    },
    { new: true },
  );
  if (user) {
    const url = new URL(req.app.locals.config.appOrigin);
    url.hash = `reset-password=${token}`;
    try {
      await send({ to: user.email, url: url.toString() });
    } catch {
      await User.updateOne(
        { _id: user._id, resetTokenHash: tokenHash },
        { $unset: { resetTokenHash: 1, resetExpiresAt: 1 } },
      );
      console.error(
        "Password recovery email delivery failed. Check the mail provider configuration.",
      );
    }
  }
  res.json({
    message:
      "If that email has an account, a password reset link will be sent. It expires in 15 minutes.",
  });
}
export async function resetPassword(req, res) {
  const { token, newPassword } = req.body;
  checkPassword(newPassword);
  const tokenHash = hashToken(token);
  const existing = await User.findOne({
    resetTokenHash: tokenHash,
    resetExpiresAt: { $gt: new Date() },
  });
  if (!existing)
    throw new AppError(
      400,
      "This reset link is invalid or expired. Request a new one.",
      "INVALID_RESET_TOKEN",
    );
  const passwordHash = await bcrypt.hash(newPassword, 12);
  const updated = await User.findOneAndUpdate(
    {
      _id: existing._id,
      tokenVersion: existing.tokenVersion,
      resetTokenHash: tokenHash,
      resetExpiresAt: { $gt: new Date() },
    },
    {
      $set: { passwordHash },
      $inc: { tokenVersion: 1 },
      $unset: { resetTokenHash: 1, resetExpiresAt: 1, resetRequestedAt: 1 },
    },
    { new: true },
  );
  if (!updated)
    throw new AppError(
      400,
      "This reset link is invalid or expired. Request a new one.",
      "INVALID_RESET_TOKEN",
    );
  const { maxAge, ...options } = sessionOptions(req.app.locals.config);
  res.clearCookie("planora_session", options);
  res.clearCookie(ADMIN_COOKIE, options);
  res.json({ message: "Password updated. Sign in with your new password." });
}
