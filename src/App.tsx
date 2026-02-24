import { useState, useEffect } from 'react';
import { Dashboard } from './components/Dashboard';
import { LoginScreen } from './components/LoginScreen';

// ── DEV-ONLY: Mission Control preview ──────────────────────────────────────
// Navigate to the app with ?mc=1 in the URL to render Mission Control.
// Rendered at the top level so the CalendarApp component (and its ipcRenderer
// hooks) never mounts. Replace with the real switcher in a future phase.
import { MissionControl } from './mission-control/MissionControl';
const MC_DEV_MODE = new URLSearchParams(window.location.search).get('mc') === '1';
// ─────────────────────────────────────────────────────────────────────────────

/** Calendar app — only mounted when NOT in MC dev mode */
function CalendarApp() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isChecking, setIsChecking] = useState<boolean>(true);

  useEffect(() => {
    const checkAuth = async () => {
        try {
            if (!window.ipcRenderer) {
                console.warn('IPC Renderer not found - running in browser mode?');
                setIsAuthenticated(false);
                setIsChecking(false);
                return;
            }
            const isAuth = await window.ipcRenderer.invoke('auth:check');
            setIsAuthenticated(isAuth as boolean);
        } catch (e) {
            console.error('Auth check failed', e);
        } finally {
            setIsChecking(false);
        }
    };

    checkAuth();

    // Guard: ipcRenderer may be absent in plain-browser dev
    if (!window.ipcRenderer) return;
    const cleanup = window.ipcRenderer.on('auth:success', () => {
        setIsAuthenticated(true);
    });

    return () => cleanup();
  }, []);

  if (isChecking) {
      return <div className="h-screen w-screen bg-zinc-950 flex items-center justify-center text-zinc-500">Loading...</div>;
  }

  return (
    <>
      {isAuthenticated ? <Dashboard onLogout={() => setIsAuthenticated(false)} /> : <LoginScreen />}
    </>
  );
}

/** Top-level router — decides which app to render */
function App() {
  if (MC_DEV_MODE) return <MissionControl />;
  return <CalendarApp />;
}

export default App;
