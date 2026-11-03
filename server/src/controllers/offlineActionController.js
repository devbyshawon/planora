import { createHash } from "node:crypto";
import Action from "../models/OfflineAction.js";
import { offlineData } from "../utils/offlineSnapshot.js";
import { AppError } from "../utils/errors.js";
import { createTask, updateTask, deleteTask } from "./taskController.js";
import { createTemplate, updateTemplate, deleteTemplate } from "./templateController.js";
import { createSeries, updateSeries, deleteSeries } from "./seriesController.js";
import { updateSettings, updateProfile, createCategory, updateCategory, deleteCategory } from "./accountController.js";
import { reviewTask } from "./insightController.js";
import Task from "../models/Task.js";
import { materializeRecurrences } from "../utils/recurrence.js";
const routes = [
  ["POST", /^\/tasks$/, createTask], ["PATCH", /^\/tasks\/([a-f0-9]{24})$/, updateTask], ["DELETE", /^\/tasks\/([a-f0-9]{24})$/, deleteTask],
  ["POST", /^\/templates$/, createTemplate], ["PATCH", /^\/templates\/([a-f0-9]{24})$/, updateTemplate], ["DELETE", /^\/templates\/([a-f0-9]{24})$/, deleteTemplate],
  ["POST", /^\/series$/, createSeries], ["PATCH", /^\/series\/([a-f0-9]{24})$/, updateSeries], ["DELETE", /^\/series\/([a-f0-9]{24})$/, deleteSeries],
  ["POST", /^\/insights\/review\/([a-f0-9]{24})$/, reviewTask],
  ["PATCH", /^\/account\/settings$/, updateSettings], ["PATCH", /^\/account\/profile$/, updateProfile],
  ["POST", /^\/account\/categories$/, createCategory], ["PATCH", /^\/account\/categories\/([a-zA-Z0-9_-]+)$/, updateCategory], ["DELETE", /^\/account\/categories\/([a-zA-Z0-9_-]+)$/, deleteCategory],
];
export async function applyOfflineAction(req, res) {
  const op = req.body;
  if (!op || !/^[a-f0-9-]{36}$/.test(op.id) || typeof op.path !== "string" || !/^[a-f0-9]{24}$/.test(op.entityId)) throw new AppError(400, "Invalid queued action.");
  const route = routes.find(([method, pattern]) => method === op.method && pattern.test(op.path));
  if (!route) throw new AppError(400, "This action must be performed online.");
  if (op.path === "/account/profile" && Object.keys(op.body || {}).some(k => k !== "name")) throw new AppError(400, "Email and password changes require an online session.");
  const fingerprint = createHash("sha256").update(JSON.stringify(op)).digest("hex");
  const previous = await Action.findOne({ owner: req.user._id, operationId: op.id });
  if (previous) {
    if (previous.fingerprint !== fingerprint) throw new AppError(409, "Queued action content changed.", "OFFLINE_CONFLICT");
    if (previous.state === "complete") return res.json({ result: previous.result, signature: previous.signature });
    throw new AppError(409, previous.failure || "A previous attempt has an uncertain outcome. Review the online account before retrying; no duplicate request was sent.", "OFFLINE_CONFLICT");
  }
  const snapshot = await offlineData(req.user._id);
  let expected = op.expectedSignature;
  if (op.parentId) expected = (await Action.findOne({ owner: req.user._id, operationId: op.parentId, state: "complete" }))?.signature;
  if (!expected || expected !== snapshot.signature) throw new AppError(409, "Your account changed in another view or device. Queued changes are preserved; review the conflict before applying them.", "OFFLINE_CONFLICT");
  const receipt = await Action.create({ owner: req.user._id, operationId: op.id, fingerprint, state: "executing" });
  let result = null;
  const response = { status() { return this; }, json(data) { result = JSON.parse(JSON.stringify(data)); return this; }, end() { return this; } };
  const child = Object.create(req);
  child.params = { id: route[1].exec(op.path)[1] };
  child.body = { ...(op.body || {}) };
  delete child.body.expectedUpdatedAt;
  child.offlineId = op.entityId;
  try {
    if (op.occurrence) {
      if (!/^[a-f0-9]{24}$/.test(op.occurrence.series) || !/^\d{4}-\d{2}-\d{2}$/.test(op.occurrence.date)) throw new AppError(400,"Invalid recurring occurrence.");
      await materializeRecurrences(req.user, op.occurrence.date, op.occurrence.date);
      const task = await Task.findOne({ owner: req.user._id, series: op.occurrence.series, occurrenceDate: op.occurrence.date });
      if (!task) throw new AppError(409,"Recurring occurrence changed. Review the series before syncing.","OFFLINE_CONFLICT");
      child.params.id = String(task._id);
    }
    // The ordinary controllers enforce exactly the same validation/workflows.
    // A durable executing receipt prevents replay after an uncertain crash. It
    // deliberately requires review rather than risking duplicate external writes.
    await route[2](child, response);
    const after = await offlineData(req.user._id);
    receipt.state = "complete"; receipt.result = result; receipt.signature = after.signature;
    await receipt.save();
    res.json({ result, signature: after.signature });
  } catch (error) {
    receipt.state = "failed";
    receipt.failure = error instanceof AppError ? error.message : "This action has an uncertain outcome. Review the account before retrying.";
    await receipt.save();
    throw error;
  }
}
