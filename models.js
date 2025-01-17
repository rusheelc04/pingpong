import mongoose from "mongoose";
const { ObjectId } = mongoose.Types;

let models = {};

await mongoose.connect('mongodb+srv://Project:Fall441@projectcluster.px1uk.mongodb.net/gameDatabase?retryWrites=true&w=majority&appName=ProjectCluster');

const userSchema = new mongoose.Schema({
    username: {type: String, required: true, unique: true},
    elo: Number,
    created_at: Date,
    updated_at: Date
});

const gameSchema = new mongoose.Schema({
    player1: {type: ObjectId, ref: "User"},
    player2: {type: ObjectId, ref: "User"},
    startTime: Date,
    endTime: Date,
    score: { player1: Number, player2: Number },
    winner: {type: ObjectId, ref: "User"},
    chatRoomId: {type: ObjectId, ref: "Message"},
    createdAt: Date,
    updatedAt: Date,
})

const messageSchema = new mongoose.Schema({
    username: {type: ObjectId, ref: "User"},
    chatRoomId: {type: ObjectId},
    message: String,
    timestamp: Date,
})
messageSchema.index({ username: 1, chatRoomId: 1, message: 1 }, { unique: true })
models.Game = mongoose.model("Game", gameSchema);
models.User = mongoose.model("User", userSchema);
models.Message = mongoose.model("Message", messageSchema);

export default models;