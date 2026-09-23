import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true, lowercase: true },
  passwordHash: { type: String, required: true }
}, { timestamps: true });

const KitSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  title: String,
  status: { type: String, enum: ["generating", "ready", "failed"], default: "generating" },
  progress: String,
  data: mongoose.Schema.Types.Mixed,
  error: mongoose.Schema.Types.Mixed
}, { timestamps: true });

export const User = mongoose.model("User", UserSchema);
export const KitModel = mongoose.model("Kit", KitSchema);
