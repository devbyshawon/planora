import Connection from "../../models/GoogleConnection.js";
import { configured, decryptSecret, encryptSecret } from "./config.js";
import { AppError } from "../errors.js";
export const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
export const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
export const CALENDAR_URL = "https://www.googleapis.com/calendar/v3";
export class GoogleError extends AppError {
  constructor(status, message, code) {
    super(status, message, code);
  }
}
export async function googleRequest(
  app,
  url,
  options = {},
  { retry = false } = {},
) {
  const fetcher = app.locals.config.googleFetch || fetch;
  for (let attempt = 0; ; attempt++) {
    let response, data;
    try {
      response = await fetcher(url, {
        ...options,
        redirect: "error",
        signal: AbortSignal.timeout(8000),
      });
      data = await response.json().catch(() => ({}));
    } catch {
      // Never include provider errors or request bodies: they can contain tokens.
      if (retry && attempt === 0) {
        await delay(app, 300);
        continue;
      }
      throw new GoogleError(
        502,
        "Google could not be reached. Retry this item shortly.",
        "GOOGLE_UNREACHABLE",
      );
    }
    if (response.ok) return data;
    if (
      retry &&
      attempt === 0 &&
      (response.status === 429 || response.status >= 500)
    ) {
      const seconds = Number(response.headers.get("retry-after"));
      await delay(
        app,
        Number.isFinite(seconds)
          ? Math.min(2000, Math.max(300, seconds * 1000))
          : 500,
      );
      continue;
    }
    const providerCode = typeof data.error === "string" ? data.error : "";
    if (providerCode === "invalid_grant" || response.status === 401)
      throw new GoogleError(
        409,
        "Google access expired or was revoked. Connect Google Calendar again.",
        "GOOGLE_RECONNECT",
      );
    const messages = {
      403: "Google refused this operation. Check Calendar API access and reconnect with the requested permission.",
      404: "The Google calendar or event is unavailable. Reconnect if the Planora calendar was deleted.",
      410: "This Google event was deleted.",
      409: "Google already has an event with this ID.",
      412: "The Google event changed during sync. Retry this item.",
      429: "Google is limiting requests. Wait briefly and retry failed items.",
    };
    throw new GoogleError(
      response.status,
      messages[response.status] ||
        "Google could not complete this operation. Retry or reconnect.",
      `GOOGLE_HTTP_${response.status}`,
    );
  }
}
const delay = (app, ms) =>
  app.locals.config.googleDelay
    ? app.locals.config.googleDelay(ms)
    : new Promise((resolve) => setTimeout(resolve, ms));
export const formRequest = (body) => ({
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(body).toString(),
});
export async function accessToken(app, connection) {
  const config = configured(app),
    cache = (app.locals.googleTokens ??= new Map()),
    key = `${connection.owner}:${connection.generation}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now() + 60000) return cached.token;
  const refresh = decryptSecret(
    connection.refreshToken,
    config.tokenKey,
    `refresh:${connection.owner}`,
  );
  let token;
  try {
    token = await googleRequest(
      app,
      TOKEN_URL,
      formRequest({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: "refresh_token",
        refresh_token: refresh,
      }),
    );
  } catch (error) {
    if (error.code === "GOOGLE_RECONNECT")
      await Connection.updateOne(
        { _id: connection._id },
        { $set: { needsReconnect: true } },
      );
    throw error;
  }
  if (typeof token.access_token !== "string" || !token.access_token)
    throw new GoogleError(
      502,
      "Google returned an incomplete token response. Connect again.",
      "GOOGLE_TOKEN_RESPONSE",
    );
  if (token.refresh_token) {
    connection.refreshToken = encryptSecret(
      token.refresh_token,
      config.tokenKey,
      `refresh:${connection.owner}`,
    );
    await connection.save();
  }
  cache.set(key, {
    token: token.access_token,
    expiresAt:
      Date.now() + Math.min(3600, Number(token.expires_in) || 3600) * 1000,
  });
  return token.access_token;
}
export async function calendarRequest(
  app,
  connection,
  path,
  { method = "GET", body, etag, retry = true } = {},
) {
  for (let attempt = 0; ; attempt++) {
    const token = await accessToken(app, connection);
    try {
      return await googleRequest(
        app,
        `${CALENDAR_URL}${path}`,
        {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            ...(body ? { "Content-Type": "application/json" } : {}),
            ...(etag ? { "If-Match": etag } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        },
        { retry },
      );
    } catch (error) {
      if (error.code === "GOOGLE_RECONNECT" && attempt === 0) {
        app.locals.googleTokens?.delete(
          `${connection.owner}:${connection.generation}`,
        );
        continue;
      }
      if (error.code === "GOOGLE_RECONNECT")
        await Connection.updateOne(
          { _id: connection._id },
          { $set: { needsReconnect: true } },
        );
      throw error;
    }
  }
}
