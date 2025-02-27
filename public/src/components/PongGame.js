import React, { useEffect, useState } from 'react'; // Import React and hooks for state management
import Pong from './Pong'; // Import Pong game component
import Chat from './Chat'; // Import Chat component
import { Link } from 'react-router-dom'; // Import Link for navigation

/**
 * PongGame Component
 * - Manages the entire game session, WebSocket communication, and game logic.
 * - Handles matchmaking, game state updates, player movement, and ELO updates.
 * - Renders the Pong game and real-time chat functionality.
 * 
 * Props:
 * @param {Object} identityInfo - Contains user details, including username and ELO rating.
 */
function PongGame({ identityInfo }) {
    // WebSocket instance state
    const [ws, setWs] = useState(null);

    // Game session details
    const [gameSessionId, setGameSessionId] = useState(null);
    const [isMatched, setIsMatched] = useState(false);

    // Player states
    const [playerPosition, setPlayerPosition] = useState(150);
    const [opponentPosition, setOpponentPosition] = useState(150);
    const [opponentUsername, setOpponentUsername] = useState("");

    // Ball state
    const [ballPosition, setBallPosition] = useState({ x: 400, y: 200 });

    // Player number (1 or 2)
    const [playerNumber, setPlayerNumber] = useState(null);

    // Scores tracking
    const [scores, setScores] = useState({ player1: 0, player2: 0 });

    // Game over state
    const [gameOver, setGameOver] = useState(false);
    const [winner, setWinner] = useState(null);

    // Chat system state
    const [chatRoomId, setChatRoomId] = useState(null);

    /**
     * useEffect Hook - Establishes WebSocket connection when the component mounts.
     * - Listens for server messages and updates game state accordingly.
     */
    useEffect(() => {
        // Initialize WebSocket connection to the game server
        const socket = new WebSocket('wss://pong441.onrender.com/game');

        // WebSocket opens - Send join request with user's ELO rating
        socket.onopen = () => {
            console.log('Connected to WebSocket server');
            socket.send(JSON.stringify({ 
                type: 'join',
                elo: identityInfo.elo
            }));
        };

        // WebSocket message handler - Processes game events
        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);

            if (data.type === "waiting") {
                // User is in the matchmaking queue, waiting for an opponent
                console.log(data.message);

            } else if (data.type === "matched") {
                // A match has been found, initialize game state
                setIsMatched(true);
                setGameSessionId(data.gameSessionId);
                setPlayerNumber(data.playerNumber);
                setOpponentUsername(data.opponent);
                setPlayerPosition(150);
                setOpponentPosition(150);
                setScores({ player1: 0, player2: 0 });
                setGameOver(false);
                setWinner(null);
            
            } else if (data.type === "gameState") {
                // Update ball and paddle positions from server state
                setBallPosition(data.ball);
                const { player1Pos, player2Pos, player1Score, player2Score } = data.gameData;
                 
                // Assign paddle positions based on player number
                if (data.playerNumber === 1) {
                    setPlayerPosition(player1Pos);
                    setOpponentPosition(player2Pos);
                } else {
                    setPlayerPosition(player2Pos);
                    setOpponentPosition(player1Pos);
                }

                // Update scores
                setScores({ 
                    player1: player1Score, 
                    player2: player2Score 
                });
            
            } else if (data.type === "gameOver") {
                // Game over - Set winner and update scores
                console.log('Winner:', data.winnerUsername);
                console.log('Scores:', data.scores);
                setWinner(data.winnerUsername);
                setScores(data.scores);
                setGameOver(true);

                // Function to store match result in database
                async function addGameToDB() {
                    try {
                        console.log('Adding game to DB!', {
                            player1: data.player1,
                            player2: data.player2,
                            winner: data.winnerUsername,
                            scores: data.scores,
                            startTime: new Date(),
                            endTime: new Date(),
                            chatRoomId: chatRoomId
                        });

                        await fetch("api/v1/games", {
                            method: "POST",
                            body: JSON.stringify({
                                player1: data.player1,
                                player2: data.player2,
                                winner: data.winnerUsername,
                                scores: data.scores,
                                startTime: new Date(),
                                endTime: new Date(),
                                chatRoomId: chatRoomId
                            }),
                            headers: {
                                "Content-Type": "application/json"
                            }
                        });
                    } catch (e) {
                        console.log(`Could not add game to DB: ${e}`);
                    }
                };

                // Function to update ELO rating in database
                async function updateElo(winnerUsername, loserUsername) {
                    try {
                        console.log('Updating Elo ratings!');
                        await fetch("api/v1/users/updateElo", {
                            method: "POST",
                            body: JSON.stringify({
                                winner: winnerUsername,
                                loser: loserUsername
                            }),
                            headers: {
                                "Content-Type": "application/json"
                            }
                        });
                    } catch (e) {
                        console.log(`Could not update Elo: ${e}`);
                    }
                }

                // Only the winner should record the match in the database
                if (identityInfo.username === data.winnerUsername) {
                    addGameToDB();
                }

                // Determine loser and update ELO ratings
                let loser = data.player1;
                if (data.player1 === data.winnerUsername) {
                    loser = data.player2;
                }
                updateElo(data.winnerUsername, loser);
            }
        };

        // WebSocket connection closed - Reset game state
        socket.onclose = () => {
            setGameOver(true);
            console.log('WebSocket connection closed');
            setIsMatched(false);
        };

        // Handle WebSocket errors
        socket.onerror = (error) => {
            console.error('WebSocket error:', error);
        };

        // Store WebSocket instance in state
        setWs(socket);

        // Cleanup function to close WebSocket on unmount
        return () => {
            if (socket) {
                socket.close();
            }
        };
    }, []);

    /**
     * Sends paddle movement data to the server.
     * - Only sends updates if the game is active and session exists.
     */
    const handleMove = (newPosition) => {
        if (ws && gameSessionId && !gameOver) {
            ws.send(JSON.stringify({
                type: 'move',
                position: newPosition
            }));
        }
    };

    return (
        <div className="board-view">
            {isMatched ? (
                <div className="matched">
                    {gameOver ? (
                        <div className="gameover">
                            <div className="gameover-popup">
                                <h2>Game Over!</h2>
                                <p>Player {winner} Wins! ({scores.player1} - {scores.player2})</p>
                                <button>
                                    <Link to="/" className="gameover-link">Go to Home</Link>
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="game-start">
                            <p>{identityInfo.username} vs {opponentUsername}</p>
                            <p>First to 11 points with 2 point lead wins!</p>
                        </div>
                    )}
                    <div className="pong-board">
                        <Pong 
                            playerNumber={playerNumber}
                            playerPosition={playerPosition}
                            opponentPosition={opponentPosition}
                            ballPosition={ballPosition}
                            scores={scores}
                            onMove={handleMove}
                        />
                    </div>
                    <Chat identityInfo={identityInfo} setChatRoomId={setChatRoomId} chatRoomId={chatRoomId} />
                </div>
            ) : (
                <div className="queue-view">
                    <h2>Matching...</h2> 
                    <div className='spinner'></div>
                    <button><Link to="/home" className="quit-link">QUIT</Link></button>
                </div>
            )}
        </div>
    );
};

export default PongGame;
