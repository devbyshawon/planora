export function runtimeEnvironment(env) {
  const production = env.NODE_ENV === "production";
  if (!env.MONGODB_URI || !env.JWT_SECRET || env.JWT_SECRET.length < 32 || env.JWT_SECRET === "REPLACE_WITH_A_RANDOM_SECRET")
    throw new Error("Run npm run setup and configure MONGODB_URI and a JWT_SECRET of at least 32 characters.");
  const appOrigin = env.APP_ORIGIN || "http://localhost:5173";
  let origin;
  try { origin = new URL(appOrigin); } catch { throw new Error("APP_ORIGIN must be a valid origin."); }
  if (origin.origin !== appOrigin || origin.username || origin.password || !["http:", "https:"].includes(origin.protocol))
    throw new Error("APP_ORIGIN must contain only the scheme and hostname, with an optional port and no trailing slash.");
  if (production && origin.protocol !== "https:")
    throw new Error("Production APP_ORIGIN must use HTTPS.");
  const port = Number(env.PORT || 5001), proxy = env.TRUST_PROXY || "0";
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be an integer from 1 to 65535.");
  if (!/^[0-5]$/.test(proxy)) throw new Error("TRUST_PROXY must be an explicit trusted hop count from 0 to 5.");
  const mailMode = env.MAIL_MODE || (production ? "smtp" : "file");
  if (!["file", "smtp", "resend", "smtp2go"].includes(mailMode)) throw new Error("MAIL_MODE must be file, smtp, resend, or smtp2go.");
  if (production && mailMode === "file") throw new Error("Local email previews cannot be enabled in production. Use MAIL_MODE=smtp, resend, or smtp2go.");
  return { production, appOrigin, port, trustProxy: Number(proxy) || false, jwtSecret: env.JWT_SECRET, mongoUri: env.MONGODB_URI };
}
