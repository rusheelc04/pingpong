import mongoose from "mongoose"; // Import Mongoose for MongoDB ObjectId handling
const { ObjectId } = mongoose.Types; // Extract ObjectId for unique chat room identifiers

/**
 * setupChatSocket
 * - Initializes WebSocket connection for real-time chat.
 * - Manages chat room assignments and message broadcasting.
 * 
 * @param {Object} app - Express app instance.
 */
export function setupChatSocket(app) {
    const chatRooms = {}; // Stores active chat room WebSocket connections
    const chatRoomId = new ObjectId(); // Generate a unique chat room ID

    // WebSocket connection handler for chat
    app.ws('/chat', (ws, req) => {
        const username = req.session.account.username; // Retrieve username from session

        // Initialize chat room if it doesn't exist
        if (!chatRooms[chatRoomId]) {
            chatRooms[chatRoomId] = [];
        }

        // Add WebSocket connection to the chat room
        chatRooms[chatRoomId].push(ws);

        // Send the chat room ID to the connected client
        ws.send(JSON.stringify({ type: 'chatRoomId', chatRoomId }));

        // Handle incoming chat messages
        ws.on('message', (data) => {
            try {
                const { message } = JSON.parse(data);

                // Broadcast the message to all clients in the chat room
                chatRooms[chatRoomId].forEach(socket => {
                    if (socket.readyState === 1) { // Ensure WebSocket is open
                        socket.send(`${username}: ${message}`);
                    }
                });
            } catch (error) {
                console.error('Error parsing message:', error);
            }
        });

        // Handle WebSocket closure
        ws.on('close', () => {
            console.log(username, "socket closed");
        });

        // Handle WebSocket errors
        ws.on('error', (error) => {
            console.log(error);
        });
    });
}
