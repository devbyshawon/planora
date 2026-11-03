import { validateRange } from "../../../shared/calendar.js";
const fields = ["title", "notes", "category", "priority", "status", "location", "date", "startTime", "endTime"];
export function enqueue(state, { id, taskId, kind, body, allowOverlap = false }, now = new Date().toISOString()) {
  if (!state?.snapshot?.user) throw new Error("Save your account on this device first.");
  const next = structuredClone(state), tasks = next.snapshot.tasks;
  if (next.queue.length >= 10000) throw new Error("Sync or back up pending changes before adding more offline operations.");
  if (kind === "create" && tasks.length >= 5000) throw new Error("Offline mode supports up to 5,000 saved tasks.");
  const previous = tasks.find(t => t._id === taskId);
  if (kind !== "create" && !previous) throw new Error("Task is not in the saved offline copy.");
  let data;
  if (kind !== "delete") {
    data = Object.fromEntries(fields.map(key => [key, body?.[key] ?? previous?.[key]]));
    if (typeof data.title !== "string" || !data.title.trim() || data.title.trim().length > 160) throw new Error("Use a title with 1–160 characters.");
    data.title = data.title.trim(); data.notes ??= "";
    if (typeof data.notes !== "string" || data.notes.length > 5000) throw new Error("Notes must be at most 5,000 characters.");
    if (!next.snapshot.user.categories.some(c => c.id === data.category) || !["low", "medium", "high"].includes(data.priority) || !["scheduled", "completed", "not_completed"].includes(data.status) || !["calendar", "bucket"].includes(data.location)) throw new Error("Choose valid task settings.");
    if (data.location === "calendar") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date) || new Date(data.date + "T00:00:00Z").toISOString().slice(0, 10) !== data.date) throw new Error("Choose a valid date.");
      Object.assign(data, validateRange(data.startTime, data.endTime));
      const scheduleChanged = !previous || previous.location !== "calendar" || ["date","startTime","endTime"].some(k=>data[k]!==previous[k]);
      if (scheduleChanged && !allowOverlap && tasks.some(t => !t.deletedAt && t._id !== taskId && t.location === "calendar" && t.date === data.date && t.startMinute < data.endMinute && t.endMinute > data.startMinute)) throw new Error("This overlaps a saved task. Adjust the time or explicitly allow overlaps.");
    } else data.status = "not_completed";
    if (previous?.location === "bucket" && data.location === "calendar") data.status = "scheduled";
  }
  const op = { id, taskId, kind, timeZone: next.snapshot.user.timeZone, allowOverlap };
  if (data) op.body = Object.fromEntries(fields.filter(k => data[k] !== undefined).map(k => [k, data[k]]));
  if (previous?.updatedAt?.startsWith("local:")) op.parentId = previous.updatedAt.slice(6);
  else if (previous) op.expectedUpdatedAt = previous.updatedAt;
  next.queue.push(op);
  if (kind === "delete") next.snapshot.tasks = tasks.filter(t => t._id !== taskId);
  else {
    const task = { ...previous, ...data, _id: taskId, owner: next.snapshot.user.id, updatedAt: `local:${id}`, createdAt: previous?.createdAt || now };
    if (previous) tasks[tasks.indexOf(previous)] = task;
    else tasks.push(task);
  }
  return next;
}
