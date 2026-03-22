// Match chat stays separate so replay pages can load conversation without rebuilding live socket history.
import mongoose from "mongoose";

export interface MessageDocument extends mongoose.Document {
  matchId: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: Date;
}

const messageSchema = new mongoose.Schema<MessageDocument>({
  matchId: { type: String, required: true, index: true },
  senderId: { type: String, required: true },
  senderName: { type: String, required: true },
  body: { type: String, required: true, maxlength: 240 },
  createdAt: { type: Date, default: Date.now }
});

messageSchema.index({ matchId: 1, createdAt: 1 });

export const MessageModel =
  mongoose.models.Message ||
  mongoose.model<MessageDocument>("Message", messageSchema);
