import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { BrowserWindow } from 'electron';
import { store } from './store';
import crypto from 'node:crypto';

export class RemoteBridge {
    private supabase: SupabaseClient | null = null;
    private channel: RealtimeChannel | null = null;
    private seenIds = new Map<string, number>();
    private cleanupInterval: NodeJS.Timeout | null = null;
    private reconnectTimeout: NodeJS.Timeout | null = null;
    private isOnline = false;

    getStatus(): boolean {
        return this.isOnline;
    }

    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
    }

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

        if (!this.cleanupInterval) {
            this.cleanupInterval = setInterval(() => {
                const now = Date.now();
                for (const [msgId, timestamp] of this.seenIds.entries()) {
                    if (now - timestamp > 120000) {
                        this.seenIds.delete(msgId);
                    }
                }
            }, 60000);
        }

        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }

        if (!this.supabase) {
            this.supabase = createClient(url, key);
        }

        const config = store.get();
        let roomId = config.remoteRoomId;
        let remoteKey = config.remoteKey;

        // Auto-generate if missing
        if (!roomId || !remoteKey) {
            roomId = crypto.randomUUID();
            remoteKey = crypto.randomBytes(20).toString('hex');
            store.set({ ...config, remoteRoomId: roomId, remoteKey });
        }

        if (this.channel) {
            this.supabase.removeChannel(this.channel);
        }

        const currentChannel = this.supabase.channel(`remote-control:${roomId}`);
        this.channel = currentChannel;
        
        console.log(`[RemoteBridge] Initializing. Room ID: ${roomId}`);

        currentChannel
            .on('broadcast', { event: 'action' }, (payload: { payload: { key: string; action: Record<string, unknown>; msgId?: string; timestamp?: number } }) => {
                console.log('[RemoteBridge] Broadcast received:', JSON.stringify(payload, null, 2));
                const { key: receivedKey, action, msgId, timestamp } = payload.payload || {};
                
                if (!action) {
                    console.error('[RemoteBridge] No action found in payload');
                    return;
                }

                // 1. Validate msgId for double-dispatch protection
                if (msgId && this.seenIds.has(msgId)) {
                    console.log(`[RemoteBridge] Ignoring duplicate msgId: ${msgId}`);
                    return;
                }

                // 2. Ignore extremely old messages (older than 15 seconds)
                // Tightened from 5 minutes to 15 seconds to prevent replaying old actions on connect
                if (timestamp && Math.abs(Date.now() - timestamp) > 15000) {
                    console.warn(`[RemoteBridge] Ignoring stale message. Remote time: ${new Date(timestamp).toLocaleTimeString()}, Local time: ${new Date().toLocaleTimeString()}`);
                    return;
                }

                // Re-fetch config to ensure we have latest key
                const currentConfig = store.get();
                
                if (receivedKey === currentConfig.remoteKey) {
                    // Special case: Sync Request
                    if (action.type === 'SYNC_REQUEST') {
                        console.log('[RemoteBridge] 🔄 Sync request received. Asking renderer to broadcast state.');
                        this.sendToRenderer('remote:request-sync', null);
                        return;
                    }

                    console.log(`[RemoteBridge] ✅ Key matched! Dispatching action: ${action.type}`);
                    
                    // Track seenId to prevent double-dispatch
                    if (msgId) {
                        this.seenIds.set(msgId, Date.now());
                    }

                    this.sendToRenderer('remote-control:action', action);
                } else {
                    console.warn(`[RemoteBridge] ❌ INVALID KEY. Expected: ${currentConfig.remoteKey}, Got: ${receivedKey}`);
                }
            })
            .subscribe((status, err) => {
                if (this.channel !== currentChannel) return;
                
                console.log(`[RemoteBridge] Supabase Realtime status: ${status}`, err || '');
                if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
                    console.error(`[RemoteBridge] Channel disconnected (Status: ${status}). Scheduling reconnect...`);
                    this.isOnline = false;
                    this.sendToRenderer('remote:status-changed', false);
                    // Let Supabase handle automatic reconnection natively.
                    // Do NOT call this.init() here as it tears down the channel and interrupts backoff.
                } else if (status === 'SUBSCRIBED') {
                    this.isOnline = true;
                    this.sendToRenderer('remote:status-changed', true);
                }
            });
    }

    regenerateKeys() {
        const config = store.get();
        const roomId = crypto.randomUUID();
        const remoteKey = crypto.randomBytes(20).toString('hex');
        store.set({ ...config, remoteRoomId: roomId, remoteKey });
        
        // Re-init with new keys
        this.init();
        
        return { roomId, remoteKey };
    }

    private sendToRenderer(channel: string, data: unknown) {
        const wins = BrowserWindow.getAllWindows();
        wins.forEach(win => {
            win.webContents.send(channel, data);
        });
    }

    async broadcastState(state: unknown) {
        if (!this.supabase || !this.channel) return;
        const config = store.get();
        if (!config.remoteRoomId || !config.remoteKey) return;

        try {
            console.log('[RemoteBridge] Broadcasting state update...');
            await this.channel.send({
                type: 'broadcast',
                event: 'state-update',
                payload: {
                    key: config.remoteKey,
                    state,
                    timestamp: Date.now()
                }
            });
        } catch (e) {
            console.error('[RemoteBridge] Broadcast state failed:', e);
        }
    }
}

export const remoteBridge = new RemoteBridge();
