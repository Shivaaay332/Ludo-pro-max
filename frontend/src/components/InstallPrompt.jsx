import { useState, useEffect } from 'react';

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstall, setShowInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Check if mobile device
    const checkMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    setIsMobile(checkMobile);

    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    // Also check if running as installed app
    if (window.navigator.standalone === true) {
      setIsInstalled(true);
      return;
    }

    function handleBeforeInstallPrompt(e) {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstall(true);
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  async function handleInstall() {
    if (!deferredPrompt) {
      // If no deferred prompt, show instructions for manual add to home screen
      alert('To install: Open browser menu → Add to Home Screen');
      return;
    }

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
    setShowInstall(false);
  }

  // Don't show if already installed
  if (isInstalled) {
    return null;
  }

  // Show install button on mobile OR when deferred prompt is available
  if (!isMobile && !showInstall) {
    return null;
  }

  return (
    <button
      onClick={handleInstall}
      style={{
        position: 'fixed',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'linear-gradient(135deg, #0084ff, #5b21b6)',
        color: '#fff',
        border: 'none',
        borderRadius: 12,
        padding: '12px 24px',
        fontSize: 14,
        fontWeight: 700,
        cursor: 'pointer',
        zIndex: 9999,
        boxShadow: '0 4px 20px rgba(0, 132, 255, 0.4)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <span style={{ fontSize: 18 }}>📲</span>
      {isMobile ? 'Add to Home Screen' : 'Install App'}
    </button>
  );
}
