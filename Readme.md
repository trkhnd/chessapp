# Chess Master

Professional starter monorepo for a chess platform.

## Structure
- `backend/` - Express + WebSocket API
- `frontend/` - React (Vite) client

## Run backend
```bash
cd backend
npm install
npm start
```
Runs on `http://localhost:4000`.

## Run frontend
```bash
cd frontend
npm install
npm run dev
```
Runs on `http://localhost:5173`.

Set API URL in `frontend/.env` using `.env.example`.

## Features included
- Guest authorization (nickname + city)
- Save/list games API
- Leaderboard API
- WebSocket room relay for multiplayer
- Play local and basic vs AI frontend mode

## Next upgrades
- JWT auth + DB (Postgres/Supabase)
- Proper Stockfish integration in Web Worker
- Matchmaking + ELO ratings
- Stripe payments + premium skins
