
import React, { useEffect, useState } from 'react';
import Pong from './Pong';
import Chat from './Chat';
import { Link } from 'react-router-dom';

function PongGame ({identityInfo}) {
    const [ws, setWs] = useState(null);
    const [gameSessionId, setGameSessionId] = useState(null)
    const [isMatched, setIsMatched] = useState(false);
    const [playerPosition, setPlayerPosition] = useState(150);
    // opponent states
    const [opponentPosition, setOpponentPosition] = useState(150);
    const [opponentUsername, setOpponentUsername] = useState("");

    const [ballPosition, setBallPosition] = useState({ x: 400, y: 200 });
    const [playerNumber, setPlayerNumber] = useState(null);
    const [scores, setScores] = useState({ player1: 0, player2: 0 });
    const [gameOver, setGameOver] = useState(false);
    const [winner, setWinner] = useState(null);
    
    const [chatRoomId, setChatRoomId] = useState(null);


    useEffect(() => {
        const socket = new WebSocket('wss://pong441.onrender.com/game');
        
        socket.onopen = () => {
            console.log('Connected to WebSocket server');
            socket.send(JSON.stringify({ 
                type: 'join',
                elo: identityInfo.elo
            }));
        };

        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            //console.log('Received message:', data);

            if (data.type === "waiting") {
                console.log(data.message);

            } else if (data.type === "matched") {
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
                setBallPosition(data.ball);
                const { player1Pos, player2Pos, player1Score, player2Score } = data.gameData;
                 
                if (data.playerNumber === 1) {
                    setPlayerPosition(player1Pos);
                    setOpponentPosition(player2Pos);
                } else {
                    setPlayerPosition(player2Pos);
                    setOpponentPosition(player1Pos);
                }
                setScores({ 
                    player1: player1Score, 
                    player2: player2Score 
                });
            
            } else if (data.type === "gameOver") {
                console.log('Winner:', data.winnerUsername);
                console.log('Scores:', data.scores);
                setWinner(data.winnerUsername);
                setScores(data.scores);
                setGameOver(true)
                // Add new game to DB
                async function addGameToDB() {
                    try {
                        console.log('Adding game to DB!');
                        console.log({
                            player1: data.player1,
                            player2: data.player2,
                            winner: data.winnerUsername,
                            scores: data.scores,
                            startTime: new Date(),
                            endTime: new Date(),
                            chatRoomId: chatRoomId
                        })
                        const res = await fetch("api/v1/games", {
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
                async function updateElo(winnerUsername, loserUsername) {
                    try {
                        console.log('Updating Elo ratings!');
                        const res = await fetch("api/v1/users/updateElo", {
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
                // We only want to do this once, so just have the winner send to DB
                if (identityInfo.username === data.winnerUsername) {
                    addGameToDB();
                }
                let loser = data.player1;
                if (data.player1 === data.winnerUsername) {
                    loser = data.player2;
                }
                updateElo(data.winnerUsername, loser)
            }
        };

        socket.onclose = () => {
            setGameOver(true)
            console.log('WebSocket connection closed');
            setIsMatched(false);
        };

        socket.onerror = (error) => {
            console.error('WebSocket error:', error);
        };

        setWs(socket);

        return () => {
            if (socket) {
                socket.close();
            }
        };
    }, []);

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
                            <button><Link to="/" className="gameover-link">Go to Home</Link></button>
                        </div>
                    </div>
                    ) : (
                        <div className="game-start">
                            <p> {identityInfo.username} vs {opponentUsername}</p>
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
                    <Chat 
                        identityInfo={identityInfo}
                        setChatRoomId={setChatRoomId}
                        chatRoomId={chatRoomId}
                    />
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