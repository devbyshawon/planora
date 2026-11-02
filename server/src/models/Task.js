import mongoose from "mongoose";
const snapshotSchema = new mongoose.Schema(
  {
    date: String,
    startTime: String,
    endTime: String,
    durationMinutes: Number,
    location: String,
    status: String,
    category: String,
    title: String,
    priority: String,
    timeZone: String,
  },
  { _id: false },
);
const historySchema = new mongoose.Schema(
  {
    type: { type: String, required: true },
    at: { type: Date, required: true },
    from: snapshotSchema,
    to: snapshotSchema,
    reviewDate: String,
  },
  { _id: true },
);
const planSchema = new mongoose.Schema(
  {
    date: { type: String, required: true },
    startTime: String,
    endTime: String,
    durationMinutes: Number,
    category: String,
    title: String,
    status: String,
    bucketMoves: { type: Number, default: 0 },
    legacy: { type: Boolean, default: false },
  },
  { _id: false },
);
const schema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    notes: { type: String, default: "", maxlength: 5000 },
    category: {
      type: String,
      default: "study",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    status: {
      type: String,
      enum: ["scheduled", "completed", "not_completed"],
      default: "scheduled",
    },
    location: {
      type: String,
      enum: ["calendar", "bucket"],
      default: "calendar",
    },
    date: String,
    startTime: String,
    endTime: String,
    startMinute: Number,
    endMinute: Number,
    durationMinutes: Number,
    startsAt: Date,
    endsAt: Date,
    timeZone: String,
    completedAt: Date,
    originalSchedule: {
      date: String,
      startTime: String,
      endTime: String,
      durationMinutes: Number,
    },
    postponeCount: { type: Number, default: 0 },
    bucketAddedAt: Date,
    series: { type: mongoose.Schema.Types.ObjectId, ref: "RecurrenceSeries" },
    occurrenceDate: String,
    isException: { type: Boolean, default: false },
    deletedAt: Date,
    deletedReason: {
      type: String,
      enum: ["occurrence", "rule", "series", "normal"],
    },
    history: { type: [historySchema], default: [], select: false },
    plans: { type: [planSchema], default: [] },
    review: {
      date: String,
      action: { type: String, enum: ["keep", "bucket", "delete"] },
      at: Date,
    },
  },
  { timestamps: true },
);
schema.index({ owner: 1, location: 1, date: 1, startMinute: 1 });
schema.index(
  { owner: 1, series: 1, occurrenceDate: 1 },
  { unique: true, partialFilterExpression: { series: { $type: "objectId" } } },
);
export default mongoose.model("Task", schema);
