import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "node:crypto";
import { AppError } from "../errors.js";
export const CALENDAR_SCOPE =
  "https://www.googleapis.com/auth/calendar.app.created";
export const GOOGLE_SCOPES = ["openid", "email", CALENDAR_SCOPE];
export const digest = (value) =>
  createHash("sha256").update(String(value)).digest("hex");
export function googleConfig(env, appOrigin) {
  const names = [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_REDIRECT_URI",
    "GOOGLE_TOKEN_KEY",
  ];
  if (!names.some((name) => env[name]?.trim())) return null;
  if (names.some((name) => !env[name]?.trim()))
    throw new Error(
      "Google Calendar configuration is incomplete. Set all four GOOGLE_* variables or leave all four blank.",
    );
  const value = {
    clientId: env.GOOGLE_CLIENT_ID.trim(),
    clientSecret: env.GOOGLE_CLIENT_SECRET.trim(),
    redirectUri: env.GOOGLE_REDIRECT_URI.trim(),
    tokenKey: env.GOOGLE_TOKEN_KEY.trim(),
  };
  let redirect;
  try {
    redirect = new URL(value.redirectUri);
  } catch {
    throw new Error("GOOGLE_REDIRECT_URI must be a valid callback URL.");
  }
  if (
    redirect.origin !== appOrigin ||
    redirect.pathname !== "/api/google/callback" ||
    redirect.search ||
    redirect.hash ||
    redirect.username ||
    redirect.password ||
    (redirect.protocol !== "https:" &&
      !["localhost", "127.0.0.1"].includes(redirect.hostname))
  )
    throw new Error(
      "GOOGLE_REDIRECT_URI must be APP_ORIGIN followed by /api/google/callback; use HTTPS outside localhost.",
    );
  if (!/^[0-9a-fA-F]{64}$/.test(value.tokenKey))
    throw new Error(
      "GOOGLE_TOKEN_KEY must contain 64 hexadecimal characters. Generate it with npm run google:key.",
    );
  return value;
}
export function configured(app) {
  const config = app.locals.config.google;
  if (!config)
    throw new AppError(
      503,
      "Google Calendar is not configured on this installation.",
      "GOOGLE_NOT_CONFIGURED",
    );
  return config;
}
export function encryptSecret(value, key, purpose) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);
  cipher.setAAD(Buffer.from(purpose));
  const content = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    content.toString("base64url"),
  ].join(".");
}
export function decryptSecret(value, key, purpose) {
  try {
    const [version, iv, tag, content, extra] = String(value).split(".");
    if (version !== "v1" || !iv || !tag || !content || extra)
      throw new Error("Invalid envelope");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      Buffer.from(key, "hex"),
      Buffer.from(iv, "base64url"),
    );
    decipher.setAAD(Buffer.from(purpose));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(content, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new AppError(
      409,
      "The saved Google connection cannot be unlocked. Restore the original token key or disconnect and connect again.",
      "GOOGLE_KEY_CHANGED",
    );
  }
}
