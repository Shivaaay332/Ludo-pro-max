import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';

const colorHex = { blue: '#0084ff', red: '#ff3b3b', green: '#00b84c', yellow: '#ffcc00' };
const medals = { 1: '🥇', 2: '🥈', 3: '🥉', 4: '💔' };
const rankColors = { 1: 'gold', 2: '#c0c0c0', 3: '#cd7f32', 4: '#555' };
const rankLabels = { 1: '1st Place 🥇', 2: '2nd Place 🥈', 3: '3rd Place 🥉', 4: 'Last Place' };

export default function Profile() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [history, setHistory] = useState([]);
  const [rankCounts, setRankCounts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const me = await fetch('/api/auth/me').then(r => r.json());
      if (!me.success) { navigate('/'); return; }
      const data = await fetch('/api/profile').then(r => r.json());
      if (!data.success) return;
      setUser(data.user);
      setHistory(data.history);
      setRankCounts(data.rankCounts);
      setLoading(false);
    }
    init();
  }, [navigate]);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    navigate('/');
  }

  if (loading) return <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0a0a1a,#12122a,#1a1a35)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555' }}>Loading profile...</div>;

  const rate = user.games_played > 0 ? Math.round((user.wins / user.games_played) * 100) : 0;
  const rankMap = {};
  rankCounts.forEach(r => rankMap[r.rank] = parseInt(r.count));
  const maxCount = Math.max(...Object.values(rankMap), 1);

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0a0a1a,#12122a,#1a1a35)', color: '#fff' }}>
      <nav style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--yellow)' }}>🎲 Ludo Pro</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Link to="/dashboard" style={{ padding: '8px 16px', borderRadius: 10, color: '#aaa', fontWeight: 600, fontSize: 14 }}>Dashboard</Link>
          <Link to="/profile" style={{ padding: '8px 16px', borderRadius: 10, color: 'var(--blue)', fontWeight: 600, fontSize: 14, background: 'rgba(0,132,255,0.2)' }}>Profile</Link>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 20, padding: '6px 14px', fontSize: 13, fontWeight: 700 }}>👤 {user.username}</div>
          <button onClick={logout} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '7px 14px', color: '#aaa', fontSize: 13, cursor: 'pointer' }}>Logout</button>
        </div>
      </nav>

      <main style={{ maxWidth: 900, margin: '0 auto', padding: '32px 20px' }}>
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 32, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'linear-gradient(135deg,#0084ff,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, fontWeight: 900, boxShadow: '0 8px 24px rgba(0,132,255,0.3)', flexShrink: 0 }}>
            {user.username.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 style={{ fontSize: 26, fontWeight: 900 }}>{user.username}</h2>
            <p style={{ color: '#888', marginTop: 4, fontSize: 14 }}>Ludo Pro Player</p>
            <div style={{ marginTop: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 20, padding: '4px 12px', fontSize: 12, color: '#aaa', display: 'inline-block' }}>
              📅 Member since {new Date(user.created_at).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
            </div>
          </div>
          <Link to="/dashboard" style={{ marginLeft: 'auto', background: 'linear-gradient(135deg,#0084ff,#5b21b6)', color: '#fff', padding: '14px 28px', borderRadius: 12, fontSize: 15, fontWeight: 700 }}>🎮 Play Now</Link>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
          {[
            { icon: '🏆', value: user.wins, label: 'Wins', color: 'var(--yellow)' },
            { icon: '🎮', value: user.games_played, label: 'Games', color: 'var(--blue)' },
            { icon: '💀', value: user.kills, label: 'Kills', color: 'var(--red)' },
            { icon: '📈', value: rate + '%', label: 'Win Rate', color: 'var(--green)' },
          ].map(s => (
            <div key={s.label} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 20, textAlign: 'center' }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>{s.icon}</div>
              <div style={{ fontSize: 30, fontWeight: 900, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700, marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 20 }}>
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, padding: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 18 }}>🎯 Placement History</div>
            {rankCounts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#666' }}><div style={{ fontSize: 40 }}>🎮</div><p>Play some games to see stats!</p></div>
            ) : [1, 2, 3, 4].map(r => {
              const count = rankMap[r] || 0;
              const pct = Math.round((count / maxCount) * 100);
              return (
                <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 15, background: `${rankColors[r]}22`, color: rankColors[r], border: `2px solid ${rankColors[r]}`, flexShrink: 0 }}>{r}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{rankLabels[r]}</span>
                      <span style={{ fontWeight: 900, fontSize: 20, color: rankColors[r] }}>{count}</span>
                    </div>
                    <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3 }}>
                      <div style={{ width: pct + '%', height: '100%', borderRadius: 3, background: rankColors[r], transition: 'width 1s ease' }}></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, padding: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 18 }}>📋 Recent Games</div>
            {history.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#666' }}><div style={{ fontSize: 40 }}>🎮</div><p>No games yet. Start playing!</p></div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ color: '#666', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {['Result', 'Color', 'Players', 'Kills', 'Date'].map(h => <th key={h} style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {history.map((g, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '12px 10px' }}><span style={{ fontSize: 15 }}>{medals[g.rank] || g.rank}</span> <span style={{ fontSize: 12, color: '#aaa' }}>#{g.rank}</span></td>
                      <td style={{ padding: '12px 10px' }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: colorHex[g.color] || '#fff', display: 'inline-block', marginRight: 6 }}></span>{g.color.toUpperCase()}</td>
                      <td style={{ padding: '12px 10px', color: '#888' }}>{g.total_players}P</td>
                      <td style={{ padding: '12px 10px', color: 'var(--red)', fontWeight: 700 }}>💀 {g.kills}</td>
                      <td style={{ padding: '12px 10px', color: '#666', fontSize: 12 }}>{new Date(g.played_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
