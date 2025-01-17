import mongoose from "mongoose";
const { ObjectId } = mongoose.Types;

export function setupChatSocket(app) {
    const chatRooms = {};
    const chatRoomId = new ObjectId();

    app.ws('/chat', (ws, req) => {
        const username = req.session.account.username;
        if (!chatRooms[chatRoomId]) {
            chatRooms[chatRoomId] = [];
        }
        chatRooms[chatRoomId].push(ws)
        ws.send(JSON.stringify({ type: 'chatRoomId', chatRoomId }));

        ws.on('message', (data) => {
            try {
                const { message } = JSON.parse(data);
                
                chatRooms[chatRoomId].forEach(socket => {
                    if (socket.readyState === 1) {
                        socket.send(`${username}: ${message}`);
                    }
                });
            } catch (error) {
                console.error('Error parsing message:', error);
            }
        });

        ws.on('close', () => {
            console.log(username, " socket closed")
        });

        ws.on('error', (error) => {
            console.log(error);
        })
    });
}
