import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import request from "supertest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createHash } from "node:crypto";
import { createApp } from "../src/app.js";
import User from "../src/models/User.js";
import Task from "../src/models/Task.js";
import { createResetMailer } from "../src/utils/mail.js";
let db, app, mail;
let counter = 0;
const origin = "http://localhost:5173",
  password = "InitialPassword123";
const write = (req) => req.set("Origin", origin).set("X-Planora-Client", "web");
const tokenOf = (entry) =>
  new URLSearchParams(new URL(entry.url).hash.slice(1)).get("reset-password");
before(async () => {
  db = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    instanceOpts: [{ args: ["--nounixsocket"] }],
  });
  await mongoose.connect(db.getUri());
  await User.init();
  await Task.init();
});
beforeEach(() => {
  mail = [];
  app = createApp({
    jwtSecret: "a-test-secret-with-at-least-32-characters",
    appOrigin: origin,
    production: false,
    trustProxy: false,
    sendResetMail: async (value) => {
      mail.push(value);
    },
  });
});
after(async () => {
  await mongoose.disconnect();
  await db?.stop();
});
async function account() {
  const agent = request.agent(app),
    email = `stage2-${++counter}@example.com`;
  const response = await write(agent.post("/api/auth/register")).send({
    name: "Shawon",
    email,
    password,
    timeZone: "Asia/Dhaka",
  });
  assert.equal(response.status, 201);
  return {
    agent,
    email,
    user: response.body.user,
    cookie: response.headers["set-cookie"][0].split(";")[0],
  };
}
const taskInput = {
  title: "Research",
  date: "2026-11-01",
  startTime: "09:15",
  endTime: "09:55",
  category: "study",
};
test("Stage 1 accounts migrate defaults without losing their task records", async () => {
  const email = `legacy-${++counter}@example.com`,
    id = new mongoose.Types.ObjectId();
  await User.collection.insertOne({
    _id: id,
    name: "Legacy",
    email,
    passwordHash: await bcrypt.hash(password, 12),
    timeZone: "Asia/Dhaka",
    tokenVersion: 0,
  });
  const legacyTask = await Task.create({
    ...taskInput,
    owner: id,
    notes: "Keep this note",
    postponeCount: 2,
  });
  const agent = request.agent(app);
  assert.equal(
    (await write(agent.post("/api/auth/login")).send({ email, password }))
      .status,
    200,
  );
  let response = await agent.get("/api/auth/me");
  assert.equal(response.body.user.categories.length, 4);
  assert.equal(response.body.user.preferences.theme, "light");
  const stored = await User.collection.findOne({ _id: id });
  assert.equal(stored.categories[0].id, "study");
  assert.equal(stored.preferences.weekStartsOn, 1);
  response = await write(agent.post("/api/account/categories")).send({
    name: "Research",
    color: "#123456",
  });
  assert.equal(response.status, 201);
  const preserved = await Task.findById(legacyTask._id);
  assert.equal(preserved.notes, "Keep this note");
  assert.equal(preserved.postponeCount, 2);
});
test("profile edits validate identity and require the current password for email changes", async () => {
  const { agent, email, user } = await account(),
    other = await account();
  let response = await write(agent.patch("/api/account/profile")).send({
    name: "MD. Shawon Hossain",
    owner: other.user.id,
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.user.id, user.id);
  assert.equal(response.body.user.name, "MD. Shawon Hossain");
  assert.equal(
    (await write(agent.patch("/api/account/profile")).send({ name: "  " }))
      .status,
    400,
  );
  assert.equal(
    (await write(agent.patch("/api/account/profile")).send({ email: "bad" }))
      .status,
    400,
  );
  assert.equal(
    (
      await write(agent.patch("/api/account/profile")).send({
        email: "new@example.com",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await write(agent.patch("/api/account/profile")).send({
        email: other.email,
        currentPassword: password,
      })
    ).status,
    409,
  );
  const before = (await agent.get("/api/auth/me")).body.user;
  assert.equal(before.email, email);
  const newEmail = `changed-${++counter}@example.com`;
  response = await write(agent.patch("/api/account/profile")).send({
    email: newEmail,
    currentPassword: password,
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.user.email, newEmail);
  assert.equal(response.body.user.resetTokenHash, undefined);
  assert.equal(
    (await other.agent.get("/api/auth/me")).body.user.name,
    "Shawon",
  );
});
test("password changes retain the current session and revoke other sessions and recovery links", async () => {
  const { agent, email, cookie } = await account();
  await write(agent.post("/api/auth/forgot-password")).send({ email });
  const oldToken = tokenOf(mail[0]);
  assert.equal(
    (
      await write(agent.post("/api/auth/change-password")).send({
        currentPassword: "wrong",
        newPassword: "UpdatedPassword456",
      })
    ).status,
    400,
  );
  let response = await write(agent.post("/api/auth/change-password")).send({
    currentPassword: password,
    newPassword: "UpdatedPassword456",
  });
  assert.equal(response.status, 200);
  assert.equal((await agent.get("/api/auth/me")).status, 200);
  assert.equal(
    (await request(app).get("/api/auth/me").set("Cookie", cookie)).status,
    401,
  );
  assert.equal(
    (
      await write(agent.post("/api/auth/reset-password")).send({
        token: oldToken,
        newPassword: "UnwantedPassword456",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await write(request(app).post("/api/auth/login")).send({
        email,
        password,
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await write(request(app).post("/api/auth/login")).send({
        email,
        password: "UpdatedPassword456",
      })
    ).status,
    200,
  );
});
test("recovery uses hashed, expiring, single-use tokens and generic request responses", async () => {
  const { agent, email, user, cookie } = await account();
  let known = await write(request(app).post("/api/auth/forgot-password")).send({
    email,
  });
  const unknown = await write(
    request(app).post("/api/auth/forgot-password"),
  ).send({ email: "no-account@example.com" });
  assert.deepEqual(known.body, unknown.body);
  assert.equal(mail.length, 1);
  await write(request(app).post("/api/auth/forgot-password")).send({ email });
  assert.equal(mail.length, 1);
  const token = tokenOf(mail[0]),
    stored = await User.findById(user.id).select(
      "+resetTokenHash +resetExpiresAt",
    );
  assert.notEqual(stored.resetTokenHash, token);
  assert.equal(
    stored.resetTokenHash,
    createHash("sha256").update(token).digest("hex"),
  );
  assert.ok(stored.resetExpiresAt > new Date());
  let response = await write(
    request(app).post("/api/auth/reset-password"),
  ).send({ token, newPassword: "RecoveredPassword456" });
  assert.equal(response.status, 200);
  assert.equal(
    (
      await write(agent.post("/api/auth/reset-password")).send({
        token,
        newPassword: "ReusedPassword456",
      })
    ).status,
    400,
  );
  assert.equal(
    (await request(app).get("/api/auth/me").set("Cookie", cookie)).status,
    401,
  );
  assert.equal(
    (
      await write(agent.post("/api/auth/login")).send({
        email,
        password: "RecoveredPassword456",
      })
    ).status,
    200,
  );
  await write(request(app).post("/api/auth/forgot-password")).send({ email });
  const expired = tokenOf(mail.at(-1));
  await User.updateOne(
    { _id: user.id },
    { $set: { resetExpiresAt: new Date(Date.now() - 1) } },
  );
  assert.equal(
    (
      await write(request(app).post("/api/auth/reset-password")).send({
        token: expired,
        newPassword: "ExpiredPassword456",
      })
    ).status,
    400,
  );
});
test("concurrent reset submissions consume a recovery link only once", async () => {
  const { email } = await account();
  await write(request(app).post("/api/auth/forgot-password")).send({ email });
  const token = tokenOf(mail[0]);
  const responses = await Promise.all([
    write(request(app).post("/api/auth/reset-password")).send({
      token,
      newPassword: "ConcurrentPassword123",
    }),
    write(request(app).post("/api/auth/reset-password")).send({
      token,
      newPassword: "ConcurrentPassword456",
    }),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 400]);
});
test("settings persist across sessions; timezone migration is atomic and preserves local times", async () => {
  const { agent, email, user } = await account();
  let response = await write(agent.post("/api/tasks")).send(taskInput);
  assert.equal(response.status, 201);
  const id = response.body.task._id;
  response = await write(agent.patch("/api/account/settings")).send({
    theme: "dark",
    timeFormat: "24h",
    weekStartsOn: 0,
    showHourGuides: false,
    defaultView: "month",
    reminderMinutes: 20,
  });
  assert.equal(response.status, 200);
  const other = request.agent(app);
  await write(other.post("/api/auth/login")).send({ email, password });
  assert.equal(
    (await other.get("/api/auth/me")).body.user.preferences.theme,
    "dark",
  );
  assert.equal(
    (
      await write(agent.patch("/api/account/settings")).send({
        weekStartsOn: 3,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await write(agent.patch("/api/account/settings")).send({
        timeZone: "invalid",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await write(agent.patch("/api/account/settings")).send({
        timeZone: "UTC",
      })
    ).body.error.code,
    "TIMEZONE_CONFIRMATION_REQUIRED",
  );
  response = await write(agent.patch("/api/account/settings")).send({
    timeZone: "UTC",
    confirmTimezoneChange: true,
  });
  assert.equal(response.status, 200);
  let task = await Task.findById(id);
  assert.equal(task.startTime, "09:15");
  assert.equal(task.date, "2026-11-01");
  assert.equal(task.startsAt.toISOString(), "2026-11-01T09:15:00.000Z");
  await write(agent.post("/api/tasks")).send({
    ...taskInput,
    title: "DST conflict",
    date: "2026-03-08",
    startTime: "02:15",
    endTime: "03:30",
  });
  response = await write(agent.patch("/api/account/settings")).send({
    timeZone: "America/New_York",
    confirmTimezoneChange: true,
    theme: "light",
  });
  assert.equal(response.status, 409);
  assert.equal(response.body.error.code, "TIMEZONE_TASK_CONFLICT");
  const unchanged = await User.findById(user.id);
  assert.equal(unchanged.timeZone, "UTC");
  assert.equal(unchanged.preferences.theme, "dark");
  task = await Task.findById(id);
  assert.equal(task.timeZone, "UTC");
});
test("custom categories remain private, preserve existing task IDs, and refuse deletion while in use", async () => {
  const { agent } = await account(),
    other = await account();
  let response = await write(agent.post("/api/account/categories")).send({
    name: "Research (AI)+ML",
    color: "#123abc",
  });
  assert.equal(response.status, 201);
  const id = response.body.categories.at(-1).id;
  assert.equal(
    (
      await write(agent.post("/api/account/categories")).send({
        name: "research (ai)+ml",
        color: "#123abc",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await write(other.agent.patch(`/api/account/categories/${id}`)).send({
        name: "Hijacked",
        color: "#000000",
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await write(other.agent.post("/api/tasks")).send({
        ...taskInput,
        category: id,
      })
    ).status,
    400,
  );
  response = await write(agent.post("/api/tasks")).send({
    ...taskInput,
    category: id,
    notes: "Preserve this",
  });
  assert.equal(response.status, 201);
  const taskId = response.body.task._id;
  response = await write(agent.patch(`/api/account/categories/${id}`)).send({
    name: "Thesis",
    color: "#654321",
  });
  assert.equal(response.status, 200);
  assert.equal((await Task.findById(taskId)).category, id);
  response = await write(agent.delete(`/api/account/categories/${id}`));
  assert.equal(response.status, 409);
  assert.equal(response.body.error.code, "CATEGORY_IN_USE");
  await write(agent.patch(`/api/tasks/${taskId}`)).send({ category: "study" });
  assert.equal(
    (await write(agent.delete(`/api/account/categories/${id}`))).status,
    200,
  );
  assert.equal((await Task.findById(taskId)).notes, "Preserve this");
  for (const category of ["work", "personal", "health"])
    assert.equal(
      (await write(agent.delete(`/api/account/categories/${category}`))).status,
      200,
    );
  assert.equal(
    (await write(agent.delete("/api/account/categories/study"))).status,
    409,
  );
  assert.equal(
    (await other.agent.get("/api/account/categories")).body.categories.length,
    4,
  );
});
test("production cannot expose local recovery previews and missing SMTP is reported consistently", async () => {
  assert.equal(createResetMailer({ MAIL_MODE: "file" }, true), null);
  const unconfigured = createApp({
    jwtSecret: "a-test-secret-with-at-least-32-characters",
    appOrigin: origin,
    production: false,
    trustProxy: false,
  });
  const response = await write(
    request(unconfigured).post("/api/auth/forgot-password"),
  ).send({ email: "any@example.com" });
  assert.equal(response.status, 503);
  assert.equal(response.body.error.code, "MAIL_NOT_CONFIGURED");
});
