import { layoutTasks, minutes } from "./calendar.js";

const endOfDay = 1439;
export function slotPreset(startMinute, endMinute = endOfDay, duration = 30) {
  const start = Math.max(0, Math.min(endOfDay - 1, Math.floor(startMinute)));
  const end = Math.min(endOfDay, Math.max(start + 1, Math.min(endMinute, start + duration)));
  const clock = minute => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  return { startTime: clock(start), endTime: clock(end) };
}

export function withDuration(startTime, duration) {
  const start = minutes(startTime);
  if (!Number.isInteger(duration) || duration <= 0 || start + duration > endOfDay)
    throw new Error("Choose a duration that ends before midnight.");
  return slotPreset(start, start + duration, duration);
}

// Rows come from actual task boundaries, never from an hourly interval. A
// connected overlap group uses those boundaries to position its separate cards.
export function taskSlots(tasks) {
  const sorted = tasks.filter(task => Number.isInteger(task.startMinute) && Number.isInteger(task.endMinute) && task.startMinute >= 0 && task.endMinute <= endOfDay && task.startMinute < task.endMinute)
    .map(task => ({ ...task }))
    .sort((a, b) => a.startMinute - b.startMinute || b.endMinute - a.endMinute || String(a._id).localeCompare(String(b._id)));
  const groups = [];
  for (const task of sorted) {
    const last = groups.at(-1);
    if (!last || task.startMinute >= last.endMinute)
      groups.push({ startMinute: task.startMinute, endMinute: task.endMinute, tasks: [task] });
    else {
      last.endMinute = Math.max(last.endMinute, task.endMinute);
      last.tasks.push(task);
    }
  }
  const rows = [];
  let cursor = 0;
  for (const group of groups) {
    if (cursor < group.startMinute) rows.push({ kind: "gap", startMinute: cursor, endMinute: group.startMinute });
    const boundaries = [...new Set(group.tasks.flatMap(task => [task.startMinute, task.endMinute]))].sort((a, b) => a - b);
    const offsets = new Map([[boundaries[0], 0]]);
    let height = 0;
    for (let i = 1; i < boundaries.length; i++) {
      height += Math.min(240, Math.max(88, (boundaries[i] - boundaries[i - 1]) * 0.75 + 64));
      offsets.set(boundaries[i], height);
    }
    rows.push({
      ...group,
      kind: "tasks",
      height,
      tasks: layoutTasks(group.tasks).map(task => ({ ...task, top: offsets.get(task.startMinute), height: offsets.get(task.endMinute) - offsets.get(task.startMinute) })),
    });
    cursor = group.endMinute;
  }
  if (cursor < endOfDay) rows.push({ kind: "gap", startMinute: cursor, endMinute: endOfDay });
  return rows;
}
