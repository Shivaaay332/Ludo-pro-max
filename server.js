const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));
app.use(express.json());

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS players (
                id SERIAL PRIMARY KEY,
                name VARCHAR(50) NOT NULL UNIQUE,
                wins INTEGER DEFAULT 0,
                games_played INTEGER DEFAULT 0,
                kills INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS game_sessions (
                id SERIAL PRIMARY KEY,
                room_id VARCHAR(50),
                played_at TIMESTAMP DEFAULT NOW(),
                total_players INTEGER
            );
            CREATE TABLE IF NOT EXISTS game_participants (
                id SERIAL PRIMARY KEY,
                session_id INTEGER REFERENCES game_sessions(id) ON DELETE CASCADE,
                player_name VARCHAR(50),
                color VARCHAR(10),
                rank INTEGER,
                kills INTEGER DEFAULT 0
            );
        `);
        console.log('Database initialized');
    } catch (err) {
        console.error('DB init error:', err.message);
    }
}
initDB();

// REST API: Leaderboard
app.get('/api/leaderboard', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT name, wins, games_played, kills,
                   CASE WHEN games_played > 0 THEN ROUND((wins::numeric / games_played) * 100, 1) ELSE 0 END AS win_rate
            FROM players
            ORDER BY wins DESC, kills DESC, games_played ASC
            LIMIT 20
        `);
        res.json({ success: true, players: result.rows });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// REST API: Player stats
app.get('/api/player/:name', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT name, wins, games_played, kills FROM players WHERE LOWER(name) = LOWER($1)',
            [req.params.name]
        );
        if (result.rows.length === 0) return res.json({ success: false, error: 'Player not found' });
        res.json({ success: true, player: result.rows[0] });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

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
            rooms[roomId] = {
                players: [], host: socket.id, status: 'waiting',
                activeColors: [], rollStats: {}, turnColor: '',
                pendingRequests: {}, kills: {}
            };
        }

        let room = rooms[roomId];

        if (room.players.some(p => p.id === socket.id)) {
            let pIndex = room.players.findIndex(p => p.id === socket.id);
            socket.emit('joined', { color: room.players[pIndex].color, roomId: roomId, isHost: room.host === socket.id, name: room.players[pIndex].name });
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
        socket.emit('joined', { color: assignedColor, roomId: roomId, isHost: room.host === socket.id, name: playerName });
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
            io.to(data.roomId).emit('midGameJoin', {
                activeColors: room.activeColors,
                newColor: assignedColor,
                turnColor: room.turnColor,
                gameState: data.currentGameState
            });
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
                    let currentTurnIdx = room.activeColors.indexOf(kickedColor);
                    let nextTurnIdx = (currentTurnIdx + 1) % room.activeColors.length;
                    room.turnColor = room.activeColors[nextTurnIdx];
                    io.to(data.roomId).emit('turnChanged', { color: room.turnColor });
                }

                room.players.splice(pIndex, 1);

                if (room.players.length === 2 && room.status === 'playing') {
                    let hostP = room.players.find(p => p.id === room.host);
                    let oppP = room.players.find(p => p.id !== room.host);

                    if (hostP && oppP) {
                        let targetOppositeColor = getOppositeColor(hostP.color);
                        if (oppP.color !== targetOppositeColor) {
                            let oldColor = oppP.color;
                            oppP.color = targetOppositeColor;

                            room.rollStats[targetOppositeColor] = room.rollStats[oldColor];
                            delete room.rollStats[oldColor];
                            room.kills[targetOppositeColor] = room.kills[oldColor] || 0;
                            delete room.kills[oldColor];
                            if (room.turnColor === oldColor) room.turnColor = targetOppositeColor;

                            io.to(data.roomId).emit('migrateColor', { oldColor: oldColor, newColor: targetOppositeColor });
                        }
                    }
                }

                room.activeColors = room.players.map(p => p.color);
                room.activeColors.sort((a, b) => turnOrder.indexOf(a) - turnOrder.indexOf(b));

                let targetSocket = io.sockets.sockets.get(data.targetId);
                if (targetSocket) {
                    targetSocket.emit('kickedOut');
                    targetSocket.leave(data.roomId);
                }

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
        if (roll === 6) {
            stats.count = 0;
            stats.target = Math.floor(Math.random() * 3) + 4;
        }
        io.to(data.roomId).emit('diceRolled', { color: data.color, roll: roll });
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
            const sessionResult = await pool.query(
                'INSERT INTO game_sessions (room_id, total_players) VALUES ($1, $2) RETURNING id',
                [data.roomId, data.rankings.length]
            );
            const sessionId = sessionResult.rows[0].id;

            for (const entry of data.rankings) {
                const kills = (room.kills && room.kills[entry.color]) || 0;

                await pool.query(
                    'INSERT INTO game_participants (session_id, player_name, color, rank, kills) VALUES ($1, $2, $3, $4, $5)',
                    [sessionId, entry.name, entry.color, entry.rank, kills]
                );

                await pool.query(`
                    INSERT INTO players (name, wins, games_played, kills, updated_at)
                    VALUES ($1, $2, 1, $3, NOW())
                    ON CONFLICT (name) DO UPDATE SET
                        wins = players.wins + EXCLUDED.wins,
                        games_played = players.games_played + 1,
                        kills = players.kills + EXCLUDED.kills,
                        updated_at = NOW()
                `, [entry.name, entry.rank === 1 ? 1 : 0, kills]);
            }

            io.to(data.roomId).emit('scoreSaved', { success: true });
        } catch (err) {
            console.error('Error saving game result:', err.message);
            io.to(data.roomId).emit('scoreSaved', { success: false });
        }
    });

    socket.on('sendInteraction', (data) => {
        io.to(data.roomId).emit('showInteraction', { color: data.color, type: data.type, content: data.content });
    });

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
server.listen(PORT, '0.0.0.0', () => { console.log(`Server running on port ${PORT}`); });
