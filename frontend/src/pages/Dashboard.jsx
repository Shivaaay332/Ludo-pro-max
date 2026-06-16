import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';

const colorHex = { blue: '#0084ff', red: '#ff3b3b', green: '#00b84c', yellow: '#ffcc00' };

function authFetch(url, options = {}) {
  const token = localStorage.getItem('ludo_token');
  if (token) {
    options.headers = { ...options.headers, 'Authorization': 'Bearer ' + token };
  }
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
      if (!me.success) { 
        localStorage.removeItem('ludo_token');
        navigate('/'); return; 
      }
      const dash = await authFetch('/api/dashboard').then(r => r.json());
      if (!dash.success) return;
      setUser(dash.user);
      setLeaderboard(dash.leaderboard);
      setRecentGames(dash.recentGames);
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
      <header style={{ background: 'rgba(0,0,0,0.5)', padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: 8 }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: '#ffcc00' }}>🎲 Ludo</div>
        <div style={{ display: 'flex', gap: 4 }}>
          <Link to="/dashboard" style={{ padding: '6px 10px', borderRadius: 8, color: '#0084ff', fontWeight: 600, fontSize: 12, background: 'rgba(0,132,255,0.2)', textDecoration: 'none' }}>Home</Link>
          <Link to="/friends" style={{ padding: '6px 10px', borderRadius: 8, color: '#aaa', fontWeight: 600, fontSize: 12, textDecoration: 'none' }}>👥</Link>
          <Link to="/profile" style={{ padding: '6px 10px', borderRadius: 8, color: '#aaa', fontWeight: 600, fontSize: 12, textDecoration: 'none' }}>👤</Link>
        </div>
        <button onClick={logout} style={{ background: 'transparent', border: 'none', color: '#666', fontSize: 12, cursor: 'pointer' }}>Logout</button>
      </header>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        
        {/* Welcome */}
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 800 }}>Hi, <span style={{ color: '#ffcc00' }}>{user.username}</span>! 👋</h2>
        </div>

        {/* Stats - Horizontal */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
          {[
            { icon: '🏆', value: user.wins, label: 'Wins', color: '#ffcc00' },
            { icon: '🎮', value: user.games_played, label: 'Games', color: '#0084ff' },
            { icon: '💀', value: user.kills, label: 'Kills', color: '#ff3b3b' },
            { icon: '📈', value: rate + '%', label: 'Win%', color: '#00b84c' },
          ].map(s => (
            <div key={s.label} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 65, flexShrink: 0 }}>
              <div style={{ fontSize: 16 }}>{s.icon}</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 9, color: '#666', fontWeight: 600 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Play Section */}
        <div style={{ background: 'linear-gradient(135deg,rgba(0,132,255,0.2),rgba(124,58,237,0.2))', border: '1px solid rgba(0,132,255,0.3)', borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>🎮 Play Now</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={roomCode} onChange={e => setRoomCode(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && joinGame()} placeholder="Room Code" maxLength={20}
              style={{ flex: 1, padding: '10px 12px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff', fontSize: 14, outline: 'none' }} />
            <button onClick={genCode} style={{ padding: '10px 12px', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, background: 'rgba(255,255,255,0.1)', color: '#ccc', fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>🎲</button>
            <button onClick={joinGame} style={{ padding: '10px 14px', border: 'none', borderRadius: 8, background: 'linear-gradient(135deg,#0084ff,#5b21b6)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>▶</button>
          </div>
        </div>

        {/* Two Column */}
        <div style={{ display: 'flex', gap: 8, flex: 1, minHeight: 0 }}>
          
          {/* Leaderboard */}
          <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 10, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>🏆 Top Players</div>
            {leaderboard.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#666', fontSize: 11, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>No data!</div>
            ) : (
              <>
                {leaderboard.slice(0, 3).map((p, i) => (
                  <div key={p.username} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ width: 18, textAlign: 'center', fontWeight: 800, fontSize: 11 }}>{medals[i] || i + 1}</div>
                    <div style={{ flex: 1, fontWeight: 600, fontSize: 11, color: i === 0 ? 'gold' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : '#fff' }}>{p.username}</div>
                    <div style={{ fontSize: 10, color: '#ffcc00' }}>{p.wins}W</div>
                  </div>
                ))}
                <button onClick={openLeaderboard} style={{ display: 'block', width: '100%', textAlign: 'center', marginTop: 6, color: '#0084ff', fontSize: 10, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>More →</button>
              </>
            )}
          </div>

          {/* Recent Games */}
          <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 10, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>📋 Recent</div>
            {recentGames.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#666', fontSize: 11, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>No games!</div>
            ) : (
              <>
                {recentGames.slice(0, 3).map((g, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ width: 18, height: 18, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 9, background: g.rank === 1 ? 'rgba(255,215,0,0.2)' : 'rgba(255,255,255,0.1)', color: g.rank === 1 ? 'gold' : '#888' }}>{g.rank}</div>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: colorHex[g.color] || '#fff', flexShrink: 0 }}></div>
                    <div style={{ flex: 1, fontSize: 10, fontWeight: 600 }}>{g.color?.toUpperCase()}</div>
                    <div style={{ fontSize: 9, color: '#ff3b3b' }}>💀{g.kills}</div>
                  </div>
                ))}
                <Link to="/profile" style={{ display: 'block', textAlign: 'center', marginTop: 6, color: '#0084ff', fontSize: 10, fontWeight: 600, textDecoration: 'none' }}>All →</Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Modal */}
      {lbModal && (
        <div onClick={() => setLbModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 500, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 15 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#16162a', border: '1px solid rgba(255,215,0,0.3)', borderRadius: 16, padding: 16, maxWidth: 400, width: '100%', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ color: 'gold', fontSize: 16 }}>🏆 Leaderboard</h3>
              <button onClick={() => setLbModal(false)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 16, cursor: 'pointer' }}>✕</button>
            </div>
            {fullLb.length === 0 ? <p style={{ color: '#666', textAlign: 'center', fontSize: 13 }}>No games yet!</p> : (
              fullLb.map((p, i) => (
                <div key={p.username} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ width: 24, textAlign: 'center', fontWeight: 800, fontSize: 12 }}>{medals[i] || i + 1}</div>
                  <div style={{ flex: 1, fontWeight: 600, fontSize: 13, color: i === 0 ? 'gold' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : '#fff' }}>{p.username}</div>
                  <div style={{ fontSize: 12, color: '#ffcc00' }}>{p.wins}W</div>
                  <div style={{ fontSize: 12, color: '#00b84c' }}>{p.win_rate}%</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
