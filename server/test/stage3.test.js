import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import User from "../src/models/User.js";
import Task from "../src/models/Task.js";
import RecurrenceSeries from "../src/models/RecurrenceSeries.js";
import Template from "../src/models/Template.js";
import { materializeRecurrences } from "../src/utils/recurrence.js";
import { MAX_LIST_TASKS } from "../src/controllers/taskController.js";
let db,
  app,
  count = 0;
const origin = "http://localhost:5173";
const write = (req) => req.set("Origin", origin).set("X-Planora-Client", "web");
before(async () => {
  db = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    instanceOpts: [{ args: ["--nounixsocket"] }],
  });
  await mongoose.connect(db.getUri());
  await Promise.all([
    User.init(),
    Task.init(),
    RecurrenceSeries.init(),
    Template.init(),
  ]);
});
beforeEach(() => {
  app = createApp({
    jwtSecret: "a-stage3-test-secret-at-least-32-characters",
    appOrigin: origin,
    production: false,
    trustProxy: false,
  });
});
after(async () => {
  await mongoose.disconnect();
  await db?.stop();
});
async function account() {
  const agent = request.agent(app),
    email = `s3-${++count}@example.com`;
  const r = await write(agent.post("/api/auth/register")).send({
    name: "Shawon",
    email,
    password: "StrongPassword123",
    timeZone: "Asia/Dhaka",
  });
  assert.equal(r.status, 201);
  return { agent, user: r.body.user };
}
const base = {
  title: "Paper reading",
  notes: "BiomedCLIP",
  date: "2026-11-02",
  startTime: "09:15",
  endTime: "09:55",
  category: "study",
  priority: "high",
  recurrence: { frequency: "daily", endDate: "2026-11-06" },
};
async function series(agent, input = base) {
  const r = await write(agent.post("/api/series")).send(input);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.series;
}
async function tasks(agent, from = "2026-11-02", to = "2026-11-06") {
  const r = await agent.get(`/api/tasks?from=${from}&to=${to}`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.tasks;
}
test("occurrences have stable identities, independent status, and no concurrent duplicates", async () => {
  const { agent, user } = await account(),
    s = await series(agent);
  let list = await tasks(agent);
  assert.equal(list.length, 5);
  const ids = list.map((t) => t._id);
  await write(agent.patch(`/api/tasks/${ids[0]}`)).send({
    status: "completed",
  });
  list = await tasks(agent);
  assert.equal(list[0].status, "completed");
  assert.equal(list[1].status, "scheduled");
  assert.deepEqual(
    list.map((t) => t._id),
    ids,
  );
  const owner = await User.findById(user.id);
  await Promise.all([
    materializeRecurrences(owner, "2027-02-01", "2027-02-07"),
    materializeRecurrences(owner, "2027-02-01", "2027-02-07"),
  ]);
  assert.equal(await Task.countDocuments({ series: s._id }), 5);
});
test("a moved occurrence keeps its original slot and never reappears there", async () => {
  const { agent } = await account();
  await series(agent);
  let list = await tasks(agent),
    first = list[0];
  let r = await write(agent.patch(`/api/tasks/${first._id}`)).send({
    location: "bucket",
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.task.isException, true);
  list = await tasks(agent);
  assert.equal(list.length, 4);
  assert.equal(
    (await agent.get("/api/tasks?location=bucket")).body.tasks.length,
    1,
  );
  r = await write(agent.patch(`/api/tasks/${first._id}`)).send({
    location: "calendar",
    date: "2026-11-10",
    startTime: "10:15",
    endTime: "10:55",
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.task.occurrenceDate, "2026-11-02");
  assert.equal((await tasks(agent)).length, 4);
  const moved = await tasks(agent, "2026-11-10", "2026-11-10");
  assert.equal(moved[0]._id, first._id);
  assert.equal(moved[0].postponeCount, 1);
});
test("deleted occurrences remain suppressed after regeneration and whole-series edits", async () => {
  const { agent } = await account(),
    s = await series(agent);
  const list = await tasks(agent),
    id = list[1]._id;
  assert.equal((await write(agent.delete(`/api/tasks/${id}`))).status, 204);
  assert.equal((await tasks(agent)).length, 4);
  assert.equal(
    (
      await write(agent.patch(`/api/series/${s._id}`)).send({
        title: "Updated series",
      })
    ).status,
    200,
  );
  assert.equal((await tasks(agent)).length, 4);
  assert.ok((await Task.findById(id)).deletedAt);
  assert.equal(
    (await write(agent.patch(`/api/tasks/${id}`)).send({ status: "completed" }))
      .status,
    404,
  );
});
test("whole-series edits preserve completed and exceptional tasks and reconcile rule changes", async () => {
  const { agent } = await account(),
    s = await series(agent);
  let list = await tasks(agent);
  await write(agent.patch(`/api/tasks/${list[0]._id}`)).send({
    status: "completed",
  });
  await write(agent.patch(`/api/tasks/${list[1]._id}`)).send({
    notes: "My individual note",
  });
  let r = await write(agent.patch(`/api/series/${s._id}`)).send({
    title: "New plan",
    startTime: "10:15",
    endTime: "10:55",
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  list = await tasks(agent);
  assert.equal(list[0].title, "Paper reading");
  assert.equal(list[0].status, "completed");
  assert.equal(list[1].notes, "My individual note");
  assert.equal(list[1].startTime, "09:15");
  assert.equal(list[2].title, "New plan");
  assert.equal(list[2].startTime, "10:15");
  r = await write(agent.patch(`/api/series/${s._id}`)).send({
    recurrence: { frequency: "weekly", endDate: "2026-11-06" },
  });
  assert.equal(r.status, 200);
  assert.equal((await tasks(agent)).length, 2);
  r = await write(agent.patch(`/api/series/${s._id}`)).send({
    recurrence: { frequency: "daily", endDate: "2026-11-06" },
  });
  assert.equal(r.status, 200);
  assert.equal((await tasks(agent)).length, 5);
});
test("series overlap consent includes retained exceptions and invalid changes do not partially save", async () => {
  const { agent, user } = await account();
  await write(agent.post("/api/tasks")).send({
    ...base,
    title: "Existing slot",
    date: "2026-11-03",
  });
  let r = await write(agent.post("/api/series")).send(base);
  assert.equal(r.status, 409);
  assert.equal(r.body.error.code, "OVERLAP");
  assert.equal(await RecurrenceSeries.countDocuments({ owner: user.id }), 0);
  const s = await series(agent, { ...base, allowOverlap: true });
  let list = await tasks(agent);
  const occurrence = list.find(
    (t) => t.series === s._id && t.date === "2026-11-02",
  );
  await write(agent.patch(`/api/tasks/${occurrence._id}`)).send({
    date: "2026-11-04",
    startTime: "11:15",
    endTime: "11:55",
  });
  r = await write(agent.patch(`/api/series/${s._id}`)).send({
    startTime: "11:15",
    endTime: "11:55",
  });
  assert.equal(r.status, 409);
  assert.equal(r.body.error.code, "OVERLAP");
  assert.equal((await RecurrenceSeries.findById(s._id)).startTime, "09:15");
  r = await write(agent.patch(`/api/series/${s._id}`)).send({
    startTime: "14:00",
    endTime: "13:00",
  });
  assert.equal(r.status, 400);
  assert.equal((await RecurrenceSeries.findById(s._id)).startTime, "09:15");
});
test("unbounded rules expand beyond the initial horizon and follow the saved timezone", async () => {
  const { agent, user } = await account(),
    s = await series(agent, {
      ...base,
      recurrence: { frequency: "weekly", endDate: null },
    });
  const before = await Task.countDocuments({ series: s._id });
  let list = await tasks(agent, "2027-05-03", "2027-05-09");
  assert.equal(list.length, 1);
  assert.ok((await Task.countDocuments({ series: s._id })) > before);
  const owner = await User.findById(user.id);
  await Promise.all([
    materializeRecurrences(owner, "2027-06-01", "2027-06-30"),
    materializeRecurrences(owner, "2027-06-01", "2027-06-30"),
  ]);
  const all = await Task.find({ series: s._id });
  assert.equal(new Set(all.map((t) => t.occurrenceDate)).size, all.length);
  assert.equal(
    (
      await write(agent.patch("/api/account/settings")).send({
        timeZone: "UTC",
        confirmTimezoneChange: true,
      })
    ).status,
    200,
  );
  list = await tasks(agent, "2028-05-01", "2028-05-07");
  assert.equal(list[0].startsAt, `${list[0].date}T09:15:00.000Z`);
});
test("templates support private CRUD, independent application, overlap warnings, and category protection", async () => {
  const { agent } = await account(),
    other = await account();
  let r = await write(agent.post("/api/account/categories")).send({
    name: "Thesis",
    color: "#123456",
  });
  const category = r.body.categories.at(-1).id;
  r = await write(agent.post("/api/templates")).send({
    ...base,
    name: "Research block",
    category,
  });
  assert.equal(r.status, 201);
  const id = r.body.template._id;
  assert.equal(
    (
      await write(agent.post("/api/templates")).send({
        ...base,
        name: "research block",
      })
    ).status,
    409,
  );
  assert.equal(
    (await other.agent.get("/api/templates")).body.templates.length,
    0,
  );
  assert.equal(
    (
      await write(other.agent.post(`/api/templates/${id}/apply`)).send({
        date: "2026-11-02",
      })
    ).status,
    404,
  );
  assert.equal(
    (await write(agent.delete(`/api/account/categories/${category}`))).status,
    409,
  );
  r = await write(agent.post(`/api/templates/${id}/apply`)).send({
    date: "2026-11-02",
  });
  assert.equal(r.status, 201);
  const taskId = r.body.task._id;
  assert.equal(r.body.task.series, undefined);
  assert.equal(
    (
      await write(agent.post(`/api/templates/${id}/apply`)).send({
        date: "2026-11-02",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await write(agent.patch(`/api/templates/${id}`)).send({
        title: "New template title",
      })
    ).status,
    200,
  );
  assert.equal((await Task.findById(taskId)).title, "Paper reading");
  assert.equal((await write(agent.delete(`/api/templates/${id}`))).status, 204);
  assert.ok(await Task.findById(taskId));
});
test("task lists reject oversized results without silently hiding records; search remains available", async () => {
  const { agent, user } = await account(), other = await account();
  const records = await Task.insertMany(Array.from({ length: MAX_LIST_TASKS + 1 }, (_, i) => ({
    owner: user.id, title: `Large bucket ${i}`, category: "study", location: "bucket",
  })));
  let result = await agent.get("/api/tasks?location=bucket");
  assert.equal(result.status, 413);
  assert.equal(result.body.error.code, "TASK_LIST_TOO_LARGE");
  result = await agent.get("/api/tasks/search?location=bucket&page=2");
  assert.equal(result.status, 200);
  assert.equal(result.body.total, MAX_LIST_TASKS + 1);
  assert.equal(result.body.tasks.length, 50);
  assert.equal((await other.agent.get("/api/tasks?location=bucket")).body.tasks.length, 0);
  await Task.updateOne({ _id: records[0]._id }, { $set: { deletedAt: new Date() } });
  result = await agent.get("/api/tasks?location=bucket");
  assert.equal(result.status, 200);
  assert.equal(result.body.tasks.length, MAX_LIST_TASKS);
  // The same guard applies to the calendar, without affecting smaller ranges.
  await Task.updateMany({ owner: user.id }, { $set: { location: "calendar", date: "2026-12-01", startMinute: 555 } });
  await Task.updateOne({ _id: records[0]._id }, { $unset: { deletedAt: 1 } });
  result = await agent.get("/api/tasks?from=2026-12-01&to=2026-12-01");
  assert.equal(result.status, 413);
  assert.equal((await agent.get("/api/tasks?from=2026-12-02&to=2026-12-02")).status, 200);
});
test("templates respect bucket selection and reject invalid destinations", async () => {
  const { agent } = await account();
  const saved = await write(agent.post("/api/templates")).send({ ...base, name: "Bucket template" });
  assert.equal(saved.status, 201);
  const path = `/api/templates/${saved.body.template._id}/apply`;
  const result = await write(agent.post(path)).send({ location: "bucket" });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal(result.body.task.location, "bucket");
  assert.equal(result.body.task.date, undefined);
  assert.equal(result.body.task.startsAt, undefined);
  assert.equal(result.body.task.status, "not_completed");
  assert.equal(result.body.task.title, base.title);
  assert.equal(result.body.task.notes, base.notes);
  assert.equal(result.body.task.priority, base.priority);
  assert.equal((await write(agent.post(path)).send({ location: "invalid" })).status, 400);
});
test("global search validates filters, searches notes/categories literally, includes bucket items, and paginates", async () => {
  const { agent, user } = await account(),
    other = await account();
  await write(agent.post("/api/tasks")).send({
    ...base,
    title: "Literal [AI]+ notes",
    notes: "causal root cause",
  });
  await write(agent.post("/api/tasks")).send({
    title: "Undated idea",
    location: "bucket",
    priority: "high",
  });
  await write(other.agent.post("/api/tasks")).send({
    ...base,
    title: "Other account",
  });
  let r = await agent.get(
    "/api/tasks/search?from=2026-11-01&to=2026-11-30&q=%5BAI%5D%2B",
  );
  assert.equal(r.status, 200);
  assert.equal(r.body.total, 1);
  assert.equal(r.body.tasks[0].title, "Literal [AI]+ notes");
  r = await agent.get(
    "/api/tasks/search?q=causal&priority=high&status=scheduled&location=calendar",
  );
  assert.equal(r.body.total, 1);
  r = await agent.get(
    "/api/tasks/search?from=2027-01-01&to=2027-01-31&location=bucket",
  );
  assert.equal(r.body.total, 1);
  assert.equal(r.body.tasks[0].title, "Undated idea");
  assert.equal(
    (await agent.get("/api/tasks/search?from=2020-01-01&to=2030-01-01")).status,
    400,
  );
  assert.equal((await agent.get("/api/tasks/search?status=wrong")).status, 400);
  await Task.insertMany(
    Array.from({ length: 55 }, (_, i) => ({
      owner: user.id,
      title: `Page ${i}`,
      location: "bucket",
      category: "study",
      priority: "low",
    })),
  );
  r = await agent.get("/api/tasks/search?q=Page&page=1");
  assert.equal(r.body.total, 55);
  assert.equal(r.body.tasks.length, 50);
  const ids = r.body.tasks.map((t) => t._id);
  r = await agent.get("/api/tasks/search?q=Page&page=2");
  assert.equal(r.body.tasks.length, 5);
  assert.ok(r.body.tasks.every((t) => !ids.includes(t._id)));
});
test("series ownership and entire-series deletion include bucket items and stop future generation", async () => {
  const { agent } = await account(),
    other = await account(),
    s = await series(agent);
  const list = await tasks(agent);
  assert.equal((await other.agent.get(`/api/series/${s._id}`)).status, 404);
  assert.equal(
    (
      await write(other.agent.patch(`/api/series/${s._id}`)).send({
        title: "Hijacked",
      })
    ).status,
    404,
  );
  assert.equal(
    (await write(other.agent.delete(`/api/series/${s._id}`))).status,
    404,
  );
  await write(agent.patch(`/api/tasks/${list[0]._id}`)).send({
    location: "bucket",
  });
  assert.equal((await write(agent.delete(`/api/series/${s._id}`))).status, 204);
  assert.equal((await tasks(agent)).length, 0);
  assert.equal(
    (await agent.get("/api/tasks?location=bucket")).body.tasks.length,
    0,
  );
  assert.equal((await agent.get("/api/series")).body.series.length, 0);
});
