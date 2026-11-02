import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import Task from "../src/models/Task.js";
import User from "../src/models/User.js";
import RecurrenceSeries from "../src/models/RecurrenceSeries.js";
import Template from "../src/models/Template.js";
let db,
  app,
  count = 0;
const origin = "http://localhost:5173",
  fixedNow = () => new Date("2026-11-01T00:30:00.000Z");
const write = (req) => req.set("Origin", origin).set("X-Planora-Client", "web");
before(async () => {
  db = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    instanceOpts: [{ args: ["--nounixsocket"] }],
  });
  await mongoose.connect(db.getUri());
  await Promise.all([
    Task.init(),
    User.init(),
    RecurrenceSeries.init(),
    Template.init(),
  ]);
});
beforeEach(() => {
  app = createApp({
    jwtSecret: "a-stage4-test-secret-of-at-least-32-characters",
    appOrigin: origin,
    production: false,
    trustProxy: false,
    now: fixedNow,
  });
});
after(async () => {
  await mongoose.disconnect();
  await db?.stop();
});
async function account(timeZone = "Asia/Dhaka") {
  const agent = request.agent(app),
    r = await write(agent.post("/api/auth/register")).send({
      name: "Shawon",
      email: `s4-${++count}@example.com`,
      password: "StrongPassword123",
      timeZone,
    });
  assert.equal(r.status, 201);
  return { agent, user: r.body.user };
}
const input = {
  title: "Thesis",
  date: "2026-10-29",
  startTime: "09:15",
  endTime: "09:55",
  category: "study",
  notes: "Keep these notes",
};
async function create(agent, body = input) {
  const r = await write(agent.post("/api/tasks")).send(body);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.task;
}
test("task history records exact moves and rescheduling without losing notes or identity", async () => {
  const { agent } = await account(),
    task = await create(agent);
  await write(agent.patch(`/api/tasks/${task._id}`)).send({
    location: "bucket",
  });
  await write(agent.patch(`/api/tasks/${task._id}`)).send({
    location: "calendar",
    date: "2026-10-30",
    startTime: "10:15",
    endTime: "10:55",
  });
  await write(agent.patch(`/api/tasks/${task._id}`)).send({
    status: "completed",
  });
  const r = await agent.get(`/api/tasks/${task._id}/history`);
  assert.equal(r.status, 200);
  assert.deepEqual(
    r.body.events.map((e) => e.type),
    ["completed", "rescheduled", "moved_to_bucket", "created"],
  );
  assert.equal(r.body.events[1].from.date, "2026-10-29");
  assert.equal(r.body.events[1].to.startTime, "10:15");
  assert.equal(r.body.task.postponeCount, 1);
  const current = await agent.get(`/api/tasks/${task._id}`);
  assert.equal(current.body.task.notes, input.notes);
  assert.equal(current.body.task.history, undefined);
  assert.equal(current.body.task.plans.length, 2);
});
test("history access is owner-scoped and supports stable pagination", async () => {
  const { agent } = await account(),
    other = await account(),
    task = await create(agent);
  assert.equal(
    (await other.agent.get(`/api/tasks/${task._id}/history`)).status,
    404,
  );
  assert.equal((await other.agent.get(`/api/tasks/${task._id}`)).status, 404);
  await Task.updateOne(
    { _id: task._id },
    {
      $push: {
        history: {
          $each: Array.from({ length: 61 }, () => ({
            type: "edited",
            at: new Date(),
          })),
        },
      },
    },
  );
  let r = await agent.get(`/api/tasks/${task._id}/history?page=1`);
  assert.equal(r.body.events.length, 50);
  const ids = r.body.events.map((e) => e._id);
  r = await agent.get(`/api/tasks/${task._id}/history?page=2`);
  assert.equal(r.body.events.length, 12);
  assert.ok(r.body.events.every((e) => !ids.includes(e._id)));
  assert.equal(r.body.total, 62);
  assert.equal(r.body.legacy, false);
  r = await agent.get(`/api/tasks/${task._id}/history?page=3`);
  assert.equal(r.body.events.length, 0);
  assert.equal(r.body.total, 62);
  assert.equal(
    (await agent.get(`/api/tasks/${task._id}/history?page=0`)).status,
    400,
  );
});
test("review decisions are explicit, persisted, and idempotent", async () => {
  const { agent } = await account(),
    keep = await create(agent),
    bucket = await create(agent, {
      ...input,
      title: "Bucket",
      startTime: "10:15",
      endTime: "10:55",
    }),
    remove = await create(agent, {
      ...input,
      title: "Delete",
      startTime: "11:15",
      endTime: "11:55",
    }),
    done = await create(agent, {
      ...input,
      title: "Done",
      startTime: "12:15",
      endTime: "12:55",
      status: "completed",
    });
  let r = await agent.get("/api/insights/review?date=2026-10-29");
  assert.equal(r.body.tasks.length, 3);
  assert.equal(
    (await agent.get(`/api/tasks/${done._id}`)).body.task.status,
    "completed",
  );
  for (const [task, action] of [
    [keep, "keep"],
    [bucket, "bucket"],
    [remove, "delete"],
  ]) {
    r = await write(agent.post(`/api/insights/review/${task._id}`)).send({
      date: "2026-10-29",
      action,
      expectedUpdatedAt: task.updatedAt,
    });
    assert.ok([200, 204].includes(r.status), JSON.stringify(r.body));
    r = await write(agent.post(`/api/insights/review/${task._id}`)).send({
      date: "2026-10-29",
      action,
    });
    assert.ok([200, 204].includes(r.status));
  }
  assert.equal(
    (await agent.get("/api/insights/review?date=2026-10-29")).body.tasks.length,
    0,
  );
  assert.equal(
    (await agent.get("/api/tasks?location=bucket")).body.tasks.length,
    1,
  );
  assert.equal((await Task.findById(bucket._id)).postponeCount, 1);
  r = await agent.get(`/api/tasks/${keep._id}/history`);
  assert.equal(r.body.events.filter((e) => e.type === "review_kept").length, 1);
  r = await agent.get("/api/insights/progress?from=2026-10-29&to=2026-10-29");
  assert.equal(r.body.total.planned, 3);
  assert.equal(r.body.total.completed, 1);
  assert.equal(r.body.total.movedToBucket, 1);
  assert.equal(r.body.total.notCompleted, 1);
});
test("daily review respects the profile timezone and rejects current/future or stale tasks", async () => {
  const dhaka = await account(),
    la = await account("America/Los_Angeles");
  assert.equal(
    (await dhaka.agent.get("/api/insights/review?date=2026-10-31")).status,
    200,
  );
  assert.equal(
    (await la.agent.get("/api/insights/review?date=2026-10-31")).status,
    400,
  );
  assert.equal(
    (await dhaka.agent.get("/api/insights/review?date=2026-11-01")).status,
    400,
  );
  const task = await create(dhaka.agent);
  assert.equal(
    (
      await write(la.agent.post(`/api/insights/review/${task._id}`)).send({
        date: "2026-10-29",
        action: "bucket",
      })
    ).status,
    404,
  );
  await write(dhaka.agent.patch(`/api/tasks/${task._id}`)).send({
    status: "completed",
  });
  assert.equal(
    (
      await write(dhaka.agent.post(`/api/insights/review/${task._id}`)).send({
        date: "2026-10-29",
        action: "bucket",
      })
    ).status,
    409,
  );
});
test("progress keeps original-day placements, exact time totals, categories, and ownership", async () => {
  const { agent } = await account(),
    other = await account(),
    moved = await create(agent),
    completed = await create(agent, {
      ...input,
      title: "Walk",
      category: "health",
      startTime: "10:15",
      endTime: "10:55",
      status: "completed",
    });
  await create(other.agent, { ...input, status: "completed" });
  await write(agent.patch(`/api/tasks/${moved._id}`)).send({
    location: "bucket",
  });
  await write(agent.patch(`/api/tasks/${moved._id}`)).send({
    location: "calendar",
    date: "2026-10-30",
  });
  await write(agent.patch(`/api/tasks/${moved._id}`)).send({
    status: "completed",
  });
  let r = await agent.get(
    "/api/insights/progress?from=2026-10-29&to=2026-10-30",
  );
  assert.equal(r.status, 200);
  assert.equal(r.body.total.planned, 3);
  assert.equal(r.body.total.completed, 2);
  assert.equal(r.body.total.plannedMinutes, 120);
  assert.equal(r.body.total.completedMinutes, 80);
  assert.equal(r.body.total.bucketMoves, 1);
  assert.equal(r.body.total.completionPercentage, 67);
  assert.equal(r.body.byCategory.length, 2);
  assert.equal(r.body.tasks.length, 3);
  r = await agent.get(
    "/api/insights/progress?from=2026-10-29&to=2026-10-30&category=health",
  );
  assert.equal(r.body.total.planned, 1);
  assert.equal(r.body.total.completedMinutes, 40);
  assert.equal(
    (await agent.get("/api/insights/progress?from=2020-01-01&to=2030-01-01"))
      .status,
    400,
  );
  assert.equal(
    (
      await agent.get(
        "/api/insights/progress?from=2026-10-29&to=2026-10-30&category=foreign",
      )
    ).status,
    400,
  );
  await write(agent.delete(`/api/tasks/${completed._id}`));
  r = await agent.get(`/api/tasks/${completed._id}/history`);
  assert.equal(r.body.events[0].type, "deleted");
  assert.ok(r.body.task.deletedAt);
});
test("stale edits and rejected overlap drops leave task history unchanged", async () => {
  const { agent } = await account(),
    task = await create(agent);
  await create(agent, {
    ...input,
    title: "Occupied",
    startTime: "11:15",
    endTime: "11:55",
  });
  await write(agent.patch(`/api/tasks/${task._id}`)).send({
    notes: "New notes",
  });
  let r = await write(agent.patch(`/api/tasks/${task._id}`)).send({
    date: "2026-10-30",
    expectedUpdatedAt: task.updatedAt,
  });
  assert.equal(r.status, 409);
  assert.equal(r.body.error.code, "STALE_TASK");
  const before = (await agent.get(`/api/tasks/${task._id}/history`)).body.total;
  const current = (await agent.get(`/api/tasks/${task._id}`)).body.task;
  r = await write(agent.patch(`/api/tasks/${task._id}`)).send({
    startTime: "11:15",
    endTime: "11:55",
    expectedUpdatedAt: current.updatedAt,
  });
  assert.equal(r.status, 409);
  assert.equal(r.body.error.code, "OVERLAP");
  assert.equal(
    (await agent.get(`/api/tasks/${task._id}/history`)).body.total,
    before,
  );
  assert.equal((await Task.findById(task._id)).startTime, "09:15");
  r = await write(agent.patch(`/api/tasks/${task._id}`)).send({
    startTime: "11:15",
    endTime: "11:55",
    expectedUpdatedAt: current.updatedAt,
    allowOverlap: true,
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.task.durationMinutes, 40);
  assert.equal(
    (await agent.get(`/api/tasks/${task._id}/history`)).body.events[0].type,
    "rescheduled",
  );
});
test("recurring generation, series edits, and series deletion maintain ledger and history", async () => {
  const { agent } = await account();
  let r = await write(agent.post("/api/series")).send({
    ...input,
    recurrence: { frequency: "daily", endDate: "2026-10-30" },
  });
  assert.equal(r.status, 201);
  const id = r.body.series._id;
  let list = (await agent.get("/api/tasks?from=2026-10-29&to=2026-10-30")).body
    .tasks;
  assert.equal(list.length, 2);
  const task = list[0];
  assert.equal(task.plans.length, 1);
  assert.equal(
    (await agent.get(`/api/tasks/${task._id}/history`)).body.events.length,
    1,
  );
  r = await write(agent.patch(`/api/series/${id}`)).send({
    title: "New series title",
    startTime: "10:15",
    endTime: "10:55",
  });
  assert.equal(r.status, 200);
  assert.equal(
    (await agent.get(`/api/tasks/${task._id}/history`)).body.events[0].type,
    "series_updated",
  );
  await write(agent.delete(`/api/series/${id}`));
  r = await agent.get(`/api/tasks/${task._id}/history`);
  assert.equal(r.body.events[0].type, "series_deleted");
  assert.equal(
    (await agent.get("/api/insights/progress?from=2026-10-29&to=2026-10-30"))
      .body.total.planned,
    0,
  );
});
test("legacy tasks retain counts and disclose the boundary of detailed history", async () => {
  const { agent, user } = await account();
  const result = await Task.collection.insertOne({
    owner: new mongoose.Types.ObjectId(user.id),
    ...input,
    durationMinutes: 40,
    startMinute: 555,
    endMinute: 595,
    location: "bucket",
    status: "not_completed",
    postponeCount: 4,
    createdAt: new Date(),
    updatedAt: new Date(),
    originalSchedule: {
      date: "2026-09-01",
      startTime: "09:15",
      endTime: "09:55",
      durationMinutes: 40,
    },
  });
  const id = String(result.insertedId);
  let r = await agent.get(
    "/api/insights/progress?from=2026-10-29&to=2026-10-29",
  );
  assert.equal(r.body.legacy, true);
  assert.equal(r.body.total.planned, 1);
  r = await agent.get(`/api/tasks/${id}/history`);
  assert.equal(r.body.legacy, true);
  assert.equal(r.body.total, 0);
  assert.equal(r.body.task.postponeCount, 4);
  await write(agent.patch(`/api/tasks/${id}`)).send({
    location: "calendar",
    date: "2026-10-30",
  });
  r = await agent.get(`/api/tasks/${id}/history`);
  assert.deepEqual(
    r.body.events.map((e) => e.type),
    ["rescheduled", "history_started"],
  );
  assert.equal(r.body.task.postponeCount, 4);
  assert.equal(r.body.task.originalSchedule.date, "2026-09-01");
});
test("clearing a completed review by rescheduling makes the new ended date reviewable", async () => {
  const { agent } = await account(),
    task = await create(agent);
  await write(agent.post(`/api/insights/review/${task._id}`)).send({
    date: "2026-10-29",
    action: "keep",
  });
  assert.equal(
    (await agent.get("/api/insights/review?date=2026-10-29")).body.tasks.length,
    0,
  );
  await write(agent.patch(`/api/tasks/${task._id}`)).send({
    date: "2026-10-30",
    status: "scheduled",
  });
  assert.equal(
    (await agent.get("/api/insights/review?date=2026-10-30")).body.tasks.length,
    1,
  );
});
