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
        if (data.token) localStorage.setItem('ludo_token', data.token);
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
        if (data.token) localStorage.setItem('ludo_token', data.token);
        setSuccess('Account created! Redirecting...'); 
        setTimeout(() => navigate('/dashboard'), 1000); 
      }
      else { setError(data.error || 'Sign up failed'); setLoading(false); }
    } catch { setError('Connection error. Please try again.'); setLoading(false); }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(circle at top right, #1a1a2e, var(--bg-dark))', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontSize: 40, marginBottom: 12, filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.5))' }}>🎲</div>
        <h1 style={{ fontSize: 42, fontWeight: 900, letterSpacing: -1, color: '#fff' }}>Ludo <span style={{ color: 'var(--yellow)' }}>Pro</span></h1>
        <p style={{ color: '#a1a1aa', marginTop: 8, fontSize: 15, fontWeight: 500 }}>Ultimate Multiplayer Experience</p>
      </div>

      <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 24, padding: '32px 24px', width: '100%', maxWidth: 400, backdropFilter: 'blur(20px)', boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }}>
        
        <div style={{ display: 'flex', background: 'rgba(0,0,0,0.4)', borderRadius: 16, padding: 6, marginBottom: 28 }}>
          {['signin', 'signup'].map(t => (
            <button key={t} onClick={() => switchTab(t)} style={{ flex: 1, padding: '12px', textAlign: 'center', borderRadius: 12, cursor: 'pointer', fontWeight: 800, fontSize: 15, border: 'none', background: tab === t ? 'var(--blue)' : 'transparent', color: tab === t ? '#fff' : '#a1a1aa', boxShadow: tab === t ? '0 4px 15px rgba(0,132,255,0.4)' : 'none', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }}>
              {t === 'signin' ? 'Sign In' : 'Sign Up'}
            </button>
          ))}
        </div>

        {error && <div style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.3)', borderRadius: 12, padding: '14px', color: 'var(--red)', fontSize: 14, fontWeight: 600, marginBottom: 20, textAlign: 'center' }}>{error}</div>}
        {success && <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 12, padding: '14px', color: 'var(--green)', fontSize: 14, fontWeight: 600, marginBottom: 20, textAlign: 'center' }}>{success}</div>}

        {tab === 'signin' ? (
          <form onSubmit={doSignIn}>
            <Field label="Username" type="text" value={siUsername} onChange={setSiUsername} placeholder="Enter username" />
            <Field label="Password" type="password" value={siPassword} onChange={setSiPassword} placeholder="Enter password" />
            <Btn disabled={loading} onClick={doSignIn}>{loading ? 'Signing in...' : 'Sign In 🚀'}</Btn>
          </form>
        ) : (
          <form onSubmit={doSignUp}>
            <Field label="Username" type="text" value={suUsername} onChange={setSuUsername} placeholder="e.g. LudoKing" maxLength={20} />
            <Field label="Password" type="password" value={suPassword} onChange={setSuPassword} placeholder="Min 6 characters" />
            <Field label="Confirm Password" type="password" value={suConfirm} onChange={setSuConfirm} placeholder="Repeat password" />
            <Btn disabled={loading} onClick={doSignUp}>{loading ? 'Creating...' : 'Create Account 🚀'}</Btn>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({ label, type, value, onChange, placeholder, maxLength }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: 'block', fontSize: 13, color: '#a1a1aa', marginBottom: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} maxLength={maxLength}
        style={{ width: '100%', height: 52, padding: '0 16px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, color: '#fff', fontSize: 16, outline: 'none', transition: 'border 0.3s' }} 
        onFocus={e => e.target.style.border = '1px solid var(--blue)'}
        onBlur={e => e.target.style.border = '1px solid rgba(255,255,255,0.1)'}
      />
    </div>
  );
}

function Btn({ children, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ width: '100%', height: 52, border: 'none', borderRadius: 14, fontSize: 16, fontWeight: 800, cursor: disabled ? 'not-allowed' : 'pointer', background: 'linear-gradient(135deg, var(--blue), var(--purple))', color: '#fff', boxShadow: '0 8px 25px rgba(59,130,246,0.4)', opacity: disabled ? 0.7 : 1, transition: 'transform 0.2s' }}
      onMouseDown={e => !disabled && (e.currentTarget.style.transform = 'scale(0.97)')}
      onMouseUp={e => !disabled && (e.currentTarget.style.transform = 'scale(1)')}
    >
      {children}
    </button>
  );
}