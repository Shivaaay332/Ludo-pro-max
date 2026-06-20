import { Link, useLocation } from 'react-router-dom';

const navItems = [
  { to: '/dashboard', icon: '🏠', label: 'Home' },
  { to: '/friends', icon: '👥', label: 'Friends' },
  { to: '/profile', icon: '👤', label: 'Profile' },
  { to: '/settings', icon: '⚙️', label: 'Settings' },
];

export default function BottomNav({ unreadCount = 0 }) {
  const location = useLocation();
  const active = location.pathname;

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 900,
      background: 'rgba(9, 9, 11, 0.85)',
      borderTop: '1px solid rgba(255, 255, 255, 0.08)',
      display: 'flex', alignItems: 'stretch',
      height: 'calc(65px + env(safe-area-inset-bottom, 0px))', // Safe area for iPhones
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      boxShadow: '0 -4px 24px rgba(0,0,0,0.4)'
    }}>
      {navItems.map(item => {
        const isActive = active === item.to || (item.to === '/game' && active.startsWith('/game'));
        return (
          <Link
            key={item.to}
            to={item.to}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              textDecoration: 'none', gap: 4,
              color: isActive ? 'var(--blue)' : '#71717a',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              position: 'relative',
              transform: isActive ? 'translateY(-2px)' : 'translateY(0)'
            }}
          >
            <div style={{ fontSize: 26, lineHeight: 1, position: 'relative', filter: isActive ? 'drop-shadow(0 4px 8px rgba(0,132,255,0.4))' : 'none' }}>
              {item.icon}
              {item.to === '/friends' && unreadCount > 0 && (
                <span style={{
                  position: 'absolute', top: -4, right: -8,
                  background: 'var(--red)', color: '#fff',
                  borderRadius: '50%', width: 18, height: 18,
                  fontSize: 10, fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '2px solid #09090b'
                }}>{unreadCount > 9 ? '9+' : unreadCount}</span>
              )}
            </div>
            <div style={{ fontSize: 11, fontWeight: isActive ? 700 : 500, letterSpacing: 0.3 }}>
              {item.label}
            </div>
          </Link>
        );
      })}
    </nav>
  );
}