import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import BottomNav from '../components/BottomNav.jsx';

const colorHex = { blue: '#0084ff', red: '#ff3b3b', green: '#00b84c', yellow: '#ffcc00' };
const medals = { 1: '🥇', 2: '🥈', 3: '🥉', 4: '💔' };
const rankColors = { 1: 'gold', 2: '#c0c0c0', 3: '#cd7f32', 4: '#555' };
const rankLabels = { 1: '1st 🥇', 2: '2nd 🥈', 3: '3rd 🥉', 4: 'Last' };

function authFetch(url, options = {}) {
  const token = localStorage.getItem('ludo_token');
  if (token) options.headers = { ...options.headers, 'Authorization': 'Bearer ' + token };
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
      if (!me.success) { localStorage.removeItem('ludo_token'); navigate('/'); return; }
      const data = await authFetch('/api/profile').then(r => r.json());
      if (!data.success) return;
      setUser(data.user);
      setHistory(data.history || []);
      setRankCounts(data.rankCounts || []);
      setLoading(false);
    }
    init();
  }, [navigate]);

  if (loading) return (
    <div style={{ width: '100%', height: '100vh', background: 'linear-gradient(135deg,#0a0a1a,#12122a,#1a1a35)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: 14 }}>Loading...</div>
  );

  const rate = user.games_played > 0 ? Math.round((user.wins / user.games_played) * 100) : 0;
  const rankMap = {};
  rankCounts.forEach(r => rankMap[r.rank] = parseInt(r.count));
  const maxCount = Math.max(...Object.values(rankMap), 1);

  return (
    <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#0a0a1a,#12122a,#1a1a35)', color: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <header style={{ background: 'rgba(0,0,0,0.6)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ fontSize: 20 }}>👤</div>
        <div style={{ fontSize: 17, fontWeight: 800, flex: 1 }}>Profile</div>
        <Link to="/dashboard" style={{ background: 'linear-gradient(135deg,#0084ff,#5b21b6)', color: '#fff', padding: '7px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>▶ Play</Link>
      </header>

      {/* Content - Scrollable */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 14px', paddingBottom: 74, display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Profile Card */}
        <div style={{ background: 'linear-gradient(135deg,rgba(0,132,255,0.15),rgba(124,58,237,0.15))', border: '1px solid rgba(0,132,255,0.2)', borderRadius: 14, padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 58, height: 58, borderRadius: '50%', background: 'linear-gradient(135deg,#0084ff,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 900, flexShrink: 0 }}>
            {user.username.charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 900 }}>{user.username}</div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
              Joined {new Date(user.created_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
            </div>
            <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
              <span style={{ background: 'rgba(255,204,0,0.15)', color: '#ffcc00', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>🏆 {user.wins} Wins</span>
              <span style={{ background: 'rgba(0,184,76,0.15)', color: '#00b84c', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>{rate}% Rate</span>
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { icon: '🏆', value: user.wins, label: 'Wins', color: '#ffcc00' },
            { icon: '🎮', value: user.games_played, label: 'Games', color: '#0084ff' },
            { icon: '💀', value: user.kills, label: 'Kills', color: '#ff3b3b' },
            { icon: '📈', value: rate + '%', label: 'Win%', color: '#00b84c' },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '10px 4px', textAlign: 'center' }}>
              <div style={{ fontSize: 15 }}>{s.icon}</div>
              <div style={{ fontSize: 15, fontWeight: 900, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 9, color: '#555', fontWeight: 600 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Placement History */}
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: '#fff' }}>🎯 Placement Distribution</div>
          {rankCounts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 20, color: '#555', fontSize: 12 }}>Play some games to see your stats!</div>
          ) : [1, 2, 3, 4].map(r => {
            const count = rankMap[r] || 0;
            const pct = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
            return (
              <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 11, background: `${rankColors[r]}22`, color: rankColors[r], flexShrink: 0 }}>{r}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontWeight: 600, fontSize: 11, color: '#ccc' }}>{rankLabels[r]}</span>
                    <span style={{ fontWeight: 900, fontSize: 12, color: rankColors[r] }}>{count}x</span>
                  </div>
                  <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                    <div style={{ width: pct + '%', height: '100%', borderRadius: 2, background: rankColors[r], transition: 'width 0.5s ease' }}></div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Recent Games */}
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: '#fff' }}>📋 Recent Games</div>
          {history.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 20, color: '#555', fontSize: 12 }}>No games yet. Start playing!</div>
          ) : history.slice(0, 10).map((g, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 10, background: g.rank === 1 ? 'rgba(255,215,0,0.2)' : 'rgba(255,255,255,0.08)', color: g.rank === 1 ? 'gold' : '#888', flexShrink: 0 }}>{medals[g.rank] || g.rank}</div>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: colorHex[g.color] || '#fff', flexShrink: 0 }}></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: colorHex[g.color] || '#fff' }}>{g.color?.toUpperCase()}</div>
                <div style={{ fontSize: 10, color: '#555' }}>{new Date(g.played_at).toLocaleDateString()}</div>
              </div>
              <div style={{ fontSize: 11, color: '#888' }}>{g.total_players}P</div>
              <div style={{ fontSize: 11, color: '#ff3b3b', fontWeight: 700 }}>💀{g.kills}</div>
            </div>
          ))}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
