import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';

const colorHex = { blue: '#0084ff', red: '#ff3b3b', green: '#00b84c', yellow: '#ffcc00' };

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// Helper function for authenticated fetch
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

  if (loading) return <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0a0a1a,#12122a,#1a1a35)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555' }}>Loading your dashboard...</div>;

  const rate = user.games_played > 0 ? Math.round((user.wins / user.games_played) * 100) : 0;
  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0a0a1a,#12122a,#1a1a35)', color: '#fff' }}>
      <nav style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--yellow)' }}>🎲 Ludo Pro</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <NavLink to="/dashboard" active>Dashboard</NavLink>
          <NavLink to="/profile">Profile</NavLink>
          <NavLink to="/friends">👥 Friends</NavLink>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 20, padding: '6px 14px', fontSize: 13, fontWeight: 700 }}>👤 {user.username}</div>
          <button onClick={logout} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '7px 14px', color: '#aaa', fontSize: 13, cursor: 'pointer' }}>Logout</button>
        </div>
      </nav>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 20px' }}>
        <div style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 28, fontWeight: 800 }} className="welcome-text">Welcome back, <span style={{ color: 'var(--yellow)' }}>{user.username}</span>! 👋</h2>
          <p style={{ color: '#888', marginTop: 6, fontSize: 15 }}>Ready for another round? Create or join a room below.</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 32 }} className="stats-grid">
          {[
            { icon: '🏆', value: user.wins, label: 'Wins', color: 'var(--yellow)' },
            { icon: '🎮', value: user.games_played, label: 'Games Played', color: 'var(--blue)' },
            { icon: '💀', value: user.kills, label: 'Total Kills', color: 'var(--red)' },
            { icon: '📈', value: rate + '%', label: 'Win Rate', color: 'var(--green)' },
          ].map(s => (
            <div key={s.label} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '22px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 26 }}>{s.icon}</div>
              <div style={{ fontSize: 34, fontWeight: 900, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 12, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{ background: 'linear-gradient(135deg,rgba(0,132,255,0.15),rgba(124,58,237,0.15))', border: '1px solid rgba(0,132,255,0.25)', borderRadius: 18, padding: 28, marginBottom: 24 }}>
          <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>🎮 Play Now</h3>
          <p style={{ color: '#aaa', fontSize: 14, marginBottom: 16 }}>Enter a room code to join friends, or generate a random one to start a new room.</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 10, flex: 1, minWidth: 220 }}>
              <input value={roomCode} onChange={e => setRoomCode(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && joinGame()} placeholder="Enter Room Code" maxLength={20}
                style={{ flex: 1, padding: '13px 16px', background: 'rgba(255,255,255,0.08)', border: '1.5px solid rgba(255,255,255,0.15)', borderRadius: 12, color: '#fff', fontSize: 15, outline: 'none' }} />
              <button onClick={genCode} style={{ padding: '13px 18px', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, background: 'rgba(255,255,255,0.08)', color: '#ccc', fontSize: 15, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>🎲 Random</button>
            </div>
            <button onClick={joinGame} style={{ padding: '13px 22px', border: 'none', borderRadius: 12, background: 'linear-gradient(135deg,#0084ff,#5b21b6)', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>Play Game →</button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }} className="dashboard-grid">
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, padding: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 18 }}>🏆 Top Players</div>
            {leaderboard.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 20px', color: '#666' }}><div style={{ fontSize: 36 }}>🎮</div><p style={{ fontSize: 14 }}>No games played yet!</p></div>
            ) : leaderboard.map((p, i) => (
              <div key={p.username} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ width: 28, textAlign: 'center', fontWeight: 800 }}>{medals[i] || (i + 1)}</div>
                <div style={{ flex: 1, fontWeight: 700, fontSize: 14, color: i === 0 ? 'gold' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : '#fff' }}>{p.username}</div>
                <div style={{ color: 'var(--yellow)', fontWeight: 800, fontSize: 14 }}>{p.wins}W</div>
                <div style={{ fontSize: 12, color: '#888' }}>{p.win_rate}%</div>
              </div>
            ))}
            <button onClick={openLeaderboard} style={{ display: 'block', width: '100%', textAlign: 'center', marginTop: 14, color: 'var(--blue)', fontSize: 13, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer' }}>See full leaderboard →</button>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, padding: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 18 }}>📋 Recent Games</div>
            {recentGames.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 20px', color: '#666' }}><div style={{ fontSize: 36 }}>🎮</div><p style={{ fontSize: 14 }}>No games played yet.<br />Start your first game!</p></div>
            ) : recentGames.map((g, i) => {
              const date = new Date(g.played_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
              const rankColors = { 1: 'gold', 2: '#c0c0c0', 3: '#cd7f32', 4: '#aaa' };
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 14, background: `rgba(${g.rank===1?'255,215,0':g.rank===2?'192,192,192':g.rank===3?'205,127,50':'100,100,100'},0.2)`, color: rankColors[g.rank], border: `2px solid ${rankColors[g.rank]}` }}>{g.rank}</div>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: colorHex[g.color] || '#fff', flexShrink: 0 }}></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>#{g.rank} Place — {g.color.toUpperCase()}</div>
                    <div style={{ fontSize: 12, color: '#888' }}>{g.total_players} players</div>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--red)', fontWeight: 700 }}>💀 {g.kills}</div>
                  <div style={{ fontSize: 11, color: '#666', minWidth: 70, textAlign: 'right' }}>{date}</div>
                </div>
              );
            })}
            <Link to="/profile" style={{ display: 'block', textAlign: 'center', marginTop: 14, color: 'var(--blue)', fontSize: 13, fontWeight: 700 }}>View all games →</Link>
          </div>
        </div>
      </main>

      {lbModal && (
        <div onClick={() => setLbModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 500, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#16162a', border: '1px solid rgba(255,215,0,0.3)', borderRadius: 20, padding: 28, maxWidth: 500, width: '100%', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ color: 'gold', fontSize: 20 }}>🏆 Global Leaderboard</h3>
              <button onClick={() => setLbModal(false)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8, padding: '6px 12px', color: '#fff', cursor: 'pointer' }}>✕</button>
            </div>
            {fullLb.length === 0 ? <p style={{ color: '#666', textAlign: 'center' }}>No games played yet!</p> : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead><tr style={{ color: '#666', fontSize: 12, textTransform: 'uppercase' }}>
                  <th style={{ padding: '6px 4px', textAlign: 'left' }}>#</th>
                  <th style={{ padding: '6px 4px', textAlign: 'left' }}>Player</th>
                  <th style={{ padding: '6px 4px' }}>Wins</th>
                  <th style={{ padding: '6px 4px' }}>Games</th>
                  <th style={{ padding: '6px 4px', color: '#ff6b6b' }}>Kills</th>
                  <th style={{ padding: '6px 4px' }}>Win%</th>
                </tr></thead>
                <tbody>
                  {fullLb.map((p, i) => (
                    <tr key={p.username} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '10px 4px', fontWeight: 800 }}>{medals[i] || i + 1}</td>
                      <td style={{ padding: '10px 4px', fontWeight: 700, color: i === 0 ? 'gold' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : '#fff' }}>{p.username}</td>
                      <td style={{ padding: '10px 4px', textAlign: 'center', color: '#ffcc00', fontWeight: 800 }}>{p.wins}</td>
                      <td style={{ padding: '10px 4px', textAlign: 'center', color: '#aaa' }}>{p.games_played}</td>
                      <td style={{ padding: '10px 4px', textAlign: 'center', color: '#ff6b6b', fontWeight: 700 }}>{p.kills}</td>
                      <td style={{ padding: '10px 4px', textAlign: 'center', color: '#00b84c' }}>{p.win_rate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NavLink({ to, children, active }) {
  return (
    <Link to={to} style={{ padding: '8px 16px', borderRadius: 10, color: active ? 'var(--blue)' : '#aaa', fontWeight: 600, fontSize: 14, background: active ? 'rgba(0,132,255,0.2)' : 'transparent' }}>{children}</Link>
  );
}
