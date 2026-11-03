import Task from "../../models/Task.js";
import RecurrenceSeries from "../../models/RecurrenceSeries.js";
import { assertWindow, materializeRecurrences } from "../recurrence.js";
import { AppError } from "../errors.js";
export const MAX_EXPORT_TASKS = 5000;
import { exportInput, categoryName, statusName, exportPreview } from "../../../../shared/exportModel.js";
export { exportInput, categoryName, statusName, exportPreview };
export async function exportData(user, options, generatedAt = new Date()) {
  if (
    options.category &&
    !user.categories.some((c) => c.id === options.category)
  )
    throw new AppError(400, "Choose one of your own categories.");
  const warnings = await materializeRecurrences(user, options.from, options.to);
  const filter = {
    owner: user._id,
    deletedAt: null,
    location: "calendar",
    date: { $gte: options.from, $lte: options.to },
    ...(options.category ? { category: options.category } : {}),
    ...(options.status ? { status: options.status } : {}),
  };
  const tasks = await Task.find(filter)
    .select("-plans")
    .sort({ date: 1, startMinute: 1, _id: 1 })
    .limit(MAX_EXPORT_TASKS + 1)
    .lean();
  if (tasks.length > MAX_EXPORT_TASKS)
    throw new AppError(
      413,
      "This export exceeds 5,000 tasks. Choose a shorter range or a category filter.",
      "EXPORT_TOO_LARGE",
    );
  const series = await RecurrenceSeries.find({
    owner: user._id,
    deletedAt: null,
    _id: {
      $in: [
        ...new Set(tasks.filter((t) => t.series).map((t) => String(t.series))),
      ],
    },
  }).lean();
  return {
    options,
    tasks,
    series,
    timeZone: user.timeZone,
    ownerId: String(user._id),
    categories: user.categories.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
    })),
    generatedAt: new Date(generatedAt),
    warnings,
  };
}
