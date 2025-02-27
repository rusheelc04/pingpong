import mongoose from "mongoose"; // Import Mongoose for MongoDB ORM
const { ObjectId } = mongoose.Types; // Extract ObjectId for MongoDB references

let models = {}; // Store database models

// Connect to MongoDB using Mongoose
await mongoose.connect(process.env.MONGO_URI || 'mongodb+srv://Project:Fall441@projectcluster.px1uk.mongodb.net/gameDatabase?retryWrites=true&w=majority&appName=ProjectCluster');

/**
 * User Schema
 * - Stores user authentication and ranking data.
 */
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true }, // Unique username
    elo: { type: Number, default: 1000 }, // ELO ranking, default to 1000
    created_at: { type: Date, default: Date.now }, // Timestamp of account creation
    updated_at: { type: Date, default: Date.now } // Timestamp of last update
});

/**
 * Game Schema
 * - Stores match history between two players.
 */
const gameSchema = new mongoose.Schema({
    player1: { type: ObjectId, ref: "User" }, // Reference to Player 1
    player2: { type: ObjectId, ref: "User" }, // Reference to Player 2
    startTime: Date, // Match start time
    endTime: Date, // Match end time
    score: { player1: Number, player2: Number }, // Score tracking
    winner: { type: ObjectId, ref: "User" }, // Reference to winner
    chatRoomId: { type: ObjectId, ref: "Message" }, // Chat room ID
    createdAt: { type: Date, default: Date.now }, // Timestamp of game creation
    updatedAt: { type: Date, default: Date.now } // Timestamp of last update
});

/**
 * Message Schema
 * - Stores in-game chat messages.
 */
const messageSchema = new mongoose.Schema({
    username: { type: ObjectId, ref: "User" }, // Reference to sender
    chatRoomId: { type: ObjectId }, // Chat room ID
    message: { type: String, required: true }, // Message text
    timestamp: { type: Date, default: Date.now } // Timestamp of message creation
});

// Ensure uniqueness of chat messages per user
messageSchema.index({ username: 1, chatRoomId: 1, message: 1 }, { unique: true });

// Register models in Mongoose
models.Game = mongoose.model("Game", gameSchema);
models.User = mongoose.model("User", userSchema);
models.Message = mongoose.model("Message", messageSchema);

export default models; // Export database models
