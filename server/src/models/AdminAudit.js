import mongoose from "mongoose";
const schema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId },
  target: { type: mongoose.Schema.Types.ObjectId },
  action: { type: String, required: true },
  from: String,
  to: String,
  revision: Number,
  at: { type: Date, default: Date.now },
});
schema.index({ at: -1, _id: -1 });
export default mongoose.model("AdminAudit", schema);
