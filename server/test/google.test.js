import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import Task from "../src/models/Task.js";
import User from "../src/models/User.js";
import Series from "../src/models/RecurrenceSeries.js";
import Connection from "../src/models/GoogleConnection.js";
import State from "../src/models/GoogleOAuthState.js";
import Mapping from "../src/models/GoogleEvent.js";
import Run from "../src/models/GoogleSyncRun.js";
import {
  googleConfig,
  encryptSecret,
  decryptSecret,
  CALENDAR_SCOPE,
} from "../src/utils/google/config.js";
import { FakeGoogle } from "./helpers/googleFake.js";
const origin = "http://localhost:5173",
  key = "ab".repeat(32),
  config = {
    clientId: "public-test-client",
    clientSecret: "private-test-client",
    redirectUri: origin + "/api/google/callback",
    tokenKey: key,
  };
const write = (req) => req.set("Origin", origin).set("X-Planora-Client", "web");
let db,
  app,
  google,
  serial = 0;
const range = { from: "2026-11-01", to: "2026-11-07" };
before(async () => {
  db = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    instanceOpts: [{ args: ["--nounixsocket"] }],
  });
  await mongoose.connect(db.getUri());
  await Promise.all([
    Task.init(),
    User.init(),
    Series.init(),
    Connection.init(),
    State.init(),
    Mapping.init(),
    Run.init(),
  ]);
});
beforeEach(() => {
  google = new FakeGoogle();
  app = createApp({
    jwtSecret: "stage6-private-test-secret-at-least-32-characters",
    appOrigin: origin,
    production: false,
    trustProxy: false,
    google: config,
    googleFetch: google.fetch,
    googleDelay: async () => {},
  });
});
after(async () => {
  await mongoose.disconnect();
  await db?.stop();
});
async function account(timeZone = "Asia/Dhaka") {
  const agent = request.agent(app),
    r = await write(agent.post("/api/auth/register")).send({
      name: "Planora User",
      email: `stage6-${++serial}@example.com`,
      password: "StrongPassword123",
      timeZone,
    });
  assert.equal(r.status, 201);
  return { agent, user: r.body.user };
}
async function begin(agent) {
  const r = await write(agent.post("/api/google/connect")).send({});
  assert.equal(r.status, 200);
  return {
    state: new URL(r.body.url).searchParams.get("state"),
    response: r,
    url: new URL(r.body.url),
  };
}
async function connect(agent) {
  const value = await begin(agent);
  const r = await agent
    .get("/api/google/callback")
    .query({ state: value.state, code: `code-${++serial}` });
  assert.equal(r.status, 303);
  assert.equal(
    new URL(r.headers.location).searchParams.get("google"),
    "connected",
    r.headers.location,
  );
  return value;
}
async function create(agent, values = {}) {
  const r = await write(agent.post("/api/tasks")).send({
    title: "Exact plan",
    date: "2026-11-02",
    startTime: "09:15",
    endTime: "09:55",
    category: "study",
    allowOverlap: true,
    ...values,
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.task;
}
async function start(agent, values = {}) {
  const r = await write(agent.post("/api/google/sync")).send({
    ...range,
    ...values,
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.run;
}
async function finish(agent, run) {
  let result = run,
    count = 0;
  while (result.status === "ready") {
    assert.ok(count++ < 200);
    const r = await write(agent.post(`/api/google/jobs/${run.id}/step`)).send(
      {},
    );
    assert.equal(r.status, 200, JSON.stringify(r.body));
    result = r.body.run;
  }
  return result;
}
const activeEvents = () =>
  [...google.events.values()].filter((e) => e.status !== "cancelled");

test("Google config is optional and token encryption is authenticated and owner-bound", () => {
  assert.equal(googleConfig({}, origin), null);
  assert.throws(
    () => googleConfig({ GOOGLE_CLIENT_ID: "only-one" }, origin),
    /incomplete/,
  );
  const env = {
    GOOGLE_CLIENT_ID: "id",
    GOOGLE_CLIENT_SECRET: "secret",
    GOOGLE_REDIRECT_URI: config.redirectUri,
    GOOGLE_TOKEN_KEY: key,
  };
  assert.equal(googleConfig(env, origin).redirectUri, config.redirectUri);
  assert.throws(() =>
    googleConfig(
      {
        ...env,
        GOOGLE_REDIRECT_URI: "https://evil.example/api/google/callback",
      },
      origin,
    ),
  );
  assert.throws(() =>
    googleConfig({ ...env, GOOGLE_TOKEN_KEY: "weak" }, origin),
  );
  const secret = encryptSecret("private-refresh", key, "owner-1");
  assert.ok(!secret.includes("private-refresh"));
  assert.equal(decryptSecret(secret, key, "owner-1"), "private-refresh");
  assert.throws(() => decryptSecret(secret, key, "owner-2"));
  assert.throws(() => decryptSecret(secret, "cd".repeat(32), "owner-1"));
});
test("Google endpoints enforce sessions, request origin, and optional configuration", async () => {
  assert.equal((await request(app).get("/api/google/status")).status, 401);
  const { agent } = await account();
  assert.equal((await agent.post("/api/google/connect").send({})).status, 403);
  app.locals.config.google = null;
  assert.equal((await agent.get("/api/google/status")).body.configured, false);
  assert.equal(
    (await write(agent.post("/api/google/connect")).send({})).status,
    503,
  );
});
test("OAuth uses encrypted PKCE, hashed state, browser binding and single-use callbacks", async () => {
  const { agent, user } = await account(),
    value = await begin(agent);
  assert.equal(value.url.origin, "https://accounts.google.com");
  assert.equal(value.url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(value.url.searchParams.get("access_type"), "offline");
  assert.ok(value.url.searchParams.get("scope").includes(CALENDAR_SCOPE));
  const saved = await State.findOne({ owner: user.id }).select("+verifier");
  assert.notEqual(saved.stateHash, value.state);
  assert.ok(saved.verifier.startsWith("v1."));
  const cookie = value.response.headers["set-cookie"].find((c) =>
    c.startsWith("planora_google_oauth="),
  );
  assert.ok(cookie.includes("HttpOnly") && cookie.includes("SameSite=Lax"));
  const otherBrowser = request.agent(app);
  await write(otherBrowser.post("/api/auth/login")).send({
    email: user.email,
    password: "StrongPassword123",
  });
  let r = await otherBrowser
    .get("/api/google/callback")
    .query({ state: value.state, code: "stolen" });
  assert.ok(r.headers.location.endsWith("google=expired"));
  r = await agent
    .get("/api/google/callback")
    .query({ state: value.state, code: "valid" });
  assert.ok(r.headers.location.endsWith("google=connected"));
  r = await agent
    .get("/api/google/callback")
    .query({ state: value.state, code: "again" });
  assert.ok(r.headers.location.endsWith("google=expired"));
  const connection = await Connection.findOne({ owner: user.id }).select(
    "+refreshToken",
  );
  assert.ok(connection.refreshToken.startsWith("v1."));
  assert.ok(!connection.refreshToken.includes("refresh-secret"));
  const status = await agent.get("/api/google/status");
  assert.ok(!JSON.stringify(status.body).includes("secret"));
  assert.equal(status.body.email, google.email);
  assert.equal(google.calendars.size, 1);
});
test("denied, expired and insufficient-scope OAuth attempts cannot connect an account", async () => {
  const { agent, user } = await account();
  let value = await begin(agent);
  let r = await agent
    .get("/api/google/callback")
    .query({ state: value.state, error: "access_denied" });
  assert.ok(r.headers.location.endsWith("google=denied"));
  value = await begin(agent);
  await State.updateOne(
    { owner: user.id },
    { $set: { expiresAt: new Date(Date.now() - 1) } },
  );
  r = await agent
    .get("/api/google/callback")
    .query({ state: value.state, code: "expired" });
  assert.ok(r.headers.location.endsWith("google=expired"));
  google.scope = "openid email";
  value = await begin(agent);
  r = await agent
    .get("/api/google/callback")
    .query({ state: value.state, code: "no-calendar" });
  assert.ok(r.headers.location.endsWith("google=permission"));
  assert.equal(await Connection.countDocuments({ owner: user.id }), 0);
});
test("logout invalidates an in-progress OAuth attempt", async () => {
  const { agent } = await account(),
    value = await begin(agent);
  await write(agent.post("/api/auth/logout")).send({});
  const r = await agent
    .get("/api/google/callback")
    .query({ state: value.state, code: "after-logout" });
  assert.ok(r.headers.location.endsWith("google=sign_in"));
  assert.equal(google.calendars.size, 0);
});
test("sync creates exact events and repeat sync updates the same remote event", async () => {
  const { agent } = await account();
  await connect(agent);
  const task = await create(agent, { notes: "Thesis notes", priority: "high" });
  let run = await finish(agent, await start(agent));
  assert.equal(run.counts.synced, 1);
  let event = activeEvents()[0];
  const id = event.id;
  assert.equal(event.start.dateTime, "2026-11-02T03:15:00.000Z");
  assert.equal(event.end.dateTime, "2026-11-02T03:55:00.000Z");
  assert.equal(event.start.timeZone, "Asia/Dhaka");
  assert.deepEqual(event.reminders.overrides, [
    { method: "popup", minutes: 10 },
  ]);
  run = await finish(agent, await start(agent));
  assert.equal(run.counts.unchanged, 1);
  assert.equal(activeEvents().length, 1);
  await write(agent.patch(`/api/tasks/${task._id}`)).send({
    title: "Updated thesis",
    startTime: "10:17",
    endTime: "11:03",
    status: "completed",
  });
  run = await finish(agent, await start(agent));
  event = activeEvents()[0];
  assert.equal(event.id, id);
  assert.equal(event.summary, "Updated thesis");
  assert.equal(event.start.dateTime, "2026-11-02T04:17:00.000Z");
  assert.deepEqual(event.reminders.overrides, []);
  event.summary = "Changed in Google";
  await finish(agent, await start(agent));
  assert.equal(activeEvents()[0].summary, "Updated thesis");
});
test("bucket/deleted tasks remove only their own mapped events and can be scheduled again", async () => {
  const { agent } = await account();
  await connect(agent);
  const task = await create(agent),
    deleted = await create(agent, { title: "Delete me" });
  await finish(agent, await start(agent));
  const calendar = [...google.calendars.keys()][0];
  google.events.set(calendar + "/unlinked", {
    id: "unlinked",
    summary: "User-created event",
    status: "confirmed",
  });
  await write(agent.patch(`/api/tasks/${task._id}`)).send({
    location: "bucket",
  });
  await write(agent.delete(`/api/tasks/${deleted._id}`)).send({});
  let run = await finish(agent, await start(agent));
  assert.equal(run.counts.removed, 2);
  assert.equal(activeEvents().length, 1);
  assert.equal(activeEvents()[0].summary, "User-created event");
  await write(agent.patch(`/api/tasks/${task._id}`)).send({
    location: "calendar",
    date: "2026-11-03",
    startTime: "09:15",
    endTime: "09:55",
  });
  run = await finish(agent, await start(agent));
  assert.equal(run.counts.synced, 1);
  assert.equal(activeEvents().length, 2);
});
test("syncing a prior date/category follows mapped tasks moved outside that range", async () => {
  const { agent } = await account();
  await connect(agent);
  const task = await create(agent);
  await finish(agent, await start(agent, { category: "study" }));
  const id = activeEvents()[0].id;
  await write(agent.patch(`/api/tasks/${task._id}`)).send({
    date: "2026-12-01",
    category: "work",
  });
  const run = await finish(agent, await start(agent, { category: "study" }));
  assert.equal(run.counts.synced, 1);
  assert.equal(activeEvents()[0].id, id);
  assert.equal(activeEvents()[0].start.dateTime, "2026-12-01T03:15:00.000Z");
  assert.ok(activeEvents()[0].description.includes("Work"));
});
test("recurring instances sync independently with exact exceptions and no resurrection", async () => {
  const { agent } = await account();
  await connect(agent);
  const r = await write(agent.post("/api/series")).send({
    title: "Daily research",
    date: range.from,
    startTime: "09:15",
    endTime: "09:55",
    category: "study",
    recurrence: { frequency: "daily", endDate: range.to },
    allowOverlap: true,
  });
  assert.equal(r.status, 201);
  let run = await finish(agent, await start(agent));
  assert.equal(run.counts.synced, 7);
  assert.ok(activeEvents().every((event) => !event.recurrence));
  const tasks = (await agent.get("/api/tasks").query(range)).body.tasks;
  await write(agent.patch(`/api/tasks/${tasks[1]._id}`)).send({
    date: "2026-11-06",
    startTime: "15:17",
    endTime: "16:03",
    allowOverlap: true,
  });
  await write(agent.delete(`/api/tasks/${tasks[2]._id}`)).send({});
  run = await finish(agent, await start(agent));
  assert.equal(run.counts.removed, 1);
  assert.equal(activeEvents().length, 6);
  assert.ok(
    activeEvents().some(
      (event) => event.start.dateTime === "2026-11-06T09:17:00.000Z",
    ),
  );
});
test("uncertain insertion is recovered by the persisted ID without duplicate remote events", async () => {
  const { agent } = await account();
  await connect(agent);
  await create(agent);
  google.dropInsert = true;
  const run = await finish(agent, await start(agent));
  assert.equal(run.counts.failed, 0);
  assert.equal(activeEvents().length, 1);
  assert.ok(
    google.calls.filter(
      (call) => call.method === "POST" && call.path.includes("/events"),
    ).length >= 2,
  );
});
test("a remotely deleted event is recreated with one new stable ID", async () => {
  const { agent } = await account();
  await connect(agent);
  await create(agent);
  await finish(agent, await start(agent));
  const [keyName, old] = [...google.events.entries()][0];
  google.events.set(keyName, { id: old.id, status: "cancelled" });
  await finish(agent, await start(agent));
  const newId = activeEvents()[0].id;
  assert.notEqual(newId, old.id);
  await finish(agent, await start(agent));
  assert.equal(activeEvents().length, 1);
  assert.equal(activeEvents()[0].id, newId);
});
test("foreign event markers are never overwritten or deleted", async () => {
  const { agent } = await account();
  await connect(agent);
  const task = await create(agent);
  await finish(agent, await start(agent));
  const remote = activeEvents()[0];
  remote.extendedProperties.private.planoraOwner = "another-owner";
  remote.summary = "Protected foreign event";
  let run = await finish(agent, await start(agent));
  assert.equal(run.counts.failed, 1);
  assert.equal(remote.summary, "Protected foreign event");
  await write(agent.delete(`/api/tasks/${task._id}`)).send({});
  run = await finish(agent, await start(agent));
  assert.equal(run.counts.failed, 1);
  assert.equal(activeEvents().length, 1);
});
test("partial failures are private and retry only failed items", async () => {
  const { agent } = await account();
  await connect(agent);
  await create(agent);
  await create(agent, { title: "Other task" });
  google.fail("POST", "/events", 403);
  let run = await finish(agent, await start(agent));
  assert.equal(run.counts.failed, 1);
  assert.equal(run.counts.synced, 1);
  assert.ok(!JSON.stringify(run).includes("PRIVATE_PROVIDER_BODY"));
  assert.ok(!JSON.stringify(run).includes("secret"));
  const retry = await write(
    agent.post(`/api/google/jobs/${run.id}/retry`),
  ).send({});
  assert.equal(retry.status, 200);
  run = await finish(agent, retry.body.run);
  assert.equal(run.counts.failed, 0);
  assert.equal(activeEvents().length, 2);
});
test("429 is boundedly retried and revoked refresh tokens require reconnect", async () => {
  const { agent, user } = await account();
  await connect(agent);
  await create(agent);
  google.fail("GET", "/events/", 429);
  let run = await finish(agent, await start(agent));
  assert.equal(run.counts.failed, 0);
  app.locals.googleTokens.clear();
  google.failRefresh = true;
  run = await finish(agent, await start(agent));
  assert.equal(run.counts.failed, 1);
  assert.equal(run.items[0].code, "GOOGLE_RECONNECT");
  assert.equal(
    (await agent.get("/api/google/status")).body.needsReconnect,
    true,
  );
  const stored = await Connection.findOne({ owner: user.id }).select(
    "+refreshToken",
  );
  assert.ok(!stored.refreshToken.includes("refresh-secret"));
});
test("jobs persist progress, refuse replacement while active, and remain owner-scoped", async () => {
  const { agent } = await account(),
    other = await account();
  await connect(agent);
  await create(agent);
  await create(agent, { title: "Second task" });
  const run = await start(agent);
  assert.equal(
    (await write(agent.post("/api/google/sync")).send(range)).status,
    409,
  );
  for (const suffix of ["", "/step", "/retry", "/cancel"]) {
    const r = suffix
      ? await write(
          other.agent.post(`/api/google/jobs/${run.id}${suffix}`),
        ).send({})
      : await other.agent.get(`/api/google/jobs/${run.id}`);
    assert.ok([404, 409].includes(r.status));
  }
  const first = await write(agent.post(`/api/google/jobs/${run.id}/step`)).send(
    {},
  );
  assert.equal(first.body.run.counts.pending, 1);
  const persisted = (await agent.get("/api/google/status")).body.run;
  assert.equal(persisted.counts.pending, 1);
  await finish(agent, persisted);
  assert.equal(activeEvents().length, 2);
});
test("concurrent step requests serialize and do not duplicate items", async () => {
  const { agent } = await account();
  await connect(agent);
  await create(agent);
  await create(agent, { title: "Concurrent second" });
  const run = await start(agent);
  const results = await Promise.all([
    write(agent.post(`/api/google/jobs/${run.id}/step`)).send({}),
    write(agent.post(`/api/google/jobs/${run.id}/step`)).send({}),
  ]);
  assert.ok(results.every((result) => result.status === 200));
  assert.equal(activeEvents().length, 2);
  assert.equal(
    (await agent.get(`/api/google/jobs/${run.id}`)).body.run.status,
    "complete",
  );
});
test("uncertain calendar creation is not blindly retried and can adopt its verified calendar", async () => {
  const { agent } = await account();
  google.dropCalendar = true;
  const value = await begin(agent);
  const r = await agent
    .get("/api/google/callback")
    .query({ state: value.state, code: "uncertain-calendar" });
  assert.ok(r.headers.location.endsWith("google=calendar"));
  assert.equal(google.calendars.size, 1);
  let status = (await agent.get("/api/google/status")).body;
  assert.equal(status.connected, true);
  assert.equal(status.calendarReady, false);
  assert.equal(status.calendarPending, true);
  assert.equal(
    (await write(agent.post("/api/google/calendar")).send({})).status,
    409,
  );
  assert.equal(google.calendars.size, 1);
  const calendarId = [...google.calendars.keys()][0];
  assert.equal(
    (await write(agent.post("/api/google/calendar")).send({ calendarId }))
      .status,
    200,
  );
  status = (await agent.get("/api/google/status")).body;
  assert.equal(status.calendarReady, true);
});
test("disconnect removes credentials, cancels pending work, keeps events and supports same-account reconnect", async () => {
  const { agent, user } = await account();
  await connect(agent);
  await create(agent);
  await finish(agent, await start(agent));
  const id = activeEvents()[0].id;
  const run = await start(agent);
  const r = await write(agent.post("/api/google/disconnect")).send({});
  assert.equal(r.status, 200);
  assert.equal(r.body.revoked, true);
  const connection = await Connection.findOne({ owner: user.id }).select(
    "+refreshToken",
  );
  assert.equal(connection.refreshToken, undefined);
  assert.equal(connection.connected, false);
  assert.equal(
    (await agent.get(`/api/google/jobs/${run.id}`)).body.run.status,
    "cancelled",
  );
  assert.equal(activeEvents().length, 1);
  await connect(agent);
  assert.equal(google.calendars.size, 1);
  await finish(agent, await start(agent));
  assert.equal(activeEvents()[0].id, id);
});
test("switching Google accounts requires disconnect and starts a separate calendar", async () => {
  const { agent } = await account();
  await connect(agent);
  google.subject = "google-2";
  google.email = "other-google@example.com";
  let value = await begin(agent);
  let r = await agent
    .get("/api/google/callback")
    .query({ state: value.state, code: "different" });
  assert.ok(r.headers.location.endsWith("google=account"));
  assert.equal(google.calendars.size, 1);
  await write(agent.post("/api/google/disconnect")).send({});
  await connect(agent);
  assert.equal(google.calendars.size, 2);
});
test("invalid ranges/categories and empty selections have explicit outcomes", async () => {
  const { agent } = await account();
  await connect(agent);
  for (const extra of [
    { from: "2026-02-30" },
    { to: "2028-01-01" },
    { category: { $ne: null } },
    { category: "foreign" },
  ])
    assert.equal(
      (await write(agent.post("/api/google/sync")).send({ ...range, ...extra }))
        .status,
      400,
    );
  const run = await start(agent);
  assert.equal(run.status, "complete");
  assert.equal(run.total, 0);
  assert.equal(activeEvents().length, 0);
});

test("an interrupted HTTP client does not release the Google mutation lock early", async () => {
  const { agent, user } = await account();
  await connect(agent);
  await create(agent);
  const run = await start(agent);
  const login = await write(request(app).post("/api/auth/login")).send({
    email: user.email,
    password: "StrongPassword123",
  });
  const cookie = login.headers["set-cookie"]
    .map((value) => value.split(";")[0])
    .join("; ");
  let entered, release;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const original = google.fetch;
  app.locals.config.googleFetch = async (url, options) => {
    if (String(url).includes("/events") && options.method === "POST") {
      entered();
      await gate;
    }
    return original(url, options);
  };
  const server = app.listen(0),
    address = await new Promise((resolve) =>
      server.once("listening", () => resolve(server.address())),
    );
  const controller = new AbortController();
  const step = fetch(
    `http://127.0.0.1:${address.port}/api/google/jobs/${run.id}/step`,
    {
      method: "POST",
      signal: controller.signal,
      headers: {
        Cookie: cookie,
        Origin: origin,
        "X-Planora-Client": "web",
        "Content-Type": "application/json",
      },
      body: "{}",
    },
  ).catch((error) => error);
  await started;
  controller.abort();
  let disconnected = false;
  const disconnect = write(agent.post("/api/google/disconnect"))
    .send({})
    .then((result) => {
      disconnected = true;
      return result;
    });
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(disconnected, false);
  release();
  await step;
  assert.equal((await disconnect).status, 200);
  assert.equal((await Run.findById(run.id)).status, "cancelled");
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});
test("missing encryption configuration still permits local disconnect and credential removal", async () => {
  const { agent, user } = await account();
  await connect(agent);
  app.locals.config.google = null;
  const r = await write(agent.post("/api/google/disconnect")).send({});
  assert.equal(r.status, 200);
  assert.equal(r.body.revoked, false);
  assert.equal(
    (await Connection.findOne({ owner: user.id }).select("+refreshToken"))
      .refreshToken,
    undefined,
  );
});
test("refreshed tokens stay encrypted, key changes require reconnect, and reconnect repairs access", async () => {
  const { agent, user } = await account();
  await connect(agent);
  await create(agent);
  app.locals.googleTokens.clear();
  let run = await finish(agent, await start(agent));
  assert.equal(run.counts.failed, 0);
  assert.ok(
    google.calls.some((call) => call.body?.grant_type === "refresh_token"),
  );
  app.locals.googleTokens.clear();
  app.locals.config.google = { ...config, tokenKey: "cd".repeat(32) };
  run = await finish(agent, await start(agent));
  assert.equal(run.counts.failed, 1);
  assert.equal(run.needsReconnect, true);
  assert.equal(
    (await agent.get("/api/google/status")).body.needsReconnect,
    true,
  );
  await connect(agent);
  assert.equal(
    (await Connection.findOne({ owner: user.id })).needsReconnect,
    false,
  );
  assert.equal(google.calendars.size, 1);
});
test("missing offline tokens, malformed callbacks, and cross-account states never persist credentials", async () => {
  const { agent, user } = await account(),
    other = await account();
  google.omitRefresh = true;
  let value = await begin(agent);
  let r = await agent
    .get("/api/google/callback")
    .query({ state: value.state, code: "no-offline-token" });
  assert.ok(r.headers.location.endsWith("google=refresh"));
  value = await begin(agent);
  r = await other.agent
    .get("/api/google/callback")
    .query({ state: value.state, code: "wrong-owner" });
  assert.ok(r.headers.location.endsWith("google=expired"));
  r = await agent.get("/api/google/callback").query({ state: value.state });
  assert.ok(r.headers.location.endsWith("google=failed"));
  assert.equal(await Connection.countDocuments({ owner: user.id }), 0);
});
test("a missing Planora calendar is replaced only during explicit reconnect", async () => {
  const { agent, user } = await account();
  await connect(agent);
  await create(agent);
  await finish(agent, await start(agent));
  const old = await Connection.findOne({ owner: user.id });
  google.calendars.delete(old.calendarId);
  const failed = await finish(agent, await start(agent));
  assert.equal(failed.counts.failed, 1);
  await connect(agent);
  const next = await Connection.findOne({ owner: user.id });
  assert.notEqual(next.calendarId, old.calendarId);
  assert.notEqual(next.generation, old.generation);
  await finish(agent, await start(agent));
  assert.equal(google.calendars.size, 1);
});

test("sync leases survive restarts and owned cancellation leaves completed remote work intact", async () => {
  const { agent } = await account(),
    other = await account();
  await connect(agent);
  await connect(other.agent);
  await create(agent);
  await create(agent, { title: "Pending second" });
  const run = await start(agent);
  for (const suffix of ["", "/step", "/retry", "/cancel"]) {
    const r = suffix
      ? await write(
          other.agent.post(`/api/google/jobs/${run.id}${suffix}`),
        ).send({})
      : await other.agent.get(`/api/google/jobs/${run.id}`);
    assert.equal(r.status, 404);
  }
  await Run.updateOne(
    { _id: run.id },
    { $set: { leaseUntil: new Date(Date.now() + 60000) } },
  );
  assert.equal(
    (await write(agent.post(`/api/google/jobs/${run.id}/step`)).send({}))
      .status,
    409,
  );
  await Run.updateOne(
    { _id: run.id },
    { $set: { leaseUntil: new Date(Date.now() - 1) } },
  );
  assert.equal(
    (await write(agent.post(`/api/google/jobs/${run.id}/step`)).send({}))
      .status,
    200,
  );
  assert.equal(activeEvents().length, 1);
  assert.equal(
    (await write(agent.post(`/api/google/jobs/${run.id}/cancel`)).send({})).body
      .run.status,
    "cancelled",
  );
  assert.equal(
    (await write(agent.post(`/api/google/jobs/${run.id}/step`)).send({})).body
      .run.status,
    "cancelled",
  );
  assert.equal(activeEvents().length, 1);
});
test("Google sync refuses a result above 5,000 links before writing remote events", async () => {
  const { agent, user } = await account();
  await connect(agent);
  await Task.insertMany(
    Array.from({ length: 5001 }, (_, i) => ({
      owner: user.id,
      title: `Size test ${i}`,
      date: "2026-11-02",
      startTime: "09:15",
      endTime: "09:55",
      startMinute: 555,
      endMinute: 595,
      durationMinutes: 40,
      timeZone: "Asia/Dhaka",
      startsAt: new Date("2026-11-02T03:15:00Z"),
      endsAt: new Date("2026-11-02T03:55:00Z"),
    })),
    { ordered: false },
  );
  const r = await write(agent.post("/api/google/sync")).send(range);
  assert.equal(r.status, 413);
  assert.equal(r.body.error.code, "GOOGLE_SYNC_TOO_LARGE");
  assert.equal(google.events.size, 0);
});

test("persistent 401 responses after token refresh expose a reconnect state without token leakage", async () => {
  const { agent } = await account();
  await connect(agent);
  await create(agent);
  google.fail("GET", "/events/", 401, 2);
  const run = await finish(agent, await start(agent));
  assert.equal(run.counts.failed, 1);
  assert.equal(run.needsReconnect, true);
  const status = (await agent.get("/api/google/status")).body;
  assert.equal(status.needsReconnect, true);
  assert.ok(!JSON.stringify(status).includes("secret"));
});
