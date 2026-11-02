import jwt from "jsonwebtoken";
import { AppError } from "../utils/errors.js";
export const ADMIN_COOKIE = "planora_admin";
export const adminCookieOptions = (config) => ({
  httpOnly: true,
  secure: config.production,
  sameSite: "lax",
  path: "/",
  maxAge: 15 * 60000,
});
export function requireAdmin(req, res, next) {
  if (req.user.role !== "admin")
    throw new AppError(
      403,
      "Administrator access is required.",
      "ADMIN_REQUIRED",
    );
  next();
}
export function adminUnlocked(req) {
  try {
    const claims = jwt.verify(
      req.cookies[ADMIN_COOKIE],
      req.app.locals.config.jwtSecret,
      { algorithms: ["HS256"], audience: "planora-admin" },
    );
    return (
      claims.sub === String(req.user._id) &&
      claims.version === req.user.tokenVersion &&
      claims.scope === "admin"
    );
  } catch {
    return false;
  }
}
export function requireAdminUnlock(req, res, next) {
  if (!adminUnlocked(req))
    throw new AppError(
      403,
      "Enter your password to unlock administration.",
      "ADMIN_LOCKED",
    );
  next();
}
export function unlockAdmin(req, res) {
  const token = jwt.sign(
    { version: req.user.tokenVersion, scope: "admin" },
    req.app.locals.config.jwtSecret,
    {
      subject: String(req.user._id),
      audience: "planora-admin",
      expiresIn: "15m",
      algorithm: "HS256",
    },
  );
  res.cookie(ADMIN_COOKIE, token, adminCookieOptions(req.app.locals.config));
}
