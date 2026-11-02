import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, required: true },
    task: { type: mongoose.Schema.Types.ObjectId, ref: "Task", required: true },
    generation: { type: String, required: true },
    calendarId: { type: String, required: true },
    eventId: { type: String, required: true },
    date: String,
    category: String,
    title: String,
    active: { type: Boolean, default: true },
    lastSyncedAt: Date,
    lastHash: String,
  },
  { timestamps: true },
);
schema.index({ owner: 1, task: 1, generation: 1 }, { unique: true });
schema.index({ owner: 1, generation: 1, active: 1, date: 1 });
export default mongoose.model("GoogleEvent", schema);
