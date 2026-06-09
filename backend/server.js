const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// FIXED: SSL Connection setting add ki hai jo Supabase ko Render se jodne ke liye zaroori hai
const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'ludo_secret_key_2024',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

// NAYA: Ek simple check route banaya hai taaki hum dekh sakein backend live hua ya nahi
app.get('/', (req, res) => {
    res.send('🎲 Ludo Pro Max Backend is Live and Running! 🚀');
});

async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) NOT NULL UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                wins INTEGER DEFAULT 0,
                games_played INTEGER DEFAULT 0,
                kills INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS game_sessions2 (
                id SERIAL PRIMARY KEY,
                room_id VARCHAR(50),
                played_at TIMESTAMP DEFAULT NOW(),
                total_players INTEGER
            );
            CREATE TABLE IF NOT EXISTS game_results (
                id SERIAL PRIMARY KEY,
                session_id INTEGER REFERENCES game_sessions2(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                username VARCHAR(50),
                color VARCHAR(10),
                rank INTEGER,
                kills INTEGER DEFAULT 0
            );
        `);
        console.log('Database initialized successfully');
    } catch (err) {
        console.error('DB init error:', err.message);
    }
}
initDB();

// ── AUTH API ─────────────────────────────────────────────────────────────────
app.post('/api/auth/signup', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.json({ success: false, error: 'Username and password required' });
    if (username.length < 3 || username.length > 20) return res.json({ success: false, error: 'Username must be 3-20 characters' });
    if (password.length < 6) return res.json({ success: false, error: 'Password must be at least 6 characters' });
    if (!/^[a-zA-Z0-9_]+$/.test(username)) return res.json({ success: false, error: 'Username: only letters, numbers, underscores' });

    try {
        const hash = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username',
            [username, hash]
        );
        req.session.userId = result.rows[0].id;
        req.session.username = result.rows[0].username;
        res.json({ success: true, username: result.rows[0].username });
    } catch (err) {
        if (err.code === '23505') return res.json({ success: false, error: 'Username already taken' });
        res.json({ success: false, error: 'Server error' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.json({ success: false, error: 'Username and password required' });

    try {
        const result = await pool.query('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [username]);
        if (result.rows.length === 0) return res.json({ success: false, error: 'Invalid username or password' });

        const user = result.rows[0];
        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) return res.json({ success: false, error: 'Invalid username or password' });

        req.session.userId = user.id;
        req.session.username = user.username;
        res.json({ success: true, username: user.username });
    } catch (err) {
        res.json({ success: false, error: 'Server error' });
    }
});

app.post('/api/auth/logout', (req, res) => {
    req.session.destroy(() => res.json({ success: true }));
});

app.get('/api/auth/me', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
    try {
        const result = await pool.query(
            'SELECT id, username, wins, games_played, kills, created_at FROM users WHERE id = $1',
            [req.session.userId]
        );
        if (result.rows.length === 0) return res.status(401).json({ error: 'User not found' });
        res.json({ success: true, user: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ── LEADERBOARD & STATS API ──────────────────────────────────────────────────
app.get('/api/leaderboard', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT username, wins, games_played, kills,
                   CASE WHEN games_played > 0 THEN ROUND((wins::numeric / games_played) * 100, 1) ELSE 0 END AS win_rate
            FROM users
            WHERE games_played > 0
            ORDER BY wins DESC, kills DESC, games_played ASC
            LIMIT 20
        `);
        res.json({ success: true, players: result.rows });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

