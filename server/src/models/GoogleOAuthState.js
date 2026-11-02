import mongoose from "mongoose";
const schema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
  stateHash: { type: String, required: true, unique: true },
  browserHash: { type: String, required: true },
  verifier: { type: String, required: true, select: false },
  tokenVersion: { type: Number, required: true },
  expiresAt: { type: Date, required: true, expires: 0 },
});
export default mongoose.model("GoogleOAuthState", schema);
