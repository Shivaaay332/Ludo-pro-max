import { Link, useLocation } from 'react-router-dom';

const navItems = [
  { to: '/dashboard', icon: '🏠', label: 'Home' },
  { to: '/friends', icon: '👥', label: 'Friends' },
  { to: '/game', icon: '🎮', label: 'Play' },
  { to: '/profile', icon: '👤', label: 'Profile' },
  { to: '/settings', icon: '⚙️', label: 'Settings' },
];

export default function BottomNav({ unreadCount = 0 }) {
  const location = useLocation();
  const active = location.pathname;

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 900,
      background: 'rgba(10,10,26,0.97)',
      borderTop: '1px solid rgba(255,255,255,0.1)',
      display: 'flex', alignItems: 'stretch',
      height: 60,
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      paddingBottom: 'env(safe-area-inset-bottom, 0)',
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
              textDecoration: 'none', gap: 2,
              color: isActive ? '#0084ff' : 'rgba(255,255,255,0.45)',
              transition: 'color 0.2s',
              position: 'relative',
            }}
          >
            <div style={{ fontSize: 22, lineHeight: 1, position: 'relative' }}>
              {item.icon}
              {item.to === '/friends' && unreadCount > 0 && (
                <span style={{
                  position: 'absolute', top: -4, right: -6,
                  background: '#ff3b3b', color: '#fff',
                  borderRadius: '50%', width: 14, height: 14,
                  fontSize: 9, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{unreadCount > 9 ? '9+' : unreadCount}</span>
              )}
            </div>
            <div style={{ fontSize: 9, fontWeight: isActive ? 700 : 500, letterSpacing: 0.2 }}>
              {item.label}
            </div>
            {isActive && (
              <div style={{
                position: 'absolute', bottom: 0, left: '25%', right: '25%',
                height: 2, background: '#0084ff', borderRadius: '2px 2px 0 0'
              }} />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
