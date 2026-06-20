import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import BottomNav from '../components/BottomNav.jsx';

function authFetch(url, options = {}) {
  const token = localStorage.getItem('ludo_token');
  if (token) options.headers = { ...options.headers, 'Authorization': 'Bearer ' + token };
  return fetch(url, options);
}

export default function Friends() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [friends, setFriends] = useState([]);
  const [receivedRequests, setReceivedRequests] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(true);

  // Profile Drawer Modal State
  const [viewingProfile, setViewingProfile] = useState(null);
  const [showProfileOptions, setShowProfileOptions] = useState(false);

  const socketRef = useRef(null);

  useEffect(() => {
    async function init() {
      const me = await authFetch('/api/auth/me').then(r => r.json()).catch(() => ({}));
      if (!me.success) { localStorage.removeItem('ludo_token'); navigate('/'); return; }
      setUser(me.user);

      const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';
      const sock = io(BACKEND_URL, { transports: ['websocket', 'polling'], reconnection: true });
      socketRef.current = sock;

      sock.on('connect', () => { sock.emit('joinChat', { userId: me.user.id, username: me.user.username }); });

      sock.on('friendActivityUpdate', ({ userId, status, roomId }) => {
        setFriends(prev => prev.map(f => f.id == userId ? { ...f, activityStatus: status, currentRoom: roomId } : f));
        setViewingProfile(prev => (prev && prev.id == userId) ? { ...prev, activityStatus: status, currentRoom: roomId } : prev);
      });

      sock.on('friendOnline', ({ userId }) => {
        setFriends(prev => prev.map(f => f.id == userId ? { ...f, is_online: true, activityStatus: 'online', lastSeen: null } : f));
        setViewingProfile(prev => (prev && prev.id == userId) ? { ...prev, is_online: true, activityStatus: 'online', lastSeen: null } : prev);
      });

      sock.on('friendOffline', ({ userId, lastSeen }) => {
        setFriends(prev => prev.map(f => f.id == userId ? { ...f, is_online: false, activityStatus: 'offline', lastSeen } : f));
        setViewingProfile(prev => (prev && prev.id == userId) ? { ...prev, is_online: false, activityStatus: 'offline', lastSeen } : prev);
      });

      const friendsData = await authFetch('/api/friends').then(r => r.json()).catch(() => ({}));
      if (friendsData.success) {
        setFriends(friendsData.friends || []);
        setReceivedRequests(friendsData.receivedRequests || []);
      }
      setLoading(false);
    }

    init();
    return () => { if (socketRef.current) socketRef.current.disconnect(); };
  }, [navigate]);

  async function searchUsers(query) {
    if (query.length < 2) { setSearchResults([]); return; }
    const data = await authFetch('/api/users/search?q=' + encodeURIComponent(query)).then(r => r.json()).catch(() => ({}));
    if (data.success) setSearchResults(data.users || []);
  }

  async function sendFriendRequest(userId, username) {
    const data = await authFetch('/api/friends/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username }) }).then(r => r.json());
    if (data.success) { setSearchResults(prev => prev.filter(u => u.id !== userId)); setSearchQuery(''); alert('Request Sent!'); }
  }

  async function acceptFriendRequest(fromUserId) {
    const data = await authFetch('/api/friends/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fromUserId }) }).then(r => r.json());
    if (data.success) {
      const friendsData = await authFetch('/api/friends').then(r => r.json());
      if(friendsData.success) { setFriends(friendsData.friends || []); setReceivedRequests(friendsData.receivedRequests || []); }
    }
  }

  async function rejectFriendRequest(fromUserId) {
    await authFetch('/api/friends/reject', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fromUserId }) });
    setReceivedRequests(prev => prev.filter(r => r.id !== fromUserId));
  }

  async function removeFriend(friendId) {
    if(!confirm('Remove this friend?')) return;
    const data = await authFetch('/api/friends/remove', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ friendId }) }).then(r => r.json());
    if (data.success) { setFriends(prev => prev.filter(f => f.id !== friendId)); setViewingProfile(null); }
  }

  async function blockFriend(friendId) {
    if(!confirm('Block this user?')) return;
    const data = await authFetch('/api/friends/block', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ friendId }) }).then(r => r.json());
    if (data.success) { setFriends(prev => prev.filter(f => f.id !== friendId)); setViewingProfile(null); }
  }

  function inviteToGame(friend) {
    if (!socketRef.current || !user) return;
    const roomId = 'ROOM' + Math.random().toString(36).substr(2, 6).toUpperCase();
    socketRef.current.emit('inviteFriend', { friendId: friend.id, roomId, fromName: user.username });
    navigate('/game?room=' + encodeURIComponent(roomId));
    setViewingProfile(null); 
  }

  if (loading) return <div style={{ height: '100vh', background: 'var(--bg-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a1a1aa' }}>Loading Friends...</div>;

  return (
    <div style={{ height: '100%', background: 'var(--bg-dark)', color: '#fff', display: 'flex', flexDirection: 'column' }}>

      {/* WhatsApp Style Premium Profile Modal */}
      {viewingProfile && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 4000, background: 'var(--bg-dark)', display: 'flex', flexDirection: 'column', animation: 'slideIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}>
          <div style={{ background: 'rgba(9, 9, 11, 0.9)', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 10 }}>
            <button onClick={() => { setViewingProfile(null); setShowProfileOptions(false); }} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 26, padding: '0 8px' }}>←</button>
            <div style={{ position: 'relative' }}>
              <button onClick={() => setShowProfileOptions(!showProfileOptions)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 26, padding: '0 8px' }}>⋮</button>
              {showProfileOptions && (
                <div style={{ position: 'absolute', top: 40, right: 0, background: '#18181b', borderRadius: 16, border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden', minWidth: 180, boxShadow: '0 10px 40px rgba(0,0,0,0.6)' }}>
                  <button onClick={() => removeFriend(viewingProfile.id)} style={{ display: 'block', width: '100%', padding: '16px', background: 'none', border: 'none', color: '#fff', textAlign: 'left', fontSize: 16, fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>🗑️ Remove</button>
                  <button onClick={() => blockFriend(viewingProfile.id)} style={{ display: 'block', width: '100%', padding: '16px', background: 'none', border: 'none', color: 'var(--red)', textAlign: 'left', fontSize: 16, fontWeight: 600 }}>🚫 Block</button>
                </div>
              )}
            </div>
          </div>

          <div style={{ padding: '0 24px 24px', flex: 1, overflowY: 'auto', textAlign: 'center' }}>
            <div style={{ width: 100, height: 100, borderRadius: '50%', background: 'linear-gradient(135deg, var(--blue), var(--purple))', margin: '20px auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, fontWeight: 900, boxShadow: '0 8px 24px rgba(59,130,246,0.4)' }}>
              {viewingProfile.username.charAt(0).toUpperCase()}
            </div>
            <h2 style={{ fontSize: 28, fontWeight: 900 }}>{viewingProfile.username}</h2>
            <p style={{ color: viewingProfile.activityStatus === 'in_match' ? 'var(--red)' : viewingProfile.is_online ? 'var(--green)' : '#a1a1aa', marginTop: 8, marginBottom: 30, fontSize: 15, fontWeight: 600 }}>
              {viewingProfile.activityStatus === 'in_match' ? '🔴 Playing Match' : viewingProfile.is_online ? '🟢 Online' : '⚫ Offline'}
            </p>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 40 }}>
              {viewingProfile.activityStatus === 'in_match' ? (
                <button onClick={() => { setViewingProfile(null); navigate(`/game?room=${encodeURIComponent(viewingProfile.currentRoom)}&spectate=true`); }} style={{ background: 'rgba(244,63,94,0.1)', color: 'var(--red)', border: '1px solid rgba(244,63,94,0.3)', padding: '0 30px', height: 52, borderRadius: 16, fontWeight: 800, fontSize: 16 }}>👁️ Spectate</button>
              ) : (
                <button onClick={() => inviteToGame(viewingProfile)} style={{ background: 'linear-gradient(135deg, var(--blue), var(--purple))', color: '#fff', border: 'none', padding: '0 30px', height: 52, borderRadius: 16, fontWeight: 800, fontSize: 16, boxShadow: '0 4px 15px rgba(59,130,246,0.3)' }}>🎮 Invite to Play</button>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ background: 'var(--bg-card)', padding: '24px 16px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--yellow)', marginBottom: 8 }}>{viewingProfile.wins || 0}</div>
                <div style={{ fontSize: 13, color: '#a1a1aa', fontWeight: 700, textTransform: 'uppercase' }}>Total Wins</div>
              </div>
              <div style={{ background: 'var(--bg-card)', padding: '24px 16px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--red)', marginBottom: 8 }}>{viewingProfile.kills || 0}</div>
                <div style={{ fontSize: 13, color: '#a1a1aa', fontWeight: 700, textTransform: 'uppercase' }}>Total Kills</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Header */}
      <header style={{ background: 'rgba(9, 9, 11, 0.7)', padding: '16px 20px', display: 'flex', alignItems: 'center', flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.05)', backdropFilter: 'blur(16px)' }}>
        <div style={{ fontSize: 20, fontWeight: 900 }}>👥 Friends Connection</div>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 100 }}>
        
        {/* Search Panel */}
        <div style={{ padding: '16px 20px' }}>
          <input type="text" placeholder="🔍 Search players..." value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); searchUsers(e.target.value); }}
            style={{ width: '100%', height: 52, padding: '0 20px', background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, color: '#fff', fontSize: 16, outline: 'none' }} />
          
          {searchResults.length > 0 && (
            <div style={{ marginTop: 12, background: '#18181b', borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
              {searchResults.map(u => (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{u.username}</div>
                  <button onClick={() => sendFriendRequest(u.id, u.username)} style={{ background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 16px', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>+ Add</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Requests Status */}
        {receivedRequests.length > 0 && (
          <div style={{ background: 'rgba(59,130,246,0.1)', padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 800, textTransform: 'uppercase', marginBottom: 12 }}>📩 Friend Requests</div>
            {receivedRequests.map(r => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.3)', padding: '12px 16px', borderRadius: 16, marginBottom: 8 }}>
                <span style={{ fontWeight: 800, fontSize: 16 }}>{r.username}</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => acceptFriendRequest(r.id)} style={{ background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 16px', fontSize: 14, fontWeight: 800 }}>Accept</button>
                  <button onClick={() => rejectFriendRequest(r.id)} style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 16px', fontSize: 14, fontWeight: 800 }}>Decline</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Friends Listing */}
        <div style={{ padding: '20px' }}>
          <div style={{ fontSize: 13, color: '#71717a', fontWeight: 800, textTransform: 'uppercase', marginBottom: 16 }}>My Friends ({friends.length})</div>
          
          {friends.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#71717a', background: 'var(--bg-card)', borderRadius: 24 }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>🎮</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>No friends yet. Add some!</div>
            </div>
          ) : (
            <div style={{ background: 'var(--bg-card)', borderRadius: 24, border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
              {friends.map(friend => (
                <div key={friend.id} onClick={() => setViewingProfile(friend)} style={{ display: 'flex', alignItems: 'center', padding: '16px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ position: 'relative', marginRight: 16 }}>
                    <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(135deg, var(--blue), var(--purple))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 900 }}>{friend.username.charAt(0).toUpperCase()}</div>
                    <div style={{ position: 'absolute', bottom: -2, right: -2, width: 16, height: 16, borderRadius: '50%', background: friend.activityStatus === 'in_match' ? 'var(--red)' : friend.is_online ? 'var(--green)' : '#52525b', border: '3px solid var(--bg-dark)' }}></div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 17 }}>{friend.username}</div>
                    <div style={{ fontSize: 14, marginTop: 4, color: friend.activityStatus === 'in_match' ? 'var(--red)' : friend.is_online ? 'var(--green)' : '#71717a', fontWeight: 600 }}>
                      {friend.activityStatus === 'in_match' ? '🔴 In Match' : friend.is_online ? '🟢 Online' : '⚫ Offline'}
                    </div>
                  </div>
                  <div style={{ color: 'var(--blue)', fontSize: 14, fontWeight: 700, background: 'rgba(59,130,246,0.1)', padding: '6px 12px', borderRadius: 10 }}>View</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`@keyframes slideIn { 0% { transform: translateX(100%); } 100% { transform: translateX(0); } }`}</style>
      <BottomNav />
    </div>
  );
}