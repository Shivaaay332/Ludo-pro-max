const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const path = require('path');
const crypto = require('crypto');

const app = express();

// YAHAN SECURITY FIX KIYA HAI: Vercel aur Render ke beech Cookies allow karne ke liye
app.set('trust proxy', 1);

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Token storage: { token: userId }
const authTokens = {};

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// YAHAN COOKIE SETTINGS FIX KI HAIN
app.use(session({
    secret: process.env.SESSION_SECRET || 'ludo_secret_key_2024',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        maxAge: 7 * 24 * 60 * 60 * 1000,
        secure: true,      // Cloud par HTTPS ke liye zaroori
        sameSite: 'none'   // Cross-domain (Vercel se Render) ke liye zaroori
    }
}));

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
            CREATE TABLE IF NOT EXISTS friends (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                friend_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                status VARCHAR(20) DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(user_id, friend_id)
            );
            CREATE TABLE IF NOT EXISTS friend_requests (
                id SERIAL PRIMARY KEY,
                from_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                to_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                status VARCHAR(20) DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(from_user_id, to_user_id)
            );
            CREATE TABLE IF NOT EXISTS online_users (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
                socket_id VARCHAR(100),
                last_seen TIMESTAMP DEFAULT NOW()
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

        // Generate persistent token
        const token = generateToken();
        authTokens[token] = user.id;
        
        req.session.userId = user.id;
        req.session.username = user.username;
        res.json({ success: true, username: user.username, token });
    } catch (err) {
        res.json({ success: false, error: 'Server error' });
    }
});

app.post('/api/auth/logout', (req, res) => {
    // Clear token if provided
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        delete authTokens[token];
    }
    req.session.destroy(() => res.json({ success: true }));
});

// Clear all tokens for a user (for logout everywhere)
app.post('/api/auth/logout-all', (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        delete authTokens[token];
    }
    req.session.destroy(() => res.json({ success: true }));
});

app.get('/api/auth/me', async (req, res) => {
    // Check session first
    let userId = req.session.userId;
    
    // Then check token in Authorization header
    if (!userId) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            userId = authTokens[token];
        }
    }
    
    // Also check token in query param for convenience
    if (!userId && req.query.token) {
        userId = authTokens[req.query.token];
    }
    
    if (!userId) return res.status(401).json({ error: 'Not logged in' });
    
    try {
        const result = await pool.query(
            'SELECT id, username, wins, games_played, kills, created_at FROM users WHERE id = $1',
            [userId]
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

// ── FRIENDS API ─────────────────────────────────────────────────────────────────
app.get('/api/friends', async (req, res) => {
    let userId = req.session.userId;
    if (!userId) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            userId = authTokens[token];
        }
    }
    if (!userId) return res.status(401).json({ error: 'Not logged in' });
    
    try {
        // Get accepted friends
        const friends = await pool.query(`
            SELECT u.id, u.username, u.wins, u.games_played, u.kills,
                   CASE WHEN u.games_played > 0 THEN ROUND((u.wins::numeric / u.games_played) * 100, 1) ELSE 0 END AS win_rate,
                   CASE WHEN ou.socket_id IS NOT NULL THEN true ELSE false END AS is_online
            FROM friends f
            JOIN users u ON (f.friend_id = u.id OR f.user_id = u.id) AND u.id != $1
            LEFT JOIN online_users ou ON u.id = ou.user_id
            WHERE (f.user_id = $1 OR f.friend_id = $1) AND f.status = 'accepted'
        `, [userId]);
        
        // Get pending requests sent by me
        const sentRequests = await pool.query(`
            SELECT u.id, u.username, fr.created_at
            FROM friend_requests fr
            JOIN users u ON fr.to_user_id = u.id
            WHERE fr.from_user_id = $1 AND fr.status = 'pending'
        `, [userId]);
        
        // Get pending requests received by me
        const receivedRequests = await pool.query(`
            SELECT u.id, u.username, fr.created_at
            FROM friend_requests fr
            JOIN users u ON fr.from_user_id = u.id
            WHERE fr.to_user_id = $1 AND fr.status = 'pending'
        `, [userId]);
        
        res.json({
            success: true,
            friends: friends.rows,
            sentRequests: sentRequests.rows,
            receivedRequests: receivedRequests.rows
        });
    } catch (err) {
        console.error('Friends error:', err.message);
        res.json({ success: false, error: err.message });
    }
});

