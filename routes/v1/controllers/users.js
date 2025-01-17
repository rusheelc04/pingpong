import express from 'express';
var router = express.Router();

router.get('/myIdentity', async (req, res, next) => {
    console.log("test")
    if (req.session.isAuthenticated) {
        let user = await req.models.User.findOne({username: req.session.account.username})
        res.send({
            status: "loggedin",
            userInfo: {
                name: req.session.account.name,
                username: req.session.account.username,
                elo: user?.elo || 1000
            }
        });
    } else {
        res.send({status: "loggedout"});
    }
});

router.post('/add', async (req, res, next) => {
    console.log("add user")
    try {
        const username = req.session.account.username
        
        let user = await req.models.User.findOne({ username: username })

        if (user) {
            return res.status(200).json({message: "User already exists", user})
        }

        user = new req.models.User({
            username: username,
            elo: 1000,
            created_at: new Date,
            updated_at: new Date
        })

        await user.save()

        res.json({"status": "success"})

    } catch (error) {
        res.status(500).json({"status": "error", "error": error})
    }

})

router.post('/updateElo', async(req, res) => {
    const { winner, loser } = req.body; 
    try {
        const winnerUser = await req.models.User.findOne({ username: winner });
        const loserUser =  await req.models.User.findOne({ username: loser });
        console.log("winner is ", winnerUser, "loser is ", loserUser)
        if (winnerUser.username == loserUser.username) {
            return res.status(400).json({ status: "error", message: "winner and loser are the same" });
        }
        winnerUser.elo += 20;
        loserUser.elo = Math.max(1000, loserUser.elo-20)
        await winnerUser.save();
        await loserUser.save();
    } catch (error) {
        res.status(500).json({"status": "error", "error": error})
    }
})

export default router;