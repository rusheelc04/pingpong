import express from 'express'; // Import Express framework
var router = express.Router(); // Create an Express Router instance

// Import individual route controllers
import usersRouter from './controllers/users.js'; // User-related routes (authentication, ELO updates)
import gamesRouter from './controllers/games.js'; // Game-related routes (match history, results)
import leaderboardRouter from './controllers/leaderboard.js'; // Leaderboard-related routes (rankings, sorting)
import messagesRouter from './controllers/messages.js'; // Chat message-related routes (storing, retrieving messages)

/**
 * GET /
 * - Returns API metadata instead of a placeholder response.
 * - Helps developers understand available endpoints.
 */
router.get('/', function(req, res, next) {
  res.json({
    status: "success",
    message: "Welcome to Pong API v1",
    availableEndpoints: {
      users: "/api/v1/users",
      games: "/api/v1/games",
      leaderboard: "/api/v1/leaderboard",
      messages: "/api/v1/messages"
    }
  });
});

/**
 * Register API route handlers.
 * - Mounts imported routers at their respective paths.
 * - Organizes the API structure cleanly.
 */
router.use('/users', usersRouter); // Handles authentication, user identity, and ELO updates
router.use('/games', gamesRouter); // Handles game history, storing results, and fetching past matches
router.use('/leaderboard', leaderboardRouter); // Handles player rankings, sorting users by ELO
router.use('/messages', messagesRouter); // Handles chat message storage and retrieval

export default router; // Export the router for use in the main application
