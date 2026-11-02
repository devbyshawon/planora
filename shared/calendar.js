export const DEFAULT_PREFERENCES = {
  theme: "light",
  timeFormat: "12h",
  weekStartsOn: 1,
  showHourGuides: true,
  defaultView: "week",
  reminderMinutes: 10,
  remindersEnabled: false,
};
export const CATEGORIES = [
  { id: "study", name: "Study", color: "#4268d6" },
  { id: "work", name: "Work", color: "#9b55bd" },
  { id: "personal", name: "Personal", color: "#d07b22" },
  { id: "health", name: "Health", color: "#28806b" },
];
export function minutes(time) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time || ""))
    throw new Error("Use a time from 00:00 to 23:59.");
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
export function validateRange(start, end) {
  const startMinute = minutes(start),
    endMinute = minutes(end);
  if (endMinute <= startMinute)
    throw new Error("End time must be after start time on the same day.");
  return { startMinute, endMinute, durationMinutes: endMinute - startMinute };
}
export function overlaps(a, b) {
  return a.startMinute < b.endMinute && b.startMinute < a.endMinute;
}
// Connected overlap groups receive equal-width columns. Adjacent tasks can share a column.
export function layoutTasks(tasks) {
  const sorted = [...tasks].sort(
    (a, b) => a.startMinute - b.startMinute || b.endMinute - a.endMinute,
  );
  const result = [];
  let group = [],
    groupEnd = -1;
  function flush() {
    const ends = [];
    const placed = group.map((task) => {
      let column = ends.findIndex((end) => end <= task.startMinute);
      if (column < 0) column = ends.length;
      ends[column] = task.endMinute;
      return { ...task, column };
    });
    result.push(...placed.map((task) => ({ ...task, columns: ends.length })));
    group = [];
  }
  for (const task of sorted) {
    if (group.length && task.startMinute >= groupEnd) {
      flush();
      groupEnd = -1;
    }
    group.push(task);
    groupEnd = Math.max(groupEnd, task.endMinute);
  }
  if (group.length) flush();
  return result;
}