app.get('/api/dashboard', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
    try {
        const userResult = await pool.query(
            'SELECT username, wins, games_played, kills, created_at FROM users WHERE id = $1',
            [req.session.userId]
        );
        const lbResult = await pool.query(`
            SELECT username, wins, games_played, kills,
                   CASE WHEN games_played > 0 THEN ROUND((wins::numeric / games_played) * 100, 1) ELSE 0 END AS win_rate
            FROM users WHERE games_played > 0
            ORDER BY wins DESC LIMIT 5
        `);
        const recentResult = await pool.query(`
            SELECT gr.color, gr.rank, gr.kills, gs.played_at, gs.total_players
            FROM game_results gr
            JOIN game_sessions2 gs ON gr.session_id = gs.id
            WHERE gr.user_id = $1
            ORDER BY gs.played_at DESC
            LIMIT 5
        `, [req.session.userId]);

        res.json({
            success: true,
            user: userResult.rows[0],
            leaderboard: lbResult.rows,
            recentGames: recentResult.rows
        });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

app.get('/api/profile', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
    try {
        const userResult = await pool.query(
            'SELECT username, wins, games_played, kills, created_at FROM users WHERE id = $1',
            [req.session.userId]
        );
        const historyResult = await pool.query(`
            SELECT gr.color, gr.rank, gr.kills, gs.played_at, gs.total_players
            FROM game_results gr
            JOIN game_sessions2 gs ON gr.session_id = gs.id
            WHERE gr.user_id = $1
            ORDER BY gs.played_at DESC
            LIMIT 20
        `, [req.session.userId]);

        const rankCounts = await pool.query(`
            SELECT rank, COUNT(*) as count
            FROM game_results WHERE user_id = $1
            GROUP BY rank ORDER BY rank
        `, [req.session.userId]);

        res.json({
            success: true,
            user: userResult.rows[0],
            history: historyResult.rows,
            rankCounts: rankCounts.rows
        });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// ── SOCKET.IO GAME ───────────────────────────────────────────────────────────
const rooms = {};
const assignmentOrder = ['blue', 'green', 'red', 'yellow'];
const turnOrder = ['blue', 'red', 'green', 'yellow'];

function getOppositeColor(c) {
    if (c === 'blue') return 'green';
    if (c === 'green') return 'blue';
    if (c === 'red') return 'yellow';
    if (c === 'yellow') return 'red';
    return 'green';
}

io.on('connection', (socket) => {
    socket.on('joinRoom', (data) => {
        let roomId = data.id;
        let playerName = data.name || 'Player';
        if (!roomId || typeof roomId !== 'string') return;
        if (!rooms[roomId]) {
            rooms[roomId] = { players: [], host: socket.id, status: 'waiting', activeColors: [], rollStats: {}, turnColor: '', pendingRequests: {}, kills: {} };
        }
        let room = rooms[roomId];
        if (room.players.some(p => p.id === socket.id)) {
            let pIndex = room.players.findIndex(p => p.id === socket.id);
            socket.emit('joined', { color: room.players[pIndex].color, roomId, isHost: room.host === socket.id, name: room.players[pIndex].name });
            io.to(roomId).emit('updatePlayers', { players: room.players, hostId: room.host });
            return;
        }
        let availableColors = assignmentOrder.filter(c => !room.players.some(p => p.color === c));
        if (availableColors.length === 0) return socket.emit('errorMsg', 'Room is full!');
        if (room.status === 'playing') {
            socket.emit('waitingForHostApproval');
            room.pendingRequests[socket.id] = playerName;
            io.to(room.host).emit('joinRequest', { requesterId: socket.id, requesterName: playerName });
            return;
        }
        let assignedColor = availableColors[0];
        room.players.push({ id: socket.id, color: assignedColor, online: true, name: playerName });
        socket.join(roomId);
        socket.emit('joined', { color: assignedColor, roomId, isHost: room.host === socket.id, name: playerName });
        io.to(roomId).emit('updatePlayers', { players: room.players, hostId: room.host });
    });

    socket.on('handleJoinRequest', (data) => {
        let room = rooms[data.roomId];
        if (!room || room.host !== socket.id) return;
        let reqSocket = io.sockets.sockets.get(data.requesterId);
        if (!reqSocket) return;
        if (data.accepted && room.players.length < 4) {
            let availableColors = assignmentOrder.filter(c => !room.players.some(p => p.color === c));
            let assignedColor = availableColors[0];
            let reqName = room.pendingRequests[data.requesterId] || 'Player';
            room.players.push({ id: data.requesterId, color: assignedColor, online: true, name: reqName });
            delete room.pendingRequests[data.requesterId];
            room.activeColors = room.players.map(p => p.color);
            room.activeColors.sort((a, b) => turnOrder.indexOf(a) - turnOrder.indexOf(b));
            room.rollStats[assignedColor] = { count: 0, target: Math.floor(Math.random() * 3) + 4 };
            room.kills[assignedColor] = 0;
            reqSocket.join(data.roomId);
            reqSocket.emit('joined', { color: assignedColor, roomId: data.roomId, isHost: false, name: reqName });
            io.to(data.roomId).emit('updatePlayers', { players: room.players, hostId: room.host });
            io.to(data.roomId).emit('midGameJoin', { activeColors: room.activeColors, newColor: assignedColor, turnColor: room.turnColor, gameState: data.currentGameState });
        } else {
            reqSocket.emit('errorMsg', 'Host rejected your request or room is full.');
            if (room.pendingRequests[data.requesterId]) delete room.pendingRequests[data.requesterId];
        }
    });

    socket.on('kickPlayer', (data) => {
        let room = rooms[data.roomId];
        if (room && room.host === socket.id) {
            let pIndex = room.players.findIndex(p => p.id === data.targetId);
            if (pIndex !== -1) {
                let kickedColor = room.players[pIndex].color;
                if (room.status === 'playing' && room.turnColor === kickedColor && room.activeColors.length > 1) {
                    let ci = room.activeColors.indexOf(kickedColor);
                    room.turnColor = room.activeColors[(ci + 1) % room.activeColors.length];
                    io.to(data.roomId).emit('turnChanged', { color: room.turnColor });
                }
                room.players.splice(pIndex, 1);
                if (room.players.length === 2 && room.status === 'playing') {
                    let hostP = room.players.find(p => p.id === room.host);
                    let oppP = room.players.find(p => p.id !== room.host);
                    if (hostP && oppP) {
                        let targetOpp = getOppositeColor(hostP.color);
                        if (oppP.color !== targetOpp) {
                            let oldColor = oppP.color;
                            oppP.color = targetOpp;
                            room.rollStats[targetOpp] = room.rollStats[oldColor];
                            delete room.rollStats[oldColor];
                            room.kills[targetOpp] = room.kills[oldColor] || 0;
                            delete room.kills[oldColor];
                            if (room.turnColor === oldColor) room.turnColor = targetOpp;
                            io.to(data.roomId).emit('migrateColor', { oldColor, newColor: targetOpp });
                        }
                    }
                }
                room.activeColors = room.players.map(p => p.color);
                room.activeColors.sort((a, b) => turnOrder.indexOf(a) - turnOrder.indexOf(b));
                let targetSocket = io.sockets.sockets.get(data.targetId);
                if (targetSocket) { targetSocket.emit('kickedOut'); targetSocket.leave(data.roomId); }
                io.to(data.roomId).emit('updatePlayers', { players: room.players, hostId: room.host });
                io.to(data.roomId).emit('playerKicked', { color: kickedColor, activeColors: room.activeColors });
                if (room.players.length === 0) delete rooms[data.roomId];
            }
        }
    });

    socket.on('startGame', (roomId) => {
        let room = rooms[roomId];
        if (room && room.host === socket.id && room.players.length > 0) {
            room.status = 'playing';
            room.activeColors = room.players.map(p => p.color);
            room.activeColors.sort((a, b) => turnOrder.indexOf(a) - turnOrder.indexOf(b));
            room.turnColor = room.activeColors[0];
            room.kills = {};
            room.activeColors.forEach(c => {
                room.rollStats[c] = { count: 0, target: Math.floor(Math.random() * 3) + 4 };
                room.kills[c] = 0;
            });
            io.to(roomId).emit('gameStarted', { activeColors: room.activeColors, turnColor: room.turnColor });
        }
    });

    socket.on('restartGame', (roomId) => {
        let room = rooms[roomId];
        if (room && room.host === socket.id) {
            room.kills = {};
            room.turnColor = room.activeColors[0];
            room.activeColors.forEach(c => {
                room.rollStats[c] = { count: 0, target: Math.floor(Math.random() * 3) + 4 };
                room.kills[c] = 0;
            });
            io.to(roomId).emit('gameRestarted', { activeColors: room.activeColors, turnColor: room.turnColor });
        }
    });

    socket.on('rollDice', (data) => {
        let room = rooms[data.roomId];
        if (!room || room.turnColor !== data.color) return;
        if (!room.rollStats[data.color]) room.rollStats[data.color] = { count: 0, target: 4 };
        let stats = room.rollStats[data.color];
        stats.count++;
        let roll = Math.floor(Math.random() * 6) + 1;
        if (stats.count >= stats.target) roll = 6;
        if (roll === 6) { stats.count = 0; stats.target = Math.floor(Math.random() * 3) + 4; }
        io.to(data.roomId).emit('diceRolled', { color: data.color, roll });
    });

    socket.on('moveToken', (data) => { io.to(data.roomId).emit('tokenMoved', { color: data.color, idx: data.idx, roll: data.roll }); });

    socket.on('passTurn', (data) => {
        let room = rooms[data.roomId];
        if (room && room.status === 'playing' && room.activeColors.length > 0) {
            let idx = room.activeColors.indexOf(room.turnColor);
            room.turnColor = room.activeColors[(idx + 1) % room.activeColors.length];
            io.to(data.roomId).emit('turnChanged', { color: room.turnColor });
        }
    });

    socket.on('reportKill', (data) => {
        let room = rooms[data.roomId];
        if (!room) return;
        if (!room.kills[data.color]) room.kills[data.color] = 0;
        room.kills[data.color]++;
    });

    socket.on('gameFinished', async (data) => {
        let room = rooms[data.roomId];
        if (!room || room.host !== socket.id) return;
        try {
            const sessionResult = await pool.query(
                'INSERT INTO game_sessions2 (room_id, total_players) VALUES ($1, $2) RETURNING id',
                [data.roomId, data.rankings.length]
            );
            const sessionId = sessionResult.rows[0].id;
            for (const entry of data.rankings) {
                const kills = (room.kills && room.kills[entry.color]) || 0;
                const userResult = await pool.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [entry.name]);
                const userId = userResult.rows.length > 0 ? userResult.rows[0].id : null;

                await pool.query(
                    'INSERT INTO game_results (session_id, user_id, username, color, rank, kills) VALUES ($1, $2, $3, $4, $5, $6)',
                    [sessionId, userId, entry.name, entry.color, entry.rank, kills]
                );

                if (userId) {
                    await pool.query(`
                        UPDATE users SET
                            wins = wins + $1,
                            games_played = games_played + 1,
                            kills = kills + $2,
                            updated_at = NOW()
                        WHERE id = $3
                    `, [entry.rank === 1 ? 1 : 0, kills, userId]);
                }
            }
            io.to(data.roomId).emit('scoreSaved', { success: true });
        } catch (err) {
            console.error('Error saving game result:', err.message);
            io.to(data.roomId).emit('scoreSaved', { success: false });
        }
    });

    socket.on('sendInteraction', (data) => { io.to(data.roomId).emit('showInteraction', { color: data.color, type: data.type, content: data.content }); });

    socket.on('disconnect', () => {
        for (let roomId in rooms) {
            let room = rooms[roomId];
            if (room.pendingRequests && room.pendingRequests[socket.id]) delete room.pendingRequests[socket.id];
            let pIndex = room.players.findIndex(p => p.id === socket.id);
            if (pIndex !== -1) {
                room.players[pIndex].online = false;
                io.to(roomId).emit('playerStatus', { color: room.players[pIndex].color, status: 'offline' });
                if (room.players.every(p => !p.online)) {
                    delete rooms[roomId];
                } else if (room.host === socket.id) {
                    let newHost = room.players.find(p => p.online);
                    if (newHost) { room.host = newHost.id; io.to(roomId).emit('updatePlayers', { players: room.players, hostId: room.host }); }
                }
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => { console.log(`Server running on port ${PORT}`); });