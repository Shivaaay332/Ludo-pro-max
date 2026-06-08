# Ludo Pro

Multiplayer Ludo game with authentication, leaderboards, and real-time gameplay.

## Structure

```
frontend/   — React + Vite app
backend/    — Node.js + Express + Socket.io API
```

## Setup

### Backend
```bash
cd backend
npm install
PORT=3001 node server.js
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Frontend runs on port 5000 and proxies `/api` and `/socket.io` to the backend on port 3001.

## Production

```bash
cd frontend && npm run build
cd backend && NODE_ENV=production PORT=5000 node server.js
```
