import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import User from "../src/models/User.js";
import Task from "../src/models/Task.js";
import Receipt from "../src/models/OfflineOperation.js";
import Series from "../src/models/RecurrenceSeries.js";
import SiteSettings from "../src/models/SiteSettings.js";
import { enqueue } from "../../client/src/offline/model.js";
let db, app, serial = 0;
const origin = "http://localhost:5173";
const write = r => r.set("Origin", origin).set("X-Planora-Client", "web");
before(async () => {
  db = await MongoMemoryReplSet.create({ replSet: { count: 1 }, instanceOpts: [{ args: ["--nounixsocket"] }] });
  await mongoose.connect(db.getUri());
  await Promise.all([User.init(), Task.init(), Receipt.init(), Series.init(), SiteSettings.init()]);
});
beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Task.deleteMany({}), Receipt.deleteMany({}), Series.deleteMany({}), SiteSettings.deleteMany({})]);
  app = createApp({ jwtSecret: "offline-test-secret-with-more-than-32-characters", appOrigin: origin, production: false });
});
after(async () => { await mongoose.disconnect(); await db?.stop(); });
async function account() {
  const agent = request.agent(app);
  const r = await write(agent.post("/api/auth/register")).send({ name: "Offline test", email: `offline-${++serial}@example.com`, password: "OnlyTestPassword123", timeZone: "Asia/Dhaka" });
  assert.equal(r.status, 201); return { agent, user: r.body.user };
}
const body = { title: "Offline task", notes: "Private notes", category: "study", priority: "medium", status: "scheduled", location: "calendar", date: "2026-11-03", startTime: "09:15", endTime: "09:55" };
const operation = (extra = {}) => ({ id: randomUUID(), taskId: new mongoose.Types.ObjectId().toString(), kind: "create", timeZone: "Asia/Dhaka", body, allowOverlap: false, ...extra });
const send = (agent, op) => write(agent.post("/api/offline/operations")).send(op);

test("offline snapshots and operations enforce session, origin, and owner isolation", async () => {
  assert.equal((await request(app).get("/api/offline/snapshot")).status, 401);
  const a = await account(), b = await account(), op = operation();
  assert.equal((await a.agent.post("/api/offline/operations").send(op)).status, 403);
  assert.equal((await send(a.agent, op)).status, 200);
  const snapshot = await a.agent.get("/api/offline/snapshot");
  assert.equal(snapshot.status, 200); assert.equal(snapshot.body.tasks.length, 1);
  assert.equal(snapshot.body.user.id, a.user.id);
  assert.ok(!JSON.stringify(snapshot.body).includes("passwordHash"));
  assert.equal((await b.agent.get("/api/offline/snapshot")).body.tasks.length, 0);
  assert.equal((await send(b.agent, operation({ taskId: op.taskId, kind: "update", expectedUpdatedAt: snapshot.body.tasks[0].updatedAt }))).status, 409);
});

test("offline creates retry idempotently, reject reused payloads, and track history", async () => {
  const { agent } = await account(), op = operation();
  const first = await send(agent, op), retry = await send(agent, op);
  assert.equal(first.status, 200); assert.deepEqual(retry.body, first.body);
  assert.equal(await Task.countDocuments({}), 1); assert.equal(await Receipt.countDocuments({}), 1);
  const task = await Task.findById(op.taskId).select("+history");
  assert.equal(task.durationMinutes, 40); assert.equal(task.history.length, 1); assert.ok(task.createdAt);
  assert.equal((await send(agent, { ...op, body: { ...body, title: "Changed retry" } })).status, 409);
});

