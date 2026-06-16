import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';

const colorHex = { blue: '#0084ff', red: '#ff3b3b', green: '#00b84c', yellow: '#ffcc00' };

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

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

  if (loading) return <div style={{ width: '100%', height: '100vh', background: 'linear-gradient(135deg,#0a0a1a,#12122a,#1a1a35)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: 14 }}>Loading...</div>;

  const rate = user.games_played > 0 ? Math.round((user.wins / user.games_played) * 100) : 0;
  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div style={{ width: '100%', height: '100vh', background: 'linear-gradient(135deg,#0a0a1a,#12122a,#1a1a35)', color: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      
      {/* Header */}
      <header style={{ background: 'rgba(0,0,0,0.5)', padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: 8 }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--yellow)' }}>🎲 Ludo</div>
        <div style={{ display: 'flex', gap: 4 }}>
          <Link to="/dashboard" style={{ padding: '6px 10px', borderRadius: 8, color: 'var(--blue)', fontWeight: 600, fontSize: 12, background: 'rgba(0,132,255,0.2)' }}>Home</Link>
          <Link to="/friends" style={{ padding: '6px 10px', borderRadius: 8, color: '#aaa', fontWeight: 600, fontSize: 12 }}>👥</Link>
          <Link to="/profile" style={{ padding: '6px 10px', borderRadius: 8, color: '#aaa', fontWeight: 600, fontSize: 12 }}>👤</Link>
        </div>
        <button onClick={logout} style={{ background: 'transparent', border: 'none', color: '#666', fontSize: 12, cursor: 'pointer' }}>Logout</button>
      </header>

      {/* Content - Scrollable */}
      <div style={{ flex: 1, overflow: 'auto', padding: '10px 12px' }}>
        
        {/* Welcome */}
        <div style={{ marginBottom: 10 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800 }}>Hi, <span style={{ color: 'var(--yellow)' }}>{user.username}</span>! 👋</h2>
        </div>

        {/* Stats - Horizontal Scroll */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, overflowX: 'auto', paddingBottom: 4 }}>
          {[
            { icon: '🏆', value: user.wins, label: 'Wins', color: 'var(--yellow)' },
            { icon: '🎮', value: user.games_played, label: 'Games', color: 'var(--blue)' },
            { icon: '💀', value: user.kills, label: 'Kills', color: 'var(--red)' },
            { icon: '📈', value: rate + '%', label: 'Win%', color: 'var(--green)' },
          ].map(s => (
            <div key={s.label} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 70, flexShrink: 0 }}>
              <div style={{ fontSize: 18 }}>{s.icon}</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 10, color: '#666', fontWeight: 600 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Play Section */}
        <div style={{ background: 'linear-gradient(135deg,rgba(0,132,255,0.2),rgba(124,58,237,0.2))', border: '1px solid rgba(0,132,255,0.3)', borderRadius: 12, padding: 14, marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>🎮 Play Now</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={roomCode} onChange={e => setRoomCode(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && joinGame()} placeholder="Room Code" maxLength={20}
              style={{ flex: 1, padding: '10px 12px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff', fontSize: 14, outline: 'none' }} />
            <button onClick={genCode} style={{ padding: '10px 12px', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, background: 'rgba(255,255,255,0.1)', color: '#ccc', fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>🎲</button>
            <button onClick={joinGame} style={{ padding: '10px 14px', border: 'none', borderRadius: 8, background: 'linear-gradient(135deg,#0084ff,#5b21b6)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>▶</button>
          </div>
        </div>

        {/* Two Column Layout */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          
          {/* Leaderboard */}
          <div style={{ flex: 1, minWidth: '45%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>🏆 Top Players</div>
            {leaderboard.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 20, color: '#666', fontSize: 12 }}>No data yet!</div>
            ) : leaderboard.slice(0, 3).map((p, i) => (
              <div key={p.username} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ width: 20, textAlign: 'center', fontWeight: 800, fontSize: 12 }}>{medals[i] || i + 1}</div>
                <div style={{ flex: 1, fontWeight: 600, fontSize: 12, color: i === 0 ? 'gold' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : '#fff' }}>{p.username}</div>
                <div style={{ fontSize: 11, color: 'var(--yellow)' }}>{p.wins}W</div>
              </div>
            ))}
            <button onClick={openLeaderboard} style={{ display: 'block', width: '100%', textAlign: 'center', marginTop: 8, color: 'var(--blue)', fontSize: 11, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>More →</button>
          </div>

          {/* Recent Games */}
          <div style={{ flex: 1, minWidth: '45%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>📋 Recent</div>
            {recentGames.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 20, color: '#666', fontSize: 12 }}>No games yet!</div>
            ) : recentGames.slice(0, 3).map((g, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 10, background: g.rank === 1 ? 'rgba(255,215,0,0.2)' : 'rgba(255,255,255,0.1)', color: g.rank === 1 ? 'gold' : '#888' }}>{g.rank}</div>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: colorHex[g.color] || '#fff', flexShrink: 0 }}></div>
                <div style={{ flex: 1, fontSize: 11, fontWeight: 600 }}>{g.color?.toUpperCase()}</div>
                <div style={{ fontSize: 10, color: 'var(--red)' }}>💀{g.kills}</div>
              </div>
            ))}
            <Link to="/profile" style={{ display: 'block', textAlign: 'center', marginTop: 8, color: 'var(--blue)', fontSize: 11, fontWeight: 600 }}>All Games →</Link>
          </div>
        </div>
      </div>

      {/* Leaderboard Modal */}
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
                  <div style={{ fontSize: 12, color: 'var(--yellow)' }}>{p.wins}W</div>
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
