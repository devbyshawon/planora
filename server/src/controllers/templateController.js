import mongoose from "mongoose";
import Template from "../models/Template.js";
import { taskInput, createTask } from "./taskController.js";
import { validateRange } from "../../../shared/calendar.js";
import { AppError } from "../utils/errors.js";
async function owned(req) {
  if (!mongoose.isValidObjectId(req.params.id))
    throw new AppError(404, "Template not found.");
  const template = await Template.findOne({
    _id: req.params.id,
    owner: req.user._id,
  });
  if (!template) throw new AppError(404, "Template not found.");
  return template;
}
function values(req, previous = {}) {
  const data = taskInput(req.body, previous),
    name = req.body.name ?? previous.name ?? data.title;
  if (req.body.category === undefined && !previous.category)
    data.category = req.user.categories[0].id;
  if (typeof name !== "string" || !name.trim() || name.trim().length > 160)
    throw new AppError(400, "Template name must contain 1–160 characters.");
  if (!req.user.categories.some((c) => c.id === data.category))
    throw new AppError(400, "Choose one of your own categories.");
  const startTime = req.body.startTime ?? previous.startTime,
    endTime = req.body.endTime ?? previous.endTime;
  try {
    validateRange(startTime, endTime);
  } catch (err) {
    throw new AppError(400, err.message);
  }
  return {
    name: name.trim(),
    nameKey: name.trim().toLowerCase(),
    title: data.title,
    notes: data.notes,
    category: data.category,
    priority: data.priority,
    startTime,
    endTime,
  };
}
export async function listTemplates(req, res) {
  res.json({
    templates: await Template.find({ owner: req.user._id })
      .sort({ name: 1 })
      .lean(),
  });
}
export async function createTemplate(req, res) {
  if ((await Template.countDocuments({ owner: req.user._id })) >= 200)
    throw new AppError(400, "Keep at most 200 templates.");
  res.status(201).json({
    template: await Template.create({ ...values(req), owner: req.user._id }),
  });
}
export async function updateTemplate(req, res) {
  const template = await owned(req);
  Object.assign(template, values(req, template.toObject()));
  await template.save();
  res.json({ template });
}
export async function deleteTemplate(req, res) {
  const template = await owned(req);
  await template.deleteOne();
  res.status(204).end();
}
export async function applyTemplate(req, res) {
  const template = await owned(req),
    overrides = req.body ?? {};
  if (typeof overrides !== "object" || Array.isArray(overrides))
    throw new AppError(400, "Provide a JSON task object.");
  req.body = {
    ...Object.fromEntries(
      ["title", "notes", "category", "priority", "startTime", "endTime"].map(
        (key) => [key, overrides[key] ?? template[key]],
      ),
    ),
    date: overrides.date,
    status: overrides.status ?? "scheduled",
    location: overrides.location ?? "calendar",
    allowOverlap: overrides.allowOverlap,
  };
  return createTask(req, res);
}
