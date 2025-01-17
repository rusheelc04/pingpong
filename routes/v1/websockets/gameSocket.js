import enableWs from 'express-ws';
import PriorityQueue from 'js-priority-queue'
import { setupChatSocket } from './chatSocket.js';

export function setupGameSocket(server, app) {
    enableWs(app, server);
    setupChatSocket(app)
    const waitingPlayers = new PriorityQueue({comparator: (a, b) => b.elo - a.elo});
    const gameSessions = new Map();
    const playerSessions = new Map();

    app.ws('/game', (ws, req) => {
        if (!req.session.isAuthenticated) {
            ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized' }));
            console.log(req.session)
            ws.close();
            return;
        }

        let username = req.session.account.username;
    

        console.log('New connection');
        let playerData = null;
        
        ws.on('message', (message) => {
            try {
                const parsedMessage = JSON.parse(message);
                
                if (parsedMessage.type === 'join') {
                    playerData = {
                        ws,
                        username: username,
                        elo: parsedMessage.elo
                    };
                    joinQueue(playerData);
                }

                if (parsedMessage.type === 'move') {
                    playerMove(ws, parsedMessage);
                }
            } catch (error) {
                console.error('error:', error);
            }
        });

        ws.on('close', () => {
            console.log('Player disconnected');
            if (playerData) {
                cleanupGameSessions(playerData);
            }
        });

        ws.on('error', (error) => {
            console.error('WebSocket error:', error);
        });
    });

    function joinQueue(playerData) {
        try {
            if (waitingPlayers.length === 0) {
                waitingPlayers.queue(playerData);
                playerData.ws.send(JSON.stringify({ 
                    type: 'waiting', 
                    message: 'Waiting for opponent...' 
                }));
            } else {
                const opponent = waitingPlayers.dequeue();
                const gameSessionId = createGameSession(opponent, playerData);

                opponent.ws.send(JSON.stringify({
                    type: 'matched',
                    message: 'Opponent found!',
                    opponent: playerData.username,
                    gameSessionId,
                    playerNumber: 1
                }));

                playerData.ws.send(JSON.stringify({
                    type: 'matched',
                    message: 'Opponent found!',
                    opponent: opponent.username,
                    gameSessionId,
                    playerNumber: 2
                }));

                playerSessions.set(opponent.ws, gameSessionId);
                playerSessions.set(playerData.ws, gameSessionId);
            }
        } catch (error) {
            console.error('Error in handleJoinQueue:', error);
        }
    }

    function createGameSession(player1, player2) {
        // session id appends game date to it
        const gameSessionId = `game-${Date.now()}`;

        // once session is created it will set game settings
        const session = {
            player1: {
                ws: player1.ws,
                username: player1.username
            },
            player2: {
                ws: player2.ws,
                username:player2.username
            },
            ball: {
                x: 400,
                y: 200,
                dx: 5,
                dy: 5,
                size: 10
            },
            player1Pos: 150,
            player2Pos: 150,
            player1Score: 0,
            player2Score: 0,
            active: true,
            activeCountdown: false
        };

        console.log("Session created:", gameSessionId);
        gameSessions.set(gameSessionId, session);
        startGameLoop(gameSessionId);
        
        return gameSessionId;
    }

    // thsi handles the game loop by using the session and will
    // track the ball position as well as the game score.
    function startGameLoop(gameSessionId) {
        const session = gameSessions.get(gameSessionId);
        if (!session) return;

        // we used set interval so that we can specify how long 
        // till the screen updates in this case 60 fps will be 1000/60
        const gameLoop = setInterval(() => {
            if (!session.active) {
                clearInterval(gameLoop);
                return;
            }

            try {
                const { ball, player1Pos, player2Pos } = session;
                if (!session.activeCountdown) {
                    // Update ball position
                    ball.x += ball.dx;
                    ball.y += ball.dy;

                    // ball collision for the top
                    if (ball.y - ball.size <= 0 || ball.y + ball.size >= 400) {
                        ball.dy = -ball.dy;
                    }

                    // when ball collides with the player paddles
                    if (ball.x - ball.size <= 40 && ball.y >= player1Pos && ball.y <= player1Pos + 100) {
                        ball.dx = Math.abs(ball.dx);
                        // Increase speed on paddle hits
                        if (Math.abs(ball.dx) < 15) {
                            ball.dx *= 1.1;
                        }
                        if (Math.abs(ball.dy) < 15) {
                            ball.dy *= 1.1;
                        }
                    }
                    if (ball.x + ball.size >= 760 && ball.y >= player2Pos && ball.y <= player2Pos + 100) {
                        ball.dx = -Math.abs(ball.dx);
                        // Increase speed on paddle hits
                        if (Math.abs(ball.dx) < 15) {
                            ball.dx *= 1.1;
                        }
                        if (Math.abs(ball.dy) < 15) {
                            ball.dy *= 1.1;
                        }
                    }

                    // updates score and ball will reset on opposing sides depending on who scored it
                    if (ball.x < 0) {
                        session.player2Score += 1;
                        resetBall(ball, true, session);
                    }
                    if (ball.x > 800) {
                        session.player1Score += 1;
                        resetBall(ball, false, session); 
                    }
                }

                // check if any players are within the winning threshold and if so it will end the gameloop
                if (session.player1Score >= 11 && session.player1Score - session.player2Score >= 2) {
                    handleGameOver(session, 1);
                    return;
                } else if (session.player2Score >= 11 && session.player2Score - session.player1Score >= 2) {
                    handleGameOver(session, 2);
                    return;
                }

                // Send game state to both players
                const gameState = {
                    type: 'gameState',
                    ball: { x: ball.x, y: ball.y },
                    gameData: {
                        player1Pos,
                        player2Pos,
                        player1Score: session.player1Score,
                        player2Score: session.player2Score
                    }
                };

                // Send state to player 1
                if (session.player1.ws.readyState === 1) {
                    session.player1.ws.send(JSON.stringify({
                        ...gameState,
                        playerNumber: 1
                    }));
                }

                // Send state to player 2
                if (session.player2.ws.readyState === 1) {
                    session.player2.ws.send(JSON.stringify({
                        ...gameState,
                        playerNumber: 2
                    }));
                }

            } catch (error) {
                console.error('Error in game loop:', error);
                session.active = false;
                clearInterval(gameLoop);
            }
        }, 1000/120);
        // sends game loop instructions back to session
        session.gameLoopId = gameLoop;
    }

    // function lets us decide which side to reset the ball
    function resetBall(ball, serveToRight, session) {
        ball.x = 400;
        ball.y = 200;
        session.activeCountdown = true;
        setTimeout(() => {
            if (serveToRight === true) {
                ball.dx = 5;
            } else {
                ball.dx = -5;
            }
            session.activeCountdown = false;
            ball.dy = (Math.random() - 0.5) * 10; // Random vertical direction
        }, 2000)
    }

    // once game is over sends final data back to session
    // TODO: update the DB when game is over
    function handleGameOver(session, winner) {
        let gameWinner = session.player1.username;
        if (winner === 2) {
            gameWinner = session.player2.username;
        }
        const gameOverData = {
            type: 'gameOver',
            winner: winner,
            player1: session.player1.username,
            player2: session.player2.username,
            winnerUsername: gameWinner,
            scores: {
                player1: session.player1Score,
                player2: session.player2Score
            }
        };

        console.log("gamover data:", JSON.stringify(gameOverData))

        if (session.player1.ws.readyState === 1) {
            session.player1.ws.send(JSON.stringify(gameOverData));
        }
        if (session.player2.ws.readyState === 1) {
            session.player2.ws.send(JSON.stringify(gameOverData));
        }

        session.active = false;
        if (session.gameLoopId) {
            clearInterval(session.gameLoopId);
        }
    }

    // updates the sockets data on player paddle location
    // and saves it to session
    function playerMove(ws, moveData) {
        try {
            const gameSessionId = playerSessions.get(ws);
            const session = gameSessions.get(gameSessionId);
            console.log("the current session", session)
            if (!session) return;

            const newPosition = Math.max(0, Math.min(300, moveData.position));
            
            if (session.player1.ws === ws) {
                session.player1Pos = newPosition;
            } else if (session.player2.ws === ws) {
                session.player2Pos = newPosition;
            }
        } catch (error) {
            console.error('Error in handlePlayerMove:', error);
        }
    }

    // remove selected player from queue
    // function removePlayerFromQueue(playerData) {
    //     const index = waitingPlayers.findIndex(p => p.ws === playerData.ws);
    //     if (index !== -1) {
    //         waitingPlayers.splice(index, 1);
    //     }
    // }

    // function will set the session to active as well as end the interval
    // 
    function cleanupGameSessions(playerData) {
        const gameSessionId = playerSessions.get(playerData.ws);
        const session = gameSessions.get(gameSessionId);
        if (session === undefined) {
            return;
        }
        session.active = false;
        if (session !== null) {
            
            if (session !== null) {
                session.active = false;
                if (session.gameLoopId) {
                    clearInterval(session.gameLoopId);
                }
                // Notify other player about disconnection
                let otherPlayer = session.player1;
                if (session.player1 === playerData.ws) {
                    otherPlayer = session.player2
                }
            
                if (otherPlayer.readyState === 1) {
                    otherPlayer.send(JSON.stringify({
                        type: 'gameOver',
                        reason: 'Opponent disconnected',
                        winner: session.player1 === playerData.ws ? 2 : 1,
                        scores: {
                            player1: session.player1Score,
                            player2: session.player2Score
                        }
                    }));
                }
                gameSessions.delete(gameSessionId);
            }
            playerSessions.delete(playerData.ws);
        }
    }
}