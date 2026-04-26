const router = require('express').Router();
const { auth } = require('../middleware/auth');
const { listGames, createGame } = require('../controllers/game.controller');

router.get('/', auth, listGames);
router.post('/', auth, createGame);

module.exports = router;
