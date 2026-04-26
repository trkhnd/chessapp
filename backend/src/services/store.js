const crypto = require('crypto');

const usersByToken = new Map();
const gamesByUser = new Map();
const cityWins = new Map();

function createGuest({ name, city }) {
  const token = crypto.randomUUID();
  const user = {
    id: crypto.randomUUID(),
    name: (name || 'Player').trim().slice(0, 24),
    city: (city || 'Unknown').trim().slice(0, 24),
    createdAt: new Date().toISOString()
  };
  usersByToken.set(token, user);
  if (!gamesByUser.has(user.id)) gamesByUser.set(user.id, []);
  if (!cityWins.has(user.city)) cityWins.set(user.city, 0);
  return { token, user };
}

function getUserByToken(token) {
  return usersByToken.get(token);
}

function saveGame(user, payload) {
  const game = {
    id: crypto.randomUUID(),
    result: payload?.result || 'unknown',
    mode: payload?.mode || 'local',
    pgn: payload?.pgn || '',
    mistakes: payload?.mistakes || [],
    createdAt: new Date().toISOString()
  };

  const list = gamesByUser.get(user.id) || [];
  list.unshift(game);
  gamesByUser.set(user.id, list.slice(0, 50));

  if (game.result === 'win') {
    cityWins.set(user.city, (cityWins.get(user.city) || 0) + 1);
  }

  return game;
}

function getGames(user) {
  return gamesByUser.get(user.id) || [];
}

function getLeaderboard() {
  return [...cityWins.entries()]
    .map(([city, wins]) => ({ city, wins }))
    .sort((a, b) => b.wins - a.wins)
    .slice(0, 20);
}

module.exports = {
  createGuest,
  getUserByToken,
  saveGame,
  getGames,
  getLeaderboard
};
