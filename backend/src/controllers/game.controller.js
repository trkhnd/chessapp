const { getGames, saveGame } = require('../services/store');

function listGames(req, res) {
  res.json(getGames(req.user));
}

function createGame(req, res) {
  const game = saveGame(req.user, req.body);
  res.json({ ok: true, game });
}

module.exports = { listGames, createGame };
