import express from 'express';

var router = express.Router();

// TODO: router.get("/")

router.post("/", async (req, res) => {
    try {
        if (req.session.isAuthenticated) {
            let player1 = await req.models.User.findOne({username: req.body.player1});
            let player2 = await req.models.User.findOne({username: req.body.player2});
            let winner = req.body.winner === req.body.player1 ? player1 : player2;
            const newGame = new req.models.Game({
                player1: player1._id,
                player2: player2._id,
                startTime: req.body.startTime,
                endTime: req.body.endTime,
                score: req.body.scores,
                winner: winner,
                chatRoomId: req.body.chatRoomId,
            });
            await newGame.save();
            res.json({status: "success"})
        } else {
            res.status(401).json({
                status: "error",
                error: "not logged in"
            });
        }
    } catch (e) {
        res.status(500).json({
            status: "error",
            error: e
        });
    }
})

router.get("/list", async (req, res) => {
    try {
        if (!req.session.isAuthenticated) {
        return res.status(401).json({ error: "User is not authenticated." });
        }
    
        let user = await req.models.User.findOne({username: req.session.account.username})
        let games = await req.models.Game.find({
            $or: [
                { player1: user._id },
                { player2: user._id }
            ]
        })

        let gameInfo = await Promise.all(games.map(async (game) => {
            let opponent = ''
            let result = game.winner.equals(user._id) ? "Win" : "Lose"
            let score = `${game.score.player1} - ${game.score.player2}`

            try {
                if (game.player1.equals(user._id)) {
                    const opponentInfo = await req.models.User.findOne({ _id: game.player2 })
                    opponent = opponentInfo.username
                } else {
                    const opponentInfo = await req.models.User.findOne({ _id: game.player1 })
                    opponent = opponentInfo.username
                }

                return {
                    score: score,
                    opponent: opponent,
                    result: result,
                    date: game.endTime.toDateString()
                }
            } catch (error) {
                return {
                    score: "error",
                    opponent: "error",
                    result: "error",
                    date: "error",
                    error: error.message
                }
            }
        }))

        res.json(gameInfo)

    } catch (error) {
        res.status(500).json({
            status: "error",
            error: error
        });
    }
})

export default router;