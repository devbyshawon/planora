import mongoose from "mongoose";
const schema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, required: true },
  operationId: { type: String, required: true },
  fingerprint: { type: String, required: true },
  task: { type: mongoose.Schema.Types.ObjectId, required: true },
  updatedAt: { type: String, required: true },
}, { timestamps: { createdAt: true, updatedAt: false } });
schema.index({ owner: 1, operationId: 1 }, { unique: true });
export default mongoose.model("OfflineOperation", schema);
