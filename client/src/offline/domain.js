import { DateTime } from "luxon";
import { scheduleFields } from "../../../server/src/utils/schedule.js";
import { trackChange, eventType } from "../../../server/src/utils/tracking.js";
import { recurrenceInput, candidatesFor, occursOn, assertWindow, previewEnd } from "../../../shared/recurrence.js";
import { validateRange } from "../../../shared/calendar.js";
import { exportInput, exportPreview } from "../../../shared/exportModel.js";
export const objectId = () => crypto.randomUUID().replaceAll("-", "").slice(0,24);
export function addTracking(before, next, type, now = new Date().toISOString()) {
  const tracked = trackChange(before, next, type, new Date(now));
  next.plans = tracked.plans;
  next.history = [...(before?.history || []), ...tracked.appendEvents.map(e => ({ ...e, _id: objectId() }))];
}
function overlaps(state, proposed, exceptSeries) {
  const conflicts = state.snapshot.tasks.filter(t => !t.deletedAt && t.location === "calendar" && t.series !== exceptSeries && proposed.some(n => n._id !== t._id && n.date === t.date && n.startMinute < t.endMinute && t.startMinute < n.endMinute));
  if (conflicts.length) throw Object.assign(new Error("This schedule overlaps other tasks. Save anyway to confirm."), { code: "OVERLAP", details: conflicts.slice(0,50) });
}
export function materializeLocal(state, from, to) {
  assertWindow(from, to);
  const warnings = [];
  for (const series of state.snapshot.series || []) {
    if (series.deletedAt) continue;
    const generated = candidatesFor(series, from, to, state.snapshot.user.timeZone);
    warnings.push(...generated.warnings);
    for (const task of generated.tasks) {
      if (state.snapshot.tasks.some(t => t.series === series._id && t.occurrenceDate === task.occurrenceDate)) continue;
      if (state.snapshot.tasks.length >= 5000) throw new Error("The saved planner exceeds 5,000 tasks. Reconnect before opening more dates.");
      const next = { ...task, _id: objectId(), updatedAt: series.updatedAt, createdAt: new Date().toISOString(), _localOccurrence: true };
      addTracking(null, next, "created"); state.snapshot.tasks.push(next);
    }
  }
  return warnings;
}
export function localExportData(state, body) {
  const options = exportInput(body);
  const warnings = materializeLocal(state, options.from, options.to);
  const tasks = state.snapshot.tasks.filter(t => !t.deletedAt && t.location === "calendar" && t.date >= options.from && t.date <= options.to && (!options.category || t.category === options.category) && (!options.status || t.status === options.status)).sort((a,b) => a.date.localeCompare(b.date) || a.startMinute-b.startMinute);
  return { options, tasks, series: (state.snapshot.series || []).filter(s => !s.deletedAt), timeZone: state.snapshot.user.timeZone, ownerId: state.snapshot.user.id, categories: state.snapshot.user.categories, generatedAt: new Date(), warnings };
}
export function localNonTask(state, path, method, body = {}, entityId) {
  const s = state.snapshot, now = new Date().toISOString(), parts = path.split("/"), id = parts.at(-1);
  if (path === "/exports/preview") return { readOnly: true, result: exportPreview(localExportData(state, body)) };
  if (parts[1] === "templates" && parts[3] !== "apply") {
    s.templates ||= [];
    const previous = s.templates.find(t => t._id === id);
    if (method !== "POST" && !previous) throw new Error("Template not found.");
    if (method === "DELETE") { s.templates = s.templates.filter(t => t !== previous); return { result: null }; }
    const value = { ...previous, ...body, _id: previous?._id || entityId, owner: s.user.id, updatedAt: `local:${entityId}` };
    value.name = (value.name || value.title || "").trim(); value.nameKey = value.name.toLowerCase();
    if (!value.name || value.name.length > 160 || !value.title?.trim() || value.title.length > 160 || (value.notes || "").length > 5000 || !s.user.categories.some(c => c.id === value.category) || !["low","medium","high"].includes(value.priority)) throw new Error("Choose valid template fields.");
    validateRange(value.startTime, value.endTime);
    if (s.templates.some(t => t._id !== value._id && t.nameKey === value.nameKey)) throw new Error("Choose a unique template name.");
    if (!previous && s.templates.length >= 200) throw new Error("Keep at most 200 templates.");
    if (previous) s.templates[s.templates.indexOf(previous)] = value; else s.templates.push(value);
    return { result: { template: value } };
  }
  if (parts[1] === "series") {
    s.series ||= [];
    const previous = s.series.find(t => t._id === id && !t.deletedAt);
    if (method !== "POST" && !previous) throw new Error("Recurring series not found.");
    if (method === "DELETE") {
      previous.deletedAt = now;
      for (const task of s.tasks.filter(t => t.series === id && !t.deletedAt)) { const before = structuredClone(task); task.deletedAt = now; task.deletedReason = "series"; addTracking(before, task, "series_deleted", now); }
      return { result: null };
    }
    const value = { ...previous, ...body, ...recurrenceInput(body, previous), _id: previous?._id || entityId, owner: s.user.id, updatedAt: `local:${entityId}` };
    if (!value.title?.trim() || value.title.length > 160 || (value.notes || "").length > 5000 || !s.user.categories.some(c => c.id === value.category) || !["low","medium","high"].includes(value.priority)) throw new Error("Choose valid recurring task fields.");
    const generated = candidatesFor(value, value.startDate, previewEnd(value.startDate), s.user.timeZone);
    if (!generated.tasks.length) throw new Error("This repeat rule has no valid occurrence in its first 90 days.");
    if (!body.allowOverlap) overlaps(state, generated.tasks, previous?._id);
    if (previous) {
      for (const task of s.tasks.filter(t => t.series === previous._id && (!t.deletedAt || t.deletedReason === "rule"))) {
        if (task.isException || task.location === "bucket" || task.status === "completed") continue;
        const before = structuredClone(task);
        if (!occursOn(value, task.occurrenceDate)) { task.deletedAt = now; task.deletedReason = "rule"; }
        else { Object.assign(task, scheduleFields({ date: task.occurrenceDate, startTime: value.startTime, endTime: value.endTime }, s.user.timeZone), { title: value.title, notes: value.notes, category: value.category, priority: value.priority }); delete task.deletedAt; delete task.deletedReason; }
        task.updatedAt = `local:${entityId}`; addTracking(before, task, task.deletedAt ? "series_removed" : "series_updated", now);
      }
      s.series[s.series.indexOf(previous)] = value;
    } else {
      if (s.series.filter(t => !t.deletedAt).length >= 50) throw new Error("Keep at most 50 active recurring series.");
      s.series.push(value);
    }
    materializeLocal(state, value.startDate, previewEnd(value.startDate));
    return { result: { series: value, warnings: generated.warnings } };
  }
  if (path === "/account/settings") {
    const validators = { theme:v=>["light","dark"].includes(v), timeFormat:v=>["12h","24h"].includes(v), weekStartsOn:v=>[0,1].includes(v), showHourGuides:v=>typeof v==="boolean", defaultView:v=>["day","week","month"].includes(v), reminderMinutes:v=>Number.isInteger(v)&&v>=0&&v<=1440, remindersEnabled:v=>typeof v==="boolean" };
    for (const [k, valid] of Object.entries(validators)) if (body[k] !== undefined) { if (!valid(body[k])) throw new Error(`Invalid ${k}.`); s.user.preferences[k] = body[k]; }
    if (body.timeZone && body.timeZone !== s.user.timeZone) {
      if (!body.confirmTimezoneChange || !DateTime.now().setZone(body.timeZone).isValid) throw new Error("Confirm a valid timezone change.");
      for (const task of s.tasks.filter(t => !t.deletedAt && t.location === "calendar")) { const before = structuredClone(task); Object.assign(task, scheduleFields(task, body.timeZone)); addTracking(before, task, "timezone_changed", now); }
      s.user.timeZone = body.timeZone;
    }
    return { result: { user: s.user } };
  }
  if (path === "/account/profile") {
    if (body.email !== undefined && body.email !== s.user.email || body.currentPassword) throw new Error("Changing your email requires an online session. Passwords are never saved in the offline queue.");
    if (!body.name?.trim() || body.name.trim().length > 80) throw new Error("Name must contain 1–80 characters.");
    s.user.name = body.name.trim(); return { body: { name: s.user.name }, result: { user: s.user } };
  }
  if (parts[1] === "account" && parts[2] === "categories") {
    const previous = s.user.categories.find(c => c.id === id);
    if (method === "DELETE") {
      if (!previous || s.user.categories.length < 2) throw new Error("Keep at least one category.");
      if (s.tasks.some(t => !t.deletedAt && t.category === id) || s.series?.some(t => !t.deletedAt && t.category === id) || s.templates?.some(t => t.category === id)) throw new Error("Reassign tasks, recurring series, and templates before deleting this category.");
      s.user.categories = s.user.categories.filter(c => c !== previous);
    } else {
      const name = body.name?.trim();
      if (!name || name.length > 40 || !/^#[a-f0-9]{6}$/i.test(body.color)) throw new Error("Choose a name of 1–40 characters and a hex color.");
      if (s.user.categories.some(c => c.id !== previous?.id && c.name.toLowerCase() === name.toLowerCase())) throw new Error("Choose a unique category name.");
      if (method === "POST") { if (s.user.categories.length >= 50) throw new Error("Keep at most 50 categories."); s.user.categories.push({ id: `cat_${entityId}`, name, color: body.color }); }
      else { if (!previous) throw new Error("Category not found."); Object.assign(previous, { name, color: body.color }); }
    }
    return { result: { categories: s.user.categories } };
  }
  throw new Error("This action requires a connection to its service. Your local planner changes are preserved.");
}
