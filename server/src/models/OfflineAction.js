import mongoose from "mongoose";
const schema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, required: true },
  operationId: { type: String, required: true },
  fingerprint: { type: String, required: true },
  state: { type: String, enum: ["executing", "complete", "failed"], required: true },
  result: mongoose.Schema.Types.Mixed,
  signature: String,
  failure: String,
}, { timestamps: true });
schema.index({ owner: 1, operationId: 1 }, { unique: true });
export default mongoose.model("OfflineAction", schema);
