import mongoose from "mongoose";
const schema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, required: true },
  deviceId: { type: String, required: true },
  key: { type: String, required: true },
  task: { type: mongoose.Schema.Types.ObjectId, required: true },
  claimedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true, expires: 0 },
});
schema.index({ owner: 1, deviceId: 1, key: 1 }, { unique: true });
export default mongoose.model("ReminderDelivery", schema);
