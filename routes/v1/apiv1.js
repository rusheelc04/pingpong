import express from 'express';
var router = express.Router();

import usersRouter from './controllers/users.js';
import gamesRouter from './controllers/games.js';
import leaderboardRouter from './controllers/leaderboard.js';
import messagesRouter from './controllers/messages.js'

/* GET users listing. */
router.get('/', function(req, res, next) {
  res.send('respond with a resource');
});

router.use('/users', usersRouter);
router.use('/games', gamesRouter);
router.use('/leaderboard', leaderboardRouter);
router.use('/messages', messagesRouter)

export default router;
