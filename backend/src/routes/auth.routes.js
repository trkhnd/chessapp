const router = require('express').Router();
const { auth } = require('../middleware/auth');
const { guestAuth, me } = require('../controllers/auth.controller');

router.post('/guest', guestAuth);
router.get('/me', auth, me);

module.exports = router;
