const rooms = new Map();

function attachRoomWs(wss, getUserByToken) {
  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://localhost');
    const roomId = url.searchParams.get('room');
    const token = url.searchParams.get('token');
    const user = getUserByToken(token);

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
      if (room.size === 0) rooms.delete(roomId);
    });
  });
}

module.exports = { attachRoomWs };
