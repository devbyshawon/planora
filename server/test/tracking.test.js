import test from "node:test";
import assert from "node:assert/strict";
import { trackChange, plansFor } from "../src/utils/tracking.js";
import { summarize } from "../src/utils/progress.js";
const base = {
  _id: "task",
  title: "Research",
  date: "2026-10-29",
  startTime: "09:15",
  endTime: "09:55",
  durationMinutes: 40,
  location: "calendar",
  status: "scheduled",
  category: "study",
};
const categories = [{ id: "study", name: "Study", color: "#123456" }];
test("movement tracking preserves daily placements and counts repeated bucket moves", () => {
  let task = { ...base, ...trackChange(null, base, "created") };
  task.history = task.appendEvents;
  const bucket = { ...task, location: "bucket", status: "not_completed" };
  let tracked = trackChange(task, bucket, "moved_to_bucket");
  assert.equal(tracked.plans[0].bucketMoves, 1);
  assert.equal(tracked.plans[0].status, "moved_to_bucket");
  const scheduled = {
    ...bucket,
    date: "2026-10-30",
    location: "calendar",
    status: "scheduled",
    plans: tracked.plans,
    history: [...task.history, ...tracked.appendEvents],
  };
  tracked = trackChange(
    { ...bucket, plans: tracked.plans, history: scheduled.history },
    scheduled,
    "rescheduled",
  );
  assert.equal(tracked.plans.length, 2);
  assert.equal(tracked.plans[0].date, "2026-10-29");
  assert.equal(tracked.plans[1].status, "scheduled");
  const deleted = { ...scheduled, plans: tracked.plans, deletedAt: new Date() };
  assert.ok(
    trackChange(scheduled, deleted, "deleted").plans.every(
      (p) => p.status === "deleted",
    ),
  );
});
test("progress uses exact minutes and closed-day streaks; empty days break runs", () => {
  const tasks = ["2026-10-26", "2026-10-27", "2026-10-29", "2026-10-30"].map(
    (date, i) => ({
      ...base,
      _id: String(i),
      date,
      status: "completed",
      plans: [{ ...base, date, status: "completed", bucketMoves: 0 }],
    }),
  );
  const result = summarize(
    tasks,
    "2026-10-26",
    "2026-10-30",
    "2026-10-30",
    categories,
  );
  assert.equal(result.total.planned, 4);
  assert.equal(result.total.completedMinutes, 160);
  assert.equal(result.total.completionPercentage, 100);
  assert.equal(result.streak.best, 2);
  assert.equal(result.streak.current, 1);
  assert.equal(result.streak.through, "2026-10-29");
  assert.equal(
    summarize([], "2026-10-29", "2026-10-29", "2026-10-30", categories).total
      .completionPercentage,
    0,
  );
});
test("legacy snapshots are explicit and do not fabricate earlier postponement dates", () => {
  const old = {
    ...base,
    location: "bucket",
    status: "not_completed",
    postponeCount: 7,
    originalSchedule: { date: "2026-09-01" },
  };
  const plans = plansFor(old);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].date, "2026-10-29");
  assert.equal(plans[0].legacy, true);
  const tracked = trackChange(
    old,
    { ...old, location: "calendar", date: "2026-10-30", status: "scheduled" },
    "rescheduled",
  );
  assert.equal(tracked.appendEvents[0].type, "history_started");
  assert.equal(tracked.appendEvents[1].type, "rescheduled");
});
