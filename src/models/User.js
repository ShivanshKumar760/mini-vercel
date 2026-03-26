import mongoose from "mongoose";
import { Schema } from "mongoose";

// Note: This repo currently doesn't have a full auth system.
// The model exists so Project ownership can be enforced server-side.
const UserSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    // Store a password hash (implementation depends on your auth flow).
    passwordHash: { type: String, required: true },
  },
  { timestamps: true }
);

const User = mongoose.model("User", UserSchema);
export default User;
