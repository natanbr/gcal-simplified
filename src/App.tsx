import { useState, useEffect } from 'react';
import { Dashboard } from './components/Dashboard';
import { LoginScreen } from './components/LoginScreen';
import { MissionControl } from './mission-control/MissionControl';
import { MCStoreProvider } from './mission-control/store/useMCStore.tsx';
import { DragLayer } from './mission-control/components/DragLayer';
import { MissionOverlay } from './mission-control/components/MissionOverlay';
import { useMissionScheduler } from './mission-control/hooks/useMissionScheduler';

// ── Scheduler hook — runs at App level so it works on both views ──────────────
function MissionSchedulerBridge() {
  useMissionScheduler();
  return null;
}

// ── Calendar app — handles auth, renders Dashboard ────────────────────────────
interface CalendarAppProps {
  onSwitchToMC: () => void;
}

function CalendarApp({ onSwitchToMC }: CalendarAppProps) {
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
      {isAuthenticated
        ? <Dashboard onLogout={() => setIsAuthenticated(false)} onSwitchToMC={onSwitchToMC} />
        : <LoginScreen />}
    </>
  );
}

// ── Top-level router ───────────────────────────────────────────────────────────
// MCStoreProvider + DragLayer live HERE so the MC store and scheduler
// keep running regardless of which view is active, and so MissionOverlay
// can overlay the calendar view when a mission fires.
function App() {
  const [view, setView] = useState<'calendar' | 'mission-control'>('calendar');

  return (
    <MCStoreProvider>
      <DragLayer>
        {/* Scheduler always running */}
        <MissionSchedulerBridge />

        {/* Mission overlay always mounted — position:fixed, overlays any view */}
        <MissionOverlay />

        {/* View switch */}
        {view === 'calendar'
          ? <CalendarApp onSwitchToMC={() => setView('mission-control')} />
          : <MissionControl onBackToCalendar={() => setView('calendar')} />}
      </DragLayer>
    </MCStoreProvider>
  );
}

export default App;
