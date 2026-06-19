import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import BottomNav from '../components/BottomNav.jsx';

function authFetch(url, options = {}) {
  const token = localStorage.getItem('ludo_token');
  if (token) options.headers = { ...options.headers, 'Authorization': 'Bearer ' + token };
  return fetch(url, options);
}

export default function Settings() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [sound, setSound] = useState(() => localStorage.getItem('ludo_sound') !== 'off');
  const [notifications, setNotifications] = useState(() => localStorage.getItem('ludo_notif') !== 'off');
  const [theme, setTheme] = useState(() => localStorage.getItem('ludo_theme') || 'dark');
  const [showPwForm, setShowPwForm] = useState(false);
  const [pwOld, setPwOld] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  
  // Privacy & Block States
  const [showBlocked, setShowBlocked] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState([]);
  
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authFetch('/api/auth/me').then(r => r.json()).then(d => {
      if (!d.success) { localStorage.removeItem('ludo_token'); navigate('/'); return; }
      setUser(d.user);
      setLoading(false);
    }).catch(() => { navigate('/'); });
  }, [navigate]);

  function toggleSound() {
    const next = !sound;
    setSound(next);
    localStorage.setItem('ludo_sound', next ? 'on' : 'off');
  }

  function toggleNotif() {
    const next = !notifications;
    setNotifications(next);
    localStorage.setItem('ludo_notif', next ? 'on' : 'off');
  }

  function setThemePref(t) {
    setTheme(t);
    localStorage.setItem('ludo_theme', t);
  }

  async function changePassword() {
    if (!pwOld || !pwNew) { setPwMsg('Fill both fields'); return; }
    if (pwNew.length < 6) { setPwMsg('New password must be 6+ chars'); return; }
    const data = await authFetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPassword: pwOld, newPassword: pwNew })
    }).then(r => r.json());
    setPwMsg(data.success ? '✅ Password changed!' : (data.error || 'Failed'));
    if (data.success) { setPwOld(''); setPwNew(''); setShowPwForm(false); }
  }

  async function loadBlockedUsers() {
    const data = await authFetch('/api/friends/blocked').then(r => r.json()).catch(() => ({}));
    if (data.success) setBlockedUsers(data.blocked || []);
    setShowBlocked(!showBlocked);
  }

  async function unblockUser(blockedId) {
    const data = await authFetch('/api/friends/unblock', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blockedId })
    }).then(r => r.json()).catch(() => ({}));
    
    if (data.success) {
      setBlockedUsers(prev => prev.filter(u => u.id !== blockedId));
    }
  }

  async function logout() {
    await authFetch('/api/auth/logout', { method: 'POST' });
    localStorage.removeItem('ludo_token');
    navigate('/');
  }

  const bg = 'linear-gradient(135deg,#0a0a1a,#12122a,#1a1a35)';
  const card = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, overflow: 'hidden', marginBottom: 10 };
  const row = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)' };
  const label = { fontSize: 14, fontWeight: 600, color: '#e0e0e0' };
  const sub = { fontSize: 11, color: '#666', marginTop: 2 };

  if (loading) return (
    <div style={{ height: '100%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555' }}>Loading...</div>
  );

  return (
    <div style={{ height: '100%', background: bg, color: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <header style={{ background: 'rgba(0,0,0,0.5)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ fontSize: 20 }}>⚙️</div>
        <div style={{ fontSize: 17, fontWeight: 800 }}>Settings</div>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', paddingBottom: 74 }}>

        {/* Profile Card */}
        <div style={{ ...card, background: 'linear-gradient(135deg,rgba(0,132,255,0.15),rgba(124,58,237,0.15))' }}>
          <div style={{ ...row, borderBottom: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'linear-gradient(135deg,#0084ff,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 900 }}>
                {user?.username?.charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{user?.username}</div>
                <div style={{ fontSize: 11, color: '#888' }}>
                  {user?.games_played} games · {user?.wins} wins
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Gameplay */}
        <div style={{ fontSize: 11, color: '#555', fontWeight: 700, letterSpacing: 1, padding: '8px 4px 4px', textTransform: 'uppercase' }}>Gameplay</div>
        <div style={card}>
          <div style={row}>
            <div>
              <div style={label}>🔊 Sound Effects</div>
              <div style={sub}>Dice rolls, moves & win sounds</div>
            </div>
            <div onClick={toggleSound} style={{ width: 46, height: 26, borderRadius: 13, background: sound ? '#0084ff' : '#333', cursor: 'pointer', position: 'relative', transition: '0.2s', flexShrink: 0 }}>
              <div style={{ position: 'absolute', top: 3, left: sound ? 23 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: '0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
            </div>
          </div>
          <div style={{ ...row, borderBottom: 'none' }}>
            <div>
              <div style={label}>🔔 Notifications</div>
              <div style={sub}>Game invites & friend requests</div>
            </div>
            <div onClick={toggleNotif} style={{ width: 46, height: 26, borderRadius: 13, background: notifications ? '#0084ff' : '#333', cursor: 'pointer', position: 'relative', transition: '0.2s', flexShrink: 0 }}>
              <div style={{ position: 'absolute', top: 3, left: notifications ? 23 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: '0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
            </div>
          </div>
        </div>

        {/* Privacy & Blocking (NEW SECTION) */}
        <div style={{ fontSize: 11, color: '#555', fontWeight: 700, letterSpacing: 1, padding: '8px 4px 4px', textTransform: 'uppercase' }}>🛡️ Privacy</div>
        <div style={card}>
          <div style={{ ...row, cursor: 'pointer' }} onClick={loadBlockedUsers}>
            <div>
              <div style={label}>🚫 Blocked Users</div>
              <div style={sub}>Manage your blocked list</div>
            </div>
            <div style={{ color: '#555', fontSize: 16 }}>{showBlocked ? '▲' : '▶'}</div>
          </div>
          {showBlocked && (
            <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {blockedUsers.length === 0 ? (
                <div style={{ fontSize: 12, color: '#666', textAlign: 'center', padding: '10px 0' }}>No blocked users.</div>
              ) : (
                blockedUsers.map(u => (
                  <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '10px 12px', borderRadius: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{u.username}</span>
                    <button onClick={() => unblockUser(u.id)} style={{ background: 'rgba(0, 184, 76, 0.2)', border: '1px solid rgba(0, 184, 76, 0.4)', color: '#00b84c', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Unblock</button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Theme */}
        <div style={{ fontSize: 11, color: '#555', fontWeight: 700, letterSpacing: 1, padding: '8px 4px 4px', textTransform: 'uppercase' }}>Appearance</div>
        <div style={card}>
          <div style={{ padding: '12px 16px' }}>
            <div style={label}>🎨 Theme</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              {[
                { id: 'dark', label: '🌙 Dark', bg: 'linear-gradient(135deg,#0a0a1a,#12122a)' },
                { id: 'midnight', label: '💜 Midnight', bg: 'linear-gradient(135deg,#0d0020,#1a0035)' },
                { id: 'ocean', label: '🌊 Ocean', bg: 'linear-gradient(135deg,#001a33,#003366)' },
              ].map(t => (
                <div key={t.id} onClick={() => setThemePref(t.id)} style={{
                  flex: 1, padding: '10px 6px', borderRadius: 10, textAlign: 'center',
                  background: t.bg, border: `2px solid ${theme === t.id ? '#0084ff' : 'rgba(255,255,255,0.1)'}`,
                  cursor: 'pointer', fontSize: 11, fontWeight: 600,
                  transition: '0.2s', color: '#fff'
                }}>
                  {t.label}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Account */}
        <div style={{ fontSize: 11, color: '#555', fontWeight: 700, letterSpacing: 1, padding: '8px 4px 4px', textTransform: 'uppercase' }}>Account</div>
        <div style={card}>
          <div style={{ ...row, cursor: 'pointer' }} onClick={() => setShowPwForm(!showPwForm)}>
            <div>
              <div style={label}>🔐 Change Password</div>
              <div style={sub}>Update your account password</div>
            </div>
            <div style={{ color: '#555', fontSize: 16 }}>{showPwForm ? '▲' : '▶'}</div>
          </div>
          {showPwForm && (
            <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                type="password" placeholder="Current password" value={pwOld}
                onChange={e => setPwOld(e.target.value)}
                style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#fff', fontSize: 14, outline: 'none', WebkitUserSelect: 'text', userSelect: 'text' }}
              />
              <input
                type="password" placeholder="New password (min 6 chars)" value={pwNew}
                onChange={e => setPwNew(e.target.value)}
                style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#fff', fontSize: 14, outline: 'none', WebkitUserSelect: 'text', userSelect: 'text' }}
              />
              {pwMsg && <div style={{ fontSize: 12, color: pwMsg.startsWith('✅') ? '#00b84c' : '#ff3b3b' }}>{pwMsg}</div>}
              <button onClick={changePassword} style={{ padding: '10px', background: 'linear-gradient(135deg,#0084ff,#5b21b6)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
                Update Password
              </button>
            </div>
          )}
          <div style={{ ...row, borderBottom: 'none', cursor: 'pointer' }} onClick={logout}>
            <div style={{ ...label, color: '#ff3b3b' }}>🚪 Logout</div>
            <div style={{ color: '#ff3b3b', fontSize: 16 }}>▶</div>
          </div>
        </div>

      </div>

      <BottomNav />
    </div>
  );
}