test("offline queues chain versions, preserve movement history, and retry deletes", async () => {
  const { agent } = await account(), create = operation();
  await send(agent, create);
  const update = operation({ taskId: create.taskId, kind: "update", parentId: create.id, body: { ...body, location: "bucket" } });
  assert.equal((await send(agent, update)).status, 200);
  const saved = await Task.findById(create.taskId).select("+history");
  assert.equal(saved.location, "bucket"); assert.equal(saved.postponeCount, 1); assert.equal(saved.history.length, 2);
  const remove = operation({ taskId: create.taskId, kind: "delete", parentId: update.id });
  assert.equal((await send(agent, remove)).status, 200);
  assert.equal((await send(agent, remove)).status, 200);
  assert.ok((await Task.findById(create.taskId)).deletedAt);
  assert.equal((await agent.get("/api/offline/snapshot")).body.tasks.filter(t=>!t.deletedAt).length, 0);
});

test("server changes, deleted tasks, timezone changes, and missing parent operations pause sync", async () => {
  const { agent, user } = await account(), create = operation();
  const saved = await send(agent, create);
  await Task.updateOne({ _id: create.taskId }, { $set: { title: "Newer server edit", updatedAt: new Date(Date.now() + 10000) } }, { timestamps: false });
  const edit = operation({ kind: "update", taskId: create.taskId, expectedUpdatedAt: saved.body.updatedAt });
  assert.equal((await send(agent, edit)).body.error.code, "OFFLINE_CONFLICT");
  assert.equal((await Task.findById(create.taskId)).title, "Newer server edit");
  assert.equal((await send(agent, { ...edit, id: randomUUID(), parentId: randomUUID() })).status, 409);
  await User.updateOne({ _id: user.id }, { $set: { timeZone: "UTC" } });
  assert.equal((await send(agent, operation())).status, 409);
  await User.updateOne({ _id: user.id }, { $set: { timeZone: "Asia/Dhaka" } });
  await Task.updateOne({ _id: create.taskId }, { $set: { deletedAt: new Date() } });
  assert.equal((await send(agent, { ...edit, id: randomUUID() })).status, 409);
});

test("offline validation and overlaps cannot partially write tasks or receipts", async () => {
  const { agent } = await account();
  for (const invalid of [{ title: "" }, { category: "foreign" }, { startTime: "10:00", endTime: "09:00" }, { date: "2026-02-31" }]) {
    assert.ok((await send(agent, operation({ body: { ...body, ...invalid } }))).status >= 400);
  }
  assert.equal(await Task.countDocuments({}), 0); assert.equal(await Receipt.countDocuments({}), 0);
  await send(agent, operation());
  const overlapping = operation();
  assert.equal((await send(agent, overlapping)).status, 409);
  assert.equal(await Task.countDocuments({}), 1); assert.equal(await Receipt.countDocuments({}), 1);
  assert.equal((await send(agent, { ...overlapping, allowOverlap: true })).status, 200);
});

test("concurrent retries create one task and one receipt", async () => {
  const { agent } = await account(), op = operation();
  const results = await Promise.all([send(agent, op), send(agent, op)]);
  assert.deepEqual(results.map(r => r.status), [200, 200]);
  assert.equal(await Task.countDocuments({}), 1); assert.equal(await Receipt.countDocuments({}), 1);
});

test("local edits preserve a durable operation chain without changing input state", () => {
  const initial = { version: 1, snapshot: { user: { id: "owner", timeZone: "Asia/Dhaka", categories: [{ id: "study" }] }, tasks: [] }, queue: [] };
  const first = enqueue(initial, { id: "first", taskId: "task", kind: "create", body });
  assert.equal(initial.queue.length, 0); assert.equal(initial.snapshot.tasks.length, 0);
  const second = enqueue(first, { id: "second", taskId: "task", kind: "update", body: { title: "Edited" }, allowOverlap: true });
  assert.equal(second.queue[1].parentId, "first"); assert.equal(second.snapshot.tasks[0].title, "Edited");
  const third = enqueue(second, { id: "third", taskId: "task", kind: "delete" });
  assert.equal(third.queue[2].parentId, "second"); assert.equal(third.snapshot.tasks.length, 0);
  assert.equal(third.queue.length, 3);
  assert.throws(() => enqueue(initial, { id: "bad", taskId: "bad", kind: "create", body: { ...body, endTime: "08:00" } }));
});
