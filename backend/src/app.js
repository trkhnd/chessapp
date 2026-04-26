const express = require('express');
const path = require('path');
const authRoutes = require('./routes/auth.routes');
const gameRoutes = require('./routes/game.routes');
const leaderboardRoutes = require('./routes/leaderboard.routes');

const app = express();
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/leaderboard', leaderboardRoutes);

app.get('/health', (_, res) => res.json({ ok: true }));

// optional static hosting if built frontend is copied here
app.use(express.static(path.join(__dirname, '../../frontend/dist')));

module.exports = app;
