import mongoose from "mongoose";
const item = new mongoose.Schema(
  {
    task: { type: mongoose.Schema.Types.ObjectId, required: true },
    title: String,
    status: {
      type: String,
      enum: ["pending", "synced", "unchanged", "removed", "skipped", "failed"],
      default: "pending",
    },
    message: String,
    code: String,
    attempts: { type: Number, default: 0 },
  },
  { _id: false },
);
const schema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      unique: true,
    },
    generation: { type: String, required: true },
    from: { type: String, required: true },
    to: { type: String, required: true },
    category: { type: String, default: "" },
    status: {
      type: String,
      enum: ["ready", "complete", "cancelled"],
      default: "ready",
    },
    items: [item],
    warningCount: { type: Number, default: 0 },
    leaseUntil: Date,
  },
  { timestamps: true },
);
export default mongoose.model("GoogleSyncRun", schema);
