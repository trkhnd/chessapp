const router = require('express').Router();
const { listLeaderboard } = require('../controllers/leaderboard.controller');

router.get('/', listLeaderboard);

module.exports = router;
