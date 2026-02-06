import { useState, useEffect } from 'react';
import { Dashboard } from './components/Dashboard';
import { LoginScreen } from './components/LoginScreen';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isChecking, setIsChecking] = useState<boolean>(true);

  useEffect(() => {
    const checkAuth = async () => {
        try {
            if (!window.ipcRenderer) {
                console.warn("IPC Renderer not found - running in browser mode?");
                setIsAuthenticated(false); // Fallback to unauthenticated
                return;
            }
            const isAuth = await window.ipcRenderer.invoke('auth:check');
            setIsAuthenticated(isAuth as boolean);
        } catch (e) {
            console.error("Auth check failed", e);
        } finally {
            setIsChecking(false);
        }
    };

    checkAuth();

    // Listen for login success from main process
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
      {isAuthenticated ? <Dashboard /> : <LoginScreen />}
    </>
  );
}

export default App;
