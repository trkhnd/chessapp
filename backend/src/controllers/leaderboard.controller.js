const { getLeaderboard } = require('../services/store');

function listLeaderboard(req, res) {
  res.json(getLeaderboard());
}

module.exports = { listLeaderboard };
