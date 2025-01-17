import express from 'express';


var router = express.Router();

router.post("/", async(req, res) => {
    try {
        let username = req.body.messages.split(":")[0];
        username = await req.models.User.findOne({username: username});
        const message = req.body.messages.split(":")[1];
        const newMessage = new req.models.Message({
            username: username._id,
            chatRoomId: req.body.chatRoomId,
            message: message,
            timestamp: Date.now()  
        })
       
        await newMessage.save() 
        res.json({status: "success"})
    } catch(error) {
        res.status(500).json({
            status: "error",
            error: error
        });
    }
})

export default router;