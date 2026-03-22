// Users stay lightweight so players can enter quickly without account setup.
import mongoose from "mongoose";

export interface UserDocument extends mongoose.Document {
  displayName: string;
  provider: "guest" | "github";
  providerId: string;
  avatarUrl?: string | null;
  rating: number;
  wins: number;
  losses: number;
  matchesPlayed: number;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new mongoose.Schema<UserDocument>(
  {
    displayName: { type: String, required: true, trim: true, maxlength: 24 },
    provider: { type: String, enum: ["guest", "github"], default: "guest" },
    providerId: { type: String, required: true, unique: true, index: true },
    avatarUrl: { type: String, default: null },
    rating: { type: Number, default: 1000, min: 100 },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    matchesPlayed: { type: Number, default: 0 }
  },
  { timestamps: true }
);

export const UserModel =
  mongoose.models.User || mongoose.model<UserDocument>("User", userSchema);
