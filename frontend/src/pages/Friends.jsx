import { useState, useEffect, useRef, useCallback } from 'react';
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
  const [selectedChat, setSelectedChat] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const chatEndRef = useRef(null);
  const socketRef = useRef(null);
  const selectedChatRef = useRef(null);
  const userRef = useRef(null);

  selectedChatRef.current = selectedChat;
  userRef.current = user;

  useEffect(() => {
    async function init() {
      const me = await authFetch('/api/auth/me').then(r => r.json());
      if (!me.success) { localStorage.removeItem('ludo_token'); navigate('/'); return; }
      setUser(me.user);
      userRef.current = me.user;

      const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';
      const sock = io(BACKEND_URL, { transports: ['websocket', 'polling'], reconnection: true, reconnectionAttempts: 10, reconnectionDelay: 1000 });
      socketRef.current = sock;

      sock.on('connect', () => {
        sock.emit('joinChat', { userId: me.user.id, username: me.user.username });
      });

      sock.on('newMessage', (data) => {
        const curChat = selectedChatRef.current;
        if (curChat && data.fromId === curChat.id) {
          setChatMessages(prev => [...prev, data]);
        } else {
          const notifEnabled = localStorage.getItem('ludo_notif') !== 'off';
          if (notifEnabled) {
            setNotifications(prev => [...prev, { id: Date.now(), fromId: data.fromId, from: data.from, message: data.message }]);
          }
          setFriends(prev => prev.map(f =>
            f.id === data.fromId ? { ...f, lastMessage: data.message, lastMessageTime: data.time, unread: (f.unread || 0) + 1 } : f
          ));
        }
      });

      sock.on('inviteReceived', (data) => {
        setNotifications(prev => [...prev, { id: Date.now(), type: 'invite', fromName: data.fromName, roomId: data.roomId }]);
      });

      sock.on('friendOnline', (data) => {
        setFriends(prev => prev.map(f => f.id === data.userId ? { ...f, is_online: true } : f));
      });

      sock.on('friendOffline', (data) => {
        setFriends(prev => prev.map(f => f.id === data.userId ? { ...f, is_online: false } : f));
      });

      const friendsData = await authFetch('/api/friends').then(r => r.json());
      if (friendsData.success) {
        setFriends((friendsData.friends || []).map(f => ({ ...f, unread: 0, lastMessage: '', lastMessageTime: null })));
        setReceivedRequests(friendsData.receivedRequests || []);
      }
      setLoading(false);
    }

    init();

    return () => {
      if (socketRef.current) {
        socketRef.current.emit('leaveChat', {});
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [navigate]);

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  async function loadFriends() {
    const data = await authFetch('/api/friends').then(r => r.json());
    if (data.success) {
      setFriends(prev => {
        const prevMap = {};
        prev.forEach(f => prevMap[f.id] = f);
        return (data.friends || []).map(f => ({ ...f, unread: prevMap[f.id]?.unread || 0, lastMessage: prevMap[f.id]?.lastMessage || '', lastMessageTime: prevMap[f.id]?.lastMessageTime || null }));
      });
      setReceivedRequests(data.receivedRequests || []);
    }
  }

  async function searchUsers(query) {
    if (query.length < 2) { setSearchResults([]); return; }
    const data = await authFetch('/api/users/search?q=' + encodeURIComponent(query)).then(r => r.json());
    if (data.success) setSearchResults(data.users || []);
  }

  async function sendFriendRequest(userId, username) {
    const data = await authFetch('/api/friends/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    }).then(r => r.json());
    if (data.success) {
      setSearchResults(prev => prev.filter(u => u.id !== userId));
      setSearchQuery('');
    } else {
      alert(data.error || 'Failed to send request');
    }
  }

  async function acceptFriendRequest(fromUserId) {
    const data = await authFetch('/api/friends/accept', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromUserId })
    }).then(r => r.json());
    if (data.success) loadFriends();
  }

  async function rejectFriendRequest(fromUserId) {
    await authFetch('/api/friends/reject', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromUserId })
    });
    loadFriends();
  }

  async function selectFriend(friend) {
    setSelectedChat(friend);
    selectedChatRef.current = friend;
    setChatMessages([]);
    setFriends(prev => prev.map(f => f.id === friend.id ? { ...f, unread: 0 } : f));
    const data = await authFetch('/api/chat/history/' + friend.id).then(r => r.json()).catch(() => ({ success: true, messages: [] }));
    if (data.success && data.messages) setChatMessages(data.messages);
  }

  async function sendMessage() {
    if (!newMessage.trim() || !selectedChat || !user) return;
    const msgData = { toId: selectedChat.id, toUsername: selectedChat.username, from: user.username, fromId: user.id, message: newMessage.trim(), time: Date.now() };
    setChatMessages(prev => [...prev, msgData]);
    setNewMessage('');
    setFriends(prev => prev.map(f => f.id === selectedChat.id ? { ...f, lastMessage: msgData.message, lastMessageTime: msgData.time } : f));
    if (socketRef.current) socketRef.current.emit('sendMessage', msgData);
    await authFetch('/api/chat/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(msgData)
    });
  }

  function inviteToGame(friend) {
    if (!socketRef.current || !user) return;
    const roomId = 'ROOM' + Math.random().toString(36).substr(2, 6).toUpperCase();
    socketRef.current.emit('inviteFriend', { friendId: friend.id, roomId, fromName: user.username });
    navigate('/game?room=' + encodeURIComponent(roomId));
  }

  function acceptInvite(roomId) {
    navigate('/game?room=' + encodeURIComponent(roomId));
  }

  function dismissNotif(id) {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }

  function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const diff = Date.now() - date;
    if (diff < 60000) return 'now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm';
    if (diff < 86400000) return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  }

  const totalUnread = friends.reduce((sum, f) => sum + (f.unread || 0), 0);

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0b141a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8696a0' }}>Loading...</div>
  );

  return (
    <div style={{ height: '100%', background: '#0b141a', color: '#e9edef', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>

      {/* Notification Toasts */}
      {notifications.length > 0 && (
        <div style={{ position: 'fixed', top: 60, right: 12, zIndex: 2000, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 280 }}>
          {notifications.slice(0, 3).map((notif) => (
            <div key={notif.id} style={{ background: '#1f2c33', borderRadius: 10, padding: '10px 14px', boxShadow: '0 4px 16px rgba(0,0,0,0.4)', borderLeft: `3px solid ${notif.type === 'invite' ? '#0084ff' : '#00b84c'}` }}>
              {notif.type === 'invite' ? (
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 13 }}>🎮 {notif.fromName} invited you!</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => { acceptInvite(notif.roomId); dismissNotif(notif.id); }} style={{ flex: 1, background: '#00b84c', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Join</button>
                    <button onClick={() => dismissNotif(notif.id)} style={{ background: '#2a3942', color: '#ccc', border: 'none', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', fontSize: 12 }}>✕</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>💬 {notif.from}</div>
                    <div style={{ color: '#8696a0', fontSize: 12, marginTop: 1 }}>{notif.message?.substring(0, 40)}</div>
                  </div>
                  <button onClick={() => dismissNotif(notif.id)} style={{ background: 'none', border: 'none', color: '#555', fontSize: 14, cursor: 'pointer', flexShrink: 0, padding: 0 }}>✕</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Header */}
      <header style={{ background: '#1f2c33', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 14, borderBottom: '1px solid #222d34', flexShrink: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 700, flex: 1 }}>
          👥 Friends
          {friends.filter(f => f.is_online).length > 0 && (
            <span style={{ marginLeft: 8, fontSize: 11, color: '#00b84c', fontWeight: 500 }}>{friends.filter(f => f.is_online).length} online</span>
          )}
        </div>
        {notifications.length > 0 && (
          <div style={{ background: '#ff3b3b', color: '#fff', borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>{notifications.length}</div>
        )}
      </header>

      {/* Main scrollable area */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 60 }}>

        {/* Search */}
        <div style={{ padding: '10px 14px', background: '#1f2c33', borderBottom: '1px solid #222d34' }}>
          <input
            type="text" placeholder="🔍 Search players to add..."
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); searchUsers(e.target.value); }}
            style={{ width: '100%', padding: '10px 14px', background: '#2a3942', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, outline: 'none', WebkitUserSelect: 'text', userSelect: 'text', boxSizing: 'border-box' }}
          />
          {searchResults.length > 0 && (
            <div style={{ marginTop: 8, background: '#1a272e', borderRadius: 10, overflow: 'hidden', border: '1px solid #222d34' }}>
              {searchResults.map(u => (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #222d34' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{u.username}</div>
                    <div style={{ fontSize: 11, color: '#8696a0' }}>{u.wins}W · {u.win_rate}% WR</div>
                  </div>
                  <button onClick={() => sendFriendRequest(u.id, u.username)} style={{ background: '#0084ff', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>+ Add</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Friend Requests */}
        {receivedRequests.length > 0 && (
          <div style={{ background: 'rgba(0,132,255,0.08)', borderBottom: '1px solid #222d34', padding: '10px 14px' }}>
            <div style={{ fontSize: 12, color: '#8696a0', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>📩 Requests ({receivedRequests.length})</div>
            {receivedRequests.map(r => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,#0084ff,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700 }}>{r.username.charAt(0).toUpperCase()}</div>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{r.username}</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => acceptFriendRequest(r.id)} style={{ background: '#00b84c', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>✓ Accept</button>
                  <button onClick={() => rejectFriendRequest(r.id)} style={{ background: '#2a3942', color: '#ccc', border: 'none', borderRadius: 8, padding: '7px 10px', cursor: 'pointer', fontSize: 13 }}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Friends List */}
        <div style={{ padding: '8px 14px 4px', fontSize: 11, color: '#8696a0', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Friends ({friends.length})
        </div>
        {friends.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#8696a0' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>No friends yet</div>
            <div style={{ fontSize: 12 }}>Search for players above to add them!</div>
          </div>
        ) : (
          friends.map(friend => (
            <div key={friend.id} onClick={() => selectFriend(friend)} style={{ display: 'flex', alignItems: 'center', padding: '12px 14px', cursor: 'pointer', background: 'transparent', borderBottom: '1px solid #222d34', transition: 'background 0.15s', WebkitTapHighlightColor: 'rgba(255,255,255,0.05)' }}>
              <div style={{ position: 'relative', marginRight: 12, flexShrink: 0 }}>
                <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'linear-gradient(135deg,#0084ff,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, fontWeight: 700 }}>
                  {friend.username.charAt(0).toUpperCase()}
                </div>
                <div style={{ position: 'absolute', bottom: 1, right: 1, width: 12, height: 12, borderRadius: '50%', background: friend.is_online ? '#00b84c' : '#444', border: '2px solid #0b141a' }}></div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{friend.username}</span>
                  {friend.lastMessageTime && <span style={{ fontSize: 11, color: '#8696a0' }}>{formatTime(friend.lastMessageTime)}</span>}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                  <span style={{ fontSize: 13, color: friend.is_online && !friend.lastMessage ? '#00b84c' : '#8696a0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80%' }}>
                    {friend.lastMessage || (friend.is_online ? '🟢 Online' : '⚫ Offline')}
                  </span>
                  {(friend.unread || 0) > 0 && (
                    <span style={{ background: '#00b84c', color: '#fff', borderRadius: 10, minWidth: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, padding: '0 5px', flexShrink: 0 }}>
                      {friend.unread}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Chat Modal */}
      {selectedChat && (
        <div style={{ position: 'fixed', inset: 0, background: '#0b141a', zIndex: 1000, display: 'flex', flexDirection: 'column' }}>
          <div style={{ background: '#1f2c33', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #222d34', flexShrink: 0 }}>
            <button onClick={() => { setSelectedChat(null); selectedChatRef.current = null; }} style={{ background: 'none', border: 'none', color: '#8696a0', fontSize: 22, cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}>←</button>
            <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'linear-gradient(135deg,#0084ff,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 700, flexShrink: 0 }}>
              {selectedChat.username.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{selectedChat.username}</div>
              <div style={{ fontSize: 11, color: selectedChat.is_online ? '#00b84c' : '#8696a0', display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: selectedChat.is_online ? '#00b84c' : '#555' }}></div>
                {selectedChat.is_online ? 'Online' : 'Offline'}
              </div>
            </div>
            <button onClick={() => inviteToGame(selectedChat)} style={{ background: 'rgba(0,132,255,0.2)', color: '#0084ff', border: '1px solid rgba(0,132,255,0.3)', borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>🎮 Invite</button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
            {chatMessages.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#8696a0', marginTop: 60 }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>💬</div>
                <div style={{ fontSize: 14 }}>Say hi to {selectedChat.username}! 👋</div>
              </div>
            ) : (
              chatMessages.map((msg, i) => {
                const isMine = msg.fromId === user?.id;
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start', marginBottom: 6 }}>
                    <div style={{ maxWidth: '78%', padding: '8px 12px', borderRadius: isMine ? '12px 12px 4px 12px' : '12px 12px 12px 4px', background: isMine ? '#005c4b' : '#1f2c33', color: '#e9edef', fontSize: 14 }}>
                      <div style={{ wordBreak: 'break-word' }}>{msg.message}</div>
                      <div style={{ fontSize: 10, color: '#8696a0', textAlign: 'right', marginTop: 3 }}>{formatTime(msg.time)}</div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>

          <div style={{ padding: '8px 12px', background: '#1f2c33', display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid #222d34', flexShrink: 0, paddingBottom: 'max(8px, env(safe-area-inset-bottom, 8px))' }}>
            <input
              type="text" placeholder="Message..." value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage()}
              style={{ flex: 1, padding: '10px 14px', background: '#2a3942', border: 'none', borderRadius: 22, color: '#fff', fontSize: 15, outline: 'none', WebkitUserSelect: 'text', userSelect: 'text' }}
            />
            <button onClick={sendMessage} disabled={!newMessage.trim()}
              style={{ width: 42, height: 42, borderRadius: '50%', background: newMessage.trim() ? '#00b84c' : '#2a3942', color: '#fff', border: 'none', cursor: newMessage.trim() ? 'pointer' : 'default', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: '0.15s', flexShrink: 0 }}>
              ➤
            </button>
          </div>
        </div>
      )}

      <BottomNav unreadCount={totalUnread} />
    </div>
  );
}
