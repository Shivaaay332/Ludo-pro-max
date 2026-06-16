import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Auth() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('signin');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [siUsername, setSiUsername] = useState('');
  const [siPassword, setSiPassword] = useState('');
  const [suUsername, setSuUsername] = useState('');
  const [suPassword, setSuPassword] = useState('');
  const [suConfirm, setSuConfirm] = useState('');

  useEffect(() => {
    // Check if user is already logged in with persistent token
    const token = localStorage.getItem('ludo_token');
    if (token) {
      fetch('/api/auth/me?token=' + encodeURIComponent(token)).then(r => r.json()).then(d => {
        if (d.success) navigate('/dashboard');
      }).catch(() => {});
    }
  }, [navigate]);

  function switchTab(t) { setTab(t); setError(''); setSuccess(''); }

  async function doSignIn(e) {
    e?.preventDefault();
    if (!siUsername || !siPassword) return setError('Please fill in all fields');
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: siUsername, password: siPassword }) });
      const data = await res.json();
      if (data.success) { 
        // Save token for persistent login
        if (data.token) {
          localStorage.setItem('ludo_token', data.token);
        }
        setSuccess('Welcome back! Redirecting...'); 
        setTimeout(() => navigate('/dashboard'), 800); 
      }
      else { setError(data.error || 'Sign in failed'); setLoading(false); }
    } catch { setError('Connection error. Please try again.'); setLoading(false); }
  }

  async function doSignUp(e) {
    e?.preventDefault();
    if (!suUsername || !suPassword || !suConfirm) return setError('Please fill in all fields');
    if (suPassword !== suConfirm) return setError('Passwords do not match');
    if (suPassword.length < 6) return setError('Password must be at least 6 characters');
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: suUsername, password: suPassword }) });
      const data = await res.json();
      if (data.success) { 
        // Save token for persistent login
        if (data.token) {
          localStorage.setItem('ludo_token', data.token);
        }
        setSuccess('Account created! Redirecting...'); 
        setTimeout(() => navigate('/dashboard'), 1000); 
      }
      else { setError(data.error || 'Sign up failed'); setLoading(false); }
    } catch { setError('Connection error. Please try again.'); setLoading(false); }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0f0c29,#302b63,#24243e)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }} className="auth-container">
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>🎲🎮🏆</div>
        <h1 style={{ fontSize: 48, fontWeight: 900, letterSpacing: -1 }} className="auth-title">Ludo <span style={{ color: 'var(--yellow)' }}>Pro</span></h1>
        <p style={{ color: '#aaa', marginTop: 8, fontSize: 15 }}>Multiplayer Ludo with Live Leaderboards & Stats</p>
      </div>

      <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 20, padding: 36, width: '100%', maxWidth: 420, backdropFilter: 'blur(20px)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }} className="auth-box">
        <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 4, marginBottom: 28 }}>
          {['signin', 'signup'].map(t => (
            <button key={t} onClick={() => switchTab(t)} style={{ flex: 1, padding: '10px', textAlign: 'center', borderRadius: 9, cursor: 'pointer', fontWeight: 700, fontSize: 15, border: 'none', background: tab === t ? 'var(--blue)' : 'transparent', color: tab === t ? '#fff' : '#aaa', boxShadow: tab === t ? '0 4px 12px rgba(0,132,255,0.4)' : 'none', transition: 'all 0.2s' }}>
              {t === 'signin' ? 'Sign In' : 'Sign Up'}
            </button>
          ))}
        </div>

        {error && <div style={{ background: 'rgba(255,59,59,0.15)', border: '1px solid rgba(255,59,59,0.3)', borderRadius: 10, padding: '12px 15px', color: '#ff6b6b', fontSize: 14, marginBottom: 16 }}>{error}</div>}
        {success && <div style={{ background: 'rgba(0,184,76,0.15)', border: '1px solid rgba(0,184,76,0.3)', borderRadius: 10, padding: '12px 15px', color: '#00d45a', fontSize: 14, marginBottom: 16 }}>{success}</div>}

        {tab === 'signin' ? (
          <form onSubmit={doSignIn}>
            <Field label="Username" type="text" value={siUsername} onChange={setSiUsername} placeholder="Your username" autoComplete="username" />
            <Field label="Password" type="password" value={siPassword} onChange={setSiPassword} placeholder="Your password" autoComplete="current-password" />
            <Btn disabled={loading} onClick={doSignIn}>{loading ? 'Signing in...' : 'Sign In →'}</Btn>
          </form>
        ) : (
          <form onSubmit={doSignUp}>
            <Field label="Choose Username" type="text" value={suUsername} onChange={setSuUsername} placeholder="e.g. LudoKing123" maxLength={20} autoComplete="username" hint="3–20 chars, letters/numbers/underscore only" />
            <Field label="Password" type="password" value={suPassword} onChange={setSuPassword} placeholder="Min 6 characters" autoComplete="new-password" />
            <Field label="Confirm Password" type="password" value={suConfirm} onChange={setSuConfirm} placeholder="Repeat password" autoComplete="new-password" />
            <Btn disabled={loading} onClick={doSignUp}>{loading ? 'Creating account...' : 'Create Account →'}</Btn>
          </form>
        )}

        <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
          {[['🏆', 'Leaderboard', 'Global rankings'], ['📊', 'Stats', 'Track progress'], ['💀', 'Kills', 'Score history']].map(([icon, title, sub]) => (
            <div key={title} style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 14, textAlign: 'center' }}>
              <div style={{ fontSize: 22, marginBottom: 4 }}>{icon}</div>
              <strong style={{ fontSize: 13, color: '#ccc', display: 'block', marginBottom: 2 }}>{title}</strong>
              <p style={{ fontSize: 11, color: '#888' }}>{sub}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Field({ label, type, value, onChange, placeholder, autoComplete, maxLength, hint }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: 'block', fontSize: 13, color: '#aaa', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} autoComplete={autoComplete} maxLength={maxLength}
        style={{ width: '100%', padding: '14px 16px', background: 'rgba(255,255,255,0.08)', border: '1.5px solid rgba(255,255,255,0.15)', borderRadius: 12, color: '#fff', fontSize: 16, outline: 'none' }} />
      {hint && <p style={{ fontSize: 12, color: '#666', marginTop: 6 }}>{hint}</p>}
    </div>
  );
}

function Btn({ children, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ width: '100%', padding: 15, border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 800, cursor: disabled ? 'not-allowed' : 'pointer', background: 'linear-gradient(135deg,#0084ff,#0060cc)', color: '#fff', boxShadow: '0 6px 20px rgba(0,132,255,0.35)', opacity: disabled ? 0.6 : 1 }}>
      {children}
    </button>
  );
}
