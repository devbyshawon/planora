import mongoose from "mongoose";
import { CATEGORIES } from "../../../shared/calendar.js";
const categorySchema = new mongoose.Schema(
  { id: String, name: String, color: String },
  { _id: false },
);
const settingsSchema = new mongoose.Schema(
  {
    theme: { type: String, enum: ["light", "dark"], default: "light" },
    timeFormat: { type: String, enum: ["12h", "24h"], default: "12h" },
    weekStartsOn: { type: Number, enum: [0, 1], default: 1 },
    showHourGuides: { type: Boolean, default: true },
    defaultView: {
      type: String,
      enum: ["day", "week", "month"],
      default: "week",
    },
    reminderMinutes: { type: Number, min: 0, max: 1440, default: 10 },
    remindersEnabled: { type: Boolean, default: false },
  },
  { _id: false },
);
const schema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
    },
    passwordHash: { type: String, required: true, select: false },
    timeZone: { type: String, default: "Asia/Dhaka" },
    tokenVersion: { type: Number, default: 0 },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    status: { type: String, enum: ["active", "suspended"], default: "active" },
    emailVerifiedAt: Date,
    verificationTokenHash: { type: String, select: false },
    verificationExpiresAt: { type: Date, select: false },
    verificationRequestedAt: { type: Date, select: false },
    preferences: { type: settingsSchema, default: () => ({}) },
    categories: {
      type: [categorySchema],
      default: () => CATEGORIES.map((c) => ({ ...c })),
    },
    resetTokenHash: { type: String, select: false },
    resetExpiresAt: { type: Date, select: false },
    resetRequestedAt: { type: Date, select: false },
  },
  { timestamps: true },
);
export default mongoose.model("User", schema);
