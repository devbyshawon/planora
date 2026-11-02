import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: { type: String, required: true, maxlength: 160 },
    nameKey: { type: String, required: true },
    title: { type: String, required: true, maxlength: 160 },
    notes: { type: String, default: "", maxlength: 5000 },
    category: { type: String, required: true },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
  },
  { timestamps: true },
);
schema.index({ owner: 1, nameKey: 1 }, { unique: true });
export default mongoose.model("Template", schema);
