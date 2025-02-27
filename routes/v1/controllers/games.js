import express from 'express'; // Import Express framework

var router = express.Router(); // Create a new Express Router instance

// TODO: Define router.get("/") for retrieving all game records (currently missing)

/**
 * POST /api/v1/games/
 * - Creates a new game record in the database.
 * - Requires authentication.
 * - Fetches player data, determines the winner, and stores the game result.
 */
router.post("/", async (req, res) => {
    try {
        // Check if the user is authenticated
        if (req.session.isAuthenticated) {
            
            // Find Player 1 in the database based on username
            let player1 = await req.models.User.findOne({ username: req.body.player1 });
            
            // Find Player 2 in the database based on username
            let player2 = await req.models.User.findOne({ username: req.body.player2 });

            // Determine the winner based on the request body
            let winner = req.body.winner === req.body.player1 ? player1 : player2;

            // Create a new game entry in the database
            const newGame = new req.models.Game({
                player1: player1._id, // Store MongoDB ObjectId reference for Player 1
                player2: player2._id, // Store MongoDB ObjectId reference for Player 2
                startTime: req.body.startTime, // Capture game start time
                endTime: req.body.endTime, // Capture game end time
                score: req.body.scores, // Store final game score
                winner: winner, // Store winner's ID
                chatRoomId: req.body.chatRoomId, // Store associated chat room ID
            });

            // Save game entry to database
            await newGame.save();

            // Send success response
            res.json({ status: "success" });

        } else {
            // Return an error if the user is not authenticated
            res.status(401).json({
                status: "error",
                error: "not logged in"
            });
        }
    } catch (e) {
        // Handle server errors and send a 500 response
        res.status(500).json({
            status: "error",
            error: e.message // Include error message for debugging
        });
    }
});

/**
 * GET /api/v1/games/list
 * - Retrieves all games associated with the logged-in user.
 * - Requires authentication.
 * - Fetches user match history and formats data for response.
 */
router.get("/list", async (req, res) => {
    try {
        // Ensure the user is authenticated before proceeding
        if (!req.session.isAuthenticated) {
            return res.status(401).json({ error: "User is not authenticated." });
        }

        // Find the user in the database based on session data
        let user = await req.models.User.findOne({ username: req.session.account.username });

        // Find all games where the user was either player1 or player2
        let games = await req.models.Game.find({
            $or: [
                { player1: user._id }, 
                { player2: user._id }
            ]
        });

        // Format game data for frontend display
        let gameInfo = await Promise.all(games.map(async (game) => {
            let opponent = ''; // Store opponent username
            let result = game.winner.equals(user._id) ? "Win" : "Lose"; // Determine if user won or lost
            let score = `${game.score.player1} - ${game.score.player2}`; // Format game score

            try {
                // Find opponent's username based on player position
                if (game.player1.equals(user._id)) {
                    const opponentInfo = await req.models.User.findOne({ _id: game.player2 });
                    opponent = opponentInfo.username;
                } else {
                    const opponentInfo = await req.models.User.findOne({ _id: game.player1 });
                    opponent = opponentInfo.username;
                }

                return {
                    score: score, // Store formatted score
                    opponent: opponent, // Store opponent's username
                    result: result, // Store match result (Win/Lose)
                    date: game.endTime.toDateString() // Convert date object to string
                };
            } catch (error) {
                // Handle error in case opponent retrieval fails
                return {
                    score: "error",
                    opponent: "error",
                    result: "error",
                    date: "error",
                    error: error.message // Store error message for debugging
                };
            }
        }));

        // Send the formatted game data as response
        res.json(gameInfo);

    } catch (error) {
        // Handle any unexpected errors and send a 500 response
        res.status(500).json({
            status: "error",
            error: error.message // Include error details
        });
    }
});

export default router; // Export the router for use in the main application
