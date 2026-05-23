import React, { createContext, useContext, useState, useEffect } from 'react';

type RemoteStatus = 'online' | 'offline';
const RemoteStatusContext = createContext<RemoteStatus>('offline');

export function RemoteStatusProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [status, setStatus] = useState<RemoteStatus>('offline');

  useEffect(() => {
    if (!window.ipcRenderer) return;
    // Pull initial state (avoids boot-timing race)
    window.ipcRenderer.invoke('remote:get-status')
      .then((online: unknown) => setStatus(online ? 'online' : 'offline'))
      .catch(() => {}); // graceful: stays 'offline'

    // Subscribe to push updates
    const unsub = window.ipcRenderer.on('remote:status-changed', (online: unknown) => {
      setStatus(online ? 'online' : 'offline');
    });
    return () => { if (unsub) unsub(); };
  }, []); // [] — runs once on mount, cleaned up on unmount

  return (
    <RemoteStatusContext.Provider value={status}>
      {children}
    </RemoteStatusContext.Provider>
  );
}

export function useRemoteStatus(): RemoteStatus {
  return useContext(RemoteStatusContext);
}
