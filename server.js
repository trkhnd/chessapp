const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const usersByToken = new Map();
const gamesByUser = new Map();
const cityWins = new Map();
const rooms = new Map();

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const user = usersByToken.get(token);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.user = user;
  next();
}

app.post('/api/auth/guest', (req, res) => {
  const name = (req.body?.name || 'Player').trim().slice(0, 24);
  const city = (req.body?.city || 'Unknown').trim().slice(0, 24);
  const token = crypto.randomUUID();
  const user = { id: crypto.randomUUID(), name, city, createdAt: new Date().toISOString() };
  usersByToken.set(token, user);
  if (!gamesByUser.has(user.id)) {
    gamesByUser.set(user.id, []);
  }
  if (!cityWins.has(city)) {
    cityWins.set(city, 0);
  }
  res.json({ token, user });
});

app.get('/api/me', auth, (req, res) => {
  res.json(req.user);
});

app.get('/api/games', auth, (req, res) => {
  res.json(gamesByUser.get(req.user.id) || []);
});

app.post('/api/games', auth, (req, res) => {
  const game = {
    id: crypto.randomUUID(),
    result: req.body?.result || 'unknown',
    mode: req.body?.mode || 'local',
    pgn: req.body?.pgn || '',
    accuracy: req.body?.accuracy || null,
    mistakes: req.body?.mistakes || [],
    createdAt: new Date().toISOString()
  };
  const list = gamesByUser.get(req.user.id) || [];
  list.unshift(game);
  gamesByUser.set(req.user.id, list.slice(0, 20));

  if (game.result === 'win') {
    const current = cityWins.get(req.user.city) || 0;
    cityWins.set(req.user.city, current + 1);
  }

  res.json({ ok: true, game });
});

app.get('/api/leaderboard', (req, res) => {
  const leaderboard = [...cityWins.entries()]
    .map(([city, wins]) => ({ city, wins }))
    .sort((a, b) => b.wins - a.wins)
    .slice(0, 20);
  res.json(leaderboard);
});

app.post('/api/upgrade', auth, (req, res) => {
  res.json({
    ok: true,
    message: 'Mock Stripe checkout created',
    checkoutUrl: `https://example.com/checkout?user=${req.user.id}&plan=pro`
  });
});

app.get('/health', (req, res) => res.json({ ok: true }));

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const roomId = url.searchParams.get('room');
  const token = url.searchParams.get('token');

  const user = usersByToken.get(token);
  if (!roomId || !user) {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid room or token' }));
    ws.close();
    return;
  }

  if (!rooms.has(roomId)) rooms.set(roomId, new Set());
  const room = rooms.get(roomId);
  room.add(ws);

  ws.send(JSON.stringify({ type: 'joined', roomId, user: user.name }));

  for (const client of room) {
    if (client !== ws && client.readyState === 1) {
      client.send(JSON.stringify({ type: 'peer_joined', user: user.name }));
    }
  }

  ws.on('message', (message) => {
    for (const client of room) {
      if (client !== ws && client.readyState === 1) {
        client.send(message.toString());
      }
    }
  });

  ws.on('close', () => {
    room.delete(ws);
    if (room.size === 0) {
      rooms.delete(roomId);
    }
  });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Chess platform listening on http://localhost:${port}`);
});