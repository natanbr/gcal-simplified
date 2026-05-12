import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { BrowserWindow } from 'electron';
import { store } from './store';

export class RemoteBridge {
    private supabase: SupabaseClient | null = null;

    init() {
        console.log('[RemoteBridge] --- INIT CALLED ---');
        console.log(`[RemoteBridge] ENV URL: ${process.env.VITE_SUPABASE_URL ? 'FOUND' : 'MISSING'}`);
        console.log(`[RemoteBridge] ENV KEY: ${process.env.VITE_SUPABASE_ANON_KEY ? 'FOUND' : 'MISSING'}`);

        const url = process.env.VITE_SUPABASE_URL;
        const key = process.env.VITE_SUPABASE_ANON_KEY;

        if (!url || !key) {
            console.error('[RemoteBridge] ERROR: Supabase credentials missing. Remote control disabled.');
            return;
        }

        this.supabase = createClient(url, key);

        const config = store.get();
        let roomId = config.remoteRoomId;
        let remoteKey = config.remoteKey;

        // Auto-generate if missing
        if (!roomId || !remoteKey) {
            roomId = crypto.randomUUID();
            remoteKey = Math.random().toString(36).slice(-10) + Math.random().toString(36).slice(-10);
            store.set({ ...config, remoteRoomId: roomId, remoteKey });
        }

        const channel = this.supabase.channel(`remote-control:${roomId}`);
        
        console.log(`[RemoteBridge] Initializing. Room ID: ${roomId}`);

        channel
            .on('broadcast', { event: 'action' }, (payload: any) => {
                console.log('[RemoteBridge] Received broadcast message:', payload);
                const { key: receivedKey, action } = payload.payload;
                
                // Re-fetch config to ensure we have latest key
                const currentConfig = store.get();
                
                if (receivedKey === currentConfig.remoteKey) {
                    console.log(`[RemoteBridge] Key matched! Dispatching action: ${action?.type}`);
                    this.sendToRenderer('remote-control:action', action);
                } else {
                    console.warn(`[RemoteBridge] INVALID KEY. Expected: ${currentConfig.remoteKey}, Got: ${receivedKey}`);
                }
            })
            .subscribe((status, err) => {
                console.log(`[RemoteBridge] Supabase Realtime status: ${status}`, err || '');
            });
    }

    regenerateKeys() {
        const config = store.get();
        const roomId = crypto.randomUUID();
        const remoteKey = Math.random().toString(36).slice(-10) + Math.random().toString(36).slice(-10);
        store.set({ ...config, remoteRoomId: roomId, remoteKey });
        
        // Re-init with new keys
        this.init();
        
        return { roomId, remoteKey };
    }

    private sendToRenderer(channel: string, data: any) {
        const wins = BrowserWindow.getAllWindows();
        wins.forEach(win => {
            win.webContents.send(channel, data);
        });
    }
}

export const remoteBridge = new RemoteBridge();
