import { useState, useEffect } from 'react';
import { Dashboard } from './Dashboard';
import { LoginScreen } from './LoginScreen';
import { useCalendarSession } from '../features/calendar-session/calendarSession';

type SignIn = 'checking' | 'signed-in' | 'signed-out';

// ── Calendar app — handles auth, renders Dashboard ────────────────────────────
interface CalendarAppProps {
  onSwitchToMC: () => void;
}

export function CalendarApp({ onSwitchToMC }: CalendarAppProps) {
  const session = useCalendarSession();
  // Back from Mission Control with this sign-in's week kept: show it while auth:check confirms the sign-in.
  const [signIn, setSignIn] = useState<SignIn>(() => (session?.warm ? 'signed-in' : 'checking'));
  const [epochAtMount] = useState(() => session?.epoch);
  // A new sign-in (Settings → Reconnect may change the account) remounts the Dashboard: a failed read
  // keeps what it shows, so without this the account before it stayed on screen while Google was
  // unreachable, and no answer still in flight for that account can reach a new tree.
  const [signIns, setSignIns] = useState(0);

  useEffect(() => {
    const ipc = window.ipcRenderer;
    if (!ipc) {
      console.warn('IPC Renderer not found - running in browser mode?');
      setSignIn('signed-out');
      return;
    }
    let active = true;

    // The main process reads a held token file again before it answers (electron/held-file.ts).
    ipc.invoke('auth:check').then(
      isAuth => { if (active) setSignIn(isAuth === true ? 'signed-in' : 'signed-out'); },
      error => {
        console.error('Auth check failed', error);
        if (active) setSignIn('signed-out');
      },
    );

    // The session hears both events too (CalendarSessionProvider) and empties itself.
    const offSuccess = ipc.on('auth:success', () => {
      setSignIn('signed-in');
      setSignIns(n => n + 1);
    });
    // Google refused the saved sign-in (revoked, or expired) and the main process signed out.
    const offSignedOut = ipc.on('auth:signed-out', () => setSignIn('signed-out'));

    // A sign-in or a sign-out the session heard after the first render and before this effect (the
    // auto-return renders from a timer, so an IPC event can land in between) was missed here, and the
    // Dashboard may have started from the week it emptied: start over and let auth:check decide.
    if (session && session.epoch !== epochAtMount) {
      setSignIn('checking');
      setSignIns(n => n + 1);
    }

    return () => {
      active = false;
      offSuccess();
      offSignedOut();
    };
  }, [session, epochAtMount]);

  // Signed out, however it was found (auth:check, Google's sign-out, Settings): nothing read for the account is kept.
  useEffect(() => {
    if (signIn === 'signed-out') session?.forget();
  }, [signIn, session]);

  if (signIn === 'checking') {
      return <div className="h-screen w-screen bg-zinc-950 flex items-center justify-center text-zinc-500">Loading...</div>;
  }

  return signIn === 'signed-in'
    ? <Dashboard key={signIns} onLogout={() => setSignIn('signed-out')} onSwitchToMC={onSwitchToMC} />
    : <LoginScreen />;
}
