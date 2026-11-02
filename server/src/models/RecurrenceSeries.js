import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: { type: String, required: true, maxlength: 160 },
    notes: { type: String, default: "", maxlength: 5000 },
    category: { type: String, required: true },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    startDate: { type: String, required: true },
    endDate: { type: String, default: null },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    frequency: {
      type: String,
      enum: ["daily", "weekdays", "weekly", "monthly"],
      required: true,
    },
    weekdays: [Number],
    deletedAt: Date,
    generationRevision: { type: Number, default: 0 },
  },
  { timestamps: true },
);
schema.index({ owner: 1, deletedAt: 1, startDate: 1 });
export default mongoose.model("RecurrenceSeries", schema);
