import { useState, useEffect } from 'react';
import { Dashboard } from './Dashboard';
import { LoginScreen } from './LoginScreen';

type SignIn = 'checking' | 'signed-in' | 'signed-out';

/**
 * The waits before asking auth:check again after it failed. It fails when the
 * token file is held for a moment (antivirus, a backup) and the next read in the
 * main process succeeds; offering Sign in at once sent a signed-in parent
 * through Google's consent page for nothing. After the last wait: Sign in.
 */
const AUTH_CHECK_RETRY_DELAYS_MS = [1000, 2000, 4000];

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
    let retry: ReturnType<typeof setTimeout> | undefined;

    const check = async (attempt: number) => {
      try {
        const isAuth = await ipc.invoke('auth:check');
        if (active) setSignIn(isAuth === true ? 'signed-in' : 'signed-out');
      } catch (e) {
        if (!active) return;
        const delay = AUTH_CHECK_RETRY_DELAYS_MS[attempt];
        if (delay === undefined) {
          console.error('Auth check failed', e);
          setSignIn('signed-out');
          return;
        }
        console.warn('Auth check failed; asking again', e);
        retry = setTimeout(() => void check(attempt + 1), delay);
      }
    };
    void check(0);

    const offSuccess = ipc.on('auth:success', () => {
      clearTimeout(retry);
      setSignIn('signed-in');
    });
    // Google refused the saved sign-in (revoked, or expired) and the main process signed out.
    const offSignedOut = ipc.on('auth:signed-out', () => {
      clearTimeout(retry);
      setSignIn('signed-out');
    });

    return () => {
      active = false;
      clearTimeout(retry);
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
