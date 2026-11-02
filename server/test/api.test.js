import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import User from "../src/models/User.js";
let db, app;
const origin = "http://localhost:5173";
const write = (req) => req.set("Origin", origin).set("X-Planora-Client", "web");
before(async () => {
  db = await MongoMemoryServer.create({
    instance: { args: ["--nounixsocket"] },
  });
  await mongoose.connect(db.getUri());
  await User.init();
  app = createApp({
    jwtSecret: "a-test-only-secret-of-at-least-32-characters",
    appOrigin: origin,
    production: false,
    trustProxy: false,
  });
});
after(async () => {
  await mongoose.disconnect();
  await db?.stop();
});
test("authenticated task lifecycle, exact timing, overlap consent, tenant boundaries and logout", async () => {
  const alice = request.agent(app),
    bob = request.agent(app);
  let response = await write(alice.post("/api/auth/register")).send({
    name: "Alice",
    email: "alice@example.com",
    password: "StrongPassword123",
    timeZone: "Asia/Dhaka",
  });
  assert.equal(response.status, 201);
  assert.equal(response.body.user.timeZone, "Asia/Dhaka");
  assert.equal(response.body.user.passwordHash, undefined);
  const cookies = response.headers["set-cookie"];
  assert.match(cookies[0], /HttpOnly/);
  assert.match(cookies[0], /SameSite=Lax/);
  response = await write(bob.post("/api/auth/register")).send({
    name: "Bob",
    email: "bob@example.com",
    password: "StrongPassword123",
  });
  assert.equal(response.status, 201);
  assert.equal(
    (await request(app).get("/api/tasks?from=2026-11-01&to=2026-11-01")).status,
    401,
  );
  assert.equal(
    (await alice.post("/api/tasks").send({ title: "Blocked" })).status,
    403,
  );
  const input = {
    title: "Thesis",
    date: "2026-11-01",
    startTime: "09:15",
    endTime: "09:55",
    notes: "Read BiomedCLIP",
    category: "study",
    priority: "high",
  };
  response = await write(alice.post("/api/tasks")).send(input);
  assert.equal(response.status, 201);
  const id = response.body.task._id;
  assert.equal(response.body.task.durationMinutes, 40);
  assert.equal(response.body.task.startsAt, "2026-11-01T03:15:00.000Z");
  response = await write(alice.post("/api/tasks")).send({
    ...input,
    title: "Overlapping",
    startTime: "09:30",
    endTime: "10:00",
  });
  assert.equal(response.status, 409);
  assert.equal(response.body.error.code, "OVERLAP");
  assert.equal(response.body.error.details[0]._id, id);
  response = await write(alice.post("/api/tasks")).send({
    ...input,
    title: "Allowed overlap",
    allowOverlap: true,
  });
  assert.equal(response.status, 201);
  response = await write(alice.post("/api/tasks")).send({
    ...input,
    title: "Adjacent",
    startTime: "09:55",
    endTime: "10:10",
  });
  assert.equal(response.status, 201);
  response = await bob.get("/api/tasks?from=2026-11-01&to=2026-11-01");
  assert.deepEqual(response.body.tasks, []);
  assert.equal(
    (await write(bob.patch(`/api/tasks/${id}`)).send({ title: "Hijacked" }))
      .status,
    404,
  );
  assert.equal((await write(bob.delete(`/api/tasks/${id}`))).status, 404);
  response = await write(alice.patch(`/api/tasks/${id}`)).send({
    status: "completed",
  });
  assert.equal(response.status, 200);
  assert.ok(response.body.task.completedAt);
  response = await write(alice.patch(`/api/tasks/${id}`)).send({
    location: "bucket",
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.task.postponeCount, 1);
  assert.equal(response.body.task.originalSchedule.date, "2026-11-01");
  assert.equal(response.body.task.completedAt, undefined);
  response = await write(alice.patch(`/api/tasks/${id}`)).send({
    notes: "Updated notes",
  });
  assert.equal(response.body.task.postponeCount, 1);
  response = await alice.get("/api/tasks?location=bucket");
  assert.equal(response.body.tasks.length, 1);
  response = await write(alice.patch(`/api/tasks/${id}`)).send({
    location: "calendar",
    date: "2026-11-02",
    startTime: "10:15",
    endTime: "10:55",
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.task.location, "calendar");
  assert.equal(response.body.task.status, "scheduled");
  assert.equal(response.body.task.postponeCount, 1);
  assert.equal(response.body.task.notes, "Updated notes");
  response = await alice.get("/api/tasks?location=bucket");
  assert.equal(response.body.tasks.length, 0);
  response = await write(alice.patch(`/api/tasks/${id}`)).send({
    location: "bucket",
  });
  assert.equal(response.body.task.postponeCount, 2);
  assert.equal(response.body.task.originalSchedule.date, "2026-11-01");
  response = await write(alice.delete(`/api/tasks/${id}`));
  assert.equal(response.status, 204);
  assert.equal(
    (await alice.get("/api/tasks?location=bucket")).body.tasks.length,
    0,
  );
  response = await write(alice.post("/api/auth/logout"));
  assert.equal(response.status, 204);
  assert.equal((await alice.get("/api/auth/me")).status, 401);
  const oldSession = cookies[0].split(";")[0];
  assert.equal(
    (await request(app).get("/api/auth/me").set("Cookie", oldSession)).status,
    401,
  );
  response = await write(alice.post("/api/auth/login")).send({
    email: "alice@example.com",
    password: "StrongPassword123",
  });
  assert.equal(response.status, 200);
});
test("input validation and duplicate accounts cannot bypass the API", async () => {
  const agent = request.agent(app);
  assert.equal(
    (
      await write(agent.post("/api/auth/register")).send({
        name: "Test",
        email: "invalid",
        password: "short",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await write(agent.post("/api/auth/register")).send({
        name: "Alice",
        email: "alice@example.com",
        password: "StrongPassword123",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await write(agent.post("/api/auth/login")).send({
        email: "alice@example.com",
        password: "wrong-password",
      })
    ).status,
    401,
  );
  await write(agent.post("/api/auth/login")).send({
    email: "alice@example.com",
    password: "StrongPassword123",
  });
  assert.equal(
    (await write(agent.post("/api/tasks")).send({ title: "No time" })).status,
    400,
  );
  assert.equal(
    (
      await write(agent.post("/api/tasks")).send({
        title: "Backward",
        date: "2026-11-01",
        startTime: "12:00",
        endTime: "10:00",
      })
    ).status,
    400,
  );
  assert.equal((await agent.get("/api/tasks?from=bad&to=bad")).status, 400);
  const response = await write(agent.post("/api/tasks")).send({
    title: "Unscheduled idea",
    location: "bucket",
  });
  assert.equal(response.status, 201);
  assert.equal(response.body.task.date, undefined);
  assert.equal(response.body.task.postponeCount, 0);
});
