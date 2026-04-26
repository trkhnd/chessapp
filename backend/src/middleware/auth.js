const { getUserByToken } = require('../services/store');

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const user = getUserByToken(token);

  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  req.user = user;
  next();
}

module.exports = { auth };
