import { useState, useEffect } from 'react';
import { Dashboard } from './Dashboard';
import { LoginScreen } from './LoginScreen';

type SignIn = 'checking' | 'signed-in' | 'signed-out';

// ── Calendar app — handles auth, renders Dashboard ────────────────────────────
interface CalendarAppProps {
  onSwitchToMC: () => void;
}

export function CalendarApp({ onSwitchToMC }: CalendarAppProps) {
  const [signIn, setSignIn] = useState<SignIn>('checking');

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

    const offSuccess = ipc.on('auth:success', () => setSignIn('signed-in'));
    // Google refused the saved sign-in (revoked, or expired) and the main process signed out.
    const offSignedOut = ipc.on('auth:signed-out', () => setSignIn('signed-out'));

    return () => {
      active = false;
      offSuccess();
      offSignedOut();
    };
  }, []);

  if (signIn === 'checking') {
      return <div className="h-screen w-screen bg-zinc-950 flex items-center justify-center text-zinc-500">Loading...</div>;
  }

  return signIn === 'signed-in'
    ? <Dashboard onLogout={() => setSignIn('signed-out')} onSwitchToMC={onSwitchToMC} />
    : <LoginScreen />;
}
