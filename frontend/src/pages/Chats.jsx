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

const EMOJI_LIST = [
  '😀','😂','🤣','😊','😍','🥰','😘','🙃','😉','😇','😎','🤓','🥳','😏','😒',
  '😞','😔','😟','😕','🙁','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡',
  '🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤔','🤫','🤥','😶','😐',
  '😑','😬','🙄','😯','😦','👍','👎','👏','🙌','👐','🤲','🤝','🙏','✌️','💪',
  '🎲','🎮','🏆','🥇','🥈','🥉','🎯','🔥','✨','🌟','💯','💣','💥','💀','👽'
];

export default function Chats() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [friends, setFriends] = useState([]);
  
  // Chat View States
  const [selectedChat, setSelectedChat] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());

  const [loading, setLoading] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [editingMsg, setEditingMsg] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);

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
    const timer = setInterval(() => setCurrentTime(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    async function init() {
      const me = await authFetch('/api/auth/me').then(r => r.json()).catch(() => ({}));
      if (!me.success) { localStorage.removeItem('ludo_token'); navigate('/'); return; }
      setUser(me.user);

      const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';
      const sock = io(BACKEND_URL, { transports: ['websocket', 'polling'], reconnection: true, reconnectionAttempts: 10, reconnectionDelay: 1000 });
      socketRef.current = sock;

      sock.on('connect', () => {
        sock.emit('joinChat', { userId: me.user.id, username: me.user.username });
      });

      sock.on('friendActivityUpdate', ({ userId, status, roomId }) => {
        setFriends(prev => prev.map(f => f.id == userId ? { ...f, activityStatus: status, currentRoom: roomId } : f));
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

      sock.on('friendOnline', ({ userId }) => {
        setFriends(prev => prev.map(f => f.id == userId ? { ...f, is_online: true, activityStatus: 'online', lastSeen: null } : f));
      });

      sock.on('friendOffline', ({ userId, lastSeen }) => {
        setFriends(prev => prev.map(f => f.id == userId ? { ...f, is_online: false, activityStatus: 'offline', lastSeen } : f));
      });

      const friendsData = await authFetch('/api/friends').then(r => r.json()).catch(() => ({}));
      if (friendsData.success) {
        setFriends((friendsData.friends || []).map(f => ({ ...f, unread: 0, lastMessage: '', lastMessageTime: null })));
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

  async function selectFriend(friend) {
    setSelectedChat(friend);
    selectedChatRef.current = friend;
    setChatMessages([]);
    setIsTyping(false);
    setReplyingTo(null);
    setEditingMsg(null);
    setNewMessage('');
    setShowEmojiPicker(false);
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
      setShowEmojiPicker(false);
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
    setShowEmojiPicker(false);
    setReplyingTo(null);
    setFriends(prev => prev.map(f => f.id === selectedChat.id ? { ...f, lastMessage: text, lastMessageTime: msgData.time } : f));
    socketRef.current?.emit('stopTyping', { fromId: user.id, toId: selectedChat.id });
    socketRef.current?.emit('sendMessage', msgData);
    await authFetch('/api/chat/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(msgData) }).catch(() => {});
  }

  async function sendChallenge() {
    if (!selectedChat || !user) return;
    if (!confirm(`Send a direct 1v1 Challenge to ${selectedChat.username}?`)) return;
    
    setShowEmojiPicker(false);
    const roomId = '1V1_' + Math.random().toString(36).substr(2, 6).toUpperCase();
    const text = `[INVITE:${roomId}]`;

    const msgId = genMsgId();
    const msgData = {
      msgId, toId: selectedChat.id, toUsername: selectedChat.username,
      from: user.username, fromId: user.id, message: text,
      time: Date.now(), replyTo: null,
      reactions: {}, status: 'sent', deletedFor: []
    };
    
    setChatMessages(prev => [...prev, msgData]);
    setFriends(prev => prev.map(f => f.id === selectedChat.id ? { ...f, lastMessage: '⚔️ 1v1 Challenge', lastMessageTime: msgData.time } : f));
    socketRef.current?.emit('sendMessage', msgData);
    await authFetch('/api/chat/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(msgData) }).catch(() => {});
    
    setSelectedChat(null);
    navigate(`/game?room=${encodeURIComponent(roomId)}`);
  }

  function rejectChallenge(msg) {
    setReplyingTo(msg);
    setNewMessage("I can't play right now! 😅");
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function deleteMsg(msg, forEveryone) {
    if (!socketRef.current || !user || !selectedChat) return;
    socketRef.current.emit('deleteMessage', { msgId: msg.msgId, fromId: user.id, toId: selectedChat.id, forEveryone });
    if (forEveryone) {
      setChatMessages(prev => prev.map(m => m.msgId === msg.msgId ? { ...m, message: 'This message was deleted', deleted: true } : m));
    } else {
      setChatMessages(prev => prev.filter(m => m.msgId !== msgId));
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
  }

  function handleLongPressStart(msg) {
    if (msg.deleted) return;
    longPressTimer.current = setTimeout(() => {
      if (window.navigator.vibrate) window.navigator.vibrate(50);
      setContextMenu({ msg });
    }, 450);
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

  const totalUnread = friends.reduce((sum, f) => sum + (f.unread || 0), 0);

  if (loading) return <div style={{ minHeight: '100vh', background: 'var(--bg-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a1a1aa' }}>Loading Chats...</div>;

  return (
    <div style={{ height: '100%', background: 'var(--bg-dark)', color: '#fff', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
      
      {/* 🟢 Chats Main List Header - BACK BUTTON ADDED HERE */}
      <header style={{ background: 'rgba(9, 9, 11, 0.85)', backdropFilter: 'blur(16px)', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0, zIndex: 10 }}>
        {/* WAPAS HOME JAANE KA BUTTON */}
        <button onClick={() => navigate('/dashboard')} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', width: 44, height: 44, borderRadius: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, transition: 'background 0.2s' }}>←</button>
        <div style={{ fontSize: 22, fontWeight: 900, flex: 1 }}>💬 Direct Messages</div>
      </header>

      {/* Friends Active Chat List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', paddingBottom: 100 }}>
        {friends.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#71717a' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>💬</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>No Active Chats</div>
            <div style={{ fontSize: 14 }}>Go to Friends page to start a conversation!</div>
          </div>
        ) : friends.map(friend => {
            let statusText = friend.is_online ? '🟢 Online' : '⚫ Offline';
            if (friend.activityStatus === 'in_lobby') statusText = '🟢 In Lobby';
            else if (friend.activityStatus === 'in_match') statusText = '🔴 In Match';

            return (
              <div key={friend.id} onClick={() => selectFriend(friend)} style={{ display: 'flex', alignItems: 'center', padding: '16px', cursor: 'pointer', background: 'var(--bg-card)', borderRadius: 20, marginBottom: 8, border: '1px solid rgba(255,255,255,0.03)', backdropFilter: 'blur(10px)', transition: 'background 0.2s' }}>
                <div style={{ position: 'relative', marginRight: 16, flexShrink: 0 }}>
                  <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(135deg, var(--blue), var(--purple))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 900, boxShadow: '0 4px 10px rgba(59,130,246,0.3)' }}>{friend.username.charAt(0).toUpperCase()}</div>
                  <div style={{ position: 'absolute', bottom: -2, right: -2, width: 16, height: 16, borderRadius: '50%', background: friend.activityStatus === 'in_match' ? 'var(--red)' : friend.is_online ? 'var(--green)' : '#52525b', border: '3px solid var(--bg-dark)' }}></div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 800, fontSize: 16 }}>{friend.username}</span>
                    {friend.lastMessageTime && <span style={{ fontSize: 12, color: '#a1a1aa', fontWeight: 600 }}>{formatTime(friend.lastMessageTime)}</span>}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                    <span style={{ fontSize: 14, color: (friend.unread || 0) > 0 ? '#fff' : '#a1a1aa', fontWeight: (friend.unread || 0) > 0 ? 600 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80%' }}>
                      {friend.lastMessage || statusText}
                    </span>
                    {(friend.unread || 0) > 0 && (
                      <span style={{ background: 'var(--blue)', color: '#fff', borderRadius: '50%', minWidth: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, padding: '0 6px', boxShadow: '0 2px 8px rgba(59,130,246,0.4)' }}>{friend.unread}</span>
                    )}
                  </div>
                </div>
              </div>
            );
        })}
      </div>

      {/* ── CHAT OVERLAY VIEW ── */}
      {selectedChat && (
        <div style={{ position: 'fixed', inset: 0, background: 'var(--bg-dark)', zIndex: 1000, display: 'flex', flexDirection: 'column', animation: 'slideIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}>
          
          {/* Active Chat Header */}
          <div style={{ background: 'rgba(9, 9, 11, 0.85)', backdropFilter: 'blur(20px)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0, position: 'relative', zIndex: 10 }}>
            <button onClick={() => { setSelectedChat(null); selectedChatRef.current = null; setIsTyping(false); setReplyingTo(null); setEditingMsg(null); setNewMessage(''); setShowEmojiPicker(false); }}
              style={{ background: 'none', border: 'none', color: '#fff', fontSize: 26, cursor: 'pointer', padding: '0 8px', display: 'flex', alignItems: 'center' }}>←</button>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg, var(--blue), var(--purple))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 900 }}>
                {selectedChat.username.charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{selectedChat.username}</div>
                <div style={{ fontSize: 12, color: isTyping ? 'var(--green)' : '#a1a1aa', fontWeight: isTyping ? 700 : 500, transition: 'color 0.2s' }}>
                  {isTyping ? `is typing...` : selectedChat.activityStatus === 'in_match' ? '🔴 In Match' : selectedChat.is_online ? '🟢 Online' : 'Offline'}
                </div>
              </div>
            </div>
            
            <button onClick={clearChat} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', width: 40, height: 40, borderRadius: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🗑️</button>
          </div>

          {/* Chat Messages Area */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px', display: 'flex', flexDirection: 'column' }} onClick={() => setShowEmojiPicker(false)}>
            {chatMessages.length === 0 ? (
              <div style={{ margin: 'auto', textAlign: 'center', color: '#71717a', padding: '30px', background: 'var(--bg-card)', borderRadius: 24 }}>
                <div style={{ fontSize: 48, marginBottom: 16, filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.3))' }}>👋</div>
                <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8, color: '#fff' }}>Say Hello!</div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>Send a message or a 1v1 challenge.</div>
              </div>
            ) : chatMessages.map((msg, i) => {
              const isMine = msg.fromId == user?.id;
              const isDeleted = msg.deleted;
              const reactionEntries = Object.entries(msg.reactions || {}).filter(([, users]) => users.length > 0);
              
              const isInvite = msg.message && msg.message.startsWith('[INVITE:') && msg.message.endsWith(']');
              let inviteRoomId = ''; let isExpired = false;
              if (isInvite) {
                  inviteRoomId = msg.message.replace('[INVITE:', '').replace(']', '');
                  isExpired = (currentTime - msg.time) > 300000;
              }

              return (
                <SwipeableMessage key={msg.msgId || i} msg={msg} isMine={isMine} isDeleted={isDeleted}
                  onReply={() => { setReplyingTo(msg); setTimeout(() => inputRef.current?.focus(), 50); }}
                  onLongPress={handleLongPressStart} onLongPressEnd={handleLongPressEnd} onContextMenu={handleContextMenu}>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start', marginBottom: reactionEntries.length ? 16 : 10, width: '100%' }}>
                    <div style={{
                        maxWidth: '80%', padding: isInvite ? '0' : '12px 16px',
                        borderRadius: isMine ? '20px 20px 4px 20px' : '20px 20px 20px 4px',
                        background: isMine ? 'linear-gradient(135deg, var(--blue), var(--purple))' : 'var(--bg-card)',
                        border: isMine ? 'none' : '1px solid rgba(255,255,255,0.08)',
                        boxShadow: isMine ? '0 4px 15px rgba(59,130,246,0.3)' : '0 4px 15px rgba(0,0,0,0.1)',
                        color: isDeleted ? 'rgba(255,255,255,0.5)' : '#fff', fontSize: 15, lineHeight: 1.4,
                        position: 'relative'
                      }}>
                      
                      {msg.replyTo && !isInvite && (
                        <div style={{ background: 'rgba(0,0,0,0.2)', borderLeft: `3px solid ${isMine ? '#fff' : 'var(--blue)'}`, borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>
                          <div style={{ fontWeight: 800, fontSize: 12, color: isMine ? '#fff' : 'var(--blue)', marginBottom: 2 }}>{msg.replyTo.from}</div>
                          <div style={{ fontSize: 13, opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{msg.replyTo.message}</div>
                        </div>
                      )}
                      
                      {isInvite ? (
                        <div style={{ padding: '20px', textAlign: 'center', width: '240px', opacity: isExpired ? 0.7 : 1 }}>
                          <div style={{ fontSize: 40, marginBottom: 12, filter: isExpired ? 'grayscale(100%)' : 'drop-shadow(0 4px 8px rgba(0,0,0,0.5))' }}>{isExpired ? '⌛' : '⚔️'}</div>
                          <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 4 }}>{isExpired ? 'Challenge Expired' : '1v1 Challenge!'}</div>
                          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 16, fontWeight: 700, letterSpacing: 1 }}>ROOM: {inviteRoomId}</div>
                          
                          {isExpired ? (
                             <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: '10px', fontSize: 13, fontWeight: 600 }}>This invite is no longer valid.</div>
                          ) : isMine ? (
                             <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: '10px', fontSize: 13, color: 'var(--green)', fontWeight: 800 }}>⏳ Waiting for opponent...</div>
                          ) : (
                             <div style={{ display: 'flex', gap: 10 }}>
                               <button onClick={() => navigate(`/game?room=${encodeURIComponent(inviteRoomId)}`)} style={{ flex: 1, background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 12, padding: '12px 0', fontWeight: 800, fontSize: 14, cursor: 'pointer', boxShadow: '0 4px 12px rgba(16,185,129,0.3)' }}>✓ Accept</button>
                               <button onClick={() => rejectChallenge(msg)} style={{ flex: 1, background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', borderRadius: 12, padding: '12px 0', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>✕ Reject</button>
                             </div>
                          )}
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 16, fontWeight: 600 }}>{formatTime(msg.time)}</div>
                        </div>
                      ) : (
                        <div style={{ wordBreak: 'break-word', fontStyle: isDeleted ? 'italic' : 'normal' }}>
                          {isDeleted ? '🚫 This message was deleted' : msg.message}
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 6, fontSize: 11, fontWeight: 600, color: isMine ? 'rgba(255,255,255,0.8)' : '#a1a1aa' }}>
                            {msg.edited && <span>edited</span>}
                            <span>{formatTime(msg.time)}</span>
                            {isMine && !isDeleted && <span style={{ color: msg.status === 'seen' ? '#bbf7d0' : 'inherit' }}>{msg.status === 'seen' ? '✓✓' : '✓'}</span>}
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {reactionEntries.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, marginTop: -8, zIndex: 2, padding: isMine ? '0 12px 0 0' : '0 0 0 12px' }}>
                        {reactionEntries.map(([emoji, users]) => (
                          <div key={emoji} style={{ background: users.includes(String(user?.id)) ? 'var(--blue)' : 'var(--bg-dark)', border: `1px solid ${users.includes(String(user?.id)) ? 'var(--blue)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 14, padding: '4px 8px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, boxShadow: '0 4px 10px rgba(0,0,0,0.3)', backdropFilter: 'blur(10px)' }}>
                            {emoji} <span style={{ fontSize: 11, fontWeight: 800 }}>{users.length}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </SwipeableMessage>
              );
            })}
            
            {/* Typing Indicator */}
            {isTyping && (
              <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 12 }}>
                <div style={{ background: 'var(--bg-card)', backdropFilter: 'blur(10px)', borderRadius: '20px 20px 20px 4px', padding: '16px 20px', display: 'flex', gap: 6, alignItems: 'center', border: '1px solid rgba(255, 255, 255, 0.05)', boxShadow: '0 4px 15px rgba(0,0,0,0.1)' }}>
                  {[0, 0.15, 0.3].map((delay, i) => (
                    <div key={i} className="liquid-dot" style={{ animationDelay: `${delay}s` }}></div>
                  ))}
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Reply/Edit Preview Bar */}
          {(replyingTo || editingMsg) && (
            <div style={{ background: 'rgba(9, 9, 11, 0.95)', borderTop: '1px solid rgba(255,255,255,0.05)', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ flex: 1, borderLeft: '3px solid var(--blue)', paddingLeft: 12, background: 'rgba(255,255,255,0.05)', borderRadius: '0 8px 8px 0', padding: '8px 12px' }}>
                <div style={{ fontSize: 12, color: 'var(--blue)', fontWeight: 800, marginBottom: 4 }}>{editingMsg ? '✏️ Editing Message' : `↩ Replying to ${replyingTo?.from}`}</div>
                <div style={{ fontSize: 14, color: '#a1a1aa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{editingMsg ? editingMsg.message : replyingTo?.message}</div>
              </div>
              <button onClick={() => { setReplyingTo(null); setEditingMsg(null); setNewMessage(''); }} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer', width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: 12 }}>✕</button>
            </div>
          )}

          {/* Premium Bottom Chat Input */}
          <div style={{ position: 'relative', background: 'rgba(9, 9, 11, 0.85)', backdropFilter: 'blur(20px)', borderTop: '1px solid rgba(255,255,255,0.08)', zIndex: 20 }}>
            {showEmojiPicker && (
              <div style={{ position: 'absolute', bottom: '100%', left: 16, right: 16, marginBottom: 12, background: 'rgba(24, 24, 27, 0.95)', backdropFilter: 'blur(20px)', borderRadius: 20, border: '1px solid rgba(255,255,255,0.1)', padding: '16px', display: 'flex', flexWrap: 'wrap', gap: 10, maxHeight: 240, overflowY: 'auto', boxShadow: '0 -10px 40px rgba(0,0,0,0.5)' }}>
                {EMOJI_LIST.map(em => (
                  <button key={em} onClick={() => setNewMessage(prev => prev + em)} style={{ background: 'none', border: 'none', fontSize: 28, cursor: 'pointer', padding: 4, transition: 'transform 0.1s' }} onMouseDown={e=>e.currentTarget.style.transform='scale(0.8)'} onMouseUp={e=>e.currentTarget.style.transform='scale(1)'}>{em}</button>
                ))}
              </div>
            )}

            <div style={{ padding: '12px 16px', paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))', display: 'flex', alignItems: 'center', gap: 12 }}>
              <button onClick={() => setShowEmojiPicker(!showEmojiPicker)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', width: 44, height: 44, borderRadius: 14, fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>😀</button>
              <button onClick={sendChallenge} title="Send 1v1 Challenge" style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.3)', width: 44, height: 44, borderRadius: 14, fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: '0.2s' }}>⚔️</button>

              <div style={{ flex: 1, position: 'relative' }}>
                <input
                  ref={inputRef} type="text" placeholder={editingMsg ? "Edit message..." : "Message..."} value={newMessage}
                  onChange={e => handleTyping(e.target.value)} onFocus={() => setShowEmojiPicker(false)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                  style={{ width: '100%', height: 52, padding: '0 20px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 26, color: '#fff', fontSize: 16, outline: 'none', transition: 'border 0.3s' }}
                  onFocusCapture={e => e.target.style.border = '1px solid var(--blue)'}
                  onBlurCapture={e => e.target.style.border = '1px solid rgba(255,255,255,0.1)'}
                />
              </div>
              
              <button onClick={sendMessage} disabled={!newMessage.trim()}
                style={{ width: 52, height: 52, borderRadius: '50%', background: newMessage.trim() ? 'linear-gradient(135deg, var(--blue), var(--purple))' : 'rgba(255,255,255,0.05)', color: '#fff', border: 'none', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.3s', opacity: newMessage.trim() ? 1 : 0.5, transform: newMessage.trim() ? 'scale(1)' : 'scale(0.9)', boxShadow: newMessage.trim() ? '0 4px 15px rgba(59,130,246,0.4)' : 'none' }}>
                ➤
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Context Actions Menu */}
      {contextMenu && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }} onClick={() => setContextMenu(null)}>
          <div style={{ background: 'rgba(24, 24, 27, 0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 24, overflow: 'hidden', minWidth: 260, boxShadow: '0 20px 60px rgba(0,0,0,0.5)', animation: 'popIn 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-around', padding: '16px 12px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              {EMOJIS.map(em => (
                <button key={em} onClick={() => reactToMessage(contextMenu.msg.msgId, em)}
                  style={{ background: 'rgba(255,255,255,0.05)', border: 'none', fontSize: 26, width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'transform 0.1s' }}
                  onMouseDown={e => e.currentTarget.style.transform = 'scale(0.8)'} onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}>{em}</button>
              ))}
            </div>
            <button onClick={() => { setReplyingTo(contextMenu.msg); setContextMenu(null); setTimeout(() => inputRef.current?.focus(), 50); }} style={ctxBtn}>↩ Reply to Message</button>
            {contextMenu.msg.fromId == user?.id && !contextMenu.msg.deleted && (
              <button onClick={() => { setEditingMsg(contextMenu.msg); setNewMessage(contextMenu.msg.message); setContextMenu(null); setTimeout(() => inputRef.current?.focus(), 50); }} style={ctxBtn}>✏️ Edit Message</button>
            )}
            {contextMenu.msg.fromId == user?.id && !contextMenu.msg.deleted && (
              <button onClick={() => deleteMsg(contextMenu.msg, true)} style={{ ...ctxBtn, color: 'var(--red)' }}>🗑 Delete for Everyone</button>
            )}
            <button onClick={() => deleteMsg(contextMenu.msg, false)} style={{ ...ctxBtn, color: '#fca5a5', borderBottom: 'none' }}>🗑 Delete for Me</button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideIn { 0% { transform: translateX(100%); } 100% { transform: translateX(0); } }
        @keyframes popIn { 0% { transform: scale(0.9); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
        .liquid-dot { width: 10px; height: 10px; border-radius: 50%; background-color: var(--blue); animation: liquidWave 1.2s infinite cubic-bezier(0.4, 0, 0.2, 1); }
        @keyframes liquidWave { 0%, 100% { transform: translateY(0) scale(1); opacity: 0.4; } 50% { transform: translateY(-8px) scale(1.3); opacity: 1; background-color: var(--purple); } }
      `}</style>
      <BottomNav unreadCount={totalUnread} />
    </div>
  );
}

function SwipeableMessage({ msg, isMine, isDeleted, children, onReply, onLongPress, onLongPressEnd, onContextMenu }) {
  const [slideX, setSlideX] = useState(0);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isSwiping = useRef(false);

  const onTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX; touchStartY.current = e.touches[0].clientY;
    isSwiping.current = false; onLongPress(msg);
  };

  const onTouchMove = (e) => {
    const diffX = e.touches[0].clientX - touchStartX.current; const diffY = Math.abs(e.touches[0].clientY - touchStartY.current);
    if (Math.abs(diffX) > 10 || diffY > 10) onLongPressEnd();
    if (diffX > 10 && diffY < 25 && !isDeleted) isSwiping.current = true;
    if (isSwiping.current && diffX > 0 && diffX <= 80) setSlideX(diffX);
  };

  const onTouchEnd = () => {
    onLongPressEnd();
    if (slideX > 50) { onReply(); if (window.navigator.vibrate) window.navigator.vibrate(40); }
    setSlideX(0); isSwiping.current = false;
  };

  return (
    <div style={{ position: 'relative', display: 'flex', width: '100%', alignItems: 'center', justifyContent: isMine ? 'flex-end' : 'flex-start' }}>
      {!isDeleted && (
        <div style={{ position: 'absolute', left: isMine ? 'auto' : slideX - 50, right: isMine ? slideX - 50 : 'auto', opacity: slideX / 60, transform: `scale(${Math.min(slideX / 60, 1)})`, transition: slideX === 0 ? 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)' : 'none', width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
          ↩️
        </div>
      )}
      <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onContextMenu={(e) => onContextMenu(e, msg)}
        style={{ width: '100%', display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start', transform: `translateX(${slideX}px)`, transition: slideX === 0 ? 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)' : 'none', zIndex: 2 }}>
        {children}
      </div>
    </div>
  );
}

const ctxBtn = { display: 'block', width: '100%', padding: '16px 20px', background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#fff', textAlign: 'left', fontSize: 16, cursor: 'pointer', fontWeight: 700 };