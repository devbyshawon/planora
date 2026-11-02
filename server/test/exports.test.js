import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import ICAL from "ical.js";
import { parse } from "csv-parse/sync";
import { createApp } from "../src/app.js";
import Task from "../src/models/Task.js";
import User from "../src/models/User.js";
import Series from "../src/models/RecurrenceSeries.js";
import { csvCell, makeCsv } from "../src/utils/exports/csv.js";
import { foldLine, makeIcs } from "../src/utils/exports/ics.js";
import { scheduleFields } from "../src/utils/schedule.js";
import { candidatesFor } from "../src/utils/recurrence.js";
import { exportData, exportInput } from "../src/utils/exports/data.js";
let db,
  app,
  counter = 0;
const origin = "http://localhost:5173",
  now = new Date("2026-10-31T10:00:00Z");
const write = (req) => req.set("Origin", origin).set("X-Planora-Client", "web");
const options = { from: "2026-11-01", to: "2026-11-30", period: "month" };
before(async () => {
  db = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    instanceOpts: [{ args: ["--nounixsocket"] }],
  });
  await mongoose.connect(db.getUri());
  await Promise.all([Task.init(), User.init(), Series.init()]);
  app = createApp({
    jwtSecret: "stage5-secret-with-at-least-32-characters",
    appOrigin: origin,
    production: false,
    trustProxy: false,
    now: () => now,
  });
});
after(async () => {
  await mongoose.disconnect();
  await db?.stop();
});
async function account(timeZone = "Asia/Dhaka") {
  const agent = request.agent(app);
  const r = await write(agent.post("/api/auth/register")).send({
    name: "Export User",
    email: `s5-${++counter}@example.com`,
    password: "StrongPassword123",
    timeZone,
  });
  assert.equal(r.status, 201);
  return { agent, user: await User.findById(r.body.user.id) };
}
async function create(agent, overrides = {}) {
  const r = await write(agent.post("/api/tasks")).send({
    title: "Exact-time task",
    category: "study",
    date: "2026-11-02",
    startTime: "09:15",
    endTime: "09:55",
    allowOverlap: true,
    ...overrides,
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.task;
}
const csvRows = (text) => parse(text, { columns: true, bom: true });
function dataFixture(zone, series, tasks, from, to) {
  return {
    ownerId: "user-1",
    timeZone: zone,
    categories: [{ id: "study", name: "Study" }],
    options: {
      from,
      to,
      period: "custom",
      includeNotes: true,
      reminderMinutes: 10,
    },
    generatedAt: now,
    series,
    tasks,
    warnings: [],
  };
}
function fixtureSeries(
  frequency,
  startDate,
  startTime = "09:15",
  endTime = "09:55",
  extras = {},
) {
  return {
    _id: "series-1",
    owner: "user-1",
    title: "Repeat",
    notes: "",
    category: "study",
    priority: "medium",
    frequency,
    startDate,
    startTime,
    endTime,
    weekdays: [],
    ...extras,
  };
}
function fixtureTasks(series, from, to, zone) {
  return candidatesFor(series, from, to, zone).tasks.map((t, i) => ({
    ...t,
    _id: `task-${i}`,
    updatedAt: now,
  }));
}
// ICAL.js independently parses, registers VTIMEZONE, expands RRULE/EXDATE,
// and resolves both start and end UTC instants for comparison with Mongo tasks.
function expand(text) {
  const calendar = new ICAL.Component(ICAL.parse(text));
  for (const component of calendar.getAllSubcomponents("vtimezone"))
    ICAL.TimezoneService.register(new ICAL.Timezone(component));
  const result = [];
  for (const component of calendar.getAllSubcomponents("vevent")) {
    const event = new ICAL.Event(component),
      iterator = event.iterator();
    let start,
      guard = 0;
    while ((start = iterator.next())) {
      assert.ok(++guard < 1000, "Export recurrence must be bounded");
      const detail = event.getOccurrenceDetails(start);
      result.push({
        title: event.summary,
        start: detail.startDate.toJSDate().toISOString(),
        end: detail.endDate.toJSDate().toISOString(),
      });
      if (!event.isRecurring()) break;
    }
  }
  return result.sort(
    (a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title),
  );
}
function expected(tasks) {
  return tasks
    .map((t) => ({
      title: t.title,
      start: new Date(t.startsAt).toISOString(),
      end: new Date(t.endsAt).toISOString(),
    }))
    .sort(
      (a, b) =>
        a.start.localeCompare(b.start) || a.title.localeCompare(b.title),
    );
}

test("CSV quotes commas, quotes and multiline Unicode and neutralises dangerous cells", () => {
  for (const dangerous of [
    "=1+1",
    "+SUM(A1)",
    "-12",
    "@SUM(1)",
    "  =1",
    "\t=1",
    "\nhello",
    "\rtext",
    "\u0000=1",
  ])
    assert.ok(csvCell(dangerous).startsWith("\"'"), dangerous);
  const task = {
    _id: "one",
    title: '=HYPERLINK("bad")',
    notes: 'Line 1, "quoted"\nবাংলা',
    category: "study",
    priority: "high",
    status: "scheduled",
    ...scheduleFields(
      { date: "2026-11-02", startTime: "09:15", endTime: "09:55" },
      "Asia/Dhaka",
    ),
  };
  const text = makeCsv(
    dataFixture("Asia/Dhaka", [], [task], "2026-11-01", "2026-11-30"),
  );
  const [row] = csvRows(text);
  assert.equal(row.Title, "'" + task.title);
  assert.equal(row.Notes, task.notes);
  assert.equal(row["Start UTC"], "2026-11-02T03:15:00.000Z");
  assert.equal(row["Duration minutes"], "40");
});
test("ICS folding preserves UTF-8 and cannot inject properties through text", () => {
  const task = {
    _id: "one",
    title: "বাংলা".repeat(25) + "\r\nATTENDEE:bad",
    notes: "a,b;c\\d\nline",
    category: "study",
    priority: "high",
    status: "scheduled",
    ...scheduleFields(
      { date: "2026-11-02", startTime: "09:15", endTime: "09:55" },
      "Asia/Dhaka",
    ),
  };
  const text = makeIcs(
    dataFixture("Asia/Dhaka", [], [task], "2026-11-01", "2026-11-30"),
  );
  assert.ok(text.split("\r\n").every((line) => Buffer.byteLength(line) <= 75));
  const event = new ICAL.Component(ICAL.parse(text)).getFirstSubcomponent(
    "vevent",
  );
  assert.equal(
    event.getFirstPropertyValue("summary"),
    task.title.replace("\r\n", "\n"),
  );
  assert.equal(event.getAllProperties("attendee").length, 0);
  assert.ok(foldLine("a".repeat(76)).includes("\r\n "));
});
test("all four repeat patterns export only selected dates with independently expanded rules", () => {
  for (const [frequency, extras] of [
    ["daily", {}],
    ["weekly", {}],
    ["weekdays", { weekdays: [1, 3, 5] }],
    ["monthly", {}],
  ]) {
    const series = fixtureSeries(
        frequency,
        "2026-01-31",
        "09:15",
        "09:55",
        extras,
      ),
      tasks = fixtureTasks(series, "2026-02-01", "2026-06-30", "Asia/Dhaka");
    const text = makeIcs(
      dataFixture("Asia/Dhaka", [series], tasks, "2026-02-01", "2026-06-30"),
    );
    assert.ok(text.includes("RRULE:"));
    assert.deepEqual(expand(text), expected(tasks), frequency);
  }
});
test("ICS suppresses deleted, bucket, filtered and changed occurrences using EXDATE", () => {
  const series = fixtureSeries("daily", "2026-11-01"),
    all = fixtureTasks(series, "2026-11-01", "2026-11-07", "Asia/Dhaka");
  const tasks = all.filter((_, i) => ![1, 3, 5].includes(i));
  tasks[1] = {
    ...tasks[1],
    isException: true,
    title: "Moved, edited",
    ...scheduleFields(
      { date: "2026-11-07", startTime: "15:17", endTime: "16:03" },
      "Asia/Dhaka",
    ),
  };
  tasks[2].status = "completed";
  const text = makeIcs(
    dataFixture("Asia/Dhaka", [series], tasks, "2026-11-01", "2026-11-07"),
  );
  assert.ok(text.includes("EXDATE"));
  assert.deepEqual(expand(text), expected(tasks));
});
test("ICS preserves wall times across DST and exact durations on transition days", () => {
  for (const [from, to, start, end] of [
    ["2026-03-06", "2026-03-10", "09:15", "09:55"],
    ["2026-03-06", "2026-03-10", "01:15", "03:15"],
    ["2026-03-08", "2026-03-10", "01:15", "03:15"],
    ["2026-10-30", "2026-11-03", "00:15", "03:15"],
  ]) {
    const series = fixtureSeries("daily", from, start, end),
      tasks = fixtureTasks(series, from, to, "America/New_York");
    const text = makeIcs(
      dataFixture("America/New_York", [series], tasks, from, to),
    );
    assert.ok(text.includes("BEGIN:DAYLIGHT"));
    assert.deepEqual(expand(text), expected(tasks));
  }
});
test("ICS omits nonexistent or ambiguous generated clock-change slots", () => {
  for (const [from, to] of [
    ["2026-03-07", "2026-03-10"],
    ["2026-10-31", "2026-11-03"],
  ]) {
    const series = fixtureSeries("daily", from, "01:30", "02:30"),
      tasks = fixtureTasks(series, from, to, "America/New_York");
    assert.equal(tasks.length, 3);
    assert.deepEqual(
      expand(
        makeIcs(dataFixture("America/New_York", [series], tasks, from, to)),
      ),
      expected(tasks),
    );
  }
});
test("ICS UIDs are stable; reminders are configurable and completed tasks are quiet", () => {
  const series = fixtureSeries("daily", "2026-11-01"),
    tasks = fixtureTasks(series, "2026-11-01", "2026-11-04", "Asia/Dhaka");
  tasks[2].status = "completed";
  const data = dataFixture(
    "Asia/Dhaka",
    [series],
    tasks,
    "2026-11-01",
    "2026-11-04",
  );
  const uids = (text) =>
    new ICAL.Component(ICAL.parse(text))
      .getAllSubcomponents("vevent")
      .map((c) => c.getFirstPropertyValue("uid"));
  assert.deepEqual(
    uids(makeIcs(data)),
    uids(makeIcs({ ...data, generatedAt: new Date("2026-11-01") })),
  );
  let calendar = new ICAL.Component(ICAL.parse(makeIcs(data)));
  assert.equal(
    calendar
      .getAllSubcomponents("vevent")
      .reduce((n, e) => n + e.getAllSubcomponents("valarm").length, 0),
    1,
  );
  assert.ok(makeIcs(data).includes("TRIGGER:-PT10M"));
  data.options.reminderMinutes = null;
  assert.ok(!makeIcs(data).includes("VALARM"));
});
test("export endpoints require authentication and origin protection and reject invalid filters", async () => {
  assert.equal(
    (await write(request(app).post("/api/exports/preview")).send(options))
      .status,
    401,
  );
  const { agent } = await account();
  assert.equal(
    (
      await agent
        .post("/api/exports/download")
        .send({ ...options, format: "csv" })
    ).status,
    403,
  );
  for (const extra of [
    { from: "2026-02-30" },
    { to: "2028-01-01" },
    { category: { $ne: null } },
    { category: "foreign" },
    { status: "bad" },
    { reminderMinutes: -1 },
    { reminderMinutes: "10" },
    { includeNotes: "true" },
  ])
    assert.equal(
      (
        await write(agent.post("/api/exports/preview")).send({
          ...options,
          ...extra,
        })
      ).status,
      400,
      JSON.stringify(extra),
    );
  assert.equal(
    (
      await write(agent.post("/api/exports/download")).send({
        ...options,
        format: "html",
      })
    ).status,
    400,
  );
});
test("preview and all downloads share owner, range, category and status boundaries", async () => {
  const { agent } = await account(),
    other = await account();
  await create(agent);
  await create(agent, { category: "work", title: "Work only" });
  await create(agent, { date: "2026-10-31", title: "Outside range" });
  await create(agent, { status: "completed", title: "Finished" });
  await create(agent, { location: "bucket", title: "Bucket idea" });
  const deleted = await create(agent, { title: "Deleted" });
  await write(agent.delete(`/api/tasks/${deleted._id}`)).send({});
  await create(other.agent, { title: "Secret other owner" });
  const filter = { ...options, category: "study", status: "scheduled" };
  const preview = await write(agent.post("/api/exports/preview")).send(filter);
  assert.equal(preview.body.count, 1);
  assert.equal(preview.body.totalMinutes, 40);
  const csv = await write(agent.post("/api/exports/download")).send({
    ...filter,
    format: "csv",
  });
  assert.equal(csv.status, 200);
  assert.equal(csv.headers["cache-control"], "no-store");
  assert.match(
    csv.headers["content-disposition"],
    /attachment; filename="Planora_month_2026-11-01_2026-11-30.csv"/,
  );
  assert.equal(csvRows(csv.text).length, 1);
  const ics = await write(agent.post("/api/exports/download")).send({
    ...filter,
    format: "ics",
  });
  assert.equal(expand(ics.text).length, 1);
  assert.ok(!ics.text.includes("Secret other"));
  const pdf = await write(agent.post("/api/exports/download"))
    .send({ ...filter, format: "pdf" })
    .buffer(true)
    .parse((res, cb) => {
      const chunks = [];
      res.on("data", (d) => chunks.push(d));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    });
  assert.equal(pdf.status, 200);
  assert.ok(pdf.body.subarray(0, 5).equals(Buffer.from("%PDF-")));
  assert.match(pdf.body.toString("latin1"), /%%EOF/);
});
test("exports lazily generate recurrence without duplicates and retain exceptions", async () => {
  const { agent, user } = await account();
  const created = await write(agent.post("/api/series")).send({
    title: "Future repeat",
    date: "2026-01-01",
    startTime: "09:15",
    endTime: "09:55",
    category: "study",
    recurrence: { frequency: "daily" },
    allowOverlap: true,
  });
  assert.equal(created.status, 201);
  const first = await exportData(user, exportInput(options), now);
  assert.equal(first.tasks.length, 30);
  const task = first.tasks[1];
  await write(agent.patch(`/api/tasks/${task._id}`)).send({
    location: "bucket",
  });
  const next = await exportData(user, exportInput(options), now);
  assert.equal(next.tasks.length, 29);
  assert.deepEqual(expand(makeIcs(next)), expected(next.tasks));
  const count = await Task.countDocuments({ owner: user._id });
  await exportData(user, exportInput(options), now);
  assert.equal(await Task.countDocuments({ owner: user._id }), count);
});
test("empty exports remain valid and notes can be excluded from every format", async () => {
  const { agent, user } = await account();
  const empty = await exportData(user, exportInput(options), now);
  assert.equal(csvRows(makeCsv(empty)).length, 0);
  assert.deepEqual(expand(makeIcs(empty)), []);
  await create(agent, { notes: "PRIVATE_NOTE_DO_NOT_EXPORT" });
  const data = await exportData(
    user,
    exportInput({ ...options, includeNotes: false }),
    now,
  );
  assert.ok(!makeCsv(data).includes("PRIVATE_NOTE"));
  assert.ok(!makeIcs(data).includes("PRIVATE_NOTE"));
});
test("moved-in occurrences stay exact and tasks moved outside the export do not reappear", () => {
  const series = fixtureSeries("daily", "2026-11-01"),
    all = fixtureTasks(series, "2026-11-01", "2026-11-09", "Asia/Dhaka");
  const movedIn = {
    ...all[0],
    isException: true,
    ...scheduleFields(
      { date: "2026-11-06", startTime: "14:17", endTime: "14:48" },
      "Asia/Dhaka",
    ),
  };
  const tasks = [
    movedIn,
    ...all.filter(
      (t) =>
        t.date >= "2026-11-05" &&
        t.date <= "2026-11-07" &&
        t.date !== "2026-11-06",
    ),
  ].sort((a, b) => a.date.localeCompare(b.date));
  assert.deepEqual(
    expand(
      makeIcs(
        dataFixture("Asia/Dhaka", [series], tasks, "2026-11-05", "2026-11-07"),
      ),
    ),
    expected(tasks),
  );
});
test("the export size limit refuses truncation and asks for a smaller range", async () => {
  const { user } = await account();
  const schedule = scheduleFields(
    { date: "2026-11-02", startTime: "09:15", endTime: "09:55" },
    user.timeZone,
  );
  await Task.insertMany(
    Array.from({ length: 5001 }, (_, i) => ({
      owner: user._id,
      title: `Load ${i}`,
      ...schedule,
    })),
    { ordered: false },
  );
  await assert.rejects(
    exportData(user, exportInput(options), now),
    (err) => err.status === 413 && err.code === "EXPORT_TOO_LARGE",
  );
});
