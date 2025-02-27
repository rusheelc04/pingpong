import express from 'express'; // Import Express framework

var router = express.Router(); // Create a new Express router instance

/**
 * GET /api/v1/users/myIdentity
 * - Retrieves the logged-in user's information.
 */
router.get('/myIdentity', async (req, res) => {
    console.log("Fetching user identity");

    // Check if user is authenticated
    if (req.session.isAuthenticated) {
        // Find user in the database based on session info
        let user = await req.models.User.findOne({ username: req.session.account.username });

        // Return user info
        res.send({
            status: "loggedin",
            userInfo: {
                name: req.session.account.name,
                username: req.session.account.username,
                elo: user?.elo || 1000 // Default ELO if not set
            }
        });
    } else {
        // Return logged out status
        res.send({ status: "loggedout" });
    }
});

/**
 * POST /api/v1/users/add
 * - Adds a new user to the database.
 */
router.post('/add', async (req, res) => {
    console.log("Adding user");

    try {
        // Get username from session
        const username = req.session.account.username;

        // Check if user already exists
        let user = await req.models.User.findOne({ username: username });

        if (user) {
            return res.status(200).json({ message: "User already exists", user });
        }

        // Create new user record
        user = new req.models.User({
            username: username,
            elo: 1000, // Default ELO rating
            created_at: new Date(),
            updated_at: new Date()
        });

        // Save user to database
        await user.save();

        res.json({ "status": "success" });

    } catch (error) {
        res.status(500).json({ "status": "error", "error": error.message });
    }
});

/**
 * POST /api/v1/users/updateElo
 * - Updates ELO rankings for a match winner and loser.
 */
router.post('/updateElo', async (req, res) => {
    const { winner, loser } = req.body;

    try {
        // Find winner and loser in the database
        const winnerUser = await req.models.User.findOne({ username: winner });
        const loserUser = await req.models.User.findOne({ username: loser });

        console.log("Winner:", winnerUser, "Loser:", loserUser);

        // Prevent updating if winner and loser are the same
        if (winnerUser.username === loserUser.username) {
            return res.status(400).json({ status: "error", message: "Winner and loser cannot be the same person." });
        }

        // Update ELO scores
        winnerUser.elo += 20;
        loserUser.elo = Math.max(1000, loserUser.elo - 20); // Ensure ELO doesn't drop below 1000

        // Save changes to database
        await winnerUser.save();
        await loserUser.save();

        res.json({ status: "success" });

    } catch (error) {
        res.status(500).json({ "status": "error", "error": error.message });
    }
});

export default router; // Export the router for use in the main application
