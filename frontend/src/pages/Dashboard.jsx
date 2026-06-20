import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import BottomNav from '../components/BottomNav.jsx';

const colorHex = { blue: '#3b82f6', red: '#f43f5e', green: '#10b981', yellow: '#f59e0b' };

function authFetch(url, options = {}) {
  const token = localStorage.getItem('ludo_token');
  if (token) options.headers = { ...options.headers, 'Authorization': 'Bearer ' + token };
  return fetch(url, options);
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [recentGames, setRecentGames] = useState([]);
  const [roomCode, setRoomCode] = useState('');
  const [lbModal, setLbModal] = useState(false);
  const [fullLb, setFullLb] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalUnread, setTotalUnread] = useState(0); 
  
  const socketRef = useRef(null);

  useEffect(() => {
    let isMounted = true;
    async function init() {
      const me = await authFetch('/api/auth/me').then(r => r.json());
      if (!me.success) { localStorage.removeItem('ludo_token'); navigate('/'); return; }
      if (!isMounted) return;
      setUser(me.user);
      
      const dash = await authFetch('/api/dashboard').then(r => r.json());
      if (dash.success && isMounted) {
        setUser(dash.user);
        setLeaderboard(dash.leaderboard || []);
        setRecentGames(dash.recentGames || []);
      }
      
      const friendsData = await authFetch('/api/friends').then(r => r.json()).catch(() => ({}));
      if (friendsData.success && friendsData.friends && isMounted) {
        const unread = friendsData.friends.reduce((sum, f) => sum + (f.unread || 0), 0);
        setTotalUnread(unread);
      }
      
      if (isMounted) setLoading(false);

      const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';
      const sock = io(BACKEND_URL, { transports: ['websocket', 'polling'], reconnection: true });
      socketRef.current = sock;

      sock.on('connect', () => { sock.emit('joinChat', { userId: me.user.id, username: me.user.username }); });
      sock.on('newMessage', (data) => { if (data.fromId !== me.user.id) setTotalUnread(prev => prev + 1); });
    }
    init();

    return () => { isMounted = false; if (socketRef.current) socketRef.current.disconnect(); };
  }, [navigate]);

  function genCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    setRoomCode(code);
  }

  function joinGame() {
    if (!roomCode.trim()) return alert('Please enter a room code!');
    navigate('/game?room=' + encodeURIComponent(roomCode.trim()));
  }

  async function openLeaderboard() {
    setLbModal(true);
    const data = await authFetch('/api/leaderboard').then(r => r.json());
    if (data.success) setFullLb(data.players);
  }

  if (loading) return (
    <div style={{ width: '100%', height: '100%', background: 'var(--bg-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a1a1aa', fontSize: 16, fontWeight: 600 }}>
      Loading Area...
    </div>
  );

  const rate = user.games_played > 0 ? Math.round((user.wins / user.games_played) * 100) : 0;
  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div style={{ width: '100%', height: '100%', background: 'radial-gradient(circle at top right, #1a1a2e, var(--bg-dark))', color: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Premium Header */}
      <header style={{ background: 'rgba(9, 9, 11, 0.7)', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.05)', backdropFilter: 'blur(16px)' }}>
        <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--yellow)', letterSpacing: -0.5, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>🎲</span> Ludo Pro
        </div>
        
        <div onClick={() => navigate('/chats')} style={{ position: 'relative', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)', width: 44, height: 44, borderRadius: '50%', transition: 'background 0.2s' }}>
          <span style={{ fontSize: 22 }}>💬</span>
          {totalUnread > 0 && (
            <span style={{ position: 'absolute', top: -2, right: -2, background: 'var(--red)', width: 18, height: 18, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, border: '2px solid #09090b', boxShadow: '0 2px 8px rgba(244,63,94,0.5)' }}>
              {totalUnread > 9 ? '9+' : totalUnread}
            </span>
          )}
        </div>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', paddingBottom: 100, display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Huge Welcome Card */}
        <div style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(139,92,246,0.15))', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 24, padding: 20, boxShadow: '0 8px 32px rgba(0,0,0,0.3)', backdropFilter: 'blur(10px)' }}>
          <div style={{ fontSize: 14, color: '#a1a1aa', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Welcome back</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#fff', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
            {user.username} <span style={{ fontSize: 26 }}>👋</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {[
              { icon: '🏆', value: user.wins, label: 'Wins', color: 'var(--yellow)' },
              { icon: '🎮', value: user.games_played, label: 'Games', color: 'var(--blue)' },
              { icon: '💀', value: user.kills, label: 'Kills', color: 'var(--red)' },
              { icon: '📈', value: rate + '%', label: 'Win %', color: 'var(--green)' },
            ].map(s => (
              <div key={s.label} style={{ background: 'rgba(0,0,0,0.4)', borderRadius: 16, padding: '12px 6px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: 18, marginBottom: 4 }}>{s.icon}</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 10, color: '#a1a1aa', fontWeight: 700, marginTop: 4, textTransform: 'uppercase' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Modern Play Section (Large Touch Targets) */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 24, padding: 20, backdropFilter: 'blur(10px)' }}>
          <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 16, color: 'var(--blue)', display: 'flex', alignItems: 'center', gap: 8 }}>
            🎮 Join or Create Room
          </div>
          
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <input
              value={roomCode}
              onChange={e => setRoomCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && joinGame()}
              placeholder="Enter Room Code"
              maxLength={20}
              style={{ flex: 1, padding: '0 20px', height: 52, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, color: '#fff', fontSize: 16, fontWeight: 600, outline: 'none', transition: 'border 0.3s' }}
            />
            <button onClick={genCode} title="Generate random code" style={{ width: 52, height: 52, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🎲</button>
          </div>
          
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={joinGame} style={{ flex: 1, height: 52, border: 'none', borderRadius: 16, background: 'linear-gradient(135deg, var(--blue), var(--purple))', color: '#fff', fontSize: 16, fontWeight: 800, boxShadow: '0 4px 15px rgba(59,130,246,0.4)' }}>
              ▶ Join Game
            </button>
            <button onClick={() => navigate('/game')} style={{ flex: 1, height: 52, border: '1px solid rgba(16,185,129,0.3)', borderRadius: 16, background: 'rgba(16,185,129,0.1)', color: 'var(--green)', fontSize: 16, fontWeight: 800 }}>
              🆕 Create Room
            </button>
          </div>
        </div>

        {/* Stacked Layout instead of Cramped Columns */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          
          {/* Leaderboard - Expanded */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 24, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--yellow)' }}>🏆 Top Players</div>
              <button onClick={openLeaderboard} style={{ background: 'none', border: 'none', color: 'var(--blue)', fontSize: 14, fontWeight: 700 }}>View All</button>
            </div>
            
            {leaderboard.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#71717a', padding: '20px 0', fontWeight: 500 }}>No data yet!</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {leaderboard.slice(0, 3).map((p, i) => (
                  <div key={p.username} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'rgba(0,0,0,0.2)', borderRadius: 16, border: '1px solid rgba(255,255,255,0.03)' }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: i===0?'rgba(255,215,0,0.2)':i===1?'rgba(192,192,192,0.2)':'rgba(205,127,50,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{medals[i] || (i + 1)}</div>
                    <div style={{ flex: 1, fontWeight: 700, fontSize: 16, color: i === 0 ? 'gold' : i === 1 ? '#c0c0c0' : '#cd7f32' }}>{p.username}</div>
                    <div style={{ fontSize: 14, color: 'var(--yellow)', fontWeight: 800, background: 'rgba(255,204,0,0.1)', padding: '4px 10px', borderRadius: 8 }}>{p.wins} Wins</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Games - Expanded */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 24, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>📋 Recent Matches</div>
              <Link to="/profile" style={{ color: 'var(--blue)', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>History</Link>
            </div>

            {recentGames.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#71717a', padding: '20px 0', fontWeight: 500 }}>No games played yet!</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {recentGames.slice(0, 3).map((g, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', background: 'rgba(0,0,0,0.2)', borderRadius: 16, border: '1px solid rgba(255,255,255,0.03)' }}>
                    <div style={{ width: 40, height: 40, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 18, background: g.rank === 1 ? 'linear-gradient(135deg, rgba(255,215,0,0.3), rgba(255,215,0,0.1))' : 'rgba(255,255,255,0.05)', color: g.rank === 1 ? 'gold' : '#a1a1aa', border: g.rank === 1 ? '1px solid rgba(255,215,0,0.3)' : 'none' }}>
                      #{g.rank}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 15, fontWeight: 700, color: colorHex[g.color] || '#fff', textTransform: 'capitalize' }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: colorHex[g.color] || '#fff', boxShadow: `0 0 8px ${colorHex[g.color]}` }}></div>
                        {g.color} Team
                      </div>
                      <div style={{ fontSize: 12, color: '#71717a', marginTop: 2, fontWeight: 500 }}>{g.total_players} Players</div>
                    </div>
                    <div style={{ fontSize: 14, color: 'var(--red)', fontWeight: 800, background: 'rgba(244,63,94,0.1)', padding: '6px 12px', borderRadius: 8 }}>
                      💀 {g.kills}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Leaderboard Modal (Beautified) */}
      {lbModal && (
        <div onClick={() => setLbModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'flex-end', padding: '0' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#18181b', borderTop: '1px solid rgba(255,215,0,0.3)', borderRadius: '24px 24px 0 0', padding: '24px 20px', width: '100%', height: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 -10px 40px rgba(0,0,0,0.5)' }}>
            
            <div style={{ width: 40, height: 5, background: 'rgba(255,255,255,0.2)', borderRadius: 4, margin: '0 auto 20px' }}></div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ color: 'var(--yellow)', fontSize: 22, fontWeight: 900 }}>🏆 Global Leaderboard</h3>
              <button onClick={() => setLbModal(false)} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer', borderRadius: 12, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
              {fullLb.length === 0 ? <p style={{ color: '#71717a', textAlign: 'center', fontSize: 15, marginTop: 40 }}>No players ranked yet!</p> : (
                fullLb.map((p, i) => (
                  <div key={p.username} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.04)', background: i<3?'rgba(255,255,255,0.02)':'transparent', borderRadius: i<3?16:0, marginBottom: i<3?8:0 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: i===0?'rgba(255,215,0,0.2)':i===1?'rgba(192,192,192,0.2)':i===2?'rgba(205,127,50,0.2)':'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 16, color: i===0?'gold':i===1?'#c0c0c0':i===2?'#cd7f32':'#a1a1aa' }}>
                      {i < 3 ? medals[i] : `#${i + 1}`}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, fontSize: 16, color: i === 0 ? 'gold' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : '#fff' }}>{p.username}</div>
                      <div style={{ fontSize: 12, color: 'var(--green)', fontWeight: 700, marginTop: 4 }}>{p.win_rate}% Win Rate</div>
                    </div>
                    <div style={{ fontSize: 16, color: 'var(--yellow)', fontWeight: 900 }}>{p.wins} <span style={{fontSize: 12, color: '#a1a1aa'}}>W</span></div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <BottomNav unreadCount={totalUnread} />
    </div>
  );
}