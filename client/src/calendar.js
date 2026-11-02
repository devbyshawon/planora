import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
} from "date-fns";
export const dateKey = (value) => format(value, "yyyy-MM-dd");
export const asDate = (value) => new Date(`${value}T12:00:00`);
export function todayIn(timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function visibleDays(selected, view, weekStartsOn = 1) {
  const date = asDate(selected);
  if (view === "day") return [date];
  if (view === "week")
    return eachDayOfInterval({
      start: startOfWeek(date, { weekStartsOn }),
      end: endOfWeek(date, { weekStartsOn }),
    });
  return eachDayOfInterval({
    start: startOfWeek(startOfMonth(date), { weekStartsOn }),
    end: endOfWeek(endOfMonth(date), { weekStartsOn }),
  });
}
export function clock(value, use24 = false) {
  if (!value) return "";
  const [hour, minute] = value.split(":").map(Number);
  return use24
    ? value
    : `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}
export function minuteClock(value) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}
