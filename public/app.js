const pieceChars = {
  p: '♟', r: '♜', n: '♞', b: '♝', q: '♛', k: '♚',
  P: '♙', R: '♖', N: '♘', B: '♗', Q: '♕', K: '♔'
};

const valueByPiece = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const savedTheme = localStorage.getItem('theme') || 'dark';
document.documentElement.dataset.theme = savedTheme;

const state = {
  token: localStorage.getItem('token') || '',
  user: null,
  game: null,
  selected: null,
  mode: 'local',
  ws: null,
  roomId: '',
  drillDeadline: 0,
  drillInterval: null,
  lastMoveAt: Date.now(),
  aiThinking: false
};

const el = {
  authPanel: document.getElementById('authPanel'),
  app: document.getElementById('app'),
  status: document.getElementById('status'),
  board: document.getElementById('board'),
  loginBtn: document.getElementById('loginBtn'),
  nameInput: document.getElementById('nameInput'),
  cityInput: document.getElementById('cityInput'),
  authStatus: document.getElementById('authStatus'),
  themeBtn: document.getElementById('themeBtn'),
  upgradeBtn: document.getElementById('upgradeBtn'),
  resetBtn: document.getElementById('resetBtn'),
  saveBtn: document.getElementById('saveBtn'),
  roomStatus: document.getElementById('roomStatus'),
  roomInput: document.getElementById('roomInput'),
  createRoomBtn: document.getElementById('createRoomBtn'),
  joinRoomBtn: document.getElementById('joinRoomBtn'),
  coachList: document.getElementById('coachList'),
  history: document.getElementById('history'),
  refreshBoardBtn: document.getElementById('refreshBoardBtn'),
  leaderboard: document.getElementById('leaderboard'),
  drillBtn: document.getElementById('drillBtn'),
  drillStatus: document.getElementById('drillStatus')
};


async function ensureChessLoaded() {
  if (typeof Chess !== 'undefined') return true;

  const sources = [
    'https://cdn.jsdelivr.net/npm/chess.js@1.4.0/dist/chess.min.js',
    'https://unpkg.com/chess.js@1.4.0/dist/chess.min.js'
  ];

  for (const src of sources) {
    try {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
      if (typeof Chess !== 'undefined') return true;
    } catch {
      // try next source
    }
  }
  return false;
}

function ensureGame() {
  if (!state.game && typeof Chess !== 'undefined') {
    state.game = new Chess();
  }
  return !!state.game;
}

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(path, { ...opts, headers });
  if (!res.ok) {
    const msg = (await res.json().catch(() => ({}))).error || res.statusText;
    throw new Error(msg);
  }
  return res.json();
}

function renderBoard() {
  if (!ensureGame()) {
    el.status.textContent = "Chess engine failed to load. Please open via npm start and http://localhost:3000";
    return;
  }
  const board = state.game.board();
  el.board.innerHTML = '';

  board.forEach((rank, rankIndex) => {
    rank.forEach((piece, fileIndex) => {
      const sq = `${String.fromCharCode(97 + fileIndex)}${8 - rankIndex}`;
      const cell = document.createElement('button');
      cell.className = `sq ${(rankIndex + fileIndex) % 2 ? 'dark' : 'light'}`;
      if (state.selected === sq) cell.classList.add('selected');

      const legalTargets = state.selected ? state.game.moves({ square: state.selected, verbose: true }).map(m => m.to) : [];
      if (legalTargets.includes(sq)) cell.classList.add('hint');

      cell.dataset.square = sq;
      cell.textContent = piece ? pieceChars[piece.color === 'w' ? piece.type.toUpperCase() : piece.type] : '';
      cell.addEventListener('click', () => onSquareClick(sq));
      el.board.appendChild(cell);
    });
  });
  renderStatus();
}

function renderStatus() {
  let text = `Mode: ${state.mode.toUpperCase()} · Turn: ${state.game.turn() === 'w' ? 'White' : 'Black'}`;
  if (state.game.inCheck()) text += ' · Check!';
  if (state.game.isGameOver()) {
    if (state.game.isCheckmate()) text = `Checkmate! ${state.game.turn() === 'w' ? 'Black' : 'White'} wins.`;
    else if (state.game.isStalemate()) text = 'Stalemate.';
    else if (state.game.isDraw()) text = 'Draw.';
  }
  el.status.textContent = text;
}

function onSquareClick(square) {
  if (state.aiThinking) return;
  if (state.game.isGameOver()) return;

  const piece = state.game.get(square);
  const canPick = piece && piece.color === state.game.turn();

  if (!state.selected) {
    if (canPick) state.selected = square;
    renderBoard();
    return;
  }

  const move = tryMove(state.selected, square);
  if (!move && canPick) {
    state.selected = square;
    renderBoard();
    return;
  }
  state.selected = null;
  renderBoard();
}

