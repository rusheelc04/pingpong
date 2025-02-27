import express from 'express'; // Import Express framework

var router = express.Router(); // Create a new Express router instance

/**
 * POST /api/v1/messages/
 * - Stores a new chat message in the database.
 * - Extracts sender username and message text.
 */
router.post("/", async (req, res) => {
    try {
        // Extract sender username and message from request body
        let username = req.body.messages.split(":")[0];
        username = await req.models.User.findOne({ username: username });

        // Extract message text after the first occurrence of ":"
        const message = req.body.messages.split(":").slice(1).join(":");

        // Create new message document
        const newMessage = new req.models.Message({
            username: username._id, // Store sender's user ID
            chatRoomId: req.body.chatRoomId, // Store associated chat room ID
            message: message, // Store message text
            timestamp: Date.now() // Store current timestamp
        });

        // Save message in the database
        await newMessage.save();

        // Send success response
        res.json({ status: "success" });

    } catch (error) {
        // Handle server errors
        res.status(500).json({
            status: "error",
            error: error.message
        });
    }
});

export default router; // Export the router for use in the main application
