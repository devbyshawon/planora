import SiteSettings from "../models/SiteSettings.js";
import { IANAZone } from "luxon";
import { AppError } from "./errors.js";
export async function siteSettings(session) {
  try {
    return await SiteSettings.findOneAndUpdate(
      { _id: "site" },
      { $setOnInsert: { _id: "site" } },
      { upsert: true, new: true, ...(session ? { session } : {}) },
    );
  } catch (error) {
    if (error.code === 11000 && !session) return SiteSettings.findById("site");
    throw error;
  }
}
export const preferenceRules = {
  theme: (v) => ["light", "dark"].includes(v),
  timeFormat: (v) => ["12h", "24h"].includes(v),
  weekStartsOn: (v) => [0, 1].includes(v),
  showHourGuides: (v) => typeof v === "boolean",
  defaultView: (v) => ["day", "week", "month"].includes(v),
  reminderMinutes: (v) => Number.isInteger(v) && v >= 0 && v <= 1440,
  remindersEnabled: (v) => typeof v === "boolean",
};
export function defaultsInput(body, previous) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new AppError(400, "Provide site settings.");
  const allowed = [
    "registrationOpen",
    "browserRemindersAllowed",
    "defaultTimeZone",
    "defaultPreferences",
    "defaultCategories",
    "expectedRevision",
  ];
  if (Object.keys(body).some((key) => !allowed.includes(key)))
    throw new AppError(400, "Unknown site setting.");
  const next = {};
  for (const key of ["registrationOpen", "browserRemindersAllowed"])
    if (body[key] !== undefined) {
      if (typeof body[key] !== "boolean")
        throw new AppError(400, "Use a boolean site setting.");
      next[key] = body[key];
    }
  if (body.defaultTimeZone !== undefined) {
    if (
      typeof body.defaultTimeZone !== "string" ||
      !IANAZone.isValidZone(body.defaultTimeZone)
    )
      throw new AppError(400, "Choose a valid default IANA timezone.");
    next.defaultTimeZone = body.defaultTimeZone;
  }
  if (body.defaultPreferences !== undefined) {
    const input = body.defaultPreferences;
    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      Object.keys(input).some((key) => !preferenceRules[key])
    )
      throw new AppError(400, "Invalid default preferences.");
    for (const [key, value] of Object.entries(input))
      if (!preferenceRules[key](value))
        throw new AppError(400, `Invalid default ${key}.`);
    // Enabling notifications always remains a personal explicit action.
    if (input.remindersEnabled === true)
      throw new AppError(
        400,
        "New accounts must opt in to browser reminders themselves.",
      );
    next.defaultPreferences = {
      ...previous.defaultPreferences,
      ...input,
      remindersEnabled: false,
    };
  }
  if (body.defaultCategories !== undefined) {
    const list = body.defaultCategories;
    if (!Array.isArray(list) || list.length < 1 || list.length > 20)
      throw new AppError(400, "Choose 1-20 starter categories.");
    const names = new Set();
    next.defaultCategories = list.map((item, index) => {
      if (
        !item ||
        typeof item.name !== "string" ||
        !item.name.trim() ||
        item.name.trim().length > 40 ||
        typeof item.color !== "string" ||
        !/^#[0-9a-f]{6}$/i.test(item.color)
      )
        throw new AppError(
          400,
          "Each starter category needs a name and six-digit hex color.",
        );
      const name = item.name.trim();
      if (names.has(name.toLowerCase()))
        throw new AppError(400, "Starter category names must be unique.");
      names.add(name.toLowerCase());
      return {
        id: `starter_${index + 1}`,
        name,
        color: item.color.toLowerCase(),
      };
    });
  }
  return next;
}
export function safeSite(site) {
  return {
    registrationOpen: site.registrationOpen,
    browserRemindersAllowed: site.browserRemindersAllowed,
    defaultTimeZone: site.defaultTimeZone,
    defaultPreferences: site.defaultPreferences,
    defaultCategories: site.defaultCategories.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
    })),
    revision: site.revision,
  };
}
// Used for cross-account administrative mutations. This shares the existing
// single-process account queue and holds its lock through the entire callback.
export async function withAccountLock(app, owner, callback) {
  const locks = (app.locals.accountLocks ??= new Map()),
    key = String(owner),
    previous = locks.get(key) || Promise.resolve();
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  locks.set(key, pending);
  await previous;
  try {
    return await callback();
  } finally {
    if (locks.get(key) === pending) locks.delete(key);
    release();
  }
}
