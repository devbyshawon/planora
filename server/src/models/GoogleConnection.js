import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    subject: { type: String, required: true },
    email: { type: String, required: true },
    refreshToken: { type: String, select: false },
    generation: { type: String, required: true },
    calendarId: String,
    calendarPending: { type: Boolean, default: false },
    connected: { type: Boolean, default: true },
    needsReconnect: { type: Boolean, default: false },
    connectedAt: Date,
    disconnectedAt: Date,
  },
  { timestamps: true },
);
export default mongoose.model("GoogleConnection", schema);
