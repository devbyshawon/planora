import mongoose from "mongoose";
import { CATEGORIES, DEFAULT_PREFERENCES } from "../../../shared/calendar.js";
const schema = new mongoose.Schema(
  {
    _id: { type: String, default: "site" },
    registrationOpen: { type: Boolean, default: true },
    browserRemindersAllowed: { type: Boolean, default: true },
    defaultTimeZone: { type: String, default: "Asia/Dhaka" },
    defaultPreferences: {
      type: Object,
      default: () => ({ ...DEFAULT_PREFERENCES, remindersEnabled: false }),
    },
    defaultCategories: {
      type: [{ _id: false, id: String, name: String, color: String }],
      default: () => CATEGORIES.map((c) => ({ ...c })),
    },
    revision: { type: Number, default: 0 },
    adminRevision: { type: Number, default: 0 },
  },
  { timestamps: true },
);
export default mongoose.model("SiteSettings", schema);
