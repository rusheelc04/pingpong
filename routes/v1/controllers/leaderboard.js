import express from 'express'; // Import Express framework

var router = express.Router(); // Create a new Express router instance

/**
 * GET /api/v1/leaderboard
 * - Retrieves the leaderboard of all users ranked by their ELO scores.
 * - Requires authentication.
 */
router.get("/", async (req, res) => {
    try {
        // Ensure user is authenticated before accessing leaderboard
        if (req.session.isAuthenticated) {
            // Fetch all users from the database
            let users = await req.models.User.find();

            // Map user data to an array with only relevant fields (username & elo)
            let leaderboardInfo = users.map((user) => ({ username: user.username, elo: user.elo }));

            // Sort users by ELO score in descending order
            leaderboardInfo.sort((a, b) => b.elo - a.elo);

            // Return the sorted leaderboard as JSON
            res.json(leaderboardInfo);
        } else {
            // Return authentication error if user is not logged in
            res.status(401).json({
                status: "error",
                error: "not logged in"
            });
        }
    } catch (e) {
        // Handle server errors
        res.status(500).json({
            status: "error",
            error: e.message
        });
    }
});

export default router; // Export the router for use in the main application
