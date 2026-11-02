import test from "node:test";
import assert from "node:assert/strict";
import { minutes, validateRange, overlaps, layoutTasks } from "./calendar.js";
test("minute precision is retained", () => {
  assert.equal(minutes("09:15"), 555);
  assert.deepEqual(validateRange("09:15", "09:55"), {
    startMinute: 555,
    endMinute: 595,
    durationMinutes: 40,
  });
});
test("invalid, equal and backwards ranges are rejected", () => {
  for (const [a, b] of [
    ["9:15", "10:00"],
    ["09:60", "10:00"],
    ["24:00", "23:00"],
    ["12:00", "12:00"],
    ["23:00", "01:00"],
  ])
    assert.throws(() => validateRange(a, b));
});
test("touching intervals do not overlap; contained intervals do", () => {
  assert.equal(
    overlaps(
      { startMinute: 555, endMinute: 595 },
      { startMinute: 595, endMinute: 615 },
    ),
    false,
  );
  assert.equal(
    overlaps(
      { startMinute: 555, endMinute: 595 },
      { startMinute: 560, endMinute: 570 },
    ),
    true,
  );
});
test("overlapping blocks share columns and isolated blocks regain full width", () => {
  const placed = layoutTasks([
    { id: "a", startMinute: 100, endMinute: 200 },
    { id: "b", startMinute: 150, endMinute: 250 },
    { id: "c", startMinute: 200, endMinute: 240 },
    { id: "d", startMinute: 300, endMinute: 310 },
  ]);
  assert.equal(placed.find((t) => t.id === "a").columns, 2);
  assert.equal(placed.find((t) => t.id === "c").column, 0);
  assert.equal(placed.find((t) => t.id === "d").columns, 1);
});
