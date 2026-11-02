import { CALENDAR_SCOPE } from "../../src/utils/google/config.js";
export class FakeGoogle {
  subject = "google-1";
  email = "google-user@example.com";
  scope = `openid email ${CALENDAR_SCOPE}`;
  calls = [];
  calendars = new Map();
  events = new Map();
  failures = [];
  nextCalendar = 0;
  etag = 0;
  failRefresh = false;
  omitRefresh = false;
  dropInsert = false;
  dropCalendar = false;
  fail(method, path, status, count = 1) {
    this.failures.push({ method, path, status, count });
  }
  response(data, status = 200) {
    return new Response(status === 204 ? null : JSON.stringify(data), {
      status,
      headers: { "content-type": "application/json" },
    });
  }
  fetch = async (input, options = {}) => {
    const url = new URL(input),
      method = options.method || "GET",
      body =
        typeof options.body === "string"
          ? options.headers?.["Content-Type"] === "application/json"
            ? JSON.parse(options.body)
            : Object.fromEntries(new URLSearchParams(options.body))
          : null;
    const path = url.pathname + url.search;
    this.calls.push({
      url: url.toString(),
      method,
      body,
      headers: options.headers,
      path,
    });
    const failure = this.failures.find(
      (rule) =>
        rule.method === method && path.includes(rule.path) && rule.count > 0,
    );
    if (failure) {
      failure.count--;
      return this.response(
        { error: { message: "PRIVATE_PROVIDER_BODY_DO_NOT_EXPOSE" } },
        failure.status,
      );
    }
    if (url.hostname === "oauth2.googleapis.com" && url.pathname === "/token") {
      if (body.grant_type === "refresh_token" && this.failRefresh)
        return this.response({ error: "invalid_grant" }, 400);
      const subject =
        body.grant_type === "refresh_token"
          ? body.refresh_token.replace("refresh-secret-", "")
          : this.subject;
      return this.response({
        access_token: `access-secret-${subject}`,
        expires_in: 3600,
        scope: this.scope,
        ...(!this.omitRefresh
          ? { refresh_token: `refresh-secret-${subject}` }
          : {}),
      });
    }
    if (url.hostname === "oauth2.googleapis.com" && url.pathname === "/revoke")
      return this.response({});
    const subject = options.headers?.Authorization?.replace(
      "Bearer access-secret-",
      "",
    );
    if (!subject) return this.response({ error: "unauthorized" }, 401);
    if (url.hostname === "openidconnect.googleapis.com")
      return this.response({
        sub: subject,
        email: this.email,
        email_verified: true,
      });
    if (url.hostname !== "www.googleapis.com")
      throw new Error("Unexpected external URL");
    const pieces = url.pathname
      .replace("/calendar/v3", "")
      .split("/")
      .filter(Boolean)
      .map(decodeURIComponent);
    if (pieces.length === 1 && pieces[0] === "calendars" && method === "POST") {
      const id = `calendar-${++this.nextCalendar}@example.com`;
      const calendar = { id, subject, ...body };
      this.calendars.set(id, calendar);
      if (this.dropCalendar) {
        this.dropCalendar = false;
        throw new Error("Connection dropped after creation");
      }
      return this.response(calendar);
    }
    const calendar = this.calendars.get(pieces[1]);
    if (!calendar || calendar.subject !== subject)
      return this.response({ error: {} }, 404);
    if (pieces.length === 2 && method === "GET") return this.response(calendar);
    if (pieces[2] !== "events") return this.response({}, 404);
    const key = `${calendar.id}/${pieces[3] || body?.id}`;
    if (method === "GET")
      return this.events.has(key)
        ? this.response(this.events.get(key))
        : this.response({}, 404);
    if (method === "POST") {
      if (this.events.has(key)) return this.response({}, 409);
      if (!/^[0-9a-v]{5,1024}$/.test(body.id)) return this.response({}, 400);
      const event = { ...body, etag: `"${++this.etag}"` };
      this.events.set(key, event);
      if (this.dropInsert) {
        this.dropInsert = false;
        throw new Error("Connection dropped after insertion");
      }
      return this.response(event);
    }
    const event = this.events.get(key);
    if (!event || event.status === "cancelled") return this.response({}, 410);
    if (
      options.headers?.["If-Match"] &&
      options.headers["If-Match"] !== event.etag
    )
      return this.response({}, 412);
    if (method === "PATCH") {
      const next = { ...event, ...body, etag: `"${++this.etag}"` };
      this.events.set(key, next);
      return this.response(next);
    }
    if (method === "DELETE") {
      this.events.set(key, {
        id: event.id,
        status: "cancelled",
        etag: `"${++this.etag}"`,
      });
      return this.response({}, 204);
    }
    return this.response({}, 400);
  };
}
