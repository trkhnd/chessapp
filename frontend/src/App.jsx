import { useEffect, useMemo, useState } from 'react';
import './App.css';

const pieceChars = {
  p: '♟', r: '♜', n: '♞', b: '♝', q: '♛', k: '♚',
  P: '♙', R: '♖', N: '♘', B: '♗', Q: '♕', K: '♔'
};

const apiBase = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

export default function App() {
  const [game, setGame] = useState(null);
  const [selected, setSelected] = useState(null);
  const [mode, setMode] = useState('local');
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [status, setStatus] = useState('Welcome to Chess Master');

  useEffect(() => {
    if (window.Chess) setGame(new window.Chess());
    else setStatus('Chess engine failed to load. Check internet for chess.js CDN.');
  }, []);

  const squares = useMemo(() => (game ? game.board() : []), [game]);

  const onSquare = (sq) => {
    if (!game) return;
    const piece = game.get(sq);
    const canPick = piece && piece.color === game.turn();

    if (!selected) {
      if (canPick) setSelected(sq);
      return;
    }

    const move = game.move({ from: selected, to: sq, promotion: 'q' });
    if (!move && canPick) {
      setSelected(sq);
      return;
    }
    setSelected(null);
    setGame(new window.Chess(game.fen()));

    if (mode === 'ai' && game.turn() === 'b' && !game.isGameOver()) {
      setTimeout(() => {
        const moves = game.moves({ verbose: true });
        if (moves.length) game.move(moves[Math.floor(Math.random() * moves.length)]);
        setGame(new window.Chess(game.fen()));
      }, 260);
    }
  };

  const login = async () => {
    const res = await fetch(`${apiBase}/api/auth/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, city })
    });
    const data = await res.json();
    setToken(data.token);
    localStorage.setItem('token', data.token);
    setStatus(`Logged in as ${data.user.name}`);
  };

  return (
    <main className="page">
      <header>
        <h1>♟ Chess Master</h1>
        <p>Play local, vs AI, or online room multiplayer</p>
      </header>

      <section className="auth">
        <input placeholder="Nickname" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} />
        <button onClick={login}>{token ? 'Re-login' : 'Create nickname / login'}</button>
      </section>

      <section className="modes">
        <button onClick={() => { setMode('local'); setGame(new window.Chess()); }}>Local</button>
        <button onClick={() => { setMode('ai'); setGame(new window.Chess()); }}>Play vs AI</button>
      </section>

      <p className="status">{status}</p>

      <div className="board">
        {squares.flatMap((rank, r) => rank.map((piece, f) => {
          const sq = `${String.fromCharCode(97 + f)}${8 - r}`;
          const isDark = (r + f) % 2;
          return (
            <button
              key={sq}
              className={`sq ${isDark ? 'dark' : 'light'} ${selected === sq ? 'selected' : ''}`}
              onClick={() => onSquare(sq)}
            >
              {piece ? pieceChars[piece.color === 'w' ? piece.type.toUpperCase() : piece.type] : ''}
            </button>
          );
        }))}
      </div>
    </main>
  );
}
