import React, { useEffect, useState, useCallback } from "react";

function Chat({ identityInfo, setChatRoomId, chatRoomId }) {
    const [socket, setSocket] = useState(null);
    const [message, setMessage] = useState("");
    const [allMessages, setAllMessages] = useState([]);
    

    useEffect(() => {
        const ws = new WebSocket('wss://pong441.onrender.com/chat');
        
        ws.onopen = () => {
            console.log('Chat WebSocket connected');
        };

        ws.onmessage = async (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === "chatRoomId") {
                    console.log(data.chatRoomId);
                    setChatRoomId(data.chatRoomId);
                }
            } catch (error) {
                setAllMessages((prevMessages) => [...prevMessages, event.data]);
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

        ws.onclose = () => {
            console.log('Chat WebSocket closed');
        };

        setSocket(ws);

        return () => {
            if (ws) {
                ws.close();
            }
        };
    }, []);

    const sendChat = useCallback(() => {
        if (socket && socket.readyState === WebSocket.OPEN && message.trim()) {
            // Send message only if socket is open and message is not empty
            socket.send(JSON.stringify({
                message: message
            }));
            setMessage("");
        }
    }, [socket, message, identityInfo]);

    const handleKeyPress = (e) => {
        if (e.key === 'Enter') {
            sendChat();
        }
    };

    return (
        <div className="chat-container">
            <div className="chat-output">
                {allMessages.map((msg, index) => (
                    <div key={index} className="chat-message">{msg}</div>
                ))}
            </div>
            <div className="chat-input-container">
                <input 
                    type="text" 
                    className="chat-input" 
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Type a message..."
                />
                <button 
                    className="chat-send-button" 
                    onClick={sendChat}
                >
                    Send
                </button>
            </div>
            
        </div>
    );
}

export default Chat;