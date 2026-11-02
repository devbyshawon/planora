import test from "node:test";
import assert from "node:assert/strict";
import { scheduleFields, validDate } from "../src/utils/schedule.js";
test("skipped civil dates cannot silently move a task to the next local day", () => {
  assert.throws(() => scheduleFields(
    { date: "2011-12-30", startTime: "09:15", endTime: "09:55" },
    "Pacific/Apia",
  ), error => error.status === 400);
  const valid = scheduleFields(
    { date: "2011-12-31", startTime: "09:15", endTime: "09:55" },
    "Pacific/Apia",
  );
  assert.equal(valid.date, "2011-12-31");
  assert.equal(valid.durationMinutes, 40);
});
test("Dhaka local time converts to the correct UTC instant", () => {
  const result = scheduleFields(
    { date: "2026-11-01", startTime: "09:15", endTime: "09:55" },
    "Asia/Dhaka",
  );
  assert.equal(result.startsAt.toISOString(), "2026-11-01T03:15:00.000Z");
  assert.equal(result.durationMinutes, 40);
});
test("calendar dates and impossible clock-change times are rejected", () => {
  assert.equal(validDate("2026-02-30"), false);
  assert.equal(validDate("2026-2-01"), false);
  assert.throws(() =>
    scheduleFields(
      { date: "2026-03-08", startTime: "02:15", endTime: "03:30" },
      "America/New_York",
    ),
  );
});
test("ambiguous fall-back times are rejected instead of choosing an offset silently", () => {
  assert.throws(() =>
    scheduleFields(
      { date: "2026-11-01", startTime: "01:15", endTime: "01:55" },
      "America/New_York",
    ),
  );
});