function maybePromotion(from, to) {
  const piece = state.game.get(from);
  if (!piece || piece.type !== 'p') return undefined;
  if ((piece.color === 'w' && to.endsWith('8')) || (piece.color === 'b' && to.endsWith('1'))) return 'q';
  return undefined;
}

function tryMove(from, to, skipBroadcast = false) {
  const promotion = maybePromotion(from, to);
  const move = state.game.move({ from, to, promotion });
  if (!move) return null;
  state.lastMoveAt = Date.now();

  if (!skipBroadcast && state.ws && state.ws.readyState === 1) {
    state.ws.send(JSON.stringify({ type: 'move', move: { from, to, promotion } }));
  }

  renderBoard();

  if (state.mode === 'ai' && !state.game.isGameOver() && state.game.turn() === 'b') {
    setTimeout(makeAiMove, 200);
  }

  if (state.game.isGameOver()) {
    showCoach();
  }

  return move;
}

function scoreBoard(game) {
  let score = 0;
  const b = game.board();
  for (const rank of b) {
    for (const p of rank) {
      if (!p) continue;
      const val = valueByPiece[p.type] || 0;
      score += p.color === 'w' ? val : -val;
    }
  }
  return score;
}

function pickAiMove() {
  const moves = state.game.moves({ verbose: true });
  if (!moves.length) return null;

  let best = moves[0];
  let bestScore = Infinity;

  for (const mv of moves) {
    const g = new Chess(state.game.fen());
    g.move(mv);
    if (g.isCheckmate()) return mv;

    const replies = g.moves({ verbose: true });
    let worstReplyScore = -Infinity;
    for (const rep of replies) {
      const gg = new Chess(g.fen());
      gg.move(rep);
      worstReplyScore = Math.max(worstReplyScore, scoreBoard(gg));
    }

    const score = replies.length ? worstReplyScore : scoreBoard(g);
    if (score < bestScore) {
      bestScore = score;
      best = mv;
    }
  }
  return best;
}

function makeAiMove() {
  state.aiThinking = true;
  const move = pickAiMove();
  if (move) {
    state.game.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });
  }
  state.aiThinking = false;
  renderBoard();
  if (state.game.isGameOver()) showCoach();
}

function showCoach() {
  const list = analyzeMistakes(state.game.history({ verbose: true }));
  el.coachList.innerHTML = '';
  if (!list.length) {
    el.coachList.innerHTML = '<li>Solid game. No major blunders found by lightweight coach.</li>';
    return;
  }
  for (const item of list.slice(0, 4)) {
    const li = document.createElement('li');
    li.textContent = `${item.side}: ${item.note}`;
    el.coachList.appendChild(li);
  }
}

function analyzeMistakes(history) {
  const notes = [];
  const game = new Chess();

  history.forEach((mv, idx) => {
    const before = scoreBoard(game);
    game.move(mv);
    const after = scoreBoard(game);
    const delta = after - before;

    if (mv.color === 'w' && delta < -2) {
      notes.push({ side: 'White', note: `${idx + 1}. ${mv.san} dropped material (~${Math.abs(delta).toFixed(1)}).` });
    }
    if (mv.color === 'b' && delta > 2) {
      notes.push({ side: 'Black', note: `${idx + 1}. ${mv.san} dropped material (~${Math.abs(delta).toFixed(1)}).` });
    }
  });

  return notes;
}

function setMode(mode) {
  state.mode = mode;
  if (!ensureGame()) return;
  state.game = new Chess();
  state.selected = null;
  renderBoard();
  el.roomStatus.textContent = `Mode set to ${mode}`;
}

function connectRoom(roomId) {
  if (!state.token) return;
  if (state.ws) state.ws.close();
  state.roomId = roomId;
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${protocol}://${location.host}/ws?room=${roomId}&token=${state.token}`);
  state.ws = ws;
  state.mode = 'multiplayer';

  ws.onopen = () => {
    el.roomStatus.textContent = `Connected to room ${roomId}. Share this code.`;
    history.replaceState({}, '', `${location.pathname}?room=${roomId}`);
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'move' && msg.move) {
      tryMove(msg.move.from, msg.move.to, true);
    }
    if (msg.type === 'peer_joined') {
      el.roomStatus.textContent = `${msg.user} joined your room.`;
    }
  };

  ws.onclose = () => {
    el.roomStatus.textContent = 'Room connection closed';
  };
}

