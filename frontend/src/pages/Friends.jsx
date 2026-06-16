import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { io } from 'socket.io-client';

function authFetch(url, options = {}) {
  const token = localStorage.getItem('ludo_token');
  if (token) {
    options.headers = { ...options.headers, 'Authorization': 'Bearer ' + token };
  }
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
  const [socket, setSocket] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const chatEndRef = useRef(null);

  useEffect(() => {
    async function init() {
      const me = await authFetch('/api/auth/me').then(r => r.json());
      if (!me.success) {
        localStorage.removeItem('ludo_token');
        navigate('/');
        return;
      }
      setUser(me.user);
      
      // Connect to socket
      const newSocket = io("https://ludo-pro-max.onrender.com", {
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
      });
      
      newSocket.on('connect', () => {
        console.log('Socket connected');
        newSocket.emit('joinChat', { userId: me.user.id, username: me.user.username });
      });
      
      newSocket.on('newMessage', (data) => {
        console.log('New message:', data);
        
        // If chat open with this friend, add message
        if (selectedChat && data.fromId === selectedChat.id) {
          setChatMessages(prev => [...prev, { from: data.from, fromId: data.fromId, message: data.message, time: data.time }]);
        } else {
          // Show notification
          setNotifications(prev => [...prev, {
            id: Date.now(),
            fromId: data.fromId,
            from: data.from,
            message: data.message
          }]);
        }
        
        // Update friend list
        setFriends(prev => prev.map(f => 
          f.id === data.fromId ? { ...f, lastMessage: data.message, lastMessageTime: data.time, unread: f.id !== selectedChat?.id ? (f.unread || 0) + 1 : 0 } : f
        ));
      });
      
      newSocket.on('inviteReceived', (data) => {
        setNotifications(prev => [...prev, {
          id: Date.now(),
          type: 'invite',
          fromName: data.fromName,
          roomId: data.roomId
        }]);
      });
      
      setSocket(newSocket);
      
      // Load friends
      const friendsData = await authFetch('/api/friends').then(r => r.json());
      if (friendsData.success) {
        setFriends((friendsData.friends || []).map(f => ({ ...f, unread: 0, lastMessage: '', lastMessageTime: null })));
        setReceivedRequests(friendsData.receivedRequests || []);
      }
      setLoading(false);
    }
    
    init();
    
    return () => {
      if (socket) {
        socket.emit('leaveChat', {});
        socket.disconnect();
      }
    };
  }, [navigate, selectedChat?.id]);

  useEffect(() => {
    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [socket]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  async function loadFriends() {
    const data = await authFetch('/api/friends').then(r => r.json());
    if (data.success) {
      setFriends((data.friends || []).map(f => ({ ...f, unread: 0, lastMessage: '', lastMessageTime: null })));
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
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    }).then(r => r.json());
    if (data.success) {
      alert('Friend request sent to ' + username + '!');
      setSearchResults(searchResults.filter(u => u.id !== userId));
    } else {
      alert(data.error || 'Failed to send request');
    }
  }

  async function acceptFriendRequest(fromUserId, username) {
    const data = await authFetch('/api/friends/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromUserId })
    }).then(r => r.json());
    if (data.success) {
      loadFriends();
      alert(username + ' is now your friend!');
    }
  }

  async function rejectFriendRequest(fromUserId) {
    await authFetch('/api/friends/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromUserId })
    });
    loadFriends();
  }

  async function selectFriend(friend) {
    setSelectedChat(friend);
    setChatMessages([]);
    
    // Load chat history
    const data = await authFetch('/api/chat/history/' + friend.id).then(r => r.json()).catch(() => ({ success: true, messages: [] }));
    if (data.success && data.messages) {
      setChatMessages(data.messages);
    }
    
    // Mark as read
    setFriends(prev => prev.map(f => f.id === friend.id ? { ...f, unread: 0 } : f));
  }

  async function sendMessage() {
    if (!newMessage.trim() || !selectedChat) return;
    
    const msgData = {
      toId: selectedChat.id,
      toUsername: selectedChat.username,
      from: user.username,
      fromId: user.id,
      message: newMessage.trim(),
      time: Date.now()
    };
    
    // Add to local state immediately
    setChatMessages(prev => [...prev, { ...msgData }]);
    setNewMessage('');
    
    // Send via socket
    if (socket) {
      socket.emit('sendMessage', msgData);
    }
    
    // Also save via API
    await authFetch('/api/chat/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(msgData)
    });
    
    // Update friend last message
    setFriends(prev => prev.map(f => 
      f.id === selectedChat.id ? { ...f, lastMessage: msgData.message, lastMessageTime: msgData.time } : f
    ));
  }

  function inviteToGame(friend) {
    navigate('/dashboard', { state: { inviteFriend: friend } });
  }

  function acceptInvite(roomId) {
    navigate('/game?room=' + encodeURIComponent(roomId));
  }

  function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0b141a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8696a0' }}>
      Loading...
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#0b141a', color: '#e9edef', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      
      {/* Notifications Toast */}
      {notifications.length > 0 && (
        <div style={{ position: 'fixed', top: 70, right: 16, zIndex: 2000, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 300 }}>
          {notifications.map((notif, i) => (
            <div key={notif.id || i} style={{ background: '#1f2c33', borderRadius: 8, padding: '12px 16px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
              {notif.type === 'invite' ? (
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>🎮 {notif.fromName} invited you!</div>
                  <div>
                    <button onClick={() => acceptInvite(notif.roomId)} style={{ background: '#00b84c', color: 'white', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12, marginRight: 6 }}>Join</button>
                    <button onClick={() => setNotifications(prev => prev.filter(n => n.id !== notif.id))} style={{ background: '#333', color: '#ccc', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}>Dismiss</button>
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ fontWeight: 600 }}>💬 {notif.from}</div>
                  <div style={{ color: '#8696a0', fontSize: 14, marginTop: 2 }}>{notif.message}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Header */}
      <header style={{ background: '#1f2c33', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 16, borderBottom: '1px solid #222d34' }}>
        <Link to="/dashboard" style={{ color: '#8696a0', fontSize: 20, textDecoration: 'none' }}>←</Link>
        <div style={{ fontSize: 18, fontWeight: 600, flex: 1 }}>👥 Friends</div>
        {notifications.length > 0 && (
          <div style={{ background: '#ff3b3b', color: 'white', borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
            {notifications.length}
          </div>
        )}
        <Link to="/dashboard" style={{ background: '#00b84c', color: 'white', padding: '8px 16px', borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>🎮 Play</Link>
      </header>

      {/* Friend Requests Banner */}
      {receivedRequests.length > 0 && (
        <div style={{ background: '#1f2c33', padding: '12px 16px', borderBottom: '1px solid #222d34' }}>
          <div style={{ fontSize: 14, color: '#8696a0', marginBottom: 8 }}>📩 Friend Requests ({receivedRequests.length})</div>
          {receivedRequests.map(r => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
              <span style={{ fontWeight: 500 }}>{r.username}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => acceptFriendRequest(r.id, r.username)} style={{ background: '#00b84c', color: 'white', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}>Accept</button>
                <button onClick={() => rejectFriendRequest(r.id)} style={{ background: '#333', color: '#ccc', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}>Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      <div style={{ padding: '12px 16px', background: '#1f2c33', borderBottom: '1px solid #222d34' }}>
        <input
          type="text"
          placeholder="Search players..."
          value={searchQuery}
          onChange={e => { setSearchQuery(e.target.value); searchUsers(e.target.value); }}
          style={{ width: '100%', padding: '10px 16px', background: '#2a3942', border: 'none', borderRadius: 8, color: '#fff', fontSize: 15, outline: 'none' }}
        />
        {searchResults.length > 0 && (
          <div style={{ marginTop: 8, background: '#1f2c33', borderRadius: 8, overflow: 'hidden' }}>
            {searchResults.map(u => (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderBottom: '1px solid #222d34' }}>
                <div>
                  <div style={{ fontWeight: 500 }}>{u.username}</div>
                  <div style={{ fontSize: 12, color: '#8696a0' }}>{u.wins}W • {u.win_rate}%</div>
                </div>
                <button onClick={() => sendFriendRequest(u.id, u.username)} style={{ background: '#0084ff', color: 'white', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}>+ Add</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Friends List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ padding: '8px 16px', fontSize: 13, color: '#8696a0', fontWeight: 500 }}>ALL FRIENDS ({friends.length})</div>
        {friends.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#8696a0' }}>
            No friends yet. Search and add players!
          </div>
        ) : (
          friends.map(friend => (
            <div
              key={friend.id}
              onClick={() => selectFriend(friend)}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '12px 16px',
                cursor: 'pointer',
                background: selectedChat?.id === friend.id ? '#2a3942' : 'transparent',
                borderBottom: '1px solid #222d34'
              }}
            >
              <div style={{ position: 'relative', marginRight: 14 }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'linear-gradient(135deg,#0084ff,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700 }}>
                  {friend.username.charAt(0).toUpperCase()}
                </div>
                <div style={{ position: 'absolute', bottom: 0, right: 0, width: 14, height: 14, borderRadius: '50%', background: friend.is_online ? '#00b84c' : '#333', border: '2px solid #0b141a' }}></div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 500, fontSize: 16 }}>{friend.username}</span>
                  {friend.lastMessageTime && <span style={{ fontSize: 12, color: '#8696a0' }}>{formatTime(friend.lastMessageTime)}</span>}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                  <span style={{ fontSize: 14, color: '#8696a0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                    {friend.lastMessage || (friend.is_online ? '🟢 Online' : '⚫ Offline')}
                  </span>
                  {friend.unread > 0 && (
                    <span style={{ background: '#00b84c', color: 'white', borderRadius: '50%', minWidth: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, padding: '0 6px' }}>
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
          {/* Chat Header */}
          <div style={{ background: '#1f2c33', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #222d34' }}>
            <button onClick={() => setSelectedChat(null)} style={{ background: 'none', border: 'none', color: '#8696a0', fontSize: 20, cursor: 'pointer', padding: 0 }}>←</button>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg,#0084ff,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700 }}>
              {selectedChat.username.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{selectedChat.username}</div>
              <div style={{ fontSize: 12, color: selectedChat.is_online ? '#00b84c' : '#8696a0' }}>
                {selectedChat.is_online ? '🟢 Online' : '⚫ Offline'}
              </div>
            </div>
            <button onClick={() => inviteToGame(selectedChat)} style={{ background: '#00b84c', color: 'white', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>🎮 Invite</button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
            {chatMessages.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#8696a0', marginTop: 40 }}>
                No messages yet. Say hi! 👋
              </div>
            ) : (
              chatMessages.map((msg, i) => {
                const isMine = msg.fromId === user.id;
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
                    <div style={{
                      maxWidth: '75%',
                      padding: '8px 12px',
                      borderRadius: 8,
                      background: isMine ? '#005c4b' : '#1f2c33',
                      color: '#e9edef',
                      fontSize: 14
                    }}>
                      <div>{msg.message}</div>
                      <div style={{ fontSize: 10, color: '#8696a0', textAlign: 'right', marginTop: 2 }}>{formatTime(msg.time)}</div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '8px 12px', background: '#1f2c33', display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid #222d34' }}>
            <input
              type="text"
              placeholder="Type a message..."
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage()}
              style={{ flex: 1, padding: '10px 16px', background: '#2a3942', border: 'none', borderRadius: 8, color: '#fff', fontSize: 15, outline: 'none' }}
            />
            <button 
              onClick={sendMessage}
              disabled={!newMessage.trim()}
              style={{ background: newMessage.trim() ? '#00b84c' : '#333', color: 'white', border: 'none', borderRadius: 8, padding: '10px 18px', cursor: newMessage.trim() ? 'pointer' : 'default', fontSize: 15, fontWeight: 600 }}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
