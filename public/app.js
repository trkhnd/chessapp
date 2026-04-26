/* global Chess */
const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const coachList = document.getElementById('coachList');
const historyEl = document.getElementById('history');
const leaderboardEl = document.getElementById('leaderboard');

let game = new Chess();
let selectedSquare = null;
let token = localStorage.getItem('token') || '';
let user = JSON.parse(localStorage.getItem('user') || 'null');
let mode = 'local';
let ws = null;
let roomId = null;
let moveAudit = [];

const pieceMap = {
  p: '♟', r: '♜', n: '♞', b: '♝', q: '♛', k: '♚',
  P: '♙', R: '♖', N: '♘', B: '♗', Q: '♕', K: '♔'
};

function evaluate(chess) {
  const values = { p: 1, n: 3, b: 3.2, r: 5, q: 9, k: 0 };
  return chess.board().flat().reduce((sum, p) => {
    if (!p) return sum;
    const value = values[p.type] || 0;
    return sum + (p.color === 'w' ? value : -value);
  }, 0);
}

function pickBestMove(chess, depth = 2, isMax = chess.turn() === 'w') {
  if (depth === 0 || chess.isGameOver()) return { score: evaluate(chess) };

  const moves = chess.moves({ verbose: true });
  let best = { score: isMax ? -Infinity : Infinity, move: null };

  for (const move of moves) {
    chess.move(move);
    const probe = pickBestMove(chess, depth - 1, !isMax);
    chess.undo();

    if (isMax ? probe.score > best.score : probe.score < best.score) {
      best = { score: probe.score, move };
    }
  }
  return best;
}

function analyzeMistakes() {
  coachList.innerHTML = '';
  const ranked = moveAudit
    .filter((m) => Math.abs(m.delta) > 1.5)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 3);

  if (!ranked.length) {
    coachList.innerHTML = '<li>Great discipline: no major blunders detected.</li>';
    return [];
  }

  const mistakes = ranked.map((item, idx) => {
    const text = `#${idx + 1}: Move ${item.played} caused eval swing ${item.delta.toFixed(2)}. Try ${item.suggested} instead.`;
    const li = document.createElement('li');
    li.textContent = text;
    coachList.appendChild(li);
    return text;
  });
  return mistakes;
}

function drawBoard() {
  boardEl.innerHTML = '';
  const squares = game.board();

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = document.createElement('div');
      const squareName = 'abcdefgh'[c] + (8 - r);
      sq.className = `square ${(r + c) % 2 ? 'dark' : 'light'}`;
      if (selectedSquare === squareName) sq.classList.add('selected');
      sq.dataset.square = squareName;
      const piece = squares[r][c];
      if (piece) sq.textContent = pieceMap[piece.color === 'w' ? piece.type.toUpperCase() : piece.type];
      sq.addEventListener('click', onSquareClick);
      boardEl.appendChild(sq);
    }
  }

  const turn = game.turn() === 'w' ? 'White' : 'Black';
  let text = `${turn} to move`;
  if (game.isCheckmate()) text = `Checkmate! ${turn === 'White' ? 'Black' : 'White'} won`;
  if (game.isDraw()) text = 'Draw';
  statusEl.textContent = `${text} (${mode})`;
}

function attemptMove(from, to, promotion = 'q') {
  const before = evaluate(game);
  const best = pickBestMove(game, 1).move;
  const move = game.move({ from, to, promotion });
  if (!move) return null;

  const after = evaluate(game);
  moveAudit.push({
    played: `${from}-${to}`,
    delta: after - before,
    suggested: best ? `${best.from}-${best.to}` : 'n/a'
  });

  drawBoard();

  if (ws && roomId) {
    ws.send(JSON.stringify({ type: 'move', fen: game.fen(), from, to }));
  }

  if (mode === 'ai' && !game.isGameOver() && game.turn() === 'b') {
    setTimeout(() => {
      const ai = pickBestMove(game, 2, false).move;
      if (ai) {
        game.move(ai);
        drawBoard();
      }
      if (game.isGameOver()) {
        analyzeMistakes();
      }
    }, 200);
  }

  if (game.isGameOver()) analyzeMistakes();
  return move;
}

function onSquareClick(e) {
  const sq = e.currentTarget.dataset.square;
  if (!selectedSquare) {
    selectedSquare = sq;
    drawBoard();
    return;
  }

  if (selectedSquare === sq) {
    selectedSquare = null;
    drawBoard();
    return;
  }

  const result = attemptMove(selectedSquare, sq);
  selectedSquare = null;
  if (!result) drawBoard();
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  return res.json();
}

