import { useState, useEffect } from 'react';
import { Dashboard } from './components/Dashboard';
import { LoginScreen } from './components/LoginScreen';
import { MissionControl } from './mission-control/MissionControl';
import { MCStoreProvider } from './mission-control/store/useMCStore.tsx';
import { DragLayer } from './mission-control/components/DragLayer';
import { MissionOverlay } from './mission-control/components/MissionOverlay';
import { useMissionScheduler } from './mission-control/hooks/useMissionScheduler';
import { MarineConditions } from './marine-conditions/MarineConditions';

// ── Scheduler hook — runs at App level so it works on both views ──────────────
function MissionSchedulerBridge() {
  useMissionScheduler();
  return null;
}

// ── Calendar app — handles auth, renders Dashboard ────────────────────────────
interface CalendarAppProps {
  onSwitchToMC: () => void;
  onSwitchToMarine: () => void;
}

function CalendarApp({ onSwitchToMC, onSwitchToMarine }: CalendarAppProps) {
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
        ? <Dashboard onLogout={() => setIsAuthenticated(false)} onSwitchToMC={onSwitchToMC} onSwitchToMarine={onSwitchToMarine} />
        : <LoginScreen />}
    </>
  );
}

// ── Top-level router ───────────────────────────────────────────────────────────
// MCStoreProvider + DragLayer live HERE so the MC store and scheduler
// keep running regardless of which view is active, and so MissionOverlay
// can overlay the calendar view when a mission fires.
type View = 'calendar' | 'mission-control' | 'marine-conditions';

function App() {
  const params = new URLSearchParams(window.location.search);
  const initialView: View =
    params.get('mc') === '1' ? 'mission-control' :
    params.get('marine') === '1' ? 'marine-conditions' :
    'calendar';
  const [view, setView] = useState<View>(initialView);

  return (
    <MCStoreProvider>
      <DragLayer>
        {/* Scheduler always running */}
        <MissionSchedulerBridge />

        {/* Mission overlay always mounted — position:fixed, overlays any view */}
        <MissionOverlay />

        {/* View switch */}
        {view === 'calendar' ? (
          <CalendarApp
            onSwitchToMC={() => setView('mission-control')}
            onSwitchToMarine={() => setView('marine-conditions')}
          />
        ) : view === 'mission-control' ? (
          <MissionControl onBackToCalendar={() => setView('calendar')} />
        ) : (
          <MarineConditions onBackToCalendar={() => setView('calendar')} />
        )}
      </DragLayer>
    </MCStoreProvider>
  );
}

export default App;
