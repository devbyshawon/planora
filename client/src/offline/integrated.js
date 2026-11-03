import { readOffline, writeOffline, offlineLock } from "./storage.js";
import { enqueue } from "./model.js";
import { summarize } from "../../../server/src/utils/progress.js";
import { DateTime } from "luxon";
import { scheduleFields } from "../../../server/src/utils/schedule.js";
import { eventType } from "../../../server/src/utils/tracking.js";
import { localNonTask, materializeLocal, objectId, addTracking, localExportData } from "./domain.js";

let activeUser = null, started = false, working;
const announce = detail => window.dispatchEvent(new CustomEvent("planora-sync", { detail }));
export function networkRequest(path, { method = "GET", body, signal } = {}) {
  return fetch(`/api${path}`, { method, signal: signal || AbortSignal.timeout(20000), credentials: "same-origin", headers: { "Content-Type": "application/json", "X-Planora-Client": "web" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function networkData(path, options) {
  const response = await networkRequest(path, options);
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error(data?.error?.message || "The request could not be completed."), { status: response.status, code: data?.error?.code, details: data?.error?.details });
  return data;
}
function error(message, code = "OFFLINE_UNAVAILABLE", details) { return Object.assign(new Error(message), { code, details }); }
export async function prepareOffline(user) {
  activeUser = user.id;
  await offlineLock(async () => {
    const previous = await readOffline();
    if (previous && previous.snapshot.user.id !== user.id && previous.queue.length)
      throw error("Another account has pending device changes. Sign back into that account and sync or export its backup first.");
    if (previous?.snapshot.user.id === user.id && previous.queue.length) return;
    const snapshot = await networkData("/offline/snapshot");
    if (snapshot.user.id !== user.id) throw error("Your signed-in account changed. Reload Planora.");
    await writeOffline({ version: 1, snapshot, queue: [], claims: previous?.snapshot.user.id === user.id ? previous.claims || {} : {}, responses: previous?.snapshot.user.id === user.id ? previous.responses || {} : {} });
  });
  announce({ message: "Saved on this device for offline use." });
}
export async function syncIntegrated() {
  if (working) return working;
  if (document.querySelector("dialog[open]")) return;
  if (!navigator.onLine || !activeUser) return;
  working = offlineLock(async () => {
    let state = await readOffline();
    if (!state || state.snapshot.user.id !== activeUser || state.autoSyncPaused) return;
    const { user } = await networkData("/auth/me");
    if (user.id !== state.snapshot.user.id) throw error("Sign in to the same account to sync saved changes.");
    const changed = state.queue.length > 0;
    for (const operation of [...state.queue]) {
      const result = await networkData(operation.path ? "/offline/actions" : "/offline/operations", { method: "POST", body: operation });
      if (operation.path && operation.occurrence && result.result?.task) {
        const actual = result.result.task;
        for (const queued of state.queue) if (queued.path?.endsWith(`/${operation.entityId}`)) queued.path = queued.path.replace(operation.entityId, actual._id);
        const local = state.snapshot.tasks.find(t => t._id === operation.entityId);
        if (local) local._id = actual._id;
      }
      state.queue = state.queue.filter(op => op.id !== operation.id);
      const task = state.snapshot.tasks.find(t => t._id === operation.taskId);
      if (task?.updatedAt === `local:${operation.id}`) task.updatedAt = result.updatedAt;
      if (result.signature) state.snapshot.signature = result.signature;
      await writeOffline(state);
    }
    const snapshot = await networkData("/offline/snapshot");
    if (snapshot.user.id !== activeUser) throw error("Your account changed during sync. Reload Planora.");
    state.snapshot = snapshot;
    await writeOffline(state);
    announce({ message: "All changes synced.", pending: 0, changed });
  }).catch(e => { announce({ message: e.message, error: true }); throw e; }).finally(() => { working = null; });
  return working;
}
export function startIntegratedOffline() {
  if (started) return; started = true;
  const retry = () => syncIntegrated().catch(() => {});
  window.addEventListener("online", retry);
  window.addEventListener("focus", retry);
  window.setInterval(retry, 60000);
  queueMicrotask(retry);
}
export async function rememberResponse(path, options, data) {
  if (["/auth/login", "/auth/register", "/auth/me"].includes(path) && data?.user) {
    activeUser = data.user.id;
    startIntegratedOffline();
    const saved = await readOffline();
    if (saved?.snapshot.user.id !== activeUser || !saved?.queue.length) {
      await prepareOffline(data.user);
    } else syncIntegrated().catch(() => {});
    return;
  }
  if (path === "/auth/logout") {
    await offlineLock(async () => { const s = await readOffline(); if (s?.queue.length) throw error("Sync your pending device changes before signing out."); await writeOffline(null); });
    activeUser = null; return;
  }
  if (!activeUser) return;
  await offlineLock(async () => {
    const state = await readOffline();
    if (!state || state.snapshot.user.id !== activeUser || state.queue.length) return;
    state.responses ||= {};
    if ((options.method || "GET") === "GET" && !path.startsWith("/admin")) state.responses[path] = data;
    if (path === "/reminders/claim" && data?.claimed) {
      state.claims ||= {}; state.claims[`${options.body.deviceId}:${options.body.key}`] = Date.now();
    }
    if (data?.user) state.snapshot.user = data.user;
    if (data?.task && path.startsWith("/tasks")) {
      const i = state.snapshot.tasks.findIndex(t => t._id === data.task._id);
      if (i < 0) state.snapshot.tasks.push(data.task); else state.snapshot.tasks[i] = { ...state.snapshot.tasks[i], ...data.task };
    }
    if (path.startsWith("/tasks/") && options.method === "DELETE") {
      const task = state.snapshot.tasks.find(t => t._id === path.split("/")[2]);
      if (task) task.deletedAt = new Date().toISOString();
    }
    await writeOffline(state);
  });
  if ((options.method && options.method !== "GET" && !path.startsWith("/auth/")) || path.startsWith("/tasks?")) {
    const state = await readOffline();
    if (state?.snapshot.user.id === activeUser && !state.queue.length) await prepareOffline(state.snapshot.user);
  }
}
export async function localRequest(path, options = {}, force = false) {
  let state;
  try { state = await readOffline(); }
  catch (e) { if (navigator.onLine && !force) return { handled: false }; throw e; }
  const method = options.method || "GET";
  if (!state) return { handled: false };
  if (activeUser && state.snapshot.user.id !== activeUser) return { handled: false };
  if (path === "/reminders/claim" && state.claims?.[`${options.body?.deviceId}:${options.body?.key}`]) return { handled: true, data: { claimed: false } };
  const cachedWrite = method !== "GET" && (/^\/(tasks|templates|series)(?:\/|$)/.test(path) || path.startsWith("/insights/review/") || path === "/account/settings" || path.startsWith("/account/categories") || path === "/account/profile" && (!options.body?.email || options.body.email === state.snapshot.user.email) && !options.body?.currentPassword);
  if (!force && navigator.onLine && !state.queue.length && !cachedWrite) return { handled: false };
  if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
  activeUser = state.snapshot.user.id;
  const url = new URL(path, "https://planora.local"), q = url.searchParams;
  let route = url.pathname;
  if (/^\/templates\/[^/]+\/apply$/.test(route) && method === "POST") {
    const template = state.snapshot.templates?.find(t => t._id === route.split("/")[2]);
    if (!template) throw error("Template is not saved on this device.");
    options = { ...options, body: { ...Object.fromEntries(["title","notes","category","priority","startTime","endTime"].map(k=>[k,template[k]])), status:"scheduled", location:"calendar", ...options.body } };
    route = "/tasks";
  }
  if ((route === "/tasks" || route.startsWith("/insights/") || route === "/tasks/search") && q.get("from") && q.get("to")) {
    await offlineLock(async () => { const current = await readOffline(); materializeLocal(current, q.get("from"), q.get("to")); await writeOffline(current); state = current; });
  }
  const all = state.snapshot.tasks, tasks = all.filter(t => !t.deletedAt), today = DateTime.now().setZone(state.snapshot.user.timeZone).toISODate();
  const result = data => ({ handled: true, data });
  if (route === "/auth/me" && method === "GET") { startIntegratedOffline(); if (state.queue.length) announce({pending:state.queue.length,message:`${state.queue.length} changes saved on this device; waiting to sync.`}); return result({ user: state.snapshot.user }); }
  if (route === "/auth/logout") {
    throw error("Reconnect and finish syncing before signing out so the server session can be revoked safely.");
  }
  if (route === "/reminders/upcoming") {
    const now = Date.now(), lead = state.snapshot.user.preferences.reminderMinutes;
    const allowed = state.snapshot.publicSettings?.browserRemindersAllowed !== false;
    const enabled = allowed && state.snapshot.user.preferences.remindersEnabled;
    const reminders = [];
    if (enabled) for (const task of tasks.filter(t => t.location === "calendar" && t.status !== "completed")) {
      const start = new Date(task.startsAt).getTime(), due = start-lead*60000;
      if (due < now-120000 || due > now+3600000) continue;
      const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${task._id}:${start}:${lead}`));
      const key = [...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,"0")).join("");
      reminders.push({ taskId: task._id, title: task.title, date: task.date, startTime: task.startTime, timeZone: task.timeZone, startsAt: task.startsAt, dueAt: new Date(due).toISOString(), key });
    }
    return result({ enabled, allowed, lead, serverTime: new Date().toISOString(), reminders });
  }
  if (route === "/reminders/claim") {
    let answer;
    await offlineLock(async()=>{
      const current = await readOffline(), { taskId,deviceId,key } = options.body || {};
      const task = current.snapshot.tasks.find(t=>t._id===taskId && !t.deletedAt && t.location==="calendar" && t.status!=="completed");
      if (!task || !current.snapshot.user.preferences.remindersEnabled || current.snapshot.publicSettings?.browserRemindersAllowed === false) throw error("Reminder no longer enabled.","REMINDERS_DISABLED");
      const lead=current.snapshot.user.preferences.reminderMinutes,start=new Date(task.startsAt).getTime(),due=start-lead*60000;
      const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(`${taskId}:${start}:${lead}`));
      const expected=[...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,"0")).join("");
      if (key!==expected) throw error("Task time changed.","STALE_REMINDER");
      if (due>Date.now() || due<Date.now()-120000 || lead>0 && start<=Date.now()) throw error("Reminder is not due.","REMINDER_NOT_DUE");
      const claim=`${deviceId}:${key}`; current.claims ||= {};
      if (current.claims[claim]) answer={claimed:false};
      else { current.claims[claim]=Date.now(); answer={claimed:true,reminder:{taskId,title:task.title,date:task.date,startTime:task.startTime,timeZone:task.timeZone,key}}; await writeOffline(current); }
    });
    return result(answer);
  }
  if (route === "/tasks" && method === "GET") return result({ tasks: tasks.filter(t => q.get("location") === "bucket" ? t.location === "bucket" : t.location === "calendar" && t.date >= q.get("from") && t.date <= q.get("to")), warnings: [] });
  if (route === "/tasks/search") {
    const term = (q.get("q") || "").trim().toLowerCase();
    const filtered = tasks.filter(t => (!q.get("location") || q.get("location") === "all" || t.location === q.get("location")) && ["category", "priority", "status"].every(k => !q.get(k) || t[k] === q.get(k)) && (!q.get("from") || t.location === "bucket" || t.date >= q.get("from") && t.date <= q.get("to")) && `${t.title} ${t.notes || ""} ${state.snapshot.user.categories.find(c => c.id === t.category)?.name || ""}`.toLowerCase().includes(term));
    const page = Number(q.get("page") || 1); return result({ tasks: filtered.slice((page-1)*50, page*50), total: filtered.length, page, pageSize: 50, warnings: [] });
  }
  if (/^\/tasks\/[^/]+\/history$/.test(route)) {
    const task = all.find(t => t._id === route.split("/")[2]); if (!task) throw error("Task not saved on this device.");
    const events = [...(task.history || [])].reverse(), page = Number(q.get("page") || 1);
    return result({ task, events: events.slice((page-1)*50, page*50), total: events.length, page, pageSize: 50, legacy: !events.length });
  }
  if (/^\/tasks\/[^/]+$/.test(route) && method === "GET") {
    const task = tasks.find(t => t._id === route.split("/")[2]); if (!task) throw error("Task is not saved on this device."); return result({ task });
  }
  if (route === "/insights/progress") return result({ ...summarize(all, q.get("from"), q.get("to"), today, state.snapshot.user.categories, q.get("category")), warnings: [] });
  if (route === "/insights/review" && method === "GET") {
    const date = q.get("date"); if (date >= today) throw error("Choose a day that has ended in your planner timezone.");
    return result({ date, today, tasks: tasks.filter(t => t.location === "calendar" && t.date === date && t.status !== "completed" && t.review?.date !== date), warnings: [] });
  }
  const isTaskWrite = (route === "/tasks" && method === "POST") || (/^\/tasks\/[^/]+$/.test(route) && ["PATCH", "DELETE"].includes(method));
  const review = /^\/insights\/review\/[^/]+$/.test(route) && method === "POST";
  if (isTaskWrite || review) {
    let response;
    await offlineLock(async () => {
      const current = await readOffline();
      if (!current || current.snapshot.user.id !== activeUser) throw error("The offline account changed. Reload Planora.");
      if (!current.snapshot.signature) throw error("Open Planora online once to finish updating the saved planner before editing offline.");
      if (current.queue.some(op => !op.path)) throw error("Reconnect to finish syncing changes from the earlier offline version before making new edits.");
      const taskId = method === "POST" && !review ? objectId() : route.split("/").at(-1);
      const previous = current.snapshot.tasks.find(t => t._id === taskId);
      if (options.body?.expectedUpdatedAt && previous?.updatedAt !== options.body.expectedUpdatedAt) throw error("This task changed in another view. Reload it before saving.", "STALE_TASK");
      let body = options.body, kind = method === "DELETE" ? "delete" : previous ? "update" : "create";
      if (review) {
        const { date, action } = options.body || {};
        if (!previous || previous.deletedAt || previous.date !== date || previous.location !== "calendar" || previous.status === "completed" || date >= today || !["keep", "bucket", "delete"].includes(action)) throw error("This review is no longer current.", "STALE_REVIEW");
        kind = action === "delete" ? "delete" : "update";
        body = action === "bucket" ? { location: "bucket" } : { status: "not_completed" };
      }
      const id = crypto.randomUUID();
      let next;
      try { next = enqueue(current, { id, taskId, kind, body, allowOverlap: options.body?.allowOverlap === true }); }
      catch (e) {
        if (/overlap/i.test(e.message)) throw error(e.message, "OVERLAP", current.snapshot.tasks.filter(t => !t.deletedAt && t._id!==taskId && t.date === (body?.date || previous?.date)));
        throw e;
      }
      if (review) {
        next.queue.at(-1).review = { date: options.body.date, action: options.body.action };
        const task = next.snapshot.tasks.find(t => t._id === taskId); if (task) task.review = { ...next.queue.at(-1).review, at: new Date().toISOString() };
      }
      const nextTask = next.snapshot.tasks.find(t => t._id === taskId);
      if (nextTask && kind !== "delete") {
        if (!previous && nextTask.location === "bucket") for (const key of ["date","startTime","endTime"]) delete nextTask[key];
        if (previous?.series && ["title","notes","category","priority","date","startTime","endTime","location"].some(k=>nextTask[k]!==previous[k])) nextTask.isException=true;
        if (nextTask.location === "calendar") Object.assign(nextTask, scheduleFields(nextTask, current.snapshot.user.timeZone));
        if (previous?.location === "calendar" && nextTask.location === "bucket") { nextTask.bucketAddedAt = new Date().toISOString(); nextTask.postponeCount = (previous.postponeCount || 0) + 1; nextTask.originalSchedule ||= { date: previous.date, startTime: previous.startTime, endTime: previous.endTime, durationMinutes: previous.durationMinutes }; }
        if (!previous && nextTask.location === "bucket") nextTask.bucketAddedAt = new Date().toISOString();
        if (nextTask.status === "completed") nextTask.completedAt = previous?.completedAt || new Date().toISOString();
        else delete nextTask.completedAt;
        addTracking(previous, nextTask, review ? `review_${options.body.action === "keep" ? "kept" : options.body.action}` : previous ? eventType(previous, nextTask) : "created");
      }
      if (kind === "delete" && previous) { const tombstone = { ...previous, deletedAt: new Date().toISOString(), updatedAt: `local:${id}` }; addTracking(previous, tombstone, "deleted"); next.snapshot.tasks.push(tombstone); }
      next.queue.pop();
      const parentId = current.queue.at(-1)?.id;
      next.queue.push({ id, path: route, method, entityId: taskId, body: options.body || {}, ...(previous?.series ? { occurrence: { series: previous.series, date: previous.occurrenceDate } } : {}), ...(parentId ? { parentId } : { expectedSignature: current.snapshot.signature }) });
      await writeOffline(next);
      response = kind === "delete" ? null : { task: next.snapshot.tasks.find(t => t._id === taskId) };
      announce({ pending: next.queue.length, message: `${next.queue.length} changes saved on this device; waiting to sync.` });
    });
    if (navigator.onLine) window.setTimeout(()=>syncIntegrated().catch(() => {}),300);
    return result(response);
  }
  if (method !== "GET") {
    let response;
    await offlineLock(async () => {
      const current = await readOffline();
      if (!current || current.snapshot.user.id !== activeUser || current.queue.some(op => !op.path)) throw error("Reconnect to finish migrating the saved planner first.");
      const next = structuredClone(current), entityId = objectId(), id = crypto.randomUUID();
      if (!current.snapshot.signature) throw error("Open Planora online once before making offline changes.");
      const applied = localNonTask(next, route, method, options.body, entityId);
      if (!applied.readOnly) {
        const parentId = current.queue.at(-1)?.id;
        next.queue.push({ id, path: route, method, entityId, body: applied.body || options.body || {}, ...(parentId ? { parentId } : { expectedSignature: current.snapshot.signature }) });
      }
      await writeOffline(next); response = applied.result;
      announce({ pending: next.queue.length, message: `${next.queue.length} changes saved on this device.` });
    });
    if (navigator.onLine) window.setTimeout(()=>syncIntegrated().catch(() => {}),300);
    return result(response);
  }
  if (method === "GET" && route === "/templates") return result({ templates: state.snapshot.templates || [] });
  if (method === "GET" && route === "/series") return result({ series: (state.snapshot.series || []).filter(s=>!s.deletedAt) });
  if (method === "GET" && route.startsWith("/series/")) {
    const series = state.snapshot.series?.find(s => s._id === route.split("/")[2]); if (series) return result({ series });
  }
  if (method === "GET" && route === "/account/categories") return result({ categories: state.snapshot.user.categories });
  if (method === "GET" && route === "/google/status" && state.snapshot.googleStatus) return result(state.snapshot.googleStatus);
  if (route === "/public/settings") return result(state.snapshot.publicSettings || { registrationOpen: false, defaultTimeZone: state.snapshot.user.timeZone, browserRemindersAllowed: true });
  if (method === "GET" && state.responses?.[path] !== undefined) return result(state.responses[path]);
  throw error("This action needs a connection. Your saved planner and pending changes are preserved on this device.");
}
export async function backupIntegrated() {
  const state = await offlineLock(readOffline);
  if (!state) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(state,null,2)], { type:"application/json" }));
  const a = document.createElement("a"); a.href=url; a.download=`Planora-device-backup-${new Date().toISOString().slice(0,10)}.json`; a.click();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}
export async function acceptServerVersion() {
  if (!navigator.onLine) throw error("Reconnect before loading the online version.");
  if (!window.confirm("Discard ALL pending device changes and use the online account version? Download a backup first. This cannot be undone without your backup.")) return;
  await offlineLock(async()=>{
    const current=await readOffline(), {user}=await networkData("/auth/me");
    if (!current || current.snapshot.user.id!==user.id) throw error("Sign in to the same account first.");
    const snapshot=await networkData("/offline/snapshot");
    await writeOffline({version:1,snapshot,queue:[],responses:{},claims:current.claims||{}});
    announce({message:"Online version restored.",pending:0,changed:true});
  });
}
