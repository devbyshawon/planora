import "./style.css";
import { readOffline, writeOffline, offlineLock } from "./storage.js";
import { enqueue } from "./model.js";
import { startPwa } from "../pwa.js";
startPwa();
const root = document.getElementById("offline-root");
root.innerHTML = `<header><a href="/">← Online planner</a><h1>Offline planner</h1><p>Your account tasks, saved on this device.</p></header><p id="message" role="status" aria-live="polite"></p><section id="setup"><h2>Enable on a trusted device</h2><p>This stores a readable copy of your account and tasks in this browser. Anyone with access to this browser profile can open it without signing in while offline. Browser storage can be cleared or evicted; keep backups.</p><p>Sign in to the online planner first, return here, then enable. Only saved tasks are available offline. Recurring occurrences are prepared from 30 days ago through 90 days ahead; recurrence rules, Google, exports, reminders, and account settings require the online planner.</p><button id="enable">Save my tasks for offline use</button></section><section id="workspace" hidden><p id="identity"></p><p id="summary"></p><div class="actions"><button id="sync">Sync now</button><button id="backup">Download backup</button><button id="forget">Remove device copy</button></div><details><summary>Restore an offline backup</summary><p>Restores this device's tasks and pending operations. Use a backup from this application; it replaces the device copy, never server data directly. Export the current copy first. Sync checks account ownership and server conflicts.</p><input id="restore-file" type="file" accept="application/json,.json" aria-label="Offline backup JSON"><button id="restore">Restore backup</button></details><p>Sync is automatic while this workspace is open and connected. If your session expires, sign in to the same account in the online planner, then return here. Offline changes do not trigger Google sync.</p><details id="conflict-tools"><summary>Resolve a sync conflict</summary><p>Export a backup first. Discarding pending changes downloads the current server version. To keep your edit, copy it from the backup and reapply it after refreshing. No automatic overwrite occurs.</p><button id="discard">Discard pending edits and reload server copy</button></details><div class="filters"><label>View<select id="view"><option value="day">Selected day</option><option value="bucket">Bucket</option><option value="all">All saved tasks</option></select></label><label>Date<input id="date" type="date"></label><label>Search<input id="search" type="search" maxlength="160"></label><button id="new">New task</button></div><ul id="tasks"></ul><form id="editor" hidden><h2 id="editor-title">Task</h2><label>Title<input name="title" required maxlength="160"></label><label>Notes<textarea name="notes" maxlength="5000"></textarea></label><label>Category<select name="category"></select></label><label>Priority<select name="priority"><option>low</option><option selected>medium</option><option>high</option></select></label><label>Location<select name="location"><option value="calendar">Calendar</option><option value="bucket">Bucket</option></select></label><label>Date<input name="date" type="date"></label><label>Start<input name="startTime" type="time"></label><label>End<input name="endTime" type="time"></label><label>Status<select name="status"><option value="scheduled">Scheduled</option><option value="completed">Completed</option><option value="not_completed">Not completed</option></select></label><label class="check"><input name="allowOverlap" type="checkbox">Allow schedule overlaps (including during sync)</label><div class="actions"><button type="submit">Save on device</button><button id="cancel" type="button">Cancel</button><button id="delete" type="button">Delete task</button></div></form></section><footer><a href="/privacy.html">Privacy</a> · <a href="/terms.html">Terms</a> · <a href="mailto:shawon12hossain@gmail.com">Support</a></footer>`;
const $ = id => document.getElementById(id);
const editor = $("editor");
// Backups can also be restored on a device with no saved workspace yet.
root.insertBefore($("restore").closest("details"), $("workspace"));
let state, editing, editingVersion, busy = false;
const message = (text, error = false) => { $("message").textContent = text; $("message").className = error ? "error" : ""; };
async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, { credentials: "same-origin", signal: AbortSignal.timeout(20000), headers: { "Content-Type": "application/json", "X-Planora-Client": "web" }, ...options });
  } catch {
    throw new Error("Cannot reach the server. Your saved tasks and pending edits remain on this device. Reconnect or wait for the backend to wake; sync will retry while this workspace is open.");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message || "The server could not complete this request. Your device copy is preserved.");
  return data;
}
async function run(action) {
  if (busy) return;
  busy = true;
  document.querySelectorAll("button").forEach(b => { b.disabled = true; });
  try { await offlineLock(action); } catch (error) { message(error.message || "Offline operation failed. Your server data is unchanged.", true); }
  finally { busy = false; document.querySelectorAll("button").forEach(b => { b.disabled = false; }); }
}
function render() {
  $("setup").hidden = Boolean(state);
  $("workspace").hidden = !state;
  if (!state) return;
  const snapshot = state.snapshot;
  $("identity").textContent = `${snapshot.user.email} · ${snapshot.user.timeZone}`;
  $("summary").textContent = `${state.queue.length} pending changes · Last server snapshot: ${new Date(snapshot.savedAt).toLocaleString()}. ${navigator.onLine ? "Network available" : "Offline"}.${state.autoSyncPaused ? " Automatic sync paused: review and choose Sync now." : ""} Recurrence prepared ${snapshot.recurrenceFrom || "at snapshot"}–${snapshot.recurrenceTo || "at snapshot"}.`;
  const list = $("tasks"); list.replaceChildren();
  const query = $("search").value.toLowerCase();
  const tasks = snapshot.tasks.filter(t => ($("view").value === "all" || ($("view").value === "bucket" ? t.location === "bucket" : t.location === "calendar" && t.date === $("date").value)) && `${t.title} ${t.notes || ""}`.toLowerCase().includes(query)).sort((a,b) => `${a.date || ""} ${a.startTime || ""}`.localeCompare(`${b.date || ""} ${b.startTime || ""}`));
  for (const task of tasks) {
    const li = document.createElement("li"), button = document.createElement("button");
    button.textContent = `${task.location === "bucket" ? "Bucket" : `${task.date} ${task.startTime}–${task.endTime}`} · ${task.title} · ${task.status}${task.updatedAt?.startsWith("local:") ? " · pending" : ""}${task.series ? " · recurring occurrence" : ""}`;
    button.onclick = () => openEditor(task); li.append(button); list.append(li);
  }
  if (!tasks.length) { const li = document.createElement("li"); li.textContent = "No saved tasks in this view. New recurring occurrences are generated only when connected."; list.append(li); }
}
function openEditor(task) {
  if (busy) return;
  editing = task?._id;
  editingVersion = task?.updatedAt;
  editor.reset();
  const select = editor.elements.category; select.replaceChildren();
  for (const category of state.snapshot.user.categories) { const option = document.createElement("option"); option.value = category.id; option.textContent = category.name; select.append(option); }
  const values = task || { date: $("date").value, startTime: "09:00", endTime: "10:00", priority: "medium", status: "scheduled", location: $("view").value === "bucket" ? "bucket" : "calendar" };
  for (const [key, value] of Object.entries(values)) if (editor.elements.namedItem(key) && typeof value === "string") editor.elements.namedItem(key).value = value;
  $("delete").hidden = !editing; $("editor-title").textContent = task?.series ? "Edit this saved occurrence only" : editing ? "Edit task" : "New task";
  editor.hidden = false; editor.elements.title.focus(); editor.scrollIntoView({ block: "nearest" });
}
async function refresh() {
  const me = await request("/auth/me");
  if (state && me.user.id !== state.snapshot.user.id) throw new Error("Sign in to the same account as this offline copy. No changes were sent.");
  const snapshot = await request("/offline/snapshot");
  state = { version: 1, snapshot, queue: [] };
  await writeOffline(state); render();
}
async function sync(manual = false) {
  if (!navigator.onLine || busy || !state || !editor.hidden || (state.autoSyncPaused && manual !== true)) return;
  await run(async () => {
    state = await readOffline(); if (!state) return;
    if (manual === true && state.autoSyncPaused) { delete state.autoSyncPaused; await writeOffline(state); }
    const me = await request("/auth/me");
    if (me.user.id !== state.snapshot.user.id) throw new Error("Different account is signed in. Sign in to the offline copy's account; nothing was sent.");
    message("Syncing saved changes…");
    for (const op of [...state.queue]) {
      const result = await request("/offline/operations", { method: "POST", body: JSON.stringify(op) });
      state.queue = state.queue.filter(item => item.id !== op.id);
      const task = state.snapshot.tasks.find(t => t._id === op.taskId);
      if (task?.updatedAt === `local:${op.id}`) task.updatedAt = result.updatedAt;
      await writeOffline(state);
    }
    await refresh(); message("All device changes synced. Server copy refreshed.");
  });
  render();
}
function exportBackup() {
  if (!state) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = `planora-offline-${new Date().toISOString().slice(0,10)}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  message("Backup downloaded. It contains private task data; store it securely.");
}
$("enable").onclick = () => run(async () => {
  state = await readOffline(); if (state) { render(); return; }
  if (!confirm("Save a readable copy of your account and tasks on this trusted device? Anyone using this browser profile can access it offline.")) return;
  await refresh(); message("Saved for offline use. You can disconnect now. Keep backups of pending edits.");
});
$("sync").onclick = () => sync(true);
$("backup").onclick = () => run(async () => { state = await readOffline(); exportBackup(); });
$("forget").onclick = () => run(async () => {
  state = await readOffline();
  if (!confirm(`Remove this browser's offline copy${state?.queue.length ? ` and ${state.queue.length} unsynced changes` : ""}? Download a backup first. Server tasks will not be deleted.`)) return;
  await writeOffline(null); state = null; editor.hidden = true; render(); message("Device copy removed. Server data is unchanged.");
});
$("discard").onclick = () => run(async () => {
  state = await readOffline();
  if (!confirm("Discard ALL unsynced device edits and use the current server copy? Download a backup first. This cannot be undone without that backup.")) return;
  await refresh(); editor.hidden = true; message("Server copy downloaded. Pending device edits discarded.");
});
$("restore").onclick = () => run(async () => {
  const file = $("restore-file").files[0];
  if (!file || file.size > 30 * 1024 * 1024) throw new Error("Choose an offline JSON backup under 30 MB.");
  const backup = JSON.parse(await file.text());
  if (backup.version !== 1 || typeof backup.snapshot?.user?.id !== "string" || !Array.isArray(backup.snapshot?.tasks) || !Array.isArray(backup.queue) || backup.snapshot.tasks.length > 5000 || backup.queue.length > 10000) throw new Error("Unsupported backup format.");
  for (const t of backup.snapshot.tasks) if (!t || typeof t._id !== "string" || typeof t.title !== "string" || typeof t.updatedAt !== "string") throw new Error("Invalid task in backup.");
  for (const op of backup.queue) if (!op || typeof op.id !== "string" || !["create","update","delete"].includes(op.kind) || typeof op.taskId !== "string") throw new Error("Invalid pending operation.");
  if (!confirm("Replace this browser's offline copy with the selected backup? Export the current copy first.")) return;
  backup.autoSyncPaused = true;
  await writeOffline(backup); state = backup; editor.hidden = true; render(); message("Backup restored on device. Automatic sync is paused until you choose Sync now.");
});
editor.onsubmit = event => { event.preventDefault(); run(async () => {
  state = await readOffline();
  const data = Object.fromEntries(new FormData(editor));
  if (editing && state?.snapshot.tasks.find(t => t._id === editing)?.updatedAt !== editingVersion) throw new Error("This task changed in another offline tab. Cancel and reopen the task before editing.");
  const taskId = editing || crypto.randomUUID().replaceAll("-", "").slice(0,24);
  const next = enqueue(state, { id: crypto.randomUUID(), taskId, kind: editing ? "update" : "create", body: data, allowOverlap: data.allowOverlap === "on" });
  await writeOffline(next); state = next; editor.hidden = true; render(); message("Saved on this device. Pending server synchronization.");
}).then(() => { if (editor.hidden) sync(); }); };
$("delete").onclick = () => run(async () => {
  if (!confirm("Delete this task? The deletion will sync when connected.")) return;
  state = await readOffline();
  if (state?.snapshot.tasks.find(t => t._id === editing)?.updatedAt !== editingVersion) throw new Error("This task changed in another offline tab. Cancel and reopen it before deleting.");
  const next = enqueue(state, { id: crypto.randomUUID(), taskId: editing, kind: "delete" });
  await writeOffline(next); state = next; editor.hidden = true; render(); message("Deletion saved on device, pending sync.");
}).then(sync);
$("new").onclick = () => openEditor(); $("cancel").onclick = () => { editor.hidden = true; };
for (const id of ["date", "view", "search"]) $(id).oninput = render;
window.addEventListener("online", () => { render(); sync(); }); window.addEventListener("offline", render);
window.addEventListener("focus", () => { if (editor.hidden && !busy) readOffline().then(value => { state = value; render(); }).catch(error => message(error.message, true)); });
setInterval(() => { if (editor.hidden) sync(); }, 60000);
try {
  state = await readOffline();
  const zone = state?.snapshot.user.timeZone;
  $("date").value = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  render();
  if (state) sync();
} catch (error) { message(error.message, true); }
