import React, { useEffect, useState, useCallback } from "react";

/**
 * Chat Component
 * Handles real-time chat functionality using WebSockets.
 * - Establishes a WebSocket connection to the chat server.
 * - Sends and receives messages in real-time.
 * - Stores chat history and updates UI dynamically.
 * - Sends messages to backend for persistent storage.
 * 
 * Props:
 * @param {Object} identityInfo - Contains user details (e.g., username).
 * @param {Function} setChatRoomId - Function to set chat room ID in parent component.
 * @param {String} chatRoomId - The current chat room ID.
 */
function Chat({ identityInfo, setChatRoomId, chatRoomId }) {
    // State for WebSocket instance
    const [socket, setSocket] = useState(null);
    
    // State for current message input
    const [message, setMessage] = useState("");

    // State to store all received chat messages
    const [allMessages, setAllMessages] = useState([]);

    /**
     * useEffect Hook - Establishes WebSocket connection when component mounts
     * - Listens for incoming messages and updates the chat state.
     * - Sets up the WebSocket instance and handles cleanup when unmounting.
     */
    useEffect(() => {
        // Create a new WebSocket connection to the chat server
        const ws = new WebSocket('wss://pong441.onrender.com/chat');

        // WebSocket connection opened successfully
        ws.onopen = () => {
            console.log('Chat WebSocket connected');
        };

        // WebSocket receives a new message
        ws.onmessage = async (event) => {
            try {
                // Attempt to parse the received data as JSON
                const data = JSON.parse(event.data);

                // If the received data contains a chatRoomId, update the state
                if (data.type === "chatRoomId") {
                    console.log(data.chatRoomId);
                    setChatRoomId(data.chatRoomId);
                }
            } catch (error) {
                // If JSON parsing fails, assume it's a chat message and store it
                setAllMessages((prevMessages) => [...prevMessages, event.data]);

                // If the message sender is the current user, store it in the backend
                if (identityInfo.username === event.data.split(":")[0]) {
                    await fetch("api/v1/messages", {
                        method: "POST",
                        body: JSON.stringify({
                            chatRoomId: chatRoomId,
                            messages: event.data,
                        }),
                        headers: {
                            "Content-Type": "application/json"
                        }
                    });
                }
            }
        };

        // Handle WebSocket closing event
        ws.onclose = () => {
            console.log('Chat WebSocket closed');
        };

        // Store the WebSocket instance in state
        setSocket(ws);

        // Cleanup function - Closes WebSocket connection when component unmounts
        return () => {
            if (ws) {
                ws.close();
            }
        };
    }, []); // Empty dependency array ensures this runs only on component mount

    /**
     * Function to send a chat message via WebSocket
     * - Ensures WebSocket is open and message is not empty before sending.
     */
    const sendChat = useCallback(() => {
        if (socket && socket.readyState === WebSocket.OPEN && message.trim()) {
            // Send the message as a JSON object
            socket.send(JSON.stringify({
                message: message
            }));

            // Clear input field after sending
            setMessage("");
        }
    }, [socket, message]); // Dependencies: socket, message

    /**
     * Event handler for "Enter" key press in the chat input field.
     * - Calls sendChat function when Enter is pressed.
     */
    const handleKeyPress = (e) => {
        if (e.key === 'Enter') {
            sendChat();
        }
    };

    /**
     * Render the chat UI
     */
    return (
        <div className="chat-container">
            {/* Chat message display area */}
            <div className="chat-output">
                {allMessages.map((msg, index) => (
                    <div key={index} className="chat-message">{msg}</div>
                ))}
            </div>

            {/* Chat input field and send button */}
            <div className="chat-input-container">
                <input 
                    type="text" 
                    className="chat-input" 
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyPress={handleKeyPress} // Handles "Enter" key press
                    placeholder="Type a message..."
                />
                <button 
                    className="chat-send-button" 
                    onClick={sendChat} // Sends message on button click
                >
                    Send
                </button>
            </div>
        </div>
    );
}

export default Chat;
