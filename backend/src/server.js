const http = require('http');
const { WebSocketServer } = require('ws');
const app = require('./app');
const { port } = require('./config/env');
const { getUserByToken } = require('./services/store');
const { attachRoomWs } = require('./ws/rooms');

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
attachRoomWs(wss, getUserByToken);

server.listen(port, () => {
  console.log(`Chess Master backend running on http://localhost:${port}`);
});
