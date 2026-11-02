import Task from "../models/Task.js";
import { materializeRecurrences, assertWindow } from "../utils/recurrence.js";
import { AppError } from "../utils/errors.js";
export const escapeRegex = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export async function searchTasks(req, res) {
  const {
    q = "",
    from,
    to,
    category,
    priority,
    status,
    location = "all",
    page = "1",
  } = req.query;
  if (
    [q, from, to, category, priority, status, location, page].some(
      (v) => v !== undefined && typeof v !== "string",
    ) ||
    q.length > 200
  )
    throw new AppError(400, "Invalid search filters.");
  if (
    !["all", "calendar", "bucket"].includes(location) ||
    (priority && !["low", "medium", "high"].includes(priority)) ||
    (status && !["scheduled", "completed", "not_completed"].includes(status))
  )
    throw new AppError(400, "Invalid search filters.");
  if (category && !req.user.categories.some((c) => c.id === category))
    throw new AppError(400, "Choose one of your own categories.");
  const pageNumber = Number(page);
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > 100000)
    throw new AppError(400, "Invalid search page.");
  const clauses = [{ owner: req.user._id, deletedAt: null }];
  let warnings = [];
  if (from !== undefined || to !== undefined) {
    assertWindow(from, to);
    if (location !== "bucket")
      warnings = await materializeRecurrences(req.user, from, to);
    clauses.push({
      $or: [
        { location: "calendar", date: { $gte: from, $lte: to } },
        { location: "bucket" },
      ],
    });
  }
  if (location !== "all") clauses.push({ location });
  if (category) clauses.push({ category });
  if (priority) clauses.push({ priority });
  if (status) clauses.push({ status });
  if (q.trim()) {
    const matchingCategories = req.user.categories
      .filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase()))
      .map((c) => c.id);
    clauses.push({
      $or: [
        { title: { $regex: escapeRegex(q.trim()), $options: "i" } },
        { notes: { $regex: escapeRegex(q.trim()), $options: "i" } },
        { category: { $in: matchingCategories } },
      ],
    });
  }
  const filter = { $and: clauses },
    pageSize = 50;
  const total = await Task.countDocuments(filter);
  const tasks = await Task.find(filter)
    .sort({ date: 1, startMinute: 1, _id: 1 })
    .skip((pageNumber - 1) * pageSize)
    .limit(pageSize)
    .lean();
  res.json({ tasks, total, page: pageNumber, pageSize, warnings });
}
