const { createGuest } = require('../services/store');

function guestAuth(req, res) {
  res.json(createGuest(req.body || {}));
}

function me(req, res) {
  res.json(req.user);
}

module.exports = { guestAuth, me };
