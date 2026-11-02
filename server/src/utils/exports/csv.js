import { categoryName } from "./data.js";
// Quote every cell; neutralise formulas even after leading whitespace/control characters.
export function csvCell(value) {
  let text = String(value ?? "");
  if (/^[\s\u0000-\u0020]*[=+\-@]/u.test(text) || /^[\t\r\n]/u.test(text))
    text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function makeCsv(data) {
  const headers = [
    "Task ID",
    "Title",
    "Date",
    "Start time",
    "End time",
    "Duration minutes",
    "Timezone",
    "Start UTC",
    "End UTC",
    "Category",
    "Priority",
    "Status",
    "Notes",
    "Series ID",
    "Original recurrence date",
    "Export from",
    "Export to",
    "Generated UTC",
  ];
  const rows = data.tasks.map((t) => [
    t._id,
    t.title,
    t.date,
    t.startTime,
    t.endTime,
    t.durationMinutes,
    t.timeZone,
    new Date(t.startsAt).toISOString(),
    new Date(t.endsAt).toISOString(),
    categoryName(data, t.category),
    t.priority,
    t.status,
    data.options.includeNotes ? t.notes : "",
    t.series || "",
    t.occurrenceDate || "",
    data.options.from,
    data.options.to,
    data.generatedAt.toISOString(),
  ]);
  // UTF-8 BOM lets spreadsheet applications detect Bengali and other Unicode text.
  return (
    "\uFEFF" +
    [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") +
    "\r\n"
  );
}