app.post('/api/friends/send', async (req, res) => {
    let userId = req.session.userId;
    if (!userId) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            userId = authTokens[token];
        }
    }
    if (!userId) return res.status(401).json({ error: 'Not logged in' });
    
    const { username } = req.body;
    if (!username) return res.json({ success: false, error: 'Username required' });
    
    try {
        // Find the user to send request to
        const targetResult = await pool.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [username]);
        if (targetResult.rows.length === 0) return res.json({ success: false, error: 'User not found' });
        const targetId = targetResult.rows[0].id;
        
        if (targetId === userId) return res.json({ success: false, error: 'Cannot add yourself' });
        
        // Check if already friends or request exists
        const existing = await pool.query(`
            SELECT id FROM friend_requests 
            WHERE (from_user_id = $1 AND to_user_id = $2) 
               OR (from_user_id = $2 AND to_user_id = $1)
        `, [userId, targetId]);
        
        if (existing.rows.length > 0) return res.json({ success: false, error: 'Request already exists' });
        
        // Also check friends table
        const existingFriend = await pool.query(`
            SELECT id FROM friends 
            WHERE (user_id = $1 AND friend_id = $2) 
               OR (user_id = $2 AND friend_id = $1)
        `, [userId, targetId]);
        
        if (existingFriend.rows.length > 0) return res.json({ success: false, error: 'Already friends' });
        
        await pool.query(
            'INSERT INTO friend_requests (from_user_id, to_user_id) VALUES ($1, $2)',
            [userId, targetId]
        );
        
        res.json({ success: true, message: 'Friend request sent!' });
    } catch (err) {
        if (err.code === '23505') return res.json({ success: false, error: 'Request already exists' });
        res.json({ success: false, error: err.message });
    }
});

