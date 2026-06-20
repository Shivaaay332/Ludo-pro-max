import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import BottomNav from '../components/BottomNav.jsx';

const colorHex = { blue: '#3b82f6', red: '#f43f5e', green: '#10b981', yellow: '#f59e0b' };
const medals = { 1: '🥇', 2: '🥈', 3: '🥉', 4: '💔' };
const rankColors = { 1: 'gold', 2: '#c0c0c0', 3: '#cd7f32', 4: '#71717a' };

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

  if (loading) return <div style={{ height: '100vh', background: 'var(--bg-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a1a1aa' }}>Loading Profile...</div>;

  const rate = user.games_played > 0 ? Math.round((user.wins / user.games_played) * 100) : 0;
  const rankMap = {};
  rankCounts.forEach(r => rankMap[r.rank] = parseInt(r.count));
  const maxCount = Math.max(...Object.values(rankMap), 1);

  return (
    <div style={{ height: '100%', background: 'radial-gradient(circle at top, #1a1a2e, var(--bg-dark))', color: '#fff', display: 'flex', flexDirection: 'column' }}>

      <header style={{ background: 'rgba(9, 9, 11, 0.7)', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.05)', backdropFilter: 'blur(16px)' }}>
        <div style={{ fontSize: 22 }}>👤</div>
        <div style={{ fontSize: 20, fontWeight: 900, flex: 1 }}>Player Profile</div>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', paddingBottom: 100, display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Hero Profile Card */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 24, padding: 24, display: 'flex', alignItems: 'center', gap: 16, backdropFilter: 'blur(10px)', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
          <div style={{ width: 70, height: 70, borderRadius: '50%', background: 'linear-gradient(135deg, var(--blue), var(--purple))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, fontWeight: 900, flexShrink: 0, boxShadow: '0 4px 15px rgba(59,130,246,0.4)' }}>
            {user.username.charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 24, fontWeight: 900 }}>{user.username}</div>
            <div style={{ fontSize: 13, color: '#a1a1aa', marginTop: 4, fontWeight: 500 }}>
              Member since {new Date(user.created_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
            </div>
          </div>
        </div>

        {/* 2x2 Big Stats Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            { icon: '🏆', value: user.wins, label: 'Total Wins', color: 'var(--yellow)', bg: 'rgba(245,158,11,0.1)' },
            { icon: '📈', value: rate + '%', label: 'Win Rate', color: 'var(--green)', bg: 'rgba(16,185,129,0.1)' },
            { icon: '🎮', value: user.games_played, label: 'Matches', color: 'var(--blue)', bg: 'rgba(59,130,246,0.1)' },
            { icon: '💀', value: user.kills, label: 'Total Kills', color: 'var(--red)', bg: 'rgba(244,63,94,0.1)' },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 20, padding: '20px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, marginBottom: 12 }}>{s.icon}</div>
              <div style={{ fontSize: 26, fontWeight: 900, color: s.color, marginBottom: 4 }}>{s.value}</div>
              <div style={{ fontSize: 12, color: '#a1a1aa', fontWeight: 700, textTransform: 'uppercase' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Match History */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 24, padding: 20 }}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>📋 Recent Matches</div>
          {history.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 20, color: '#71717a', fontWeight: 500 }}>No games played yet.</div>
          ) : history.slice(0, 10).map((g, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: i !== Math.min(history.length, 10) - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
              <div style={{ width: 40, height: 40, borderRadius: '12px', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{medals[g.rank] || '💔'}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 16, fontWeight: 700, color: colorHex[g.color] || '#fff', textTransform: 'capitalize' }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: colorHex[g.color] || '#fff', boxShadow: `0 0 8px ${colorHex[g.color]}` }}></div>
                  {g.color}
                </div>
                <div style={{ fontSize: 12, color: '#71717a', marginTop: 2, fontWeight: 500 }}>{new Date(g.played_at).toLocaleDateString()}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 14, color: 'var(--red)', fontWeight: 800 }}>💀 {g.kills}</div>
                <div style={{ fontSize: 12, color: '#a1a1aa', marginTop: 2 }}>{g.total_players} Players</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}