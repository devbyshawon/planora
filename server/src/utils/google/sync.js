import { randomBytes } from "node:crypto";
import Task from "../../models/Task.js";
import Connection from "../../models/GoogleConnection.js";
import GoogleEvent from "../../models/GoogleEvent.js";
import SyncRun from "../../models/GoogleSyncRun.js";
import { categoryName, statusName } from "../exports/data.js";
import { digest } from "./config.js";
import { calendarRequest } from "./client.js";
import { AppError } from "../errors.js";
export const calendarMarker = (owner) =>
  `Managed by Planora. Owner key: ${digest(owner)}.`;
const calendarPath = (connection) =>
  `/calendars/${encodeURIComponent(connection.calendarId)}`;
export async function ensureCalendar(
  app,
  connection,
  timeZone,
  { confirmNew = false, adoptId } = {},
) {
  if (adoptId) {
    if (
      typeof adoptId !== "string" ||
      adoptId.length > 512 ||
      /[\r\n]/.test(adoptId) ||
      adoptId === "primary"
    )
      throw new AppError(400, "Enter the ID of a Planora-created calendar.");
    const calendar = await calendarRequest(
      app,
      connection,
      `/calendars/${encodeURIComponent(adoptId)}`,
    );
    if (calendar.description !== calendarMarker(connection.owner))
      throw new AppError(
        409,
        "That calendar cannot be identified as this account's Planora calendar.",
        "GOOGLE_CALENDAR_MISMATCH",
      );
    connection.calendarId = adoptId;
    connection.calendarPending = false;
    await connection.save();
    return;
  }
  if (connection.calendarId) {
    try {
      await calendarRequest(app, connection, calendarPath(connection));
      return;
    } catch (error) {
      if (![404, 410].includes(error.status)) throw error;
    }
    connection.calendarId = undefined;
    connection.generation = randomBytes(16).toString("hex");
    await SyncRun.updateOne(
      { owner: connection.owner },
      { $set: { status: "cancelled" } },
    );
  }
  if (connection.calendarPending && !confirmNew)
    throw new AppError(
      409,
      "Google may already have created the calendar. Check Google Calendar before creating another, or enter its calendar ID.",
      "GOOGLE_CALENDAR_CHECK",
    );
  connection.calendarPending = true;
  await connection.save();
  // Calendar creation has no client-provided ID. Never retry an uncertain POST.
  const calendar = await calendarRequest(app, connection, "/calendars", {
    method: "POST",
    retry: false,
    body: {
      summary: "Planora",
      description: calendarMarker(connection.owner),
      timeZone,
    },
  });
  if (typeof calendar.id !== "string" || !calendar.id)
    throw new AppError(
      502,
      "Google did not return a calendar ID. Check Google Calendar before trying again.",
      "GOOGLE_CALENDAR_CHECK",
    );
  connection.calendarId = calendar.id;
  connection.calendarPending = false;
  await connection.save();
}
export function eventBody(task, user, connection) {
  const category = categoryName({ categories: user.categories }, task.category);
  return {
    summary: task.title,
    description: [
      `Planora status: ${statusName(task.status)}`,
      `Category: ${category}`,
      `Priority: ${task.priority}`,
      `Timezone: ${task.timeZone}`,
      ...(task.series ? [`Recurring occurrence: ${task.occurrenceDate}`] : []),
      ...(task.notes ? ["", task.notes] : []),
    ].join("\n"),
    start: {
      dateTime: new Date(task.startsAt).toISOString(),
      timeZone: task.timeZone,
    },
    end: {
      dateTime: new Date(task.endsAt).toISOString(),
      timeZone: task.timeZone,
    },
    reminders: {
      useDefault: false,
      overrides:
        task.status === "completed" ? [] : [{ method: "popup", minutes: 10 }],
    },
    visibility: "private",
    transparency: "opaque",
    status: "confirmed",
    extendedProperties: {
      private: {
        planoraOwner: String(user._id),
        planoraTask: String(task._id),
        planoraGeneration: connection.generation,
      },
    },
  };
}
function ownedEvent(event, user, task, connection) {
  const mark = event.extendedProperties?.private;
  return (
    mark?.planoraOwner === String(user._id) &&
    mark?.planoraTask === String(task._id) &&
    mark?.planoraGeneration === connection.generation
  );
}
function matches(event, body) {
  return (
    ["summary", "description", "visibility", "transparency", "status"].every(
      (key) => event[key] === body[key],
    ) &&
    new Date(event.start?.dateTime).getTime() ===
      new Date(body.start.dateTime).getTime() &&
    new Date(event.end?.dateTime).getTime() ===
      new Date(body.end.dateTime).getTime() &&
    event.start?.timeZone === body.start.timeZone &&
    event.end?.timeZone === body.end.timeZone &&
    event.reminders?.useDefault === false &&
    JSON.stringify(event.reminders?.overrides || []) ===
      JSON.stringify(body.reminders.overrides)
  );
}
async function readEvent(app, connection, path) {
  try {
    return await calendarRequest(app, connection, path);
  } catch (error) {
    if ([404, 410].includes(error.status)) return null;
    throw error;
  }
}
const randomEventId = () => `p${randomBytes(24).toString("hex")}`;
export async function syncItem(app, user, connection, item) {
  const task = await Task.findOne({ _id: item.task, owner: user._id }).lean();
  let mapping = await GoogleEvent.findOne({
    owner: user._id,
    task: item.task,
    generation: connection.generation,
  });
  const eligible = task && !task.deletedAt && task.location === "calendar";
  if (!eligible) {
    if (!mapping?.active)
      return { status: "skipped", message: "No linked event needs removal." };
    const path = `${calendarPath(connection)}/events/${mapping.eventId}`;
    const event = await readEvent(app, connection, path);
    if (event && event.status !== "cancelled") {
      if (!ownedEvent(event, user, { _id: item.task }, connection))
        throw new AppError(
          409,
          "The remote event cannot be verified as this task. It was left unchanged.",
          "GOOGLE_EVENT_MISMATCH",
        );
      try {
        await calendarRequest(app, connection, path, {
          method: "DELETE",
          etag: event.etag,
        });
      } catch (error) {
        if (![404, 410].includes(error.status)) throw error;
      }
    }
    mapping.active = false;
    mapping.lastSyncedAt = new Date();
    await mapping.save();
    return { status: "removed", message: "Removed the linked Google event." };
  }
  const body = eventBody(task, user, connection);
  if (!mapping) {
    mapping = await GoogleEvent.create({
      owner: user._id,
      task: task._id,
      generation: connection.generation,
      calendarId: connection.calendarId,
      eventId: `p${digest(`${user._id}:${task._id}:${connection.calendarId}`)}`,
      date: task.date,
      category: task.category,
      title: task.title,
      active: true,
    });
  } else if (!mapping.active) {
    mapping.eventId = randomEventId();
    mapping.active = true;
    await mapping.save();
  }
  for (let round = 0; round < 2; round++) {
    let path = `${calendarPath(connection)}/events/${mapping.eventId}`;
    let event = await readEvent(app, connection, path),
      outcome = "synced";
    if (event?.status === "cancelled") {
      mapping.eventId = randomEventId();
      await mapping.save();
      event = null;
      path = `${calendarPath(connection)}/events/${mapping.eventId}`;
    }
    if (event) {
      if (!ownedEvent(event, user, task, connection))
        throw new AppError(
          409,
          "A different event uses the linked ID. It was left unchanged.",
          "GOOGLE_EVENT_MISMATCH",
        );
      if (matches(event, body)) outcome = "unchanged";
      else
        await calendarRequest(app, connection, path, {
          method: "PATCH",
          body,
          etag: event.etag,
        });
    } else {
      try {
        await calendarRequest(
          app,
          connection,
          `${calendarPath(connection)}/events?sendUpdates=none`,
          { method: "POST", body: { ...body, id: mapping.eventId } },
        );
      } catch (error) {
        if (error.status === 409 && round === 0) {
          // A prior uncertain insert may have succeeded. Read its ID before any
          // update; cancelled tombstones get a fresh persisted ID next round.
          continue;
        }
        throw error;
      }
    }
    mapping.date = task.date;
    mapping.category = task.category;
    mapping.title = task.title;
    mapping.active = true;
    mapping.lastHash = digest(JSON.stringify(body));
    mapping.lastSyncedAt = new Date();
    await mapping.save();
    return {
      title: task.title,
      status: outcome,
      message:
        outcome === "unchanged"
          ? "Already matches Planora."
          : "Synced exact task times and details.",
    };
  }
  throw new AppError(
    409,
    "Google could not reconcile this event ID. Retry this item.",
    "GOOGLE_EVENT_CONFLICT",
  );
}
export function safeRun(run, page = 1) {
  if (!run) return null;
  const counts = {
    pending: 0,
    synced: 0,
    unchanged: 0,
    removed: 0,
    skipped: 0,
    failed: 0,
  };
  run.items.forEach((item) => counts[item.status]++);
  return {
    id: String(run._id),
    from: run.from,
    to: run.to,
    category: run.category,
    status: run.status,
    needsReconnect: run.items.some((item) =>
      ["GOOGLE_RECONNECT", "GOOGLE_KEY_CHANGED"].includes(item.code),
    ),
    total: run.items.length,
    counts,
    warningCount: run.warningCount,
    updatedAt: run.updatedAt,
    page,
    pageSize: 50,
    items: run.items
      .slice((page - 1) * 50, page * 50)
      .map((item) => ({
        taskId: String(item.task),
        title: item.title,
        status: item.status,
        message: item.message || "",
        code: item.code || "",
        attempts: item.attempts,
      })),
  };
}
