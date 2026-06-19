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

      sock.on('connect', () => {
        sock.emit('joinChat', { userId: me.user.id, username: me.user.username });
      });

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
    return () => {
      if (socketRef.current) { socketRef.current.disconnect(); }
    };
  }, [navigate]);

  async function loadFriends() {
    const data = await authFetch('/api/friends').then(r => r.json()).catch(() => ({}));
    if (data.success) {
      setFriends(data.friends || []);
      setReceivedRequests(data.receivedRequests || []);
    }
  }

  async function searchUsers(query) {
    if (query.length < 2) { setSearchResults([]); return; }
    const data = await authFetch('/api/users/search?q=' + encodeURIComponent(query)).then(r => r.json()).catch(() => ({}));
    if (data.success) setSearchResults(data.users || []);
  }

  async function sendFriendRequest(userId, username) {
    const data = await authFetch('/api/friends/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username }) }).then(r => r.json()).catch(() => ({}));
    if (data.success) { setSearchResults(prev => prev.filter(u => u.id !== userId)); setSearchQuery(''); alert('Request Sent!'); }
  }

  async function acceptFriendRequest(fromUserId) {
    const data = await authFetch('/api/friends/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fromUserId }) }).then(r => r.json()).catch(() => ({}));
    if (data.success) loadFriends();
  }

  async function rejectFriendRequest(fromUserId) {
    await authFetch('/api/friends/reject', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fromUserId }) }).catch(() => {});
    loadFriends();
  }

  async function removeFriend(friendId) {
    if(!confirm('Remove this friend?')) return;
    const data = await authFetch('/api/friends/remove', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ friendId }) }).then(r => r.json()).catch(() => ({}));
    if (data.success) { setFriends(prev => prev.filter(f => f.id !== friendId)); setViewingProfile(null); }
  }

  async function blockFriend(friendId) {
    if(!confirm('Block this user?')) return;
    const data = await authFetch('/api/friends/block', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ friendId }) }).then(r => r.json()).catch(() => ({}));
    if (data.success) { setFriends(prev => prev.filter(f => f.id !== friendId)); setViewingProfile(null); }
  }

  function inviteToGame(friend) {
    if (!socketRef.current || !user) return;
    const roomId = 'ROOM' + Math.random().toString(36).substr(2, 6).toUpperCase();
    socketRef.current.emit('inviteFriend', { friendId: friend.id, roomId, fromName: user.username });
    navigate('/game?room=' + encodeURIComponent(roomId));
    setViewingProfile(null); 
  }

  function formatLastSeen(ts) {
    if (!ts) return 'offline';
    const diff = Date.now() - ts;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' min ago';
    return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  if (loading) return <div style={{ minHeight: '100vh', background: '#0b141a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8696a0' }}>Loading...</div>;

  return (
    <div style={{ height: '100%', background: '#0b141a', color: '#e9edef', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>

      {/* Profile Contact Modal Overlay */}
      {viewingProfile && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 4000, background: '#0b141a', display: 'flex', flexDirection: 'column' }}>
          <div style={{ background: '#1f2c33', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <button onClick={() => { setViewingProfile(null); setShowProfileOptions(false); }} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 24 }}>←</button>
              <span style={{ fontSize: 18, fontWeight: 700 }}>Player Profile</span>
            </div>
            <div style={{ position: 'relative' }}>
              <button onClick={() => setShowProfileOptions(!showProfileOptions)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 24 }}>⋮</button>
              {showProfileOptions && (
                <div style={{ position: 'absolute', top: 35, right: 0, background: '#1f2c33', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden', minWidth: 150 }}>
                  <button onClick={() => removeFriend(viewingProfile.id)} style={ctxBtn}>🗑️ Remove</button>
                  <button onClick={() => blockFriend(viewingProfile.id)} style={{ ...ctxBtn, color: '#ff4c4c' }}>🚫 Block</button>
                </div>
              )}
            </div>
          </div>

          <div style={{ padding: '24px', flex: 1, overflowY: 'auto', textAlign: 'center' }}>
            <div style={{ width: 90, height: 90, borderRadius: '50%', background: 'linear-gradient(135deg,#0084ff,#7c3aed)', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, fontWeight: 900 }}>
              {viewingProfile.username.charAt(0).toUpperCase()}
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 800 }}>{viewingProfile.username}</h2>
            <p style={{ color: '#8696a0', marginTop: 4, marginBottom: 20 }}>
              {viewingProfile.activityStatus === 'in_match' ? '🔴 Playing Match' : viewingProfile.is_online ? '🟢 Online' : '⚫ Offline'}
            </p>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 30 }}>
              {viewingProfile.activityStatus === 'in_match' ? (
                <button onClick={() => { setViewingProfile(null); navigate(`/game?room=${encodeURIComponent(viewingProfile.currentRoom)}&spectate=true`); }} style={{ background: 'rgba(255,59,59,0.2)', color: '#ff6b6b', padding: '10px 20px', border: 'none', borderRadius: 8, fontWeight: 700 }}>👁️ Spectate</button>
              ) : (
                <button onClick={() => inviteToGame(viewingProfile)} style={{ background: '#0084ff', color: '#fff', padding: '10px 20px', border: 'none', borderRadius: 8, fontWeight: 700 }}>🎮 Challenge Invite</button>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: 14, borderRadius: 12 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'gold' }}>{viewingProfile.wins || 0}</div>
                <div style={{ fontSize: 11, color: '#8696a0' }}>TOTAL WINS</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: 14, borderRadius: 12 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#ff3b3b' }}>{viewingProfile.kills || 0}</div>
                <div style={{ fontSize: 11, color: '#8696a0' }}>TOTAL KILLS</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Friends View Header */}
      <header style={{ background: '#1f2c33', padding: '12px 16px', display: 'flex', alignItems: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>👥 Friends Connection ({friends.length})</div>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 60 }}>
        {/* Search Panel */}
        <div style={{ padding: '10px 14px', background: '#1f2c33' }}>
          <input type="text" placeholder="🔍 Search players by username..." value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); searchUsers(e.target.value); }}
            style={{ width: '100%', padding: '10px 14px', background: '#2a3942', border: 'none', borderRadius: 8, color: '#fff' }} />
          
          {searchResults.length > 0 && (
            <div style={{ marginTop: 8, background: '#1a272e', borderRadius: 8, overflow: 'hidden' }}>
              {searchResults.map(u => (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #222d34' }}>
                  <div><span style={{ fontWeight: 600 }}>{u.username}</span></div>
                  <button onClick={() => sendFriendRequest(u.id, u.username)} style={{ background: '#0084ff', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12 }}>+ Add Friend</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Received Requests Status */}
        {receivedRequests.length > 0 && (
          <div style={{ background: 'rgba(0,132,255,0.05)', padding: '10px 14px', borderBottom: '1px solid #222d34' }}>
            <div style={{ fontSize: 11, color: '#8696a0', fontWeight: 600, marginBottom: 6 }}>📩 INCOMING REQUESTS ({receivedRequests.length})</div>
            {receivedRequests.map(r => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
                <span style={{ fontWeight: 600 }}>{r.username}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => acceptFriendRequest(r.id)} style={{ background: '#00b84c', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 12 }}>Accept</button>
                  <button onClick={() => rejectFriendRequest(r.id)} style={{ background: '#333', color: '#ccc', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 12 }}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Friends Listing */}
        {friends.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#8696a0' }}>No friends connected yet.</div>
        ) : friends.map(friend => (
          <div key={friend.id} onClick={() => setViewingProfile(friend)} style={{ display: 'flex', alignItems: 'center', padding: '12px 14px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
            <div style={{ position: 'relative', marginRight: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg,#0084ff,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{friend.username.charAt(0).toUpperCase()}</div>
              <div style={{ position: 'absolute', bottom: -2, right: -2, width: 12, height: 12, borderRadius: '50%', background: friend.activityStatus === 'in_match' ? '#ff3b3b' : friend.is_online ? '#00b84c' : '#444', border: '2px solid #0b141a' }}></div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{friend.username}</div>
              <div style={{ fontSize: 12, color: friend.activityStatus === 'in_match' ? '#ff3b3b' : '#8696a0' }}>
                {friend.activityStatus === 'in_match' ? 'In Match 🎮' : friend.is_online ? 'Online' : `Last seen ${formatLastSeen(friend.lastSeen)}`}
              </div>
            </div>
            <div style={{ color: '#8696a0', fontSize: 12 }}>ℹ️ Info</div>
          </div>
        ))}
      </div>

      <BottomNav />
    </div>
  );
}

const ctxBtn = { display: 'block', width: '100%', padding: '12px', background: 'none', border: 'none', color: '#fff', textAlign: 'left', fontSize: 14 };