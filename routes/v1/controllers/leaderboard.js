import express from 'express';

var router = express.Router();

router.get("/", async (req, res) => {
    try {
        if (req.session.isAuthenticated) {
            let users = await req.models.User.find();
            let leaderboardInfo = users.map((user) => ({username: user.username, elo: user.elo})); // why does this not work?
            leaderboardInfo.sort((a, b) => b.elo - a.elo);
            res.json(leaderboardInfo);
        } else {
            res.status(401).json({
                status: "error",
                error: "not logged in"
            })
        }
    } catch (e) {
        res.status(500).json({
            status: "error",
            error: e
        });
    }
})

export default router;