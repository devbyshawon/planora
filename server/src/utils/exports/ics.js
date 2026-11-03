import { DateTime } from "luxon";
import { occursOn } from "../../../../shared/recurrence.js";
import { categoryName, statusName } from "../../../../shared/exportModel.js";
export const icsText = (value) =>
  String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replaceAll("\\", "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,");
export function foldLine(line) {
  const lines = [];
  let part = "",
    bytes = 0;
  for (const char of line) {
    const size = new TextEncoder().encode(char).length;
    if (bytes + size > 75) {
      lines.push(part);
      part = " ";
      bytes = 1;
    }
    part += char;
    bytes += size;
  }
  lines.push(part);
  return lines.join("\r\n");
}
const local = (date, time) =>
  date.replaceAll("-", "") + "T" + time.replace(":", "") + "00";
const utc = (value) =>
  DateTime.fromJSDate(new Date(value), { zone: "UTC" }).toFormat(
    "yyyyMMdd'T'HHmmss'Z'",
  );
const offset = (minutes) =>
  `${minutes < 0 ? "-" : "+"}${String(Math.floor(Math.abs(minutes) / 60)).padStart(2, "0")}${String(Math.abs(minutes) % 60).padStart(2, "0")}`;
// Explicit observances cover this bounded export, including one surrounding year.
export function timezoneLines(zone, from, to) {
  const first = DateTime.fromISO(from, { zone: "UTC" })
    .startOf("year")
    .minus({ years: 1 });
  const last = DateTime.fromISO(to, { zone: "UTC" })
    .endOf("year")
    .plus({ years: 1 });
  const at = (ms) => DateTime.fromMillis(ms, { zone });
  const lines = ["BEGIN:VTIMEZONE", `TZID:${zone}`, `X-LIC-LOCATION:${zone}`];
  let previous = at(first.toMillis()).offset;
  const observance = (ms, before, after, initial = false) => {
    const kind = !initial && after > before ? "DAYLIGHT" : "STANDARD";
    lines.push(
      `BEGIN:${kind}`,
      `DTSTART:${DateTime.fromMillis(ms, { zone: "UTC" }).plus({ minutes: before }).toFormat("yyyyMMdd'T'HHmmss")}`,
      `TZOFFSETFROM:${offset(before)}`,
      `TZOFFSETTO:${offset(after)}`,
      `TZNAME:${icsText(at(ms).offsetNameShort)}`,
      `END:${kind}`,
    );
  };
  observance(first.toMillis(), previous, previous, true);
  for (
    let cursor = first.plus({ days: 1 });
    cursor <= last;
    cursor = cursor.plus({ days: 1 })
  ) {
    const next = at(cursor.toMillis()).offset;
    if (next !== previous) {
      let low = cursor.minus({ days: 1 }).toMillis(),
        high = cursor.toMillis();
      while (high - low > 60000) {
        const mid = Math.floor((low + high) / 120000) * 60000;
        if (at(mid).offset === previous) low = mid;
        else high = mid;
      }
      observance(high, previous, next);
      previous = next;
    }
  }
  lines.push("END:VTIMEZONE");
  return lines;
}
const weekdays = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
function repeatRule(series, until) {
  const anchor = DateTime.fromISO(series.startDate, { zone: "UTC" });
  const frequency =
    series.frequency === "weekdays" ? "WEEKLY" : series.frequency.toUpperCase();
  const extra =
    series.frequency === "monthly"
      ? `;BYMONTHDAY=${anchor.day}`
      : series.frequency === "weekly"
        ? `;BYDAY=${weekdays[anchor.weekday - 1]}`
        : series.frequency === "weekdays"
          ? `;BYDAY=${series.weekdays.map((d) => weekdays[d - 1]).join(",")}`
          : "";
  return `RRULE:FREQ=${frequency}${extra};UNTIL=${until}`;
}
function eventLines(task, data, uid, recurrence = []) {
  const description = [
    `Status: ${statusName(task.status)}`,
    `Category: ${categoryName(data, task.category)}`,
    `Priority: ${task.priority}`,
    `Timezone: ${data.timeZone}`,
    `Export range: ${data.options.from} to ${data.options.to}`,
    `Generated UTC: ${data.generatedAt.toISOString()}`,
    ...(data.options.includeNotes && task.notes ? ["", task.notes] : []),
  ].join("\n");
  const lines = [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${utc(data.generatedAt)}`,
    `LAST-MODIFIED:${utc(task.updatedAt || data.generatedAt)}`,
    ...(recurrence.length
      ? [
          `DTSTART;TZID=${data.timeZone}:${local(task.date, task.startTime)}`,
          `DTEND;TZID=${data.timeZone}:${local(task.date, task.endTime)}`,
        ]
      : [`DTSTART:${utc(task.startsAt)}`, `DTEND:${utc(task.endsAt)}`]),
    ...recurrence,
    `SUMMARY:${icsText(task.title)}`,
    `DESCRIPTION:${icsText(description)}`,
    `CATEGORIES:${icsText(categoryName(data, task.category))}`,
    `PRIORITY:${{ high: 1, medium: 5, low: 9 }[task.priority]}`,
    "STATUS:CONFIRMED",
    "CLASS:PRIVATE",
    `X-PLANORA-STATUS:${task.status}`,
    `X-PLANORA-TASK-ID:${task._id}`,
  ];
  if (data.options.reminderMinutes !== null && task.status !== "completed")
    lines.push(
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `TRIGGER:-PT${data.options.reminderMinutes}M`,
      `DESCRIPTION:${icsText(task.title)}`,
      "END:VALARM",
    );
  lines.push("END:VEVENT");
  return lines;
}
function regular(task, series) {
  return (
    !task.isException &&
    task.status === "scheduled" &&
    task.date === task.occurrenceDate &&
    occursOn(series, task.date) &&
    ["title", "notes", "category", "priority", "startTime", "endTime"].every(
      (key) => task[key] === series[key],
    )
  );
}
export function makeIcs(data) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Planora//Schedule Export 0.5//EN",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:Planora schedule",
    `X-WR-TIMEZONE:${data.timeZone}`,
    `X-PLANORA-RANGE:${data.options.from}/${data.options.to}`,
    ...timezoneLines(data.timeZone, data.options.from, data.options.to),
  ];
  const grouped = new Set();
  for (const series of data.series) {
    const eligible = data.tasks.filter(
      (t) => String(t.series) === String(series._id) && regular(t, series),
    );
    // RFC recurrence uses the master's exact duration. Isolate clock-change
    // occurrences with a different elapsed duration so their ends stay exact.
    const tasks = eligible.filter(
      (t) => t.durationMinutes === t.endMinute - t.startMinute,
    );
    if (!tasks.length) continue;
    const first = tasks[0],
      lastDate =
        series.endDate && series.endDate < data.options.to
          ? series.endDate
          : data.options.to;
    const until = DateTime.fromISO(`${lastDate}T23:59:59`, {
      zone: data.timeZone,
    }).toJSDate();
    const included = new Set(tasks.map((t) => t.date)),
      excluded = [];
    for (
      let day = DateTime.fromISO(first.date, { zone: "UTC" });
      day.toISODate() <= lastDate;
      day = day.plus({ days: 1 })
    ) {
      const date = day.toISODate();
      if (occursOn(series, date) && !included.has(date))
        excluded.push(local(date, series.startTime));
    }
    const rule = [
      repeatRule(series, utc(until)),
      ...(excluded.length
        ? [`EXDATE;TZID=${data.timeZone}:${excluded.join(",")}`]
        : []),
    ];
    lines.push(
      ...eventLines(
        first,
        data,
        `series-${data.ownerId}-${series._id}@planora.local`,
        rule,
      ),
    );
    tasks.forEach((t) => grouped.add(String(t._id)));
  }
  // Edits, completion, moved occurrences and preserved old-rule occurrences remain
  // independent exact events; their nominal slots are excluded from the RRULE.
  for (const task of data.tasks)
    if (!grouped.has(String(task._id)))
      lines.push(
        ...eventLines(
          task,
          data,
          `task-${data.ownerId}-${task._id}@planora.local`,
        ),
      );
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
