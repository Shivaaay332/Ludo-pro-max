import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import BottomNav from '../components/BottomNav.jsx';

function authFetch(url, options = {}) {
  const token = localStorage.getItem('ludo_token');
  if (token) options.headers = { ...options.headers, 'Authorization': 'Bearer ' + token };
  return fetch(url, options);
}

function genMsgId() {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

const EMOJIS = ['❤️', '😂', '😮', '😡', '👍'];

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
  const [isTyping, setIsTyping] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [editingMsg, setEditingMsg] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);

  const chatEndRef = useRef(null);
  const socketRef = useRef(null);
  const selectedChatRef = useRef(null);
  const userRef = useRef(null);
  const typingTimerRef = useRef(null);
  const typingOutTimerRef = useRef(null);
  const longPressTimer = useRef(null);
  const inputRef = useRef(null);

  selectedChatRef.current = selectedChat;
  userRef.current = user;

  useEffect(() => {
    async function init() {
      const me = await authFetch('/api/auth/me').then(r => r.json()).catch(() => ({}));
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
        if (curChat && data.fromId == curChat.id) {
          setChatMessages(prev => {
            if (prev.some(m => m.msgId === data.msgId)) return prev;
            return [...prev, data];
          });
          sock.emit('messageSeen', { viewerId: me.user.id, senderId: curChat.id });
        } else {
          setNotifications(prev => {
            if (prev.some(n => n.msgId === data.msgId)) return prev;
            return [...prev, { id: Date.now(), msgId: data.msgId, fromId: data.fromId, from: data.from, message: data.message }];
          });
          setFriends(prev => prev.map(f =>
            f.id == data.fromId ? { ...f, lastMessage: data.message, lastMessageTime: data.time, unread: (f.unread || 0) + 1 } : f
          ));
        }
      });

      sock.on('messageStatus', ({ msgId, status }) => {
        setChatMessages(prev => prev.map(m => m.msgId === msgId ? { ...m, status } : m));
      });

      sock.on('messagesSeen', () => {
        setChatMessages(prev => prev.map(m => m.fromId == me.user.id ? { ...m, status: 'seen' } : m));
      });

      sock.on('typing', ({ fromId }) => {
        if (selectedChatRef.current && fromId == selectedChatRef.current.id) {
          setIsTyping(true);
          clearTimeout(typingOutTimerRef.current);
          typingOutTimerRef.current = setTimeout(() => setIsTyping(false), 3000);
        }
      });

      sock.on('stopTyping', ({ fromId }) => {
        if (selectedChatRef.current && fromId == selectedChatRef.current.id) setIsTyping(false);
      });

      sock.on('messageDeleted', ({ msgId, forEveryone }) => {
        if (forEveryone) {
          setChatMessages(prev => prev.map(m => m.msgId === msgId ? { ...m, message: 'This message was deleted', deleted: true } : m));
        } else {
          setChatMessages(prev => prev.filter(m => m.msgId !== msgId));
        }
      });

      sock.on('messageEdited', ({ msgId, newText }) => {
        setChatMessages(prev => prev.map(m => m.msgId === msgId ? { ...m, message: newText, edited: true } : m));
      });

      sock.on('messageReacted', ({ msgId, reactions }) => {
        setChatMessages(prev => prev.map(m => m.msgId === msgId ? { ...m, reactions } : m));
      });

      sock.on('chatCleared', () => {
        setChatMessages([]);
      });

      sock.on('inviteReceived', (data) => {
        setNotifications(prev => [...prev, { id: Date.now(), type: 'invite', fromName: data.fromName, roomId: data.roomId }]);
      });

      sock.on('friendOnline', ({ userId }) => {
        setFriends(prev => prev.map(f => f.id == userId ? { ...f, is_online: true, lastSeen: null } : f));
      });

      sock.on('friendOffline', ({ userId, lastSeen }) => {
        setFriends(prev => prev.map(f => f.id == userId ? { ...f, is_online: false, lastSeen } : f));
      });

      const friendsData = await authFetch('/api/friends').then(r => r.json()).catch(() => ({}));
      if (friendsData.success) {
        setFriends((friendsData.friends || []).map(f => ({ ...f, unread: 0, lastMessage: '', lastMessageTime: null })));
        setReceivedRequests(friendsData.receivedRequests || []);
      }
      setLoading(false);
    }

    init();
    return () => {
      if (socketRef.current) { socketRef.current.emit('leaveChat', {}); socketRef.current.disconnect(); socketRef.current = null; }
    };
  }, [navigate]);

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isTyping]);

  async function loadFriends() {
    const data = await authFetch('/api/friends').then(r => r.json()).catch(() => ({}));
    if (data.success) {
      setFriends(prev => {
        const prevMap = {};
        prev.forEach(f => { prevMap[f.id] = f; });
        return (data.friends || []).map(f => ({ ...f, unread: prevMap[f.id]?.unread || 0, lastMessage: prevMap[f.id]?.lastMessage || '', lastMessageTime: prevMap[f.id]?.lastMessageTime || null }));
      });
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
    if (data.success) { setSearchResults(prev => prev.filter(u => u.id !== userId)); setSearchQuery(''); }
    else alert(data.error || 'Failed to send request');
  }

  async function acceptFriendRequest(fromUserId) {
    const data = await authFetch('/api/friends/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fromUserId }) }).then(r => r.json()).catch(() => ({}));
    if (data.success) loadFriends();
  }

  async function rejectFriendRequest(fromUserId) {
    await authFetch('/api/friends/reject', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fromUserId }) }).catch(() => {});
    loadFriends();
  }

  async function selectFriend(friend) {
    setSelectedChat(friend);
    selectedChatRef.current = friend;
    setChatMessages([]);
    setIsTyping(false);
    setReplyingTo(null);
    setEditingMsg(null);
    setNewMessage('');
    setShowHeaderMenu(false);
    setFriends(prev => prev.map(f => f.id === friend.id ? { ...f, unread: 0 } : f));
    const data = await authFetch('/api/chat/history/' + friend.id).then(r => r.json()).catch(() => ({ success: true, messages: [] }));
    if (data.success && data.messages) setChatMessages(data.messages);
    if (socketRef.current && userRef.current) socketRef.current.emit('messageSeen', { viewerId: userRef.current.id, senderId: friend.id });
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  function handleTyping(val) {
    setNewMessage(val);
    if (!selectedChat || !socketRef.current || !user) return;
    socketRef.current.emit('typing', { fromId: user.id, from: user.username, toId: selectedChat.id });
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => { socketRef.current?.emit('stopTyping', { fromId: user.id, toId: selectedChat.id }); }, 1500);
  }

  async function sendMessage() {
    const text = newMessage.trim();
    if (!text || !selectedChat || !user) return;

    if (editingMsg) {
      socketRef.current?.emit('editMessage', { msgId: editingMsg.msgId, fromId: user.id, toId: selectedChat.id, newText: text });
      setChatMessages(prev => prev.map(m => m.msgId === editingMsg.msgId ? { ...m, message: text, edited: true } : m));
      setEditingMsg(null);
      setNewMessage('');
      return;
    }

    const msgId = genMsgId();
    const msgData = {
      msgId, toId: selectedChat.id, toUsername: selectedChat.username,
      from: user.username, fromId: user.id, message: text,
      time: Date.now(), replyTo: replyingTo ? { msgId: replyingTo.msgId, from: replyingTo.from, message: replyingTo.message.substring(0, 60) } : null,
      reactions: {}, status: 'sent', deletedFor: []
    };
    setChatMessages(prev => [...prev, msgData]);
    setNewMessage('');
    setReplyingTo(null);
    setFriends(prev => prev.map(f => f.id === selectedChat.id ? { ...f, lastMessage: text, lastMessageTime: msgData.time } : f));
    socketRef.current?.emit('stopTyping', { fromId: user.id, toId: selectedChat.id });
    socketRef.current?.emit('sendMessage', msgData);
    await authFetch('/api/chat/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(msgData) }).catch(() => {});
  }

  function deleteMsg(msg, forEveryone) {
    if (!socketRef.current || !user || !selectedChat) return;
    socketRef.current.emit('deleteMessage', { msgId: msg.msgId, fromId: user.id, toId: selectedChat.id, forEveryone });
    if (forEveryone) {
      setChatMessages(prev => prev.map(m => m.msgId === msg.msgId ? { ...m, message: 'This message was deleted', deleted: true } : m));
    } else {
      setChatMessages(prev => prev.filter(m => m.msgId !== msg.msgId));
    }
    setContextMenu(null);
  }

  function reactToMessage(msgId, emoji) {
    if (!socketRef.current || !user || !selectedChat) return;
    socketRef.current.emit('reactToMessage', { msgId, fromId: user.id, toId: selectedChat.id, emoji });
    setChatMessages(prev => prev.map(m => {
      if (m.msgId !== msgId) return m;
      const reactions = { ...(m.reactions || {}) };
      const uid = String(user.id);
      Object.keys(reactions).forEach(e => { reactions[e] = reactions[e].filter(id => String(id) !== uid); if (reactions[e].length === 0) delete reactions[e]; });
      if (!reactions[emoji]) reactions[emoji] = [];
      reactions[emoji].push(uid);
      return { ...m, reactions };
    }));
    setContextMenu(null);
  }

  function clearChat() {
    if (!confirm('Clear all messages? This cannot be undone.')) return;
    socketRef.current?.emit('clearChat', { userId: user.id, friendId: selectedChat.id });
    setChatMessages([]);
    setShowHeaderMenu(false);
  }

  function inviteToGame(friend) {
    if (!socketRef.current || !user) return;
    const roomId = 'ROOM' + Math.random().toString(36).substr(2, 6).toUpperCase();
    socketRef.current.emit('inviteFriend', { friendId: friend.id, roomId, fromName: user.username });
    navigate('/game?room=' + encodeURIComponent(roomId));
  }

  function dismissNotif(id) { setNotifications(prev => prev.filter(n => n.id !== id)); }

  function handleLongPressStart(msg) {
    if (msg.deleted) return;
    longPressTimer.current = setTimeout(() => setContextMenu({ msg }), 500);
  }
  function handleLongPressEnd() { clearTimeout(longPressTimer.current); }
  function handleContextMenu(e, msg) { e.preventDefault(); if (!msg.deleted) setContextMenu({ msg }); }

  function formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts), diff = Date.now() - ts;
    if (diff < 60000) return 'now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm';
    if (diff < 86400000) return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  }

  function formatLastSeen(ts) {
    if (!ts) return 'a while ago';
    const diff = Date.now() - ts;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' min ago';
    if (diff < 86400000) return 'today at ' + new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    return new Date(ts).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  }

  const totalUnread = friends.reduce((sum, f) => sum + (f.unread || 0), 0);

  if (loading) return <div style={{ minHeight: '100vh', background: '#0b141a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8696a0' }}>Loading...</div>;

  return (
    <div style={{ height: '100%', background: '#0b141a', color: '#e9edef', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>

      {/* Context Menu Modal */}
      {contextMenu && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }} onClick={() => setContextMenu(null)}>
          <div style={{ background: '#1f2c33', borderRadius: 16, overflow: 'hidden', minWidth: 220, boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-around', padding: '14px 12px', background: '#162028', borderBottom: '1px solid #222d34' }}>
              {EMOJIS.map(em => (
                <button key={em} onClick={() => reactToMessage(contextMenu.msg.msgId, em)}
                  style={{ background: 'none', border: 'none', fontSize: 26, cursor: 'pointer', padding: '2px 6px', borderRadius: 8, transition: 'transform 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.3)'}
                  onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>{em}</button>
              ))}
            </div>
            <button onClick={() => { setReplyingTo(contextMenu.msg); setContextMenu(null); setTimeout(() => inputRef.current?.focus(), 50); }} style={ctxBtn}>↩ Reply</button>
            {contextMenu.msg.fromId == user?.id && !contextMenu.msg.deleted && (
              <button onClick={() => { setEditingMsg(contextMenu.msg); setNewMessage(contextMenu.msg.message); setContextMenu(null); setTimeout(() => inputRef.current?.focus(), 50); }} style={ctxBtn}>✏️ Edit Message</button>
            )}
            {contextMenu.msg.fromId == user?.id && !contextMenu.msg.deleted && (
              <button onClick={() => deleteMsg(contextMenu.msg, true)} style={{ ...ctxBtn, color: '#ff4c4c' }}>🗑 Delete for Everyone</button>
            )}
            <button onClick={() => deleteMsg(contextMenu.msg, false)} style={{ ...ctxBtn, color: '#ff8080', borderBottom: 'none' }}>🗑 Delete for Me</button>
          </div>
        </div>
      )}

      {/* Notification Toasts */}
      {notifications.length > 0 && (
        <div style={{ position: 'fixed', top: 60, right: 12, zIndex: 2000, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 290 }}>
          {notifications.slice(0, 3).map((notif) => (
            <div key={notif.id} onClick={() => {
              if (notif.type !== 'invite') { const f = friends.find(f => f.id == notif.fromId); if (f) { selectFriend(f); dismissNotif(notif.id); } }
            }} style={{ background: '#1f2c33', borderRadius: 12, padding: '10px 14px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)', borderLeft: `4px solid ${notif.type === 'invite' ? '#0084ff' : '#00b84c'}`, cursor: notif.type !== 'invite' ? 'pointer' : 'default' }}>
              {notif.type === 'invite' ? (
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 13 }}>🎮 {notif.fromName} invited you!</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => { navigate('/game?room=' + encodeURIComponent(notif.roomId)); dismissNotif(notif.id); }} style={{ flex: 1, background: '#00b84c', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Join Game</button>
                    <button onClick={() => dismissNotif(notif.id)} style={{ background: '#2a3942', color: '#ccc', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>✕</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>💬 {notif.from}</div>
                    <div style={{ color: '#8696a0', fontSize: 12, marginTop: 2 }}>{notif.message?.substring(0, 45)}</div>
                  </div>
                  <button onClick={e => { e.stopPropagation(); dismissNotif(notif.id); }} style={{ background: 'none', border: 'none', color: '#555', fontSize: 16, cursor: 'pointer', padding: 0, flexShrink: 0 }}>✕</button>
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
        {totalUnread > 0 && (
          <div style={{ background: '#ff3b3b', color: '#fff', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{totalUnread}</div>
        )}
      </header>

      {/* Friends List Area */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 60 }}>
        {/* Search */}
        <div style={{ padding: '10px 14px', background: '#1f2c33', borderBottom: '1px solid #222d34' }}>
          <input type="text" placeholder="🔍 Search players to add..." value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); searchUsers(e.target.value); }}
            style={{ width: '100%', padding: '10px 14px', background: '#2a3942', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
          {searchResults.length > 0 && (
            <div style={{ marginTop: 8, background: '#1a272e', borderRadius: 10, overflow: 'hidden', border: '1px solid #222d34' }}>
              {searchResults.map(u => (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #222d34' }}>
                  <div><div style={{ fontWeight: 600, fontSize: 14 }}>{u.username}</div><div style={{ fontSize: 11, color: '#8696a0' }}>{u.wins}W · {u.win_rate}% WR</div></div>
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
        <div style={{ padding: '8px 14px 4px', fontSize: 11, color: '#8696a0', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Friends ({friends.length})</div>
        {friends.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#8696a0' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>No friends yet</div>
            <div style={{ fontSize: 12 }}>Search for players above to add them!</div>
          </div>
        ) : friends.map(friend => (
          <div key={friend.id} onClick={() => selectFriend(friend)} style={{ display: 'flex', alignItems: 'center', padding: '12px 14px', cursor: 'pointer', borderBottom: '1px solid #222d34', WebkitTapHighlightColor: 'rgba(255,255,255,0.05)' }}>
            <div style={{ position: 'relative', marginRight: 12, flexShrink: 0 }}>
              <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'linear-gradient(135deg,#0084ff,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, fontWeight: 700 }}>{friend.username.charAt(0).toUpperCase()}</div>
              <div style={{ position: 'absolute', bottom: 1, right: 1, width: 12, height: 12, borderRadius: '50%', background: friend.is_online ? '#00b84c' : '#444', border: '2px solid #0b141a' }}></div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: 15 }}>{friend.username}</span>
                {friend.lastMessageTime && <span style={{ fontSize: 11, color: '#8696a0' }}>{formatTime(friend.lastMessageTime)}</span>}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                <span style={{ fontSize: 13, color: '#8696a0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80%' }}>
                  {friend.lastMessage || (friend.is_online ? '🟢 Online' : `⚫ ${friend.lastSeen ? 'Last seen ' + formatLastSeen(friend.lastSeen) : 'Offline'}`)}
                </span>
                {(friend.unread || 0) > 0 && (
                  <span style={{ background: '#00b84c', color: '#fff', borderRadius: 10, minWidth: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, padding: '0 5px', flexShrink: 0 }}>{friend.unread}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── CHAT PANEL ── */}
      {selectedChat && (
        <div style={{ position: 'fixed', inset: 0, background: '#0b141a', zIndex: 1000, display: 'flex', flexDirection: 'column' }}>

          {/* Chat Header */}
          <div style={{ background: '#1f2c33', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #222d34', flexShrink: 0, position: 'relative' }}>
            <button onClick={() => { setSelectedChat(null); selectedChatRef.current = null; setIsTyping(false); setReplyingTo(null); setEditingMsg(null); setNewMessage(''); setShowHeaderMenu(false); }}
              style={{ background: 'none', border: 'none', color: '#8696a0', fontSize: 22, cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}>←</button>
            <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'linear-gradient(135deg,#0084ff,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 700, flexShrink: 0 }}>
              {selectedChat.username.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }} onClick={() => setShowHeaderMenu(false)}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{selectedChat.username}</div>
              <div style={{ fontSize: 11, color: isTyping ? '#00b84c' : (selectedChat.is_online ? '#00b84c' : '#8696a0'), transition: 'color 0.2s' }}>
                {isTyping ? `${selectedChat.username} is typing...` : selectedChat.is_online ? 'Online' : selectedChat.lastSeen ? `Last seen ${formatLastSeen(selectedChat.lastSeen)}` : 'Offline'}
              </div>
            </div>
            <button onClick={() => inviteToGame(selectedChat)} style={{ background: 'rgba(0,132,255,0.2)', color: '#0084ff', border: '1px solid rgba(0,132,255,0.3)', borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>🎮 Invite</button>
            <button onClick={() => setShowHeaderMenu(v => !v)} style={{ background: 'none', border: 'none', color: '#8696a0', fontSize: 22, cursor: 'pointer', padding: '0 2px', lineHeight: 1, flexShrink: 0 }}>⋮</button>
            {showHeaderMenu && (
              <div style={{ position: 'absolute', top: '100%', right: 8, background: '#1f2c33', borderRadius: 10, boxShadow: '0 4px 24px rgba(0,0,0,0.5)', zIndex: 10, minWidth: 160, border: '1px solid #222d34', overflow: 'hidden' }}
                onClick={e => e.stopPropagation()}>
                <button onClick={clearChat} style={{ ...ctxBtn, color: '#ff6b6b', borderBottom: 'none' }}>🗑 Clear Chat</button>
              </div>
            )}
          </div>

          {/* Messages area */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }} onClick={() => { setShowHeaderMenu(false); }}>
            {chatMessages.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#8696a0', marginTop: 80 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>💬</div>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{selectedChat.username}</div>
                <div style={{ fontSize: 13 }}>Say hello! 👋</div>
              </div>
            ) : chatMessages.map((msg, i) => {
              const isMine = msg.fromId == user?.id;
              const isDeleted = msg.deleted;
              const reactions = msg.reactions || {};
              const reactionEntries = Object.entries(reactions).filter(([, users]) => users.length > 0);
              return (
                <div key={msg.msgId || i} style={{ display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start', marginBottom: reactionEntries.length ? 10 : 4 }}>
                  <div
                    onTouchStart={() => handleLongPressStart(msg)}
                    onTouchEnd={handleLongPressEnd}
                    onTouchMove={handleLongPressEnd}
                    onContextMenu={e => handleContextMenu(e, msg)}
                    style={{ maxWidth: '78%', padding: '8px 12px', borderRadius: isMine ? '14px 14px 4px 14px' : '14px 14px 14px 4px', background: isMine ? '#005c4b' : '#1f2c33', color: isDeleted ? '#8696a0' : '#e9edef', fontSize: 14, cursor: isDeleted ? 'default' : 'pointer', userSelect: 'none', WebkitUserSelect: 'none' }}
                  >
                    {/* Reply preview */}
                    {msg.replyTo && (
                      <div style={{ background: 'rgba(255,255,255,0.07)', borderLeft: '3px solid #0084ff', borderRadius: 6, padding: '5px 8px', marginBottom: 6 }}>
                        <div style={{ color: '#53bdeb', fontWeight: 600, fontSize: 11, marginBottom: 2 }}>{msg.replyTo.from}</div>
                        <div style={{ fontSize: 12, color: '#8696a0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{msg.replyTo.message}</div>
                      </div>
                    )}
                    <div style={{ wordBreak: 'break-word', fontStyle: isDeleted ? 'italic' : 'normal' }}>
                      {isDeleted ? '🚫 This message was deleted' : msg.message}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 4, marginTop: 3 }}>
                      {msg.edited && !isDeleted && <span style={{ fontSize: 10, color: '#8696a0' }}>edited</span>}
                      <span style={{ fontSize: 10, color: '#8696a0' }}>{formatTime(msg.time)}</span>
                      {isMine && !isDeleted && (
                        <span style={{ fontSize: 11, color: msg.status === 'seen' ? '#53bdeb' : '#8696a0' }}>
                          {msg.status === 'seen' ? '✓✓' : msg.status === 'delivered' ? '✓✓' : '✓'}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Reactions */}
                  {reactionEntries.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap', justifyContent: isMine ? 'flex-end' : 'flex-start' }}>
                      {reactionEntries.map(([emoji, users]) => (
                        <button key={emoji} onClick={() => reactToMessage(msg.msgId, emoji)}
                          style={{ background: users.includes(String(user?.id)) ? 'rgba(0,132,255,0.25)' : '#1f2c33', border: `1px solid ${users.includes(String(user?.id)) ? '#0084ff' : '#2a3942'}`, borderRadius: 12, padding: '2px 8px', fontSize: 13, cursor: 'pointer', color: '#e9edef', display: 'flex', alignItems: 'center', gap: 3 }}>
                          {emoji}<span style={{ fontSize: 11 }}>{users.length}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Typing indicator */}
            {isTyping && (
              <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 4 }}>
                <div style={{ background: '#1f2c33', borderRadius: '14px 14px 14px 4px', padding: '10px 16px', display: 'flex', gap: 5, alignItems: 'center' }}>
                  {[0, 0.2, 0.4].map((d, i) => (
                    <span key={i} style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#8696a0', animation: `typingBounce 1s ${d}s infinite` }}></span>
                  ))}
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Reply / Edit bar */}
          {(replyingTo || editingMsg) && (
            <div style={{ background: '#162028', borderTop: '2px solid #0084ff', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <div style={{ flex: 1, borderLeft: '3px solid #0084ff', paddingLeft: 10 }}>
                <div style={{ fontSize: 12, color: '#53bdeb', fontWeight: 600, marginBottom: 2 }}>{editingMsg ? '✏️ Editing message' : `↩ Reply to ${replyingTo?.from}`}</div>
                <div style={{ fontSize: 12, color: '#8696a0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{editingMsg ? editingMsg.message : replyingTo?.message?.substring(0, 60)}</div>
              </div>
              <button onClick={() => { setReplyingTo(null); setEditingMsg(null); setNewMessage(''); }} style={{ background: 'none', border: 'none', color: '#8696a0', fontSize: 20, cursor: 'pointer', padding: 0 }}>✕</button>
            </div>
          )}

          {/* Input bar */}
          <div style={{ padding: '8px 12px', background: '#1f2c33', display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid #222d34', flexShrink: 0, paddingBottom: 'max(8px, env(safe-area-inset-bottom, 8px))' }}>
            <input
              ref={inputRef}
              type="text" placeholder={editingMsg ? 'Edit message...' : 'Type a message...'} value={newMessage}
              onChange={e => handleTyping(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              style={{ flex: 1, padding: '11px 16px', background: '#2a3942', border: 'none', borderRadius: 24, color: '#fff', fontSize: 15, outline: 'none', WebkitUserSelect: 'text', userSelect: 'text' }}
            />
            <button onClick={sendMessage} disabled={!newMessage.trim()}
              style={{ width: 44, height: 44, borderRadius: '50%', background: newMessage.trim() ? '#00b84c' : '#2a3942', color: '#fff', border: 'none', cursor: newMessage.trim() ? 'pointer' : 'default', fontSize: 19, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s', flexShrink: 0 }}>
              ➤
            </button>
          </div>
        </div>
      )}

      <BottomNav unreadCount={totalUnread} />

      <style>{`
        @keyframes typingBounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-5px)} }
      `}</style>
    </div>
  );
}

const ctxBtn = {
  display: 'block', width: '100%', padding: '14px 20px', background: 'none', border: 'none',
  borderBottom: '1px solid #222d34', color: '#e9edef', textAlign: 'left', fontSize: 15, cursor: 'pointer'
};