function openSocket(id) {
  roomId = id;
  ws = new WebSocket(`${location.origin.replace('http', 'ws')}/ws?room=${id}&token=${token}`);
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'move' && msg.fen) {
      game.load(msg.fen);
      drawBoard();
    }
    if (msg.type === 'peer_joined') {
      document.getElementById('roomStatus').textContent = `${msg.user} joined room ${id}`;
    }
  };
}

document.getElementById('themeBtn').addEventListener('click', () => {
  document.body.classList.toggle('dark');
});

document.getElementById('loginBtn').addEventListener('click', async () => {
  const name = document.getElementById('nameInput').value || 'Player';
  const city = document.getElementById('cityInput').value || 'Unknown';
  const data = await api('/api/auth/guest', { method: 'POST', body: JSON.stringify({ name, city }) });
  token = data.token;
  user = data.user;
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
  document.getElementById('authStatus').textContent = `Welcome ${user.name} from ${user.city}`;
  document.getElementById('authPanel').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  await loadHistory();
  await loadLeaderboard();
});

document.querySelectorAll('[data-mode]').forEach((btn) => {
  btn.addEventListener('click', () => {
    mode = btn.dataset.mode;
    game = new Chess();
    moveAudit = [];
    drawBoard();
  });
});

document.getElementById('createRoomBtn').addEventListener('click', () => {
  const id = crypto.randomUUID().slice(0, 8);
  const share = `${location.origin}?room=${id}`;
  document.getElementById('roomStatus').textContent = `Share with friend: ${share}`;
  navigator.clipboard.writeText(share).catch(() => {});
  mode = 'multiplayer';
  openSocket(id);
});

document.getElementById('joinRoomBtn').addEventListener('click', () => {
  const id = document.getElementById('roomInput').value.trim();
  if (!id) return;
  mode = 'multiplayer';
  openSocket(id);
  document.getElementById('roomStatus').textContent = `Joined room ${id}`;
});

document.getElementById('resetBtn').addEventListener('click', () => {
  game = new Chess();
  moveAudit = [];
  coachList.innerHTML = '';
  drawBoard();
});

document.getElementById('saveBtn').addEventListener('click', async () => {
  const result = game.isCheckmate() ? (game.turn() === 'w' ? 'lose' : 'win') : 'draw';
  const mistakes = analyzeMistakes();
  await api('/api/games', {
    method: 'POST',
    body: JSON.stringify({ mode, result, pgn: game.pgn(), mistakes, accuracy: Math.max(0, 100 - mistakes.length * 12) })
  });
  await loadHistory();
  await loadLeaderboard();
});

document.getElementById('refreshBoardBtn').addEventListener('click', loadLeaderboard);

document.getElementById('upgradeBtn').addEventListener('click', async () => {
  if (!token) {
    alert('Login first');
    return;
  }
  const data = await api('/api/upgrade', { method: 'POST' });
  alert(`Pro flow ready: ${data.checkoutUrl}`);
});

document.getElementById('drillBtn').addEventListener('click', () => {
  let remaining = 60;
  const status = document.getElementById('drillStatus');
  status.textContent = `Time left: ${remaining}s`;
  const interval = setInterval(() => {
    remaining -= 1;
    status.textContent = `Time left: ${remaining}s`;
    if (remaining <= 0) {
      clearInterval(interval);
      status.textContent = 'Drill finished. Review your mistakes in AI Coach.';
    }
  }, 1000);
});

async function loadHistory() {
  if (!token) return;
  const games = await api('/api/games');
  historyEl.innerHTML = '';
  for (const g of games) {
    const li = document.createElement('li');
    li.textContent = `${new Date(g.createdAt).toLocaleString()}: ${g.mode} | ${g.result} | accuracy ${g.accuracy ?? 'n/a'}%`;
    historyEl.appendChild(li);
  }
}

async function loadLeaderboard() {
  const rows = await api('/api/leaderboard');
  leaderboardEl.innerHTML = '';
  for (const row of rows) {
    const li = document.createElement('li');
    li.textContent = `${row.city}: ${row.wins} wins`;
    leaderboardEl.appendChild(li);
  }
}

(function bootstrap() {
  if (user && token) {
    document.getElementById('authPanel').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    loadHistory();
    loadLeaderboard();
  }

  const params = new URLSearchParams(location.search);
  const room = params.get('room');
  if (room) {
    document.getElementById('roomInput').value = room;
  }

  drawBoard();
})();