app.post('/api/friends/accept', async (req, res) => {
    let userId = req.session.userId;
    if (!userId) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            userId = authTokens[token];
        }
    }
    if (!userId) return res.status(401).json({ error: 'Not logged in' });
    
    const { fromUserId } = req.body;
    if (!fromUserId) return res.json({ success: false, error: 'User ID required' });
    
    try {
        // Update request status
        await pool.query(
            'UPDATE friend_requests SET status = $1 WHERE from_user_id = $2 AND to_user_id = $3',
            ['accepted', fromUserId, userId]
        );
        
        // Add to friends table
        await pool.query(
            'INSERT INTO friends (user_id, friend_id, status) VALUES ($1, $2, $3)',
            [userId, fromUserId, 'accepted']
        );
        
        res.json({ success: true, message: 'Friend added!' });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

app.post('/api/friends/reject', async (req, res) => {
    let userId = req.session.userId;
    if (!userId) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            userId = authTokens[token];
        }
    }
    if (!userId) return res.status(401).json({ error: 'Not logged in' });
    
    const { fromUserId } = req.body;
    if (!fromUserId) return res.json({ success: false, error: 'User ID required' });
    
    try {
        await pool.query(
            'DELETE FROM friend_requests WHERE from_user_id = $1 AND to_user_id = $2',
            [fromUserId, userId]
        );
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

app.post('/api/friends/remove', async (req, res) => {
    let userId = req.session.userId;
    if (!userId) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            userId = authTokens[token];
        }
    }
    if (!userId) return res.status(401).json({ error: 'Not logged in' });
    
    const { friendId } = req.body;
    if (!friendId) return res.json({ success: false, error: 'Friend ID required' });
    
    try {
        await pool.query('DELETE FROM friends WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)', [userId, friendId]);
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// Search users
app.get('/api/users/search', async (req, res) => {
    let userId = req.session.userId;
    if (!userId) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            userId = authTokens[token];
        }
    }
    if (!userId) return res.status(401).json({ error: 'Not logged in' });
    
    const { q } = req.query;
    if (!q || q.length < 2) return res.json({ success: true, users: [] });
    
    try {
        const users = await pool.query(`
            SELECT id, username, wins, games_played,
                   CASE WHEN games_played > 0 THEN ROUND((wins::numeric / games_played) * 100, 1) ELSE 0 END AS win_rate
            FROM users 
            WHERE LOWER(username) LIKE LOWER($1) AND id != $2
            LIMIT 10
        `, ['%' + q + '%', userId]);
        
        res.json({ success: true, users: users.rows });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// ── INVITE FRIEND TO GAME ───────────────────────────────────────────────────────
app.post('/api/invite', async (req, res) => {
    let userId = req.session.userId;
    if (!userId) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            userId = authTokens[token];
        }
    }
    if (!userId) return res.status(401).json({ error: 'Not logged in' });
    
    const { roomId, friendId } = req.body;
    if (!roomId || !friendId) return res.json({ success: false, error: 'Room ID and Friend ID required' });
    
    // Store invite in memory (could be stored in DB for persistence)
    if (!pendingInvites[friendId]) pendingInvites[friendId] = [];
    pendingInvites[friendId].push({ fromUserId: userId, roomId, timestamp: Date.now() });
    
    // Clean old invites (older than 5 minutes)
    pendingInvites[friendId] = pendingInvites[friendId].filter(i => Date.now() - i.timestamp < 300000);
    
    res.json({ success: true, message: 'Invite sent!' });
});

// Pending invites storage
const pendingInvites = {};

// ── FRIEND CHAT (in-memory, auto-deletes after 10 minutes) ─────────────────
const chatMessages = {}; // key: "userId1_userId2" (sorted), value: [{from, fromId, message, time}]

function getChatKey(id1, id2) {
    return [id1, id2].sort().join('_');
}

app.get('/api/chat/history/:friendId', async (req, res) => {
    let userId = req.session.userId;
    if (!userId) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            userId = authTokens[token];
        }
    }
    if (!userId) return res.status(401).json({ error: 'Not logged in' });
    
    const friendId = parseInt(req.params.friendId);
    if (!friendId) return res.json({ success: true, messages: [] });
    
    const key = getChatKey(userId, friendId);
    const tenMinAgo = Date.now() - 600000;
    
    // Clean old messages
    if (chatMessages[key]) {
        chatMessages[key] = chatMessages[key].filter(m => m.time > tenMinAgo);
    }
    
    res.json({ success: true, messages: chatMessages[key] || [] });
});

app.post('/api/chat/send', async (req, res) => {
    let userId = req.session.userId;
    if (!userId) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            userId = authTokens[token];
        }
    }
    if (!userId) return res.status(401).json({ error: 'Not logged in' });
    
    const { toId, from, fromId, message, time } = req.body;
    if (!toId || !message) return res.json({ success: false, error: 'Missing data' });
    
    const key = getChatKey(userId, toId);
    if (!chatMessages[key]) chatMessages[key] = [];
    
    const msgData = { from, fromId: parseInt(fromId) || userId, message, time: time || Date.now() };
    chatMessages[key].push(msgData);
    
    // Keep only last 100 messages
    if (chatMessages[key].length > 100) {
        chatMessages[key] = chatMessages[key].slice(-100);
    }
    
    res.json({ success: true });
});

// ── SOCKET.IO GAME ───────────────────────────────────────────────────────────
const rooms = {};
const assignmentOrder = ['blue', 'green', 'red', 'yellow'];
const turnOrder = ['blue', 'red', 'green', 'yellow'];

