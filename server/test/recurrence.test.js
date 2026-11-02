import test from "node:test";
import assert from "node:assert/strict";
import {
  occursOn,
  candidatesFor,
  assertWindow,
  recurrenceInput,
} from "../src/utils/recurrence.js";
const base = {
  title: "Study",
  startDate: "2026-11-02",
  startTime: "09:15",
  endTime: "09:55",
  frequency: "weekly",
  weekdays: [],
  category: "study",
  priority: "high",
};
test("weekly and selected-weekday rules retain minute precision", () => {
  const result = candidatesFor(base, "2026-11-02", "2026-11-15", "Asia/Dhaka");
  assert.deepEqual(
    result.tasks.map((t) => t.date),
    ["2026-11-02", "2026-11-09"],
  );
  assert.equal(result.tasks[0].durationMinutes, 40);
  assert.equal(
    occursOn(
      { ...base, frequency: "weekdays", weekdays: [2, 4] },
      "2026-11-03",
    ),
    true,
  );
  assert.equal(
    occursOn(
      { ...base, frequency: "weekdays", weekdays: [2, 4] },
      "2026-11-04",
    ),
    false,
  );
});
test("monthly rules skip missing dates and end dates are inclusive", () => {
  const monthly = {
    ...base,
    frequency: "monthly",
    startDate: "2026-01-31",
    endDate: "2026-05-31",
  };
  assert.deepEqual(
    candidatesFor(monthly, "2026-01-01", "2026-06-30", "Asia/Dhaka").tasks.map(
      (t) => t.date,
    ),
    ["2026-01-31", "2026-03-31", "2026-05-31"],
  );
  assert.equal(
    occursOn(
      { ...monthly, startDate: "2024-01-29", endDate: null },
      "2024-02-29",
    ),
    true,
  );
});
test("recurrence ranges are bounded and invalid DST dates produce explicit warnings", () => {
  assert.throws(() => assertWindow("2026-01-01", "2027-01-02"));
  assert.throws(() =>
    recurrenceInput({
      date: "2026-11-01",
      startTime: "09:15",
      endTime: "09:55",
      recurrence: { frequency: "weekdays", weekdays: [] },
    }),
  );
  const result = candidatesFor(
    {
      ...base,
      frequency: "daily",
      startDate: "2026-03-07",
      startTime: "02:15",
      endTime: "03:30",
    },
    "2026-03-07",
    "2026-03-09",
    "America/New_York",
  );
  assert.deepEqual(
    result.tasks.map((t) => t.date),
    ["2026-03-07", "2026-03-09"],
  );
  assert.equal(result.warnings[0].date, "2026-03-08");
});
