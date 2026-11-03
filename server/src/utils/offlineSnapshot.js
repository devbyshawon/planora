import { createHash } from "node:crypto";
import Task from "../models/Task.js";
import Template from "../models/Template.js";
import Series from "../models/RecurrenceSeries.js";
import User from "../models/User.js";
import { safeUser } from "../middleware/auth.js";
export async function offlineData(owner) {
  const [user, tasks, templates, series] = await Promise.all([
    User.findById(owner),
    Task.find({ owner }).select("+history").sort({ _id: 1 }).limit(5001).lean(),
    Template.find({ owner }).sort({ _id: 1 }).lean(),
    Series.find({ owner }).sort({ _id: 1 }).lean(),
  ]);
  const data = { user: safeUser(user), tasks, templates, series };
  // Ignore lazy-generation bookkeeping; include actual entity data and task versions.
  const signature = createHash("sha256").update(JSON.stringify({
    user: data.user,
    tasks: tasks.map(t => [String(t._id), t.updatedAt]),
    templates: templates.map(t => [String(t._id), t.updatedAt]),
    series: series.map(({ generationRevision, updatedAt, ...s }) => s),
  })).digest("hex");
  return { ...data, signature };
}
