import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';

const colorHex = { blue: '#0084ff', red: '#ff3b3b', green: '#00b84c', yellow: '#ffcc00' };
const medals = { 1: '🥇', 2: '🥈', 3: '🥉', 4: '💔' };
const rankColors = { 1: 'gold', 2: '#c0c0c0', 3: '#cd7f32', 4: '#555' };
const rankLabels = { 1: '1st 🥇', 2: '2nd 🥈', 3: '3rd 🥉', 4: 'Last' };

function authFetch(url, options = {}) {
  const token = localStorage.getItem('ludo_token');
  if (token) {
    options.headers = { ...options.headers, 'Authorization': 'Bearer ' + token };
  }
  return fetch(url, options);
}

export default function Profile() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [history, setHistory] = useState([]);
  const [rankCounts, setRankCounts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const me = await authFetch('/api/auth/me').then(r => r.json());
      if (!me.success) { 
        localStorage.removeItem('ludo_token');
        navigate('/'); return; 
      }
      const data = await authFetch('/api/profile').then(r => r.json());
      if (!data.success) return;
      setUser(data.user);
      setHistory(data.history || []);
      setRankCounts(data.rankCounts || []);
      setLoading(false);
    }
    init();
  }, [navigate]);

  async function logout() {
    await authFetch('/api/auth/logout', { method: 'POST' });
    localStorage.removeItem('ludo_token');
    navigate('/');
  }

  if (loading) return <div style={{ width: '100%', height: '100vh', background: 'linear-gradient(135deg,#0a0a1a,#12122a,#1a1a35)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: 14 }}>Loading...</div>;

  const rate = user.games_played > 0 ? Math.round((user.wins / user.games_played) * 100) : 0;
  const rankMap = {};
  rankCounts.forEach(r => rankMap[r.rank] = parseInt(r.count));
  const maxCount = Math.max(...Object.values(rankMap), 1);

  return (
    <div style={{ width: '100%', height: '100vh', background: 'linear-gradient(135deg,#0a0a1a,#12122a,#1a1a35)', color: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      
      {/* Header */}
      <header style={{ background: 'rgba(0,0,0,0.5)', padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: 8 }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--yellow)' }}>🎲 Ludo</div>
        <div style={{ display: 'flex', gap: 4 }}>
          <Link to="/dashboard" style={{ padding: '6px 10px', borderRadius: 8, color: '#aaa', fontWeight: 600, fontSize: 12 }}>Home</Link>
          <Link to="/friends" style={{ padding: '6px 10px', borderRadius: 8, color: '#aaa', fontWeight: 600, fontSize: 12 }}>👥</Link>
          <Link to="/profile" style={{ padding: '6px 10px', borderRadius: 8, color: 'var(--blue)', fontWeight: 600, fontSize: 12, background: 'rgba(0,132,255,0.2)' }}>👤</Link>
        </div>
        <button onClick={logout} style={{ background: 'transparent', border: 'none', color: '#666', fontSize: 12, cursor: 'pointer' }}>Logout</button>
      </header>

      {/* Content - Scrollable */}
      <div style={{ flex: 1, overflow: 'auto', padding: '10px 12px' }}>
        
        {/* Profile Card */}
        <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 14, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 50, height: 50, borderRadius: '50%', background: 'linear-gradient(135deg,#0084ff,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 900, flexShrink: 0 }}>
            {user.username.charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{user.username}</div>
            <div style={{ fontSize: 10, color: '#666' }}>Member since {new Date(user.created_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</div>
          </div>
          <Link to="/dashboard" style={{ background: 'linear-gradient(135deg,#0084ff,#5b21b6)', color: '#fff', padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, flexShrink: 0 }}>▶ Play</Link>
        </div>

        {/* Stats Row */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, overflowX: 'auto', paddingBottom: 4 }}>
          {[
            { icon: '🏆', value: user.wins, label: 'Wins', color: 'var(--yellow)' },
            { icon: '🎮', value: user.games_played, label: 'Games', color: 'var(--blue)' },
            { icon: '💀', value: user.kills, label: 'Kills', color: 'var(--red)' },
            { icon: '📈', value: rate + '%', label: 'Win%', color: 'var(--green)' },
          ].map(s => (
            <div key={s.label} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 12px', textAlign: 'center', minWidth: 65, flexShrink: 0 }}>
              <div style={{ fontSize: 16 }}>{s.icon}</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 9, color: '#666', fontWeight: 600 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Two Column Layout */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          
          {/* Placement History */}
          <div style={{ flex: 1, minWidth: '45%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>🎯 Placement</div>
            {rankCounts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 15, color: '#666', fontSize: 11 }}>No stats yet!</div>
            ) : [1, 2, 3, 4].map(r => {
              const count = rankMap[r] || 0;
              const pct = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
              return (
                <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 10, background: `${rankColors[r]}22`, color: rankColors[r] }}>{r}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 600, fontSize: 10 }}>{rankLabels[r]}</span>
                      <span style={{ fontWeight: 900, fontSize: 11, color: rankColors[r] }}>{count}</span>
                    </div>
                    <div style={{ width: '100%', height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, marginTop: 2 }}>
                      <div style={{ width: pct + '%', height: '100%', borderRadius: 2, background: rankColors[r] }}></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Recent Games */}
          <div style={{ flex: 1, minWidth: '45%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>📋 Recent</div>
            {history.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 15, color: '#666', fontSize: 11 }}>No games yet!</div>
            ) : history.slice(0, 4).map((g, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                <div style={{ width: 18, height: 18, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 9, background: g.rank === 1 ? 'rgba(255,215,0,0.2)' : 'rgba(255,255,255,0.1)', color: g.rank === 1 ? 'gold' : '#888' }}>{g.rank}</div>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: colorHex[g.color] || '#fff', flexShrink: 0 }}></div>
                <div style={{ flex: 1, fontSize: 10, fontWeight: 600 }}>{g.color?.toUpperCase()}</div>
                <div style={{ fontSize: 10, color: '#888' }}>{g.total_players}P</div>
                <div style={{ fontSize: 10, color: 'var(--red)' }}>💀{g.kills}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
