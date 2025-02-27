import enableWs from 'express-ws'; // Enable WebSockets in Express
import PriorityQueue from 'js-priority-queue'; // Import priority queue for matchmaking
import { setupChatSocket } from './chatSocket.js'; // Import chat system

/**
 * setupGameSocket
 * - Initializes WebSocket-based game matchmaking and gameplay.
 * - Manages player queue and game sessions.
 * 
 * @param {Object} server - Express server instance.
 * @param {Object} app - Express app instance.
 */
export function setupGameSocket(server, app) {
    enableWs(app, server); // Enable WebSocket support
    setupChatSocket(app); // Initialize chat system for game sessions

    const waitingPlayers = new PriorityQueue({ comparator: (a, b) => b.elo - a.elo }); // Matchmaking queue sorted by ELO
    const gameSessions = new Map(); // Stores active game sessions
    const playerSessions = new Map(); // Tracks which game session each player is in

    // WebSocket connection handler for game matchmaking
    app.ws('/game', (ws, req) => {
        if (!req.session.isAuthenticated) {
            ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized' }));
            ws.close();
            return;
        }

        let username = req.session.account.username;
        console.log('New connection');
        let playerData = null;
        
        // Handle incoming messages from the client
        ws.on('message', (message) => {
            try {
                const parsedMessage = JSON.parse(message);

                if (parsedMessage.type === 'join') {
                    playerData = { ws, username, elo: parsedMessage.elo };
                    joinQueue(playerData);
                }

                if (parsedMessage.type === 'move') {
                    playerMove(ws, parsedMessage);
                }
            } catch (error) {
                console.error('Error parsing message:', error);
            }
        });

        // Handle WebSocket disconnection
        ws.on('close', () => {
            console.log('Player disconnected');
            if (playerData) {
                cleanupGameSessions(playerData);
            }
        });

        // Handle WebSocket errors
        ws.on('error', (error) => {
            console.error('WebSocket error:', error);
        });
    });

    /**
     * joinQueue
     * - Adds player to matchmaking queue.
     * - If an opponent is available, starts a game session.
     */
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
            console.error('Error in joinQueue:', error);
        }
    }

    /**
     * createGameSession
     * - Initializes a new game session with two players.
     * 
     * @param {Object} player1 - First player object.
     * @param {Object} player2 - Second player object.
     * @returns {string} - Game session ID.
     */
    function createGameSession(player1, player2) {
        const gameSessionId = `game-${Date.now()}`;

        const session = {
            player1: { ws: player1.ws, username: player1.username },
            player2: { ws: player2.ws, username: player2.username },
            ball: { x: 400, y: 200, dx: 5, dy: 5, size: 10 },
            player1Pos: 150,
            player2Pos: 150,
            player1Score: 0,
            player2Score: 0,
            active: true
        };

        console.log("Session created:", gameSessionId);
        gameSessions.set(gameSessionId, session);
        startGameLoop(gameSessionId);
        
        return gameSessionId;
    }

    /**
     * playerMove
     * - Handles player movement updates.
     * 
     * @param {WebSocket} ws - WebSocket connection of the player.
     * @param {Object} moveData - Movement data from client.
     */
    function playerMove(ws, moveData) {
        try {
            const gameSessionId = playerSessions.get(ws);
            const session = gameSessions.get(gameSessionId);
            if (!session) return;

            const newPosition = Math.max(0, Math.min(300, moveData.position));
            
            if (session.player1.ws === ws) {
                session.player1Pos = newPosition;
            } else if (session.player2.ws === ws) {
                session.player2Pos = newPosition;
            }
        } catch (error) {
            console.error('Error in playerMove:', error);
        }
    }
}
