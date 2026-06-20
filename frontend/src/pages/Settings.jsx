import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import BottomNav from '../components/BottomNav.jsx';

// Premium Avatar Palette
const AVATARS = ['👤', '🥷', '👑', '💻', '🤖', '👽', '👻', '🤡', '😈', '🦁', '🐯', '🐼', '🦊', '🦄', '🦖'];

function authFetch(url, options = {}) {
  const token = localStorage.getItem('ludo_token');
  if (token) options.headers = { ...options.headers, 'Authorization': 'Bearer ' + token };
  return fetch(url, options);
}

export default function Settings() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  
  // Settings States
  const [sound, setSound] = useState(() => localStorage.getItem('ludo_sound') !== 'off');
  const [notifications, setNotifications] = useState(() => localStorage.getItem('ludo_notif') !== 'off');
  
  // Edit Profile States
  const [username, setUsername] = useState('');
  const [avatar, setAvatar] = useState('👤');
  const [profileMsg, setProfileMsg] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  
  // Privacy States
  const [privacyReq, setPrivacyReq] = useState('everyone');
  const [showBlocked, setShowBlocked] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState([]);
  
  // Password Change
  const [showPwForm, setShowPwForm] = useState(false);
  const [pwOld, setPwOld] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  
  // Danger Zone
  const [showDelete, setShowDelete] = useState(false);
  const [delPassword, setDelPassword] = useState('');
  const [delMsg, setDelMsg] = useState('');
  
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authFetch('/api/auth/me').then(r => r.json()).then(d => {
      if (!d.success) { localStorage.removeItem('ludo_token'); navigate('/'); return; }
      setUser(d.user);
      setUsername(d.user.username || '');
      setAvatar(d.user.avatar || '👤');
      setPrivacyReq(d.user.privacy_requests || 'everyone');
      setLoading(false);
    }).catch(() => { navigate('/'); });
  }, [navigate]);

  function toggleSound() { const next = !sound; setSound(next); localStorage.setItem('ludo_sound', next ? 'on' : 'off'); }
  function toggleNotif() { const next = !notifications; setNotifications(next); localStorage.setItem('ludo_notif', next ? 'on' : 'off'); }

  // 🔴 FIXED: UPDATE USERNAME API CALL WITH ERROR HANDLING 🔴
  async function updateUsername() {
    if(!username.trim() || username === user?.username) return;
    setIsUpdating(true);
    setProfileMsg('');
    try {
      const res = await authFetch('/api/auth/change-username', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ newUsername: username.trim() }) 
      });
      
      const data = await res.json();
      setIsUpdating(false);
      
      if(data.success) {
        setProfileMsg('✅ Username updated successfully!');
        setUser({...user, username: data.newUsername});
        setTimeout(()=>setProfileMsg(''), 3000);
      } else {
        setProfileMsg('❌ ' + (data.error || 'Update failed!'));
      }
    } catch(err) {
      setIsUpdating(false);
      setProfileMsg('❌ Server connection error! Did you restart the backend?');
      console.error('Username Update Error:', err);
    }
  }

  // 🔴 UPDATE AVATAR API CALL 🔴
  async function updateAvatar(newAv) {
    setAvatar(newAv);
    try {
      await authFetch('/api/auth/change-avatar', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ avatar: newAv }) 
      });
    } catch(err) { console.error('Avatar Update Error:', err); }
  }

  // 🔴 UPDATE PRIVACY API CALL 🔴
  async function updatePrivacy(val) {
    setPrivacyReq(val);
    try {
      await authFetch('/api/auth/update-privacy', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ privacy_requests: val }) 
      });
    } catch(err) { console.error('Privacy Update Error:', err); }
  }

  // 🔴 DELETE ACCOUNT API CALL WITH ERROR HANDLING 🔴
  async function deleteAccount() {
    if(!delPassword) { setDelMsg('Please enter your password to confirm'); return; }
    if(!confirm('Are you absolutely sure you want to permanently delete your account? This action CANNOT be undone!')) return;
    
    setDelMsg('Processing...');
    try {
      const res = await authFetch('/api/auth/delete-account', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ password: delPassword }) 
      });
      
      const data = await res.json();
      if(data.success) {
        alert('Your account has been deleted permanently.');
        localStorage.removeItem('ludo_token');
        navigate('/');
      } else {
        setDelMsg('❌ ' + data.error);
      }
    } catch(err) {
      setDelMsg('❌ Server connection error!');
      console.error('Delete Account Error:', err);
    }
  }

  // 🔴 CHANGE PASSWORD 🔴
  async function changePassword() {
    if (!pwOld || !pwNew) { setPwMsg('Fill both fields'); return; }
    if (pwNew.length < 6) { setPwMsg('New password must be 6+ chars'); return; }
    try {
      const res = await authFetch('/api/auth/change-password', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ oldPassword: pwOld, newPassword: pwNew }) 
      });
      const data = await res.json();
      setPwMsg(data.success ? '✅ Password changed!' : ('❌ ' + (data.error || 'Failed')));
      if (data.success) { setPwOld(''); setPwNew(''); setTimeout(() => setShowPwForm(false), 2000); }
    } catch(err) { setPwMsg('❌ Server connection error!'); }
  }

  async function loadBlockedUsers() {
    try {
      const data = await authFetch('/api/friends/blocked').then(r => r.json());
      if (data.success) setBlockedUsers(data.blocked || []);
      setShowBlocked(!showBlocked);
    } catch(e) { console.error(e); }
  }

  async function unblockUser(blockedId) {
    try {
      const data = await authFetch('/api/friends/unblock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ blockedId }) }).then(r => r.json());
      if (data.success) setBlockedUsers(prev => prev.filter(u => u.id !== blockedId));
    } catch(e) { console.error(e); }
  }

  async function logout() {
    await authFetch('/api/auth/logout', { method: 'POST' });
    localStorage.removeItem('ludo_token');
    navigate('/');
  }

  const card = { background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, overflow: 'hidden', marginBottom: 24, backdropFilter: 'blur(10px)' };
  const row = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)' };
  const label = { fontSize: 16, fontWeight: 800, color: '#f4f4f5' };
  const sub = { fontSize: 13, color: '#a1a1aa', marginTop: 4, fontWeight: 500 };

  if (loading) return <div style={{ height: '100vh', background: 'var(--bg-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a1a1aa' }}>Loading Settings...</div>;

  return (
    <div style={{ height: '100%', background: 'var(--bg-dark)', color: '#fff', display: 'flex', flexDirection: 'column' }}>
      <header style={{ background: 'rgba(9, 9, 11, 0.7)', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.05)', backdropFilter: 'blur(16px)' }}>
        <div style={{ fontSize: 22 }}>⚙️</div>
        <div style={{ fontSize: 20, fontWeight: 900 }}>Settings</div>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px', paddingBottom: 100 }}>

        {/* EDIT PROFILE */}
        <div style={{ fontSize: 13, color: '#71717a', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, paddingLeft: 4 }}>Edit Profile</div>
        <div style={card}>
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: '#a1a1aa' }}>Select Avatar</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {AVATARS.map(em => (
                  <button key={em} onClick={() => updateAvatar(em)} style={{ width: 44, height: 44, borderRadius: 12, background: avatar === em ? 'var(--blue)' : 'rgba(255,255,255,0.05)', border: `2px solid ${avatar === em ? 'var(--blue)' : 'rgba(255,255,255,0.1)'}`, fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s', boxShadow: avatar === em ? '0 4px 10px rgba(0,132,255,0.4)' : 'none' }}>
                    {em}
                  </button>
                ))}
              </div>
            </div>
            
            <div>
               <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: '#a1a1aa' }}>Change Username</div>
               <div style={{ display: 'flex', gap: 10 }}>
                  <input type="text" value={username} onChange={e=>setUsername(e.target.value)} maxLength={20} style={{ flex: 1, height: 48, padding: '0 16px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#fff', fontSize: 16, outline: 'none' }} />
                  <button onClick={updateUsername} disabled={isUpdating || username === user?.username || username.trim() === ''} style={{ background: 'var(--blue)', border: 'none', borderRadius: 12, padding: '0 20px', color: '#fff', fontWeight: 800, cursor: 'pointer', opacity: (isUpdating || username === user?.username || username.trim() === '') ? 0.5 : 1 }}>Update</button>
               </div>
               {profileMsg && <div style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: profileMsg.startsWith('✅') ? 'var(--green)' : 'var(--red)' }}>{profileMsg}</div>}
            </div>
          </div>
        </div>

        {/* PREFERENCES */}
        <div style={{ fontSize: 13, color: '#71717a', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, paddingLeft: 4 }}>Preferences</div>
        <div style={card}>
          <div style={row}>
            <div>
              <div style={label}>🔊 Sound Effects</div>
              <div style={sub}>Dice rolls, moves & game sounds</div>
            </div>
            <div onClick={toggleSound} style={{ width: 52, height: 32, borderRadius: 16, background: sound ? 'var(--blue)' : 'rgba(255,255,255,0.1)', cursor: 'pointer', position: 'relative', transition: 'background 0.3s' }}>
              <div style={{ position: 'absolute', top: 2, left: sound ? 22 : 2, width: 28, height: 28, borderRadius: '50%', background: '#fff', transition: 'left 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)', boxShadow: '0 2px 5px rgba(0,0,0,0.3)' }} />
            </div>
          </div>
          <div style={{ ...row, borderBottom: 'none' }}>
            <div>
              <div style={label}>🔔 Notifications</div>
              <div style={sub}>Game invites & friend alerts</div>
            </div>
            <div onClick={toggleNotif} style={{ width: 52, height: 32, borderRadius: 16, background: notifications ? 'var(--green)' : 'rgba(255,255,255,0.1)', cursor: 'pointer', position: 'relative', transition: 'background 0.3s' }}>
              <div style={{ position: 'absolute', top: 2, left: notifications ? 22 : 2, width: 28, height: 28, borderRadius: '50%', background: '#fff', transition: 'left 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)', boxShadow: '0 2px 5px rgba(0,0,0,0.3)' }} />
            </div>
          </div>
        </div>

        {/* ACCOUNT & PRIVACY */}
        <div style={{ fontSize: 13, color: '#71717a', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, paddingLeft: 4 }}>Account & Privacy</div>
        <div style={card}>
          
          {/* PRIVACY FRIEND REQUESTS */}
          <div style={row}>
            <div>
              <div style={label}>📩 Friend Requests</div>
              <div style={sub}>Who can send you requests?</div>
            </div>
            <select value={privacyReq} onChange={e => updatePrivacy(e.target.value)} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '8px 12px', borderRadius: 8, outline: 'none', fontWeight: 700, fontSize: 14 }}>
              <option value="everyone" style={{color:'#000'}}>Everyone</option>
              <option value="nobody" style={{color:'#000'}}>Nobody</option>
            </select>
          </div>

          <div style={{ ...row, cursor: 'pointer' }} onClick={loadBlockedUsers}>
            <div><div style={label}>🚫 Blocked Users</div><div style={sub}>Manage your blocked list</div></div>
            <div style={{ color: '#a1a1aa', fontSize: 18 }}>{showBlocked ? '▲' : '▶'}</div>
          </div>
          {showBlocked && (
            <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {blockedUsers.length === 0 ? (
                <div style={{ fontSize: 14, color: '#71717a', textAlign: 'center', padding: '10px 0' }}>No blocked users.</div>
              ) : blockedUsers.map(u => (
                  <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.3)', padding: '12px 16px', borderRadius: 12 }}>
                    <span style={{ fontSize: 16, fontWeight: 700 }}>{u.username}</span>
                    <button onClick={() => unblockUser(u.id)} style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: 'var(--green)', borderRadius: 8, padding: '8px 16px', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>Unblock</button>
                  </div>
              ))}
            </div>
          )}

          <div style={{ ...row, cursor: 'pointer' }} onClick={() => setShowPwForm(!showPwForm)}>
            <div><div style={label}>🔐 Change Password</div><div style={sub}>Update account security</div></div>
            <div style={{ color: '#a1a1aa', fontSize: 18 }}>{showPwForm ? '▲' : '▶'}</div>
          </div>
          {showPwForm && (
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12, background: 'rgba(0,0,0,0.2)' }}>
              <input type="password" placeholder="Current Password" value={pwOld} onChange={e => setPwOld(e.target.value)} style={{ height: 48, padding: '0 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#fff', fontSize: 15, outline: 'none' }} />
              <input type="password" placeholder="New Password (min 6)" value={pwNew} onChange={e => setPwNew(e.target.value)} style={{ height: 48, padding: '0 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#fff', fontSize: 15, outline: 'none' }} />
              {pwMsg && <div style={{ fontSize: 14, fontWeight: 600, color: pwMsg.startsWith('✅') ? 'var(--green)' : 'var(--red)' }}>{pwMsg}</div>}
              <button onClick={changePassword} style={{ height: 48, background: 'linear-gradient(135deg, var(--blue), var(--purple))', border: 'none', borderRadius: 12, color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>Update Password</button>
            </div>
          )}

          <div style={{ ...row, borderBottom: 'none', cursor: 'pointer' }} onClick={logout}>
            <div style={{ ...label, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 10 }}>🚪 Log Out</div>
          </div>
        </div>

        {/* DANGER ZONE (DELETE ACCOUNT) */}
        <div style={{ fontSize: 13, color: '#fca5a5', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, paddingLeft: 4 }}>Danger Zone</div>
        <div style={{ background: 'rgba(244,63,94,0.05)', border: '1px solid rgba(244,63,94,0.3)', borderRadius: 20, overflow: 'hidden', marginBottom: 24 }}>
          <div style={{ ...row, borderBottom: showDelete ? '1px solid rgba(244,63,94,0.2)' : 'none', cursor: 'pointer' }} onClick={() => setShowDelete(!showDelete)}>
            <div>
               <div style={{...label, color: 'var(--red)'}}>🚨 Delete Account</div>
               <div style={sub}>Permanently remove your account</div>
            </div>
            <div style={{ color: 'var(--red)', fontSize: 18 }}>{showDelete ? '▲' : '▶'}</div>
          </div>
          
          {showDelete && (
             <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: 13, color: '#fca5a5', fontWeight: 600 }}>Warning: This action is irreversible. All data, matches, and friends will be permanently lost.</div>
                <input type="password" placeholder="Enter password to confirm" value={delPassword} onChange={e => setDelPassword(e.target.value)} style={{ height: 48, padding: '0 16px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(244,63,94,0.4)', borderRadius: 12, color: '#fff', fontSize: 15, outline: 'none' }} />
                {delMsg && <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)' }}>{delMsg}</div>}
                <button onClick={deleteAccount} style={{ height: 48, background: 'var(--red)', border: 'none', borderRadius: 12, color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer', boxShadow: '0 4px 15px rgba(244,63,94,0.4)' }}>Permanently Delete Account</button>
             </div>
          )}
        </div>

      </div>
      <BottomNav />
    </div>
  );
}