function startDrill(seconds = 60) {
  clearInterval(state.drillInterval);
  state.drillDeadline = Date.now() + seconds * 1000;
  state.lastMoveAt = Date.now();
  state.drillStatus.textContent = `Drill running: ${seconds}s`;

  state.drillInterval = setInterval(() => {
    const left = Math.max(0, Math.ceil((state.drillDeadline - Date.now()) / 1000));
    el.drillStatus.textContent = `Time left: ${left}s`;

    if (Date.now() - state.lastMoveAt > 12000) {
      el.drillStatus.textContent = 'Timeout pressure! Make a move every 12s.';
    }

    if (left <= 0) {
      clearInterval(state.drillInterval);
      el.drillStatus.textContent = 'Drill ended. Save game to log performance.';
    }
  }, 1000);
}

async function saveGame() {
  if (!state.token) {
    alert('Login first to save your game history.');
    return;
  }
  const result = state.game.isCheckmate() ? (state.game.turn() === 'w' ? 'win' : 'loss') : 'draw';
  const mistakes = analyzeMistakes(state.game.history({ verbose: true }));

  await api('/api/games', {
    method: 'POST',
    body: JSON.stringify({
      mode: state.mode,
      pgn: state.game.pgn(),
      result,
      accuracy: Math.max(50, 100 - mistakes.length * 8),
      mistakes: mistakes.map((m) => m.note)
    })
  });

  await Promise.all([loadHistory(), loadLeaderboard()]);
  el.roomStatus.textContent = 'Game saved ✔';
}

async function loadHistory() {
  if (!state.token) return;
  const games = await api('/api/games');
  el.history.innerHTML = games.length
    ? games.map(g => `<li><strong>${g.mode}</strong> · ${g.result} · ${new Date(g.createdAt).toLocaleString()}<br><code>${g.pgn.slice(0, 120)}...</code></li>`).join('')
    : '<li>No saved games yet</li>';
}

async function loadLeaderboard() {
  const items = await api('/api/leaderboard');
  el.leaderboard.innerHTML = items.length
    ? items.map(i => `<li>${i.city}: <strong>${i.wins}</strong> wins</li>`).join('')
    : '<li>No games yet</li>';
}

async function login() {
  const name = el.nameInput.value.trim() || 'Player';
  const city = el.cityInput.value.trim() || 'Unknown';
  const data = await api('/api/auth/guest', {
    method: 'POST',
    body: JSON.stringify({ name, city })
  });
  state.token = data.token;
  state.user = data.user;
  localStorage.setItem('token', data.token);
  el.authStatus.textContent = `Welcome, ${state.user.name} from ${state.user.city}`;
  showApp();
}

function showApp() {
  el.authPanel.classList.add('hidden');
  renderBoard();
  loadHistory();
  loadLeaderboard();

  const roomFromUrl = new URLSearchParams(location.search).get('room');
  if (roomFromUrl) {
    el.roomInput.value = roomFromUrl;
    connectRoom(roomFromUrl);
  }
}

async function boot() {
  const loaded = await ensureChessLoaded();
  if (!loaded) {
    el.status.textContent = "Could not load chess library. Use npm start and open localhost.";
  }
  ensureGame();
  el.themeBtn.onclick = () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('theme', next);
  };

  el.upgradeBtn.onclick = async () => {
    if (!state.token) return alert('Login first');
    const res = await api('/api/upgrade', { method: 'POST' });
    alert(`${res.message}\n${res.checkoutUrl}`);
  };

  el.loginBtn.onclick = () => login().catch(e => (el.authStatus.textContent = e.message));
  el.resetBtn.onclick = () => setMode(state.mode === 'multiplayer' ? 'multiplayer' : 'local');
  el.saveBtn.onclick = () => saveGame().catch(e => (el.roomStatus.textContent = e.message));
  el.refreshBoardBtn.onclick = () => loadLeaderboard();
  el.drillBtn.onclick = () => startDrill(60);
  el.createRoomBtn.onclick = () => {
    const roomId = Math.random().toString(36).slice(2, 8);
    el.roomInput.value = roomId;
    connectRoom(roomId);
  };
  el.joinRoomBtn.onclick = () => {
    const roomId = el.roomInput.value.trim();
    if (roomId) connectRoom(roomId);
  };

  document.querySelectorAll('[data-mode]').forEach((btn) => {
    btn.onclick = () => setMode(btn.dataset.mode);
  });

  if (state.token) {
    try {
      state.user = await api('/api/me');
      showApp();
    } catch {
      localStorage.removeItem('token');
      state.token = '';
    }
  }

  renderBoard();
  loadLeaderboard();
}

boot();
