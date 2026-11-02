import test from "node:test";
import assert from "node:assert/strict";
import { taskSlots, slotPreset, withDuration } from "./slots.js";
const task = (id, startMinute, endMinute) => ({ _id: id, startMinute, endMinute });

test("non-overlapping tasks define complete custom rows at 40, 30, 60 and 120 minutes", () => {
  const rows = taskSlots([task("a", 555, 595), task("b", 600, 630), task("c", 630, 690), task("d", 690, 810)]);
  assert.deepEqual(rows.filter(row => row.kind === "tasks").map(row => [row.startMinute, row.endMinute]), [[555, 595], [600, 630], [630, 690], [690, 810]]);
  assert.deepEqual(rows.filter(row => row.kind === "gap").map(row => [row.startMinute, row.endMinute]), [[0, 555], [595, 600], [810, 1439]]);
});
test("one-minute and day-edge slots remain full accessible rows; no hourly boundaries are invented", () => {
  const slots = taskSlots([task("a", 0, 1), task("b", 1438, 1439)]);
  assert.deepEqual(slots.map(row => [row.kind, row.startMinute, row.endMinute]), [["tasks", 0, 1], ["gap", 1, 1438], ["tasks", 1438, 1439]]);
  assert.ok(slots.filter(row => row.kind === "tasks").every(row => row.tasks[0].height >= 88));
});
test("overlaps retain individual ranges, shared columns, and later isolated full-width slots", () => {
  const rows = taskSlots([task("a", 555, 595), task("b", 570, 610), task("c", 595, 600), task("d", 650, 710)]);
  const group = rows.find(row => row.kind === "tasks");
  assert.deepEqual([group.startMinute, group.endMinute], [555, 610]);
  assert.equal(group.tasks.find(t => t._id === "a").columns, 2);
  assert.equal(group.tasks.find(t => t._id === "c").column, 0);
  assert.ok(group.tasks.every(t => t.height >= 88 && t.top + t.height <= group.height));
  assert.equal(rows.filter(row => row.kind === "tasks").at(-1).tasks[0].columns, 1);
});
test("adjacent tasks stay distinct and layout derivation does not modify stored inputs", () => {
  const input = [task("b", 595, 630), task("a", 555, 595)];
  const before = structuredClone(input);
  assert.equal(taskSlots(input).filter(row => row.kind === "tasks").length, 2);
  assert.deepEqual(input, before);
});
test("empty and invalid data cannot introduce an hourly scaffold or invalid task rows", () => {
  assert.deepEqual(taskSlots([]), [{ kind: "gap", startMinute: 0, endMinute: 1439 }]);
  assert.equal(taskSlots([task("invalid", 600, 590), task("outside", -1, 5)]).filter(row => row.kind === "tasks").length, 0);
});
test("gap suggestions and duration shortcuts retain minutes and refuse overnight durations", () => {
  assert.deepEqual(slotPreset(595, 600), { startTime: "09:55", endTime: "10:00" });
  assert.deepEqual(withDuration("09:15", 30), { startTime: "09:15", endTime: "09:45" });
  assert.deepEqual(withDuration("09:15", 60), { startTime: "09:15", endTime: "10:15" });
  assert.deepEqual(withDuration("09:15", 120), { startTime: "09:15", endTime: "11:15" });
  assert.throws(() => withDuration("23:00", 120));
  assert.throws(() => withDuration("09:15", 0));
});
