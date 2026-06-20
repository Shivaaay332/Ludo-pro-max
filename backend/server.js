require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const path = require('path');
const crypto = require('crypto');

const app = express();

app.set('trust proxy', 1);

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const authTokens = {};

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const isProduction = process.env.NODE_ENV === 'production';
app.use(session({
    secret: process.env.SESSION_SECRET || 'ludo_secret_key_2024',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        maxAge: 7 * 24 * 60 * 60 * 1000,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax'
    }
}));

app.get('/', (req, res) => { res.send('🎲 Ludo Pro Max Backend is Live and Running! 🚀'); });

async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username VARCHAR(50) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL, wins INTEGER DEFAULT 0, games_played INTEGER DEFAULT 0, kills INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW());
            CREATE TABLE IF NOT EXISTS game_sessions2 (id SERIAL PRIMARY KEY, room_id VARCHAR(50), played_at TIMESTAMP DEFAULT NOW(), total_players INTEGER);
            CREATE TABLE IF NOT EXISTS game_results (id SERIAL PRIMARY KEY, session_id INTEGER REFERENCES game_sessions2(id) ON DELETE CASCADE, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, username VARCHAR(50), color VARCHAR(10), rank INTEGER, kills INTEGER DEFAULT 0);
            CREATE TABLE IF NOT EXISTS friends (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, friend_id INTEGER REFERENCES users(id) ON DELETE CASCADE, status VARCHAR(20) DEFAULT 'pending', created_at TIMESTAMP DEFAULT NOW(), UNIQUE(user_id, friend_id));
            CREATE TABLE IF NOT EXISTS friend_requests (id SERIAL PRIMARY KEY, from_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, to_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, status VARCHAR(20) DEFAULT 'pending', created_at TIMESTAMP DEFAULT NOW(), UNIQUE(from_user_id, to_user_id));
            CREATE TABLE IF NOT EXISTS blocked_users (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, blocked_id INTEGER REFERENCES users(id) ON DELETE CASCADE, created_at TIMESTAMP DEFAULT NOW(), UNIQUE(user_id, blocked_id));
            CREATE TABLE IF NOT EXISTS online_users (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE, socket_id VARCHAR(100), last_seen TIMESTAMP DEFAULT NOW());
        `);
        // 🔴 NEW FEATURES KE LIYE COLUMNS (Bina purana data delete kiye) 🔴
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar VARCHAR(50) DEFAULT '👤'`);
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_requests VARCHAR(20) DEFAULT 'everyone'`);
        
        console.log('Database initialized successfully');
    } catch (err) { console.error('DB init error:', err.message); }
}
initDB();

// ── AUTH API ──
app.post('/api/auth/signup', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.json({ success: false, error: 'Username and password required' });
    if (username.length < 3 || username.length > 20) return res.json({ success: false, error: 'Username must be 3-20 characters' });
    if (password.length < 6) return res.json({ success: false, error: 'Password must be at least 6 characters' });
    if (!/^[a-zA-Z0-9_]+$/.test(username)) return res.json({ success: false, error: 'Username: only letters, numbers, underscores' });
    try {
        const hash = await bcrypt.hash(password, 10);
        const result = await pool.query('INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username', [username, hash]);
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
        const token = generateToken();
        authTokens[token] = user.id;
        req.session.userId = user.id;
        req.session.username = user.username;
        res.json({ success: true, username: user.username, token });
    } catch (err) { res.json({ success: false, error: 'Server error' }); }
});

app.post('/api/auth/logout', (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) { delete authTokens[authHeader.substring(7)]; }
    req.session.destroy(() => res.json({ success: true }));
});

app.get('/api/auth/me', async (req, res) => {
    let userId = req.session.userId;
    if (!userId) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) userId = authTokens[authHeader.substring(7)];
    }
    if (!userId && req.query.token) userId = authTokens[req.query.token];
    if (!userId) return res.status(401).json({ error: 'Not logged in' });
    try {
        const result = await pool.query('SELECT id, username, wins, games_played, kills, created_at, avatar, privacy_requests FROM users WHERE id = $1', [userId]);
        if (result.rows.length === 0) return res.status(401).json({ error: 'User not found' });
        res.json({ success: true, user: result.rows[0] });
    } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// 🔴 ── NEW SETTINGS API ENDPOINTS ── 🔴
app.post('/api/auth/change-username', async (req, res) => {
    let userId = req.session.userId;
    if (!userId) { const authHeader = req.headers.authorization; if (authHeader && authHeader.startsWith('Bearer ')) userId = authTokens[authHeader.substring(7)]; }
    if (!userId) return res.status(401).json({ success: false, error: 'Not logged in' });
    const { newUsername } = req.body;
    if (!newUsername || newUsername.length < 3 || newUsername.length > 20) return res.json({ success: false, error: 'Username must be 3-20 characters' });
    if (!/^[a-zA-Z0-9_]+$/.test(newUsername)) return res.json({ success: false, error: 'Only letters, numbers, underscores' });
    try {
        await pool.query('UPDATE users SET username = $1, updated_at = NOW() WHERE id = $2', [newUsername, userId]);
        res.json({ success: true, newUsername });
    } catch (err) {
        if (err.code === '23505') return res.json({ success: false, error: 'Username already taken!' });
        res.json({ success: false, error: 'Server error' });
    }
});

app.post('/api/auth/change-avatar', async (req, res) => {
    let userId = req.session.userId;
    if (!userId) { const authHeader = req.headers.authorization; if (authHeader && authHeader.startsWith('Bearer ')) userId = authTokens[authHeader.substring(7)]; }
    if (!userId) return res.status(401).json({ success: false, error: 'Not logged in' });
    try {
        await pool.query('UPDATE users SET avatar = $1 WHERE id = $2', [req.body.avatar, userId]);
        res.json({ success: true });
    } catch (err) { res.json({ success: false, error: 'Server error' }); }
});

app.post('/api/auth/update-privacy', async (req, res) => {
    let userId = req.session.userId;
    if (!userId) { const authHeader = req.headers.authorization; if (authHeader && authHeader.startsWith('Bearer ')) userId = authTokens[authHeader.substring(7)]; }
    if (!userId) return res.status(401).json({ success: false, error: 'Not logged in' });
    try {
        await pool.query('UPDATE users SET privacy_requests = $1 WHERE id = $2', [req.body.privacy_requests, userId]);
        res.json({ success: true });
    } catch (err) { res.json({ success: false, error: 'Server error' }); }
});

app.post('/api/auth/delete-account', async (req, res) => {
    let userId = req.session.userId;
    if (!userId) { const authHeader = req.headers.authorization; if (authHeader && authHeader.startsWith('Bearer ')) userId = authTokens[authHeader.substring(7)]; }
    if (!userId) return res.status(401).json({ success: false, error: 'Not logged in' });
    const { password } = req.body;
    try {
        const userResult = await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
        if (userResult.rows.length === 0) return res.json({ success: false, error: 'User not found' });
        const match = await bcrypt.compare(password, userResult.rows[0].password_hash);
        if (!match) return res.json({ success: false, error: 'Incorrect password' });

        await pool.query('DELETE FROM users WHERE id = $1', [userId]); 
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) { delete authTokens[authHeader.substring(7)]; }
        req.session.destroy(() => res.json({ success: true }));
    } catch (err) { res.json({ success: false, error: err.message }); }
});

app.post('/api/auth/change-password', async (req, res) => {
    let userId = req.session.userId;
    if (!userId) { const authHeader = req.headers.authorization; if (authHeader && authHeader.startsWith('Bearer ')) userId = authTokens[authHeader.substring(7)]; }
    if (!userId) return res.status(401).json({ success: false, error: 'Not logged in' });
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) return res.json({ success: false, error: 'Both fields required' });
    if (newPassword.length < 6) return res.json({ success: false, error: 'Password must be 6+ characters' });
    try {
        const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
        if (result.rows.length === 0) return res.json({ success: false, error: 'User not found' });
        const match = await bcrypt.compare(oldPassword, result.rows[0].password_hash);
        if (!match) return res.json({ success: false, error: 'Current password is incorrect' });
        const newHash = await bcrypt.hash(newPassword, 10);
        await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, userId]);
        res.json({ success: true });
    } catch (err) { res.json({ success: false, error: err.message }); }
});

// ── LEADERBOARD & STATS ──
app.get('/api/leaderboard', async (req, res) => {
    try {
        const result = await pool.query(`SELECT username, wins, games_played, kills, CASE WHEN games_played > 0 THEN ROUND((wins::numeric / games_played) * 100, 1) ELSE 0 END AS win_rate FROM users WHERE games_played > 0 ORDER BY wins DESC, kills DESC LIMIT 20`);
        res.json({ success: true, players: result.rows });
    } catch (err) { res.json({ success: false, error: err.message }); }
});

app.get('/api/dashboard', async (req, res) => {
    let userId = req.session.userId;
    if (!userId) { const authHeader = req.headers.authorization; if (authHeader && authHeader.startsWith('Bearer ')) userId = authTokens[authHeader.substring(7)]; }
    if (!userId) return res.status(401).json({ success: false, error: 'Not logged in' });
    try {
        const userResult = await pool.query('SELECT username, wins, games_played, kills, created_at, avatar FROM users WHERE id = $1', [userId]);
        const lbResult = await pool.query(`SELECT username, wins, games_played, kills, CASE WHEN games_played > 0 THEN ROUND((wins::numeric / games_played) * 100, 1) ELSE 0 END AS win_rate FROM users WHERE games_played > 0 ORDER BY wins DESC LIMIT 5`);
        const recentResult = await pool.query(`SELECT gr.color, gr.rank, gr.kills, gs.played_at, gs.total_players FROM game_results gr JOIN game_sessions2 gs ON gr.session_id = gs.id WHERE gr.user_id = $1 ORDER BY gs.played_at DESC LIMIT 5`, [userId]);
        res.json({ success: true, user: userResult.rows[0], leaderboard: lbResult.rows, recentGames: recentResult.rows });
    } catch (err) { res.json({ success: false, error: err.message }); }
});

app.get('/api/profile', async (req, res) => {
    let userId = req.session.userId;
    if (!userId) { const authHeader = req.headers.authorization; if (authHeader && authHeader.startsWith('Bearer ')) userId = authTokens[authHeader.substring(7)]; }
    if (!userId) return res.status(401).json({ success: false, error: 'Not logged in' });
    try {
        const userResult = await pool.query('SELECT username, wins, games_played, kills, created_at, avatar FROM users WHERE id = $1', [userId]);
        const historyResult = await pool.query(`SELECT gr.color, gr.rank, gr.kills, gs.played_at, gs.total_players FROM game_results gr JOIN game_sessions2 gs ON gr.session_id = gs.id WHERE gr.user_id = $1 ORDER BY gs.played_at DESC LIMIT 20`, [userId]);
        const rankCounts = await pool.query(`SELECT rank, COUNT(*) as count FROM game_results WHERE user_id = $1 GROUP BY rank ORDER BY rank`, [userId]);
        res.json({ success: true, user: userResult.rows[0], history: historyResult.rows, rankCounts: rankCounts.rows });
    } catch (err) { res.json({ success: false, error: err.message }); }
});

// ── FRIENDS, BLOCK & SEARCH ──
app.get('/api/friends', async (req, res) => {
    let userId = req.session.userId;
    if (!userId) { const authHeader = req.headers.authorization; if (authHeader && authHeader.startsWith('Bearer ')) userId = authTokens[authHeader.substring(7)]; }
    if (!userId) return res.status(401).json({ error: 'Not logged in' });
    try {
        const friends = await pool.query(`SELECT u.id, u.username, u.wins, u.games_played, u.kills, u.avatar, CASE WHEN u.games_played > 0 THEN ROUND((u.wins::numeric / u.games_played) * 100, 1) ELSE 0 END AS win_rate, CASE WHEN ou.socket_id IS NOT NULL THEN true ELSE false END AS is_online FROM friends f JOIN users u ON (f.friend_id = u.id OR f.user_id = u.id) AND u.id != $1 LEFT JOIN online_users ou ON u.id = ou.user_id WHERE (f.user_id = $1 OR f.friend_id = $1) AND f.status = 'accepted'`, [userId]);
        const sentRequests = await pool.query(`SELECT u.id, u.username, fr.created_at FROM friend_requests fr JOIN users u ON fr.to_user_id = u.id WHERE fr.from_user_id = $1 AND fr.status = 'pending'`, [userId]);
        const receivedRequests = await pool.query(`SELECT u.id, u.username, fr.created_at FROM friend_requests fr JOIN users u ON fr.from_user_id = u.id WHERE fr.to_user_id = $1 AND fr.status = 'pending'`, [userId]);
        res.json({ success: true, friends: friends.rows.map(f => ({ ...f, activityStatus: userActivity[f.id]?.status || (f.is_online ? 'online' : 'offline'), currentRoom: userActivity[f.id]?.roomId || null })), sentRequests: sentRequests.rows, receivedRequests: receivedRequests.rows });
    } catch (err) { res.json({ success: false, error: err.message }); }
});

app.post('/api/friends/send', async (req, res) => {
    let userId = req.session.userId;
    if (!userId) { const authHeader = req.headers.authorization; if (authHeader && authHeader.startsWith('Bearer ')) userId = authTokens[authHeader.substring(7)]; }
    if (!userId) return res.status(401).json({ error: 'Not logged in' });
    const { username } = req.body;
    try {
        const targetResult = await pool.query('SELECT id, privacy_requests FROM users WHERE LOWER(username) = LOWER($1)', [username]);
        if (targetResult.rows.length === 0) return res.json({ success: false, error: 'User not found' });
        
        // 🔴 PRIVACY CHECK IMPLEMENTATION 🔴
        if (targetResult.rows[0].privacy_requests === 'nobody') {
            return res.json({ success: false, error: 'This user is not accepting friend requests right now.' });
        }

        const targetId = targetResult.rows[0].id;
        if (targetId === userId) return res.json({ success: false, error: 'Cannot add yourself' });
        const blockedCheck = await pool.query(`SELECT id FROM blocked_users WHERE (user_id = $1 AND blocked_id = $2) OR (user_id = $2 AND blocked_id = $1)`, [userId, targetId]);
        if (blockedCheck.rows.length > 0) return res.json({ success: false, error: 'Cannot send request to this user' });
        await pool.query(`DELETE FROM friend_requests WHERE ((from_user_id = $1 AND to_user_id = $2) OR (from_user_id = $2 AND to_user_id = $1)) AND status = 'accepted'`, [userId, targetId]);
        const existing = await pool.query(`SELECT id FROM friend_requests WHERE (from_user_id = $1 AND to_user_id = $2) OR (from_user_id = $2 AND to_user_id = $1)`, [userId, targetId]);
        if (existing.rows.length > 0) return res.json({ success: false, error: 'Request already exists' });
        const existingFriend = await pool.query(`SELECT id FROM friends WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)`, [userId, targetId]);
        if (existingFriend.rows.length > 0) return res.json({ success: false, error: 'Already friends' });
        await pool.query('INSERT INTO friend_requests (from_user_id, to_user_id) VALUES ($1, $2)', [userId, targetId]);
        res.json({ success: true, message: 'Friend request sent!' });
    } catch (err) { res.json({ success: false, error: err.message }); }
});

app.post('/api/friends/accept', async (req, res) => {
    let userId = req.session.userId;
    if (!userId) { const authHeader = req.headers.authorization; if (authHeader && authHeader.startsWith('Bearer ')) userId = authTokens[authHeader.substring(7)]; }
    if (!userId) return res.status(401).json({ error: 'Not logged in' });
    try {
        await pool.query('DELETE FROM friend_requests WHERE (from_user_id = $1 AND to_user_id = $2) OR (from_user_id = $2 AND to_user_id = $1)', [req.body.fromUserId, userId]);
        await pool.query('INSERT INTO friends (user_id, friend_id, status) VALUES ($1, $2, $3)', [userId, req.body.fromUserId, 'accepted']);
        res.json({ success: true, message: 'Friend added!' });
    } catch (err) { res.json({ success: false, error: err.message }); }
});

app.post('/api/friends/reject', async (req, res) => {
    let userId = req.session.userId;
    if (!userId) { const authHeader = req.headers.authorization; if (authHeader && authHeader.startsWith('Bearer ')) userId = authTokens[authHeader.substring(7)]; }
    if (!userId) return res.status(401).json({ error: 'Not logged in' });
    try {
        await pool.query('DELETE FROM friend_requests WHERE from_user_id = $1 AND to_user_id = $2', [req.body.fromUserId, userId]);
        res.json({ success: true });
    } catch (err) { res.json({ success: false, error: err.message }); }
});

app.post('/api/friends/remove', async (req, res) => {
    let userId = req.session.userId;
    if (!userId) { const authHeader = req.headers.authorization; if (authHeader && authHeader.startsWith('Bearer ')) userId = authTokens[authHeader.substring(7)]; }
    if (!userId) return res.status(401).json({ error: 'Not logged in' });
    try {
        await pool.query('DELETE FROM friends WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)', [userId, req.body.friendId]);
        await pool.query('DELETE FROM friend_requests WHERE (from_user_id = $1 AND to_user_id = $2) OR (from_user_id = $2 AND to_user_id = $1)', [userId, req.body.friendId]);
        res.json({ success: true });
    } catch (err) { res.json({ success: false, error: err.message }); }
});

app.post('/api/friends/block', async (req, res) => {
    let userId = req.session.userId;
    if (!userId) { const authHeader = req.headers.authorization; if (authHeader && authHeader.startsWith('Bearer ')) userId = authTokens[authHeader.substring(7)]; }
    if (!userId) return res.status(401).json({ error: 'Not logged in' });
    try {
        await pool.query('DELETE FROM friends WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)', [userId, req.body.friendId]);
        await pool.query('DELETE FROM friend_requests WHERE (from_user_id = $1 AND to_user_id = $2) OR (from_user_id = $2 AND to_user_id = $1)', [userId, req.body.friendId]);
        await pool.query('INSERT INTO blocked_users (user_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, req.body.friendId]);
        res.json({ success: true });
    } catch (err) { res.json({ success: false, error: err.message }); }
});

app.post('/api/friends/unblock', async (req, res) => {
    let userId = req.session.userId;
    if (!userId) { const authHeader = req.headers.authorization; if (authHeader && authHeader.startsWith('Bearer ')) userId = authTokens[authHeader.substring(7)]; }
    if (!userId) return res.status(401).json({ error: 'Not logged in' });
    try {
        await pool.query('DELETE FROM blocked_users WHERE user_id = $1 AND blocked_id = $2', [userId, req.body.blockedId]);
        res.json({ success: true });
    } catch (err) { res.json({ success: false, error: err.message }); }
});

app.get('/api/friends/blocked', async (req, res) => {
    let userId = req.session.userId;
    if (!userId) { const authHeader = req.headers.authorization; if (authHeader && authHeader.startsWith('Bearer ')) userId = authTokens[authHeader.substring(7)]; }
    if (!userId) return res.status(401).json({ error: 'Not logged in' });
    try {
        const result = await pool.query('SELECT u.id, u.username FROM blocked_users b JOIN users u ON b.blocked_id = u.id WHERE b.user_id = $1', [userId]);
        res.json({ success: true, blocked: result.rows });
    } catch (err) { res.json({ success: false, error: err.message }); }
});

app.get('/api/users/search', async (req, res) => {
    let userId = req.session.userId;
    if (!userId) { const authHeader = req.headers.authorization; if (authHeader && authHeader.startsWith('Bearer ')) userId = authTokens[authHeader.substring(7)]; }
    if (!userId) return res.status(401).json({ error: 'Not logged in' });
    const { q } = req.query;
    if (!q || q.length < 2) return res.json({ success: true, users: [] });
    try {
        const users = await pool.query(`SELECT id, username, avatar, wins, games_played, CASE WHEN games_played > 0 THEN ROUND((wins::numeric / games_played) * 100, 1) ELSE 0 END AS win_rate FROM users WHERE LOWER(username) LIKE LOWER($1) AND id != $2 AND id NOT IN (SELECT blocked_id FROM blocked_users WHERE user_id = $2) AND id NOT IN (SELECT user_id FROM blocked_users WHERE blocked_id = $2) LIMIT 10`, ['%' + q + '%', userId]);
        res.json({ success: true, users: users.rows });
    } catch (err) { res.json({ success: false, error: err.message }); }
});

app.post('/api/invite', async (req, res) => {
    let userId = req.session.userId;
    if (!userId) { const authHeader = req.headers.authorization; if (authHeader && authHeader.startsWith('Bearer ')) userId = authTokens[authHeader.substring(7)]; }
    if (!userId) return res.status(401).json({ error: 'Not logged in' });
    const { roomId, friendId } = req.body;
    if (!roomId || !friendId) return res.json({ success: false, error: 'Room ID and Friend ID required' });
    if (!pendingInvites[friendId]) pendingInvites[friendId] = [];
    pendingInvites[friendId].push({ fromUserId: userId, roomId, timestamp: Date.now() });
    pendingInvites[friendId] = pendingInvites[friendId].filter(i => Date.now() - i.timestamp < 300000);
    res.json({ success: true, message: 'Invite sent!' });
});

const pendingInvites = {};
const chatMessages = {}; 
const userLastSeen = {}; 

function getChatKey(id1, id2) { return [id1, id2].sort().join('_'); }
function findSocket(toId) { return Array.from(io.sockets.sockets.values()).find(s => s.userId != null && s.userId == toId); }

app.get('/api/chat/history/:friendId', async (req, res) => {
    let userId = req.session.userId;
    if (!userId) { const authHeader = req.headers.authorization; if (authHeader && authHeader.startsWith('Bearer ')) userId = authTokens[authHeader.substring(7)]; }
    if (!userId) return res.status(401).json({ error: 'Not logged in' });
    const friendId = parseInt(req.params.friendId);
    if (!friendId) return res.json({ success: true, messages: [] });
    const blockedCheck = await pool.query(`SELECT id FROM blocked_users WHERE (user_id = $1 AND blocked_id = $2) OR (user_id = $2 AND blocked_id = $1)`, [userId, friendId]);
    if (blockedCheck.rows.length > 0) return res.json({ success: true, messages: [] });
    const key = getChatKey(userId, friendId);
    const oneDayAgo = Date.now() - 86400000;
    if (chatMessages[key]) chatMessages[key] = chatMessages[key].filter(m => m.time > oneDayAgo);
    const msgs = (chatMessages[key] || []).filter(m => !m.deletedFor || !m.deletedFor.includes(String(userId)));
    res.json({ success: true, messages: msgs });
});

app.post('/api/chat/send', async (req, res) => {
    let userId = req.session.userId;
    if (!userId) { const authHeader = req.headers.authorization; if (authHeader && authHeader.startsWith('Bearer ')) userId = authTokens[authHeader.substring(7)]; }
    if (!userId) return res.status(401).json({ error: 'Not logged in' });
    const { toId, from, fromId, message, time, msgId, replyTo } = req.body;
    if (!toId || !message) return res.json({ success: false, error: 'Missing data' });
    const blockedCheck = await pool.query(`SELECT id FROM blocked_users WHERE (user_id = $1 AND blocked_id = $2) OR (user_id = $2 AND blocked_id = $1)`, [userId, toId]);
    if (blockedCheck.rows.length > 0) return res.json({ success: false, error: 'User is blocked' });
    const key = getChatKey(userId, toId);
    if (!chatMessages[key]) chatMessages[key] = [];
    const existingMsgId = msgId || null;
    if (existingMsgId && chatMessages[key].some(m => m.msgId === existingMsgId)) return res.json({ success: true });
    const msgData = { msgId: existingMsgId || `msg_${Date.now()}_${Math.random().toString(36).substr(2,6)}`, from, fromId: parseInt(fromId) || userId, message, time: time || Date.now(), replyTo: replyTo || null, reactions: {}, deletedFor: [], status: 'sent' };
    chatMessages[key].push(msgData);
    if (chatMessages[key].length > 100) chatMessages[key] = chatMessages[key].slice(-100);
    res.json({ success: true });
});

// ── SOCKET.IO ──
const rooms = {};
const userActivity = {};
const assignmentOrder = ['blue', 'green', 'red', 'yellow'];
const turnOrder = ['blue', 'red', 'green', 'yellow'];
const userRooms = {}; 
const roomChats = {}; 

function getOppositeColor(c) { return c === 'blue' ? 'green' : c === 'green' ? 'blue' : c === 'red' ? 'yellow' : 'red'; }

io.on('connection', (socket) => {
    
    socket.on('rejoinRoom', (data) => {
        let roomId = data.roomId;
        let userId = data.userId;
        if (!roomId || !userId) return;
        let room = rooms[roomId];
        if (!room) { socket.emit('errorMsg', 'Room no longer exists'); return; }
        let playerInfo = null;
        for (let i = 0; i < room.players.length; i++) {
            if (room.players[i].userId === userId) {
                playerInfo = room.players[i];
                if (room.host === playerInfo.id) room.host = socket.id;
                room.players[i].id = socket.id;
                room.players[i].online = true;
                break;
            }
        }
        if (playerInfo) {
            socket.join(roomId);
            userRooms[userId] = roomId;
            socket.emit('rejoined', { color: playerInfo.color, roomId, isHost: room.host === socket.id, name: playerInfo.name, gameState: room.status === 'playing' ? { gameState: room.gameState, activeColors: room.activeColors, turnColor: room.turnColor } : null });
            io.to(roomId).emit('updatePlayers', { players: room.players, hostId: room.host });
            io.to(roomId).emit('playerRejoined', { color: playerInfo.color, name: playerInfo.name });
            if (roomChats[roomId]) socket.emit('chatHistory', { messages: roomChats[roomId].slice(-50) });
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
        if (userId) {
            let existingIdx = room.players.findIndex(p => p.userId == userId);
            if (existingIdx !== -1) {
                const existing = room.players[existingIdx];
                if (room.host === existing.id) room.host = socket.id;
                existing.id = socket.id; 
                existing.online = true; 
                userRooms[userId] = roomId;
                socket.join(roomId);
                socket.emit('joined', { color: existing.color, roomId, isHost: room.host === socket.id, name: existing.name });
                io.to(roomId).emit('updatePlayers', { players: room.players, hostId: room.host });
                if (roomChats[roomId]) socket.emit('chatHistory', { messages: roomChats[roomId].slice(-50) });
                return;
            }
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
        if (userId) { 
            userActivity[userId] = { status: 'in_lobby', roomId }; 
            io.emit('friendActivityUpdate', { userId, status: 'in_lobby', roomId }); 
            userRooms[userId] = roomId; 
        }
        socket.join(roomId);
        socket.emit('joined', { color: assignedColor, roomId, isHost: room.host === socket.id, name: playerName });
        io.to(roomId).emit('updatePlayers', { players: room.players, hostId: room.host });
        if (roomChats[roomId]) socket.emit('chatHistory', { messages: roomChats[roomId].slice(-50) });
    });
    
    socket.on('sendChat', (data) => {
        let room = rooms[data.roomId];
        if (!room) return;
        let player = room.players.find(p => p.id === socket.id);
        if (!player) return;
        let message = { user: player.name, message: data.message.substring(0, 200), time: Date.now(), color: player.color };
        if (!roomChats[data.roomId]) roomChats[data.roomId] = [];
        roomChats[data.roomId].push(message);
        if (roomChats[data.roomId].length > 50) roomChats[data.roomId].shift();
        io.to(data.roomId).emit('newChat', message);
    });
    
    socket.on('inviteFriend', (data) => {
        let { friendId, roomId, fromName } = data;
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
                            room.rollStats[targetOpp] = room.rollStats[oldColor]; delete room.rollStats[oldColor];
                            room.kills[targetOpp] = room.kills[oldColor] || 0; delete room.kills[oldColor];
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

    socket.on('startGame', (rawData) => {
        const roomId = typeof rawData === 'string' ? rawData : rawData?.roomId;
        const mode = (typeof rawData === 'object' && rawData?.mode) ? rawData.mode : 'normal';
        let room = rooms[roomId];
        if (room && room.host === socket.id && room.players.length > 0) {
            room.status = 'playing';
            room.activeColors = room.players.map(p => p.color);
            room.activeColors.sort((a, b) => turnOrder.indexOf(a) - turnOrder.indexOf(b));
            room.turnColor = room.activeColors[0];
            room.kills = {}; 
            room.mode = mode; 
            room.teams = null;
            if (mode === '2v2' && room.activeColors.length === 4) { 
                room.teams = { A: [room.activeColors[0], room.activeColors[2]], B: [room.activeColors[1], room.activeColors[3]] }; 
            }
            room.activeColors.forEach(c => { 
                room.rollStats[c] = { count: 0, target: Math.floor(Math.random() * 3) + 4 }; 
                room.kills[c] = 0; 
            });
            io.to(roomId).emit('gameStarted', { activeColors: room.activeColors, turnColor: room.turnColor, mode: room.mode, teams: room.teams });
            room.players.forEach(p => { 
                if (p.userId) { 
                    userActivity[p.userId] = { status: 'in_match', roomId }; 
                    io.emit('friendActivityUpdate', { userId: p.userId, status: 'in_match', roomId }); 
                } 
            });
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

    socket.on('moveToken', (data) => { 
        io.to(data.roomId).emit('tokenMoved', { color: data.color, idx: data.idx, roll: data.roll }); 
    });

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
            const sessionResult = await pool.query('INSERT INTO game_sessions2 (room_id, total_players) VALUES ($1, $2) RETURNING id', [data.roomId, data.rankings.length]);
            const sessionId = sessionResult.rows[0].id;
            for (const entry of data.rankings) {
                const kills = (room.kills && room.kills[entry.color]) || 0;
                const userResult = await pool.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [entry.name]);
                const userId = userResult.rows.length > 0 ? userResult.rows[0].id : null;
                await pool.query('INSERT INTO game_results (session_id, user_id, username, color, rank, kills) VALUES ($1, $2, $3, $4, $5, $6)', [sessionId, userId, entry.name, entry.color, entry.rank, kills]);
                if (userId) { 
                    await pool.query(`UPDATE users SET wins = wins + $1, games_played = games_played + 1, kills = kills + $2, updated_at = NOW() WHERE id = $3`, [entry.rank === 1 ? 1 : 0, kills, userId]); 
                }
            }
            io.to(data.roomId).emit('scoreSaved', { success: true });
        } catch (err) { 
            io.to(data.roomId).emit('scoreSaved', { success: false }); 
        }
    });

    socket.on('sendInteraction', (data) => { 
        io.to(data.roomId).emit('showInteraction', { color: data.color, targetColor: data.targetColor, type: data.type, content: data.content }); 
    });

    socket.on('leaveRoom', (data) => {
        let room = rooms[data.roomId];
        if (room) {
            let pIndex = room.players.findIndex(p => p.id === socket.id);
            if (pIndex !== -1) {
                let playerName = room.players[pIndex].name;
                let playerUserId = room.players[pIndex].userId;
                room.players.splice(pIndex, 1);
                room.activeColors = room.activeColors.filter(c => c !== playerName);
                socket.leave(data.roomId);
                io.to(data.roomId).emit('playerLeft', { name: playerName });
                io.to(data.roomId).emit('updatePlayers', { players: room.players, hostId: room.host });
                
                if (playerUserId) { 
                    userActivity[playerUserId] = { status: 'online', roomId: null }; 
                    io.emit('friendActivityUpdate', { userId: playerUserId, status: 'online', roomId: null }); 
                }
                
                if (room.host === socket.id && room.players.length > 0) { 
                    room.host = room.players[0].id; 
                    io.to(data.roomId).emit('updatePlayers', { players: room.players, hostId: room.host }); 
                }
            }
        }
    });

    // ── CHAT SYSTEM (1v1 DMs) ──
    socket.on('joinChat', (data) => {
        socket.userId = data.userId; 
        socket.username = data.username; 
        userLastSeen[data.userId] = null; 
        pool.query('INSERT INTO online_users (user_id, socket_id) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET socket_id = $2, last_seen = NOW()', [data.userId, socket.id]).catch(() => {});
        io.emit('friendOnline', { userId: data.userId });
    });

    socket.on('sendMessage', (data) => {
        const msgId = data.msgId || `msg_${Date.now()}_${Math.random().toString(36).substr(2,6)}`;
        const key = getChatKey(data.fromId, data.toId);
        if (!chatMessages[key]) chatMessages[key] = [];
        
        if (!chatMessages[key].some(m => m.msgId === msgId)) {
            const msg = { msgId, from: data.from, fromId: data.fromId, message: data.message, time: data.time || Date.now(), replyTo: data.replyTo || null, reactions: {}, deletedFor: [], status: 'sent' };
            chatMessages[key].push(msg);
            if (chatMessages[key].length > 200) chatMessages[key] = chatMessages[key].slice(-200);
        }
        
        const stored = chatMessages[key].find(m => m.msgId === msgId);
        const recipSock = findSocket(data.toId);
        if (recipSock) {
            if (stored) stored.status = 'delivered';
            recipSock.emit('newMessage', { ...(stored || { msgId, from: data.from, fromId: data.fromId, message: data.message, time: data.time, replyTo: data.replyTo || null, reactions: {}, deletedFor: [] }), status: 'delivered' });
            socket.emit('messageStatus', { msgId, status: 'delivered' });
        } else { 
            socket.emit('messageStatus', { msgId, status: 'sent' }); 
        }
    });

    socket.on('leaveChat', () => { 
        if (socket.userId) pool.query('DELETE FROM online_users WHERE user_id = $1 AND socket_id = $2', [socket.userId, socket.id]).catch(() => {}); 
    });
    
    socket.on('typing', (data) => { 
        const r = findSocket(data.toId); 
        if (r) r.emit('typing', { fromId: data.fromId, from: data.from }); 
    });
    
    socket.on('stopTyping', (data) => { 
        const r = findSocket(data.toId); 
        if (r) r.emit('stopTyping', { fromId: data.fromId }); 
    });
    
    socket.on('messageSeen', (data) => {
        const key = getChatKey(data.viewerId, data.senderId);
        if (chatMessages[key]) chatMessages[key].forEach(m => { if (m.fromId == data.senderId) m.status = 'seen'; });
        const senderSock = findSocket(data.senderId);
        if (senderSock) senderSock.emit('messagesSeen', { byId: data.viewerId });
    });

    socket.on('deleteMessage', (data) => {
        const key = getChatKey(data.fromId, data.toId); 
        if (!chatMessages[key]) return;
        const msg = chatMessages[key].find(m => m.msgId === data.msgId); 
        if (!msg) return;
        
        if (data.forEveryone && msg.fromId == data.fromId) {
            msg.message = 'This message was deleted'; 
            msg.deleted = true;
            const r = findSocket(data.toId);
            if (r) r.emit('messageDeleted', { msgId: data.msgId, forEveryone: true });
            socket.emit('messageDeleted', { msgId: data.msgId, forEveryone: true });
        } else {
            if (!msg.deletedFor) msg.deletedFor = []; 
            const uid = String(data.fromId);
            if (!msg.deletedFor.includes(uid)) msg.deletedFor.push(uid);
            socket.emit('messageDeleted', { msgId: data.msgId, forEveryone: false });
        }
    });

    socket.on('editMessage', (data) => {
        const key = getChatKey(data.fromId, data.toId); 
        if (!chatMessages[key]) return;
        const msg = chatMessages[key].find(m => m.msgId === data.msgId && m.fromId == data.fromId); 
        if (!msg || msg.deleted) return;
        
        msg.message = data.newText; 
        msg.edited = true;
        const r = findSocket(data.toId);
        if (r) r.emit('messageEdited', { msgId: data.msgId, newText: data.newText });
        socket.emit('messageEdited', { msgId: data.msgId, newText: data.newText });
    });

    socket.on('reactToMessage', (data) => {
        const key = getChatKey(data.fromId, data.toId); 
        if (!chatMessages[key]) return;
        const msg = chatMessages[key].find(m => m.msgId === data.msgId); 
        if (!msg) return;
        
        if (!msg.reactions) msg.reactions = {}; 
        const uid = String(data.fromId);
        Object.keys(msg.reactions).forEach(e => { 
            msg.reactions[e] = msg.reactions[e].filter(id => String(id) !== uid); 
            if (msg.reactions[e].length === 0) delete msg.reactions[e]; 
        });
        
        if (data.emoji) { 
            if (!msg.reactions[data.emoji]) msg.reactions[data.emoji] = []; 
            msg.reactions[data.emoji].push(uid); 
        }
        
        const payload = { msgId: data.msgId, reactions: msg.reactions };
        const r = findSocket(data.toId);
        if (r) r.emit('messageReacted', payload);
        socket.emit('messageReacted', payload);
    });

    socket.on('clearChat', (data) => {
        const key = getChatKey(data.userId, data.friendId);
        if (chatMessages[key]) { 
            const uid = String(data.userId); 
            chatMessages[key].forEach(m => { 
                if (!m.deletedFor) m.deletedFor = []; 
                if (!m.deletedFor.includes(uid)) m.deletedFor.push(uid); 
            }); 
        }
        socket.emit('chatCleared', { friendId: data.friendId });
    });

    socket.on('inviteFriend', (data) => {
        const { friendId, roomId, fromName } = data;
        const friendSocket = Array.from(io.sockets.sockets.values()).find(s => s.userId == friendId);
        if (friendSocket) friendSocket.emit('inviteReceived', { fromName, roomId });
    });

    socket.on('disconnect', () => {
        if (socket.userId) {
            const lastSeenTs = Date.now(); 
            userLastSeen[socket.userId] = lastSeenTs;
            pool.query('DELETE FROM online_users WHERE user_id = $1 AND socket_id = $2', [socket.userId, socket.id]).catch(() => {});
            io.emit('friendOffline', { userId: socket.userId, lastSeen: lastSeenTs });
            if (userActivity[socket.userId]) delete userActivity[socket.userId];
        }

        for (let roomId in rooms) {
            let room = rooms[roomId];
            if (room.pendingRequests && room.pendingRequests[socket.id]) delete room.pendingRequests[socket.id];
            
            let pIndex = room.players.findIndex(p => p.id === socket.id);
            if (pIndex !== -1) {
                const disconnectedColor = room.players[pIndex].color;
                const disconnectedName = room.players[pIndex].name;
                room.players[pIndex].online = false;
                io.to(roomId).emit('playerStatus', { color: disconnectedColor, status: 'offline', name: disconnectedName });
                io.to(roomId).emit('playerDisconnected', { color: disconnectedColor, name: disconnectedName });

                if (room.status === 'playing' && room.turnColor === disconnectedColor) {
                    const capturedRoomId = roomId; 
                    const capturedColor = disconnectedColor;
                    setTimeout(() => {
                        const r = rooms[capturedRoomId];
                        if (r && r.status === 'playing' && r.turnColor === capturedColor) {
                            const stillOffline = r.players.find(p => p.color === capturedColor && !p.online);
                            if (stillOffline && r.activeColors.length > 1) {
                                const idx = r.activeColors.indexOf(r.turnColor);
                                r.turnColor = r.activeColors[(idx + 1) % r.activeColors.length];
                                io.to(capturedRoomId).emit('turnChanged', { color: r.turnColor, reason: 'auto' });
                            }
                        }
                    }, 10000); 
                }
                
                if (room.players.every(p => !p.online)) {
                    setTimeout(() => {
                        const r = rooms[roomId];
                        if (r && r.players.every(p => !p.online)) {
                            delete rooms[roomId];
                            delete roomChats[roomId];
                        }
                    }, 300000);
                } else if (room.host === socket.id) {
                    const newHost = room.players.find(p => p.online);
                    if (newHost) {
                        room.host = newHost.id;
                        io.to(roomId).emit('updatePlayers', { players: room.players, hostId: room.host });
                    }
                }
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => { 
    console.log(`Server running on port ${PORT}`); 
});