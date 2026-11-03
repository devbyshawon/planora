import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { AppError } from "../utils/errors.js";
import { CATEGORIES, DEFAULT_PREFERENCES } from "../../../shared/calendar.js";
export async function requireAuth(req, res, next) {
  const token = req.cookies.planora_session;
  if (!token) throw new AppError(401, "Please sign in.", "UNAUTHENTICATED");
  let claims;
  try {
    claims = jwt.verify(token, req.app.locals.config.jwtSecret, {
      algorithms: ["HS256"],
    });
  } catch {
    throw new AppError(
      401,
      "Your session expired. Please sign in again.",
      "UNAUTHENTICATED",
    );
  }
  let user = await User.findById(claims.sub);
  if (!user || user.tokenVersion !== claims.version)
    throw new AppError(401, "Please sign in again.", "UNAUTHENTICATED");
  if (user.status === "suspended")
    throw new AppError(
      403,
      "This account is suspended. Contact an administrator.",
      "ACCOUNT_SUSPENDED",
    );
  // Idempotent, non-destructive migration for accounts created in Stage 1.
  if (user.$isDefault("categories"))
    await User.updateOne(
      { _id: user._id, categories: { $exists: false } },
      { $set: { categories: CATEGORIES } },
    );
  if (user.$isDefault("preferences"))
    await User.updateOne(
      { _id: user._id, preferences: { $exists: false } },
      { $set: { preferences: DEFAULT_PREFERENCES } },
    );
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) ||
    (req.method === "GET" &&
      ["/api/tasks", "/api/insights", "/api/google", "/api/reminders", "/api/offline"].includes(
        req.baseUrl,
      ))
  ) {
    // This app runs as one Node process. Serialize an account's writes so category
    // deletion and timezone migration cannot race its task edits in this process.
    const locks = (req.app.locals.accountLocks ??= new Map());
    const key = String(user._id),
      previous = locks.get(key) || Promise.resolve();
    let release;
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    locks.set(key, pending);
    await previous;
    let released = false;
    const finish = () => {
      if (released) return;
      released = true;
      if (locks.get(key) === pending) locks.delete(key);
      release();
    };
    res.once("finish", finish);
    // A Google mutation can still finish after its HTTP client disconnects.
    // The route releases its lock in finally, after the external write settles.
    if (req.baseUrl === "/api/google" || (req.baseUrl === "/api/offline" && req.method === "POST")) req.releaseAccountLock = finish;
    res.once("close", () => {
      if (!req.releaseAccountLock) finish();
    });
    if (res.destroyed) {
      finish();
      return;
    }
    try {
      user = await User.findById(claims.sub);
      if (!user || user.tokenVersion !== claims.version)
        throw new AppError(401, "Please sign in again.", "UNAUTHENTICATED");
      if (user.status === "suspended")
        throw new AppError(
          403,
          "This account is suspended. Contact an administrator.",
          "ACCOUNT_SUSPENDED",
        );
    } catch (error) {
      finish();
      throw error;
    }
  }
  req.user = user;
  next();
}
export function sessionOptions(config) {
  return {
    httpOnly: true,
    secure: config.production,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 86400000,
  };
}
export function setSession(res, user, config) {
  const token = jwt.sign({ version: user.tokenVersion }, config.jwtSecret, {
    subject: String(user._id),
    expiresIn: "7d",
    algorithm: "HS256",
  });
  res.cookie("planora_session", token, sessionOptions(config));
}
export function safeUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    timeZone: user.timeZone,
    role: user.role || "user",
    status: user.status || "active",
    emailVerified: Boolean(user.emailVerifiedAt),
    preferences: user.preferences?.toObject?.() ?? user.preferences,
    categories: user.categories?.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
    })),
  };
}
