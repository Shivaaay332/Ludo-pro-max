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

  function formatLastSeen(ts) {
    if (!ts) return 'a while ago';
    const diff = Date.now() - ts;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' min ago';
    if (diff < 86400000) return 'today at ' + new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    return new Date(ts).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  }

  const totalUnread = friends.reduce((sum, f) => sum + (f.unread || 0), 0);

  if (loading) return <div style={{ minHeight: '100vh', background: '#0b141a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8696a0' }}>Loading Chats...</div>;

  return (
    <div style={{ height: '100%', background: '#0b141a', color: '#e9edef', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
      
      {/* Chats Header */}
      <header style={{ background: 'rgba(31, 44, 51, 0.95)', backdropFilter: 'blur(10px)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0, zIndex: 10 }}>
        <div style={{ fontSize: 18, fontWeight: 700, flex: 1 }}>💬 Direct Messages</div>
      </header>

      {/* Friends Active Chat List */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 60 }}>
        {friends.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#8696a0' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>💬</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>No Active Chats</div>
            <div style={{ fontSize: 12 }}>Go to Friends page to start a chat connection!</div>
          </div>
        ) : friends.map(friend => {
            let statusText = friend.is_online ? '🟢 Online' : '⚫ Offline';
            if (friend.activityStatus === 'in_lobby') statusText = '🟢 In Lobby';
            else if (friend.activityStatus === 'in_match') statusText = '🔴 In Match';

            return (
              <div key={friend.id} onClick={() => selectFriend(friend)} style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.03)', WebkitTapHighlightColor: 'rgba(255,255,255,0.05)' }}>
                <div style={{ position: 'relative', marginRight: 12, flexShrink: 0 }}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'linear-gradient(135deg,#0084ff,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, fontWeight: 700 }}>{friend.username.charAt(0).toUpperCase()}</div>
                  <div style={{ position: 'absolute', bottom: -2, right: -2, width: 14, height: 14, borderRadius: '50%', background: friend.activityStatus === 'in_match' ? '#ff3b3b' : friend.is_online ? '#00b84c' : '#444', border: '2px solid #0b141a' }}></div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{friend.username}</span>
                    {friend.lastMessageTime && <span style={{ fontSize: 11, color: '#8696a0' }}>{formatTime(friend.lastMessageTime)}</span>}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                    <span style={{ fontSize: 13, color: '#8696a0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>
                      {friend.lastMessage || statusText}
                    </span>
                    {(friend.unread || 0) > 0 && (
                      <span style={{ background: 'linear-gradient(135deg, #00b84c, #0084ff)', color: '#fff', borderRadius: 12, minWidth: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, padding: '0 5px' }}>{friend.unread}</span>
                    )}
                  </div>
                </div>
              </div>
            );
        })}
      </div>

      {/* ── CHAT OVERLAY VIEW ── */}
      {selectedChat && (
        <div style={{ position: 'fixed', inset: 0, background: '#0b141a', backgroundImage: "url('data:image/svg+xml,%3Csvg width=\"60\" height=\"60\" viewBox=\"0 0 60 60\" xmlns=\"http://www.w3.org/2000/svg\"%3E%3Cg fill=\"none\" fill-rule=\"evenodd\"%3E%3Cg fill=\"%23ffffff\" fill-opacity=\"0.02\"%3E%3Cpath d=\"M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\"/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')", zIndex: 1000, display: 'flex', flexDirection: 'column' }}>
          
          <div style={{ background: 'rgba(31, 44, 51, 0.85)', backdropFilter: 'blur(15px)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0, position: 'relative', zIndex: 10 }}>
            <button onClick={() => { setSelectedChat(null); selectedChatRef.current = null; setIsTyping(false); setReplyingTo(null); setEditingMsg(null); setNewMessage(''); setShowEmojiPicker(false); }}
              style={{ background: 'none', border: 'none', color: '#8696a0', fontSize: 24, cursor: 'pointer', padding: '0 4px' }}>←</button>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg,#0084ff,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700 }}>
                {selectedChat.username.charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{selectedChat.username}</div>
                <div style={{ fontSize: 11, color: isTyping ? '#00b84c' : '#8696a0' }}>
                  {isTyping ? `is typing...` : selectedChat.activityStatus === 'in_match' ? '🔴 In Match' : selectedChat.is_online ? '🟢 Online' : 'Offline'}
                </div>
              </div>
            </div>
            
            <button onClick={clearChat} style={{ background: 'none', border: 'none', color: '#8696a0', fontSize: 20, cursor: 'pointer' }}>🗑️</button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px', display: 'flex', flexDirection: 'column' }} onClick={() => setShowEmojiPicker(false)}>
            {chatMessages.map((msg, i) => {
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
                  
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start', marginBottom: reactionEntries.length ? 14 : 8, width: '100%' }}>
                    <div style={{
                        maxWidth: '78%', padding: isInvite ? '0' : '10px 14px',
                        borderRadius: isMine ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                        background: isMine ? 'linear-gradient(135deg, #0084ff, #5b21b6)' : 'rgba(255, 255, 255, 0.08)',
                        border: isMine ? 'none' : '1px solid rgba(255, 255, 255, 0.05)',
                        color: isDeleted ? 'rgba(255,255,255,0.5)' : '#fff', fontSize: 14
                      }}>
                      
                      {msg.replyTo && !isInvite && (
                        <div style={{ background: 'rgba(0,0,0,0.2)', borderLeft: `3px solid #0084ff`, borderRadius: 8, padding: '6px 10px', marginBottom: 8 }}>
                          <div style={{ fontWeight: 700, fontSize: 11, color: '#53bdeb' }}>{msg.replyTo.from}</div>
                          <div style={{ fontSize: 12, opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{msg.replyTo.message}</div>
                        </div>
                      )}
                      
                      {isInvite ? (
                        <div style={{ padding: '16px', textAlign: 'center', width: '220px', opacity: isExpired ? 0.75 : 1 }}>
                          <div style={{ fontSize: 32, marginBottom: 8 }}>{isExpired ? '⌛' : '⚔️'}</div>
                          <div style={{ fontWeight: 800, fontSize: 16 }}>{isExpired ? 'Challenge Expired' : '1v1 Challenge!'}</div>
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 12 }}>ROOM: {inviteRoomId}</div>
                          {isExpired ? (
                             <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px', fontSize: 12 }}>Invite is invalid.</div>
                          ) : isMine ? (
                             <div style={{ color: '#4ade80', fontWeight: 700, fontSize: 12 }}>⏳ Waiting...</div>
                          ) : (
                             <div style={{ display: 'flex', gap: 8 }}>
                               <button onClick={() => navigate(`/game?room=${encodeURIComponent(inviteRoomId)}`)} style={{ flex: 1, background: '#00b84c', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 0', fontWeight: 800 }}>Accept</button>
                               <button onClick={() => rejectChallenge(msg)} style={{ flex: 1, background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', borderRadius: 8 }}>Reject</button>
                             </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ wordBreak: 'break-word', fontStyle: isDeleted ? 'italic' : 'normal' }}>
                          {isDeleted ? '🚫 This message was deleted' : msg.message}
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 5, marginTop: 4, fontSize: 10, opacity: 0.6 }}>
                            {msg.edited && <span>edited</span>}
                            <span>{formatTime(msg.time)}</span>
                            {isMine && !isDeleted && <span>{msg.status === 'seen' ? '✓✓' : '✓'}</span>}
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {reactionEntries.length > 0 && (
                      <div style={{ display: 'flex', gap: 4, marginTop: -6, padding: isMine ? '0 10px 0 0' : '0 0 0 10px' }}>
                        {reactionEntries.map(([emoji, users]) => (
                          <span key={emoji} style={{ background: '#1f2c33', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '2px 6px', fontSize: 12 }}>{emoji} {users.length}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </SwipeableMessage>
              );
            })}
            
            {/* 🔴 TYPING ANIMATION ADDED BACK HERE 🔴 */}
            {isTyping && (
              <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{ background: 'rgba(255, 255, 255, 0.08)', backdropFilter: 'blur(10px)', borderRadius: '18px 18px 18px 4px', padding: '14px 18px', display: 'flex', gap: 6, alignItems: 'center', border: '1px solid rgba(255, 255, 255, 0.05)', boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}>
                  {[0, 0.15, 0.3].map((delay, i) => (
                    <div key={i} className="liquid-dot" style={{ animationDelay: `${delay}s` }}></div>
                  ))}
                </div>
              </div>
            )}
            
            <div ref={chatEndRef} />
          </div>

          {/* Input reply/edit wrapper */}
          {(replyingTo || editingMsg) && (
            <div style={{ background: '#162028', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ borderLeft: '3px solid #0084ff', paddingLeft: 10 }}>
                <div style={{ fontSize: 11, color: '#53bdeb', fontWeight: 700 }}>{editingMsg ? '✏️ Edit Message' : '↩ Replying'}</div>
                <div style={{ fontSize: 13, opacity: 0.7 }}>{editingMsg ? editingMsg.message : replyingTo?.message}</div>
              </div>
              <button onClick={() => { setReplyingTo(null); setEditingMsg(null); setNewMessage(''); }} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 16 }}>✕</button>
            </div>
          )}

          {/* Bottom Chat Bar */}
          <div style={{ position: 'relative', background: '#1f2c33', padding: '10px 14px' }}>
            {showEmojiPicker && (
              <div style={{ position: 'absolute', bottom: '100%', left: 14, right: 14, marginBottom: 10, background: '#162028', borderRadius: 12, padding: 12, display: 'flex', flexWrap: 'wrap', gap: 8, maxHeight: 200, overflowY: 'auto' }}>
                {EMOJI_LIST.map(em => (
                  <button key={em} onClick={() => setNewMessage(prev => prev + em)} style={{ background: 'none', border: 'none', fontSize: 24 }}>{em}</button>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button onClick={() => setShowEmojiPicker(!showEmojiPicker)} style={{ background: 'none', border: 'none', fontSize: 24 }}>😀</button>
              <button onClick={sendChallenge} style={{ background: 'none', border: 'none', fontSize: 24 }}>⚔️</button>
              <input ref={inputRef} type="text" placeholder="Message..." value={newMessage} onChange={e => handleTyping(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMessage()}
                style={{ flex: 1, padding: '10px 16px', background: 'rgba(0,0,0,0.3)', border: 'none', borderRadius: 20, color: '#fff', outline: 'none' }} />
              <button onClick={sendMessage} disabled={!newMessage.trim()} style={{ background: 'none', border: 'none', fontSize: 22, color: newMessage.trim() ? '#0084ff' : '#666' }}>➤</button>
            </div>
          </div>
        </div>
      )}

      {/* Context Actions Menu */}
      {contextMenu && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }} onClick={() => setContextMenu(null)}>
          <div style={{ background: '#1f2c33', borderRadius: 14, minWidth: 220, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-around', padding: '12px', background: 'rgba(0,0,0,0.2)' }}>
              {EMOJIS.map(em => (
                <button key={em} onClick={() => reactToMessage(contextMenu.msg.msgId, em)} style={{ background: 'none', border: 'none', fontSize: 24 }}>{em}</button>
              ))}
            </div>
            <button onClick={() => { setReplyingTo(contextMenu.msg); setContextMenu(null); setTimeout(() => inputRef.current?.focus(), 50); }} style={ctxBtn}>↩ Reply</button>
            {contextMenu.msg.fromId == user?.id && !contextMenu.msg.deleted && (
              <button onClick={() => { setEditingMsg(contextMenu.msg); setNewMessage(contextMenu.msg.message); setContextMenu(null); setTimeout(() => inputRef.current?.focus(), 50); }} style={ctxBtn}>✏️ Edit Message</button>
            )}
            {contextMenu.msg.fromId == user?.id && !contextMenu.msg.deleted && (
              <button onClick={() => deleteMsg(contextMenu.msg, true)} style={{ ...ctxBtn, color: '#ff4c4c' }}>🗑 Delete for Everyone</button>
            )}
            <button onClick={() => deleteMsg(contextMenu.msg, false)} style={{ ...ctxBtn, color: '#ff8080' }}>🗑 Delete for Me</button>
          </div>
        </div>
      )}

      <BottomNav unreadCount={totalUnread} />

      {/* 🔴 CSS FOR TYPING ANIMATION ADDED BACK HERE 🔴 */}
      <style>{`
        .liquid-dot { width: 8px; height: 8px; border-radius: 50%; background-color: #0084ff; animation: liquidWave 1.2s infinite cubic-bezier(0.4, 0, 0.2, 1); }
        @keyframes liquidWave { 0%, 100% { transform: translateY(0) scale(1); opacity: 0.4; } 50% { transform: translateY(-8px) scale(1.3); opacity: 1; background-color: #5b21b6; } }
      `}</style>
    </div>
  );
}

function SwipeableMessage({ msg, isMine, isDeleted, children, onReply, onLongPress, onLongPressEnd, onContextMenu }) {
  const [slideX, setSlideX] = useState(0);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  return (
    <div onTouchStart={e => { touchStartX.current = e.touches[0].clientX; touchStartY.current = e.touches[0].clientY; onLongPress(msg); }}
         onTouchMove={e => {
           const diffX = e.touches[0].clientX - touchStartX.current;
           const diffY = Math.abs(e.touches[0].clientY - touchStartY.current);
           if (Math.abs(diffX) > 10 || diffY > 10) onLongPressEnd();
           if (diffX > 15 && diffY < 20 && !isDeleted && diffX <= 70) setSlideX(diffX);
         }}
         onTouchEnd={() => { onLongPressEnd(); if (slideX > 45) onReply(); setSlideX(0); }}
         onContextMenu={e => onContextMenu(e, msg)}
         style={{ width: '100%', transform: `translateX(${slideX}px)`, transition: slideX === 0 ? 'transform 0.3s' : 'none', display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start' }}>
      {children}
    </div>
  );
}

const ctxBtn = { display: 'block', width: '100%', padding: '12px 16px', background: 'none', border: 'none', color: '#fff', textAlign: 'left', fontSize: 14, cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)' };