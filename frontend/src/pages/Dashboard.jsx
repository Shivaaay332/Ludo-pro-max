import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import BottomNav from '../components/BottomNav.jsx';

const colorHex = { blue: '#0084ff', red: '#ff3b3b', green: '#00b84c', yellow: '#ffcc00' };

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

  useEffect(() => {
    async function init() {
      const me = await authFetch('/api/auth/me').then(r => r.json());
      if (!me.success) { localStorage.removeItem('ludo_token'); navigate('/'); return; }
      setUser(me.user);
      const dash = await authFetch('/api/dashboard').then(r => r.json());
      if (dash.success) {
        setUser(dash.user);
        setLeaderboard(dash.leaderboard || []);
        setRecentGames(dash.recentGames || []);
      }
      setLoading(false);
    }
    init();
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

  async function logout() {
    await authFetch('/api/auth/logout', { method: 'POST' });
    localStorage.removeItem('ludo_token');
    navigate('/');
  }

  if (loading) return (
    <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#0a0a1a,#12122a,#1a1a35)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: 14 }}>
      Loading...
    </div>
  );

  const rate = user.games_played > 0 ? Math.round((user.wins / user.games_played) * 100) : 0;
  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#0a0a1a,#12122a,#1a1a35)', color: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <header style={{ background: 'rgba(0,0,0,0.6)', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ fontSize: 20, fontWeight: 900, color: '#ffcc00' }}>🎲 Ludo Pro</div>
        <button onClick={logout} style={{ background: 'rgba(255,59,59,0.15)', border: '1px solid rgba(255,59,59,0.3)', color: '#ff6b6b', fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 8, cursor: 'pointer' }}>Logout</button>
      </header>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 14px', paddingBottom: 74, display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Welcome + stats */}
        <div style={{ background: 'linear-gradient(135deg,rgba(0,132,255,0.15),rgba(124,58,237,0.15))', border: '1px solid rgba(0,132,255,0.2)', borderRadius: 14, padding: 14 }}>
          <div style={{ fontSize: 14, color: '#aaa', marginBottom: 4 }}>Welcome back,</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#fff', marginBottom: 12 }}>
            {user.username} <span style={{ color: '#ffcc00' }}>👋</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { icon: '🏆', value: user.wins, label: 'Wins', color: '#ffcc00' },
              { icon: '🎮', value: user.games_played, label: 'Games', color: '#0084ff' },
              { icon: '💀', value: user.kills, label: 'Kills', color: '#ff3b3b' },
              { icon: '📈', value: rate + '%', label: 'Win%', color: '#00b84c' },
            ].map(s => (
              <div key={s.label} style={{ flex: 1, background: 'rgba(0,0,0,0.3)', borderRadius: 10, padding: '8px 4px', textAlign: 'center' }}>
                <div style={{ fontSize: 15 }}>{s.icon}</div>
                <div style={{ fontSize: 15, fontWeight: 900, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 9, color: '#555', fontWeight: 600 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Play Section */}
        <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: '#0084ff' }}>🎮 Play Now</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={roomCode}
              onChange={e => setRoomCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && joinGame()}
              placeholder="Room Code"
              maxLength={20}
              style={{ flex: 1, padding: '11px 14px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#fff', fontSize: 15, outline: 'none', WebkitUserSelect: 'text', userSelect: 'text' }}
            />
            <button onClick={genCode} title="Generate random code" style={{ padding: '11px 13px', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, background: 'rgba(255,255,255,0.08)', color: '#ccc', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>🎲</button>
            <button onClick={joinGame} style={{ padding: '11px 18px', border: 'none', borderRadius: 10, background: 'linear-gradient(135deg,#0084ff,#5b21b6)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>▶ Go</button>
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
            <button onClick={() => navigate('/game')} style={{ flex: 1, padding: '10px', border: '1px solid rgba(0,184,76,0.4)', borderRadius: 10, background: 'rgba(0,184,76,0.1)', color: '#00b84c', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              🆕 Create New Room
            </button>
          </div>
        </div>

        {/* Two Column */}
        <div style={{ display: 'flex', gap: 10, minHeight: 160 }}>

          {/* Leaderboard */}
          <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: '#ffcc00' }}>🏆 Top Players</div>
            {leaderboard.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#555', fontSize: 11, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>No data yet!</div>
            ) : (
              <>
                {leaderboard.slice(0, 4).map((p, i) => (
                  <div key={p.username} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ width: 16, textAlign: 'center', fontSize: 12 }}>{medals[i] || (i + 1)}</div>
                    <div style={{ flex: 1, fontWeight: 600, fontSize: 12, color: i === 0 ? 'gold' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : '#ccc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.username}</div>
                    <div style={{ fontSize: 10, color: '#ffcc00', fontWeight: 700 }}>{p.wins}W</div>
                  </div>
                ))}
                <button onClick={openLeaderboard} style={{ marginTop: 'auto', padding: '6px 0', color: '#0084ff', fontSize: 11, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>View All →</button>
              </>
            )}
          </div>

          {/* Recent Games */}
          <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: '#0084ff' }}>📋 Recent</div>
            {recentGames.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#555', fontSize: 11, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>No games yet!</div>
            ) : (
              <>
                {recentGames.slice(0, 4).map((g, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ width: 18, height: 18, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 9, background: g.rank === 1 ? 'rgba(255,215,0,0.2)' : 'rgba(255,255,255,0.08)', color: g.rank === 1 ? 'gold' : '#888' }}>{g.rank}</div>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: colorHex[g.color] || '#fff', flexShrink: 0 }}></div>
                    <div style={{ flex: 1, fontSize: 11, fontWeight: 600, color: colorHex[g.color] || '#fff' }}>{g.color?.toUpperCase()}</div>
                    <div style={{ fontSize: 10, color: '#ff3b3b' }}>💀{g.kills}</div>
                  </div>
                ))}
                <Link to="/profile" style={{ display: 'block', textAlign: 'center', marginTop: 'auto', padding: '6px 0', color: '#0084ff', fontSize: 11, fontWeight: 600, textDecoration: 'none' }}>All →</Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Leaderboard Modal */}
      {lbModal && (
        <div onClick={() => setLbModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 500, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#13132a', border: '1px solid rgba(255,215,0,0.3)', borderRadius: 18, padding: 18, maxWidth: 420, width: '100%', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ color: 'gold', fontSize: 17 }}>🏆 Leaderboard</h3>
              <button onClick={() => setLbModal(false)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', fontSize: 16, cursor: 'pointer', borderRadius: 8, width: 32, height: 32 }}>✕</button>
            </div>
            {fullLb.length === 0 ? <p style={{ color: '#666', textAlign: 'center', fontSize: 13 }}>No games yet!</p> : (
              fullLb.map((p, i) => (
                <div key={p.username} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ width: 28, textAlign: 'center', fontWeight: 800, fontSize: 13 }}>{medals[i] || (i + 1)}</div>
                  <div style={{ flex: 1, fontWeight: 600, fontSize: 14, color: i === 0 ? 'gold' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : '#fff' }}>{p.username}</div>
                  <div style={{ fontSize: 12, color: '#ffcc00', fontWeight: 700 }}>{p.wins}W</div>
                  <div style={{ fontSize: 11, color: '#00b84c' }}>{p.win_rate}%</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
