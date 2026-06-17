import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Auth from './pages/Auth.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Profile from './pages/Profile.jsx';
import Game from './pages/Game.jsx';
import Friends from './pages/Friends.jsx';
import Settings from './pages/Settings.jsx';

function ProtectedRoute({ children }) {
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    const token = localStorage.getItem('ludo_token');
    const url = token ? '/api/auth/me?token=' + encodeURIComponent(token) : '/api/auth/me';
    fetch(url)
      .then(r => r.json())
      .then(d => setStatus(d.success ? 'ok' : 'unauth'))
      .catch(() => setStatus('unauth'));
  }, []);

  if (status === 'loading') return <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0a0a1a,#12122a,#1a1a35)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: 18 }}>Loading...</div>;
  if (status === 'unauth') {
    localStorage.removeItem('ludo_token');
    return <Navigate to="/" replace />;
  }
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Auth />} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/game" element={<ProtectedRoute><Game /></ProtectedRoute>} />
        <Route path="/friends" element={<ProtectedRoute><Friends /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