// Track user's previous room for rejoin
const userRooms = {}; // userId -> roomId
// Room chat history (last 50 messages)
const roomChats = {}; // roomId -> [{user, message, time, color}]

function getOppositeColor(c) {
    if (c === 'blue') return 'green';
    if (c === 'green') return 'blue';
    if (c === 'red') return 'yellow';
    if (c === 'yellow') return 'red';
    return 'green';
}

io.on('connection', (socket) => {
    // Handle rejoin
    socket.on('rejoinRoom', (data) => {
        let roomId = data.roomId;
        let userId = data.userId;
        if (!roomId || !userId) return;
        
        // Check if user was in this room before
        let room = rooms[roomId];
        if (!room) {
            socket.emit('errorMsg', 'Room no longer exists');
            return;
        }
        
        // Find the player's previous info
        let playerInfo = null;
        for (let i = 0; i < room.players.length; i++) {
            if (room.players[i].userId === userId) {
                playerInfo = room.players[i];
                room.players[i].id = socket.id;
                room.players[i].online = true;
                break;
            }
        }
        
        if (playerInfo) {
            socket.join(roomId);
            userRooms[userId] = roomId;
            socket.emit('rejoined', { 
                color: playerInfo.color, 
                roomId, 
                isHost: room.host === socket.id, 
                name: playerInfo.name,
                gameState: room.status === 'playing' ? { gameState: room.gameState, activeColors: room.activeColors, turnColor: room.turnColor } : null
            });
            io.to(roomId).emit('updatePlayers', { players: room.players, hostId: room.host });
            io.to(roomId).emit('playerRejoined', { color: playerInfo.color, name: playerInfo.name });
            
            // Send chat history
            if (roomChats[roomId]) {
                socket.emit('chatHistory', { messages: roomChats[roomId].slice(-50) });
            }
        } else {
            socket.emit('errorMsg', 'Could not rejoin. You may have been removed.');
        }
    });

    socket.on('joinRoom', (data) => {
        let roomId = data.id;
        let playerName = data.name || 'Player';
        let userId = data.userId || null;
        if (!roomId || typeof roomId !== 'string') return;
        if (!rooms[roomId]) {
            rooms[roomId] = { players: [], host: socket.id, status: 'waiting', activeColors: [], rollStats: {}, turnColor: '', pendingRequests: {}, kills: {}, gameState: { red:[-1,-1,-1,-1], green:[-1,-1,-1,-1], yellow:[-1,-1,-1,-1], blue:[-1,-1,-1,-1] } };
            roomChats[roomId] = [];
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
        room.players.push({ id: socket.id, color: assignedColor, online: true, name: playerName, userId: userId });
        if (userId) userRooms[userId] = roomId;
        socket.join(roomId);
        socket.emit('joined', { color: assignedColor, roomId, isHost: room.host === socket.id, name: playerName });
        io.to(roomId).emit('updatePlayers', { players: room.players, hostId: room.host });
        
        // Send chat history
        if (roomChats[roomId]) {
            socket.emit('chatHistory', { messages: roomChats[roomId].slice(-50) });
        }
    });
    
    // In-game chat
    socket.on('sendChat', (data) => {
        let room = rooms[data.roomId];
        if (!room) return;
        let player = room.players.find(p => p.id === socket.id);
        if (!player) return;
        
        let message = {
            user: player.name,
            message: data.message.substring(0, 200),
            time: Date.now(),
            color: player.color
        };
        
        if (!roomChats[data.roomId]) roomChats[data.roomId] = [];
        roomChats[data.roomId].push(message);
        if (roomChats[data.roomId].length > 50) roomChats[data.roomId].shift();
        
        io.to(data.roomId).emit('newChat', message);
    });
    
    // Invite friend via socket
    socket.on('inviteFriend', (data) => {
        let { friendId, roomId, fromName } = data;
        // Find friend's socket and send invite notification
        for (let [uid, rid] of Object.entries(userRooms)) {
            if (uid === friendId) {
                io.to(rid).emit('gameInvite', { fromName, roomId });
                break;
            }
        }
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

    // Handle leave room
    socket.on('leaveRoom', (data) => {
        let room = rooms[data.roomId];
        if (room) {
            let pIndex = room.players.findIndex(p => p.id === socket.id);
            if (pIndex !== -1) {
                let playerName = room.players[pIndex].name;
                room.players.splice(pIndex, 1);
                room.activeColors = room.activeColors.filter(c => c !== playerName);
                socket.leave(data.roomId);
                io.to(data.roomId).emit('playerLeft', { name: playerName });
                io.to(data.roomId).emit('updatePlayers', { players: room.players, hostId: room.host });
                
                // Transfer host if needed
                if (room.host === socket.id && room.players.length > 0) {
                    room.host = room.players[0].id;
                    io.to(data.roomId).emit('updatePlayers', { players: room.players, hostId: room.host });
                }
            }
        }
    });

    // Friend chat handlers
    socket.on('joinChat', (data) => {
        socket.userId = data.userId;
        socket.username = data.username;
        // Store online status
        pool.query('INSERT INTO online_users (user_id, socket_id) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET socket_id = $2, last_seen = NOW()', [data.userId, socket.id])
            .catch(() => {});
    });

    socket.on('sendMessage', (data) => {
        // Store message
        const key = getChatKey(data.fromId, data.toId);
        if (!chatMessages[key]) chatMessages[key] = [];
        chatMessages[key].push({ from: data.from, fromId: data.fromId, message: data.message, time: data.time });
        // Keep only last 100 messages
        if (chatMessages[key].length > 100) chatMessages[key] = chatMessages[key].slice(-100);
        
        // Find recipient's socket
        const recipientSocket = Array.from(io.sockets.sockets.values()).find(s => s.userId === data.toId);
        if (recipientSocket) {
            recipientSocket.emit('newMessage', {
                from: data.from,
                fromId: data.fromId,
                message: data.message,
                time: data.time
            });
        }
        // Also send back to sender
        socket.emit('newMessage', {
            from: data.from,
            fromId: data.fromId,
            message: data.message,
            time: data.time,
            sent: true
        });
    });

    socket.on('disconnect', () => {
        for (let roomId in rooms) {
            let room = rooms[roomId];
            if (room.pendingRequests && room.pendingRequests[socket.id]) delete room.pendingRequests[socket.id];
            let pIndex = room.players.findIndex(p => p.id === socket.id);
            if (pIndex !== -1) {
                room.players[pIndex].online = false;
                io.to(roomId).emit('playerStatus', { color: room.players[pIndex].color, status: 'offline', name: room.players[pIndex].name });
                io.to(roomId).emit('playerDisconnected', { color: room.players[pIndex].color, name: room.players[pIndex].name });
                
                // Keep room active for 5 minutes for rejoin (only during waiting or early game)
                if (room.status === 'waiting' || room.activeColors.length <= 2) {
                    // Room stays active for rejoin
                    if (room.players.every(p => !p.online)) {
                        // Set timeout to delete room after 5 minutes if no one rejoins
                        setTimeout(() => {
                            let r = rooms[roomId];
                            if (r && r.players.every(p => !p.online)) {
                                delete rooms[roomId];
                                delete roomChats[roomId];
                            }
                        }, 300000); // 5 minutes
                    }
                } else {
                    // Game in progress with many players - auto host transfer
                    if (room.players.every(p => !p.online)) {
                        delete rooms[roomId];
                        delete roomChats[roomId];
                    } else if (room.host === socket.id) {
                        let newHost = room.players.find(p => p.online);
                        if (newHost) { room.host = newHost.id; io.to(roomId).emit('updatePlayers', { players: room.players, hostId: room.host }); }
                    }
                }
            }
        }
        
        // Clean up userRooms mapping
        for (let uid in userRooms) {
            // This is simplified - in production you'd track socket -> userId mapping
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => { console.log(`Server running on port ${PORT}`); });