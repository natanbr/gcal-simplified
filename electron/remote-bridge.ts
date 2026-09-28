import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { BrowserWindow } from 'electron';
import crypto from 'node:crypto';
import { store } from './store';

/** Cryptographically random pairing credentials for the remote channel. */
function generatePairingKeys(): { roomId: string; remoteKey: string } {
    return {
        roomId: crypto.randomUUID(),
        remoteKey: crypto.randomBytes(15).toString('base64url'),
    };
}

/** Retry schedule while config.json cannot be read: 5 s, doubling, capped at 5 min. */
const INIT_RETRY_FIRST_MS = 5_000;
const INIT_RETRY_MAX_MS = 5 * 60_000;

/**
 * The room to join, generating and saving a pairing on first run. Null when
 * config.json cannot be read, or the new pairing cannot be saved: joining a
 * room that was never saved leaves the phone on a room nobody can reach.
 */
function pairedRoomId(): string | null {
    const current = store.read();
    if (current.kind === 'unreadable') return null;
    const { remoteRoomId, remoteKey } = current.config;
    if (remoteRoomId && remoteKey) return remoteRoomId;

    const pairing = generatePairingKeys();
    return store.update({ remoteRoomId: pairing.roomId, remoteKey: pairing.remoteKey }) ? pairing.roomId : null;
}

export class RemoteBridge {
    private supabase: SupabaseClient | null = null;
    private channel: RealtimeChannel | null = null;
    private seenIds = new Map<string, number>();
    private cleanupInterval: NodeJS.Timeout | null = null;
    private initRetryTimeout: NodeJS.Timeout | null = null;
    private initRetryDelayMs = INIT_RETRY_FIRST_MS;
    private isOnline = false;

    getStatus(): boolean {
        return this.isOnline;
    }

    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        if (this.initRetryTimeout) {
            clearTimeout(this.initRetryTimeout);
            this.initRetryTimeout = null;
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

        if (this.initRetryTimeout) {
            clearTimeout(this.initRetryTimeout);
            this.initRetryTimeout = null;
        }

        if (!this.supabase) {
            this.supabase = createClient(url, key);
        }

        const roomId = pairedRoomId();
        if (!roomId) {
            this.scheduleInitRetry();
            return;
        }
        this.initRetryDelayMs = INIT_RETRY_FIRST_MS;

        if (this.channel) {
            this.supabase.removeChannel(this.channel);
        }

        const currentChannel = this.supabase.channel(`remote-control:${roomId}`);
        this.channel = currentChannel;
        
        console.log(`[RemoteBridge] Initializing. Room ID: ${roomId}`);

        currentChannel
            .on('broadcast', { event: 'action' }, (payload: { payload: { key: string; action: Record<string, unknown>; msgId?: string; timestamp?: number } }) => {
                const { key: receivedKey, action, msgId, timestamp } = payload.payload || {};
                // Log the action only — the payload also carries the pairing key.
                console.log(`[RemoteBridge] Broadcast received: ${action?.type ?? 'unknown'} (msgId: ${msgId ?? 'n/a'})`);
                
                if (!action) {
                    console.error('[RemoteBridge] No action found in payload');
                    return;
                }

                // 1. Validate msgId for double-dispatch protection
                if (msgId && this.seenIds.has(msgId)) {
                    console.log(`[RemoteBridge] Ignoring duplicate msgId: ${msgId}`);
                    return;
                }

                // 2. Ignore extremely old messages (older than 60 seconds)
                // Loosened from 15 seconds to 60 seconds to prevent pairing failures from clock drifts
                if (timestamp && Math.abs(Date.now() - timestamp) > 60000) {
                    console.warn(`[RemoteBridge] Ignoring stale message. Remote time: ${new Date(timestamp).toLocaleTimeString()}, Local time: ${new Date().toLocaleTimeString()}`);
                    return;
                }

                // Re-fetch config to ensure we have latest key
                const expectedKey = store.get().remoteKey;

                // A failed read has no key: undefined must never match a payload that sent none.
                if (typeof expectedKey === 'string' && expectedKey !== '' && receivedKey === expectedKey) {
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
                    // Never log the expected key — it's the pairing secret.
                    console.warn('[RemoteBridge] ❌ Rejected action: pairing key mismatch.');
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
        const { roomId, remoteKey } = generatePairingKeys();
        if (!store.update({ remoteRoomId: roomId, remoteKey })) {
            throw new Error('Pairing keys not regenerated: config.json could not be read or saved.');
        }

        // Re-init with new keys
        this.init();
        
        return { roomId, remoteKey };
    }

    /** Stay offline rather than join a room the phone does not know, and try again. */
    private scheduleInitRetry() {
        const delay = this.initRetryDelayMs;
        this.initRetryDelayMs = Math.min(delay * 2, INIT_RETRY_MAX_MS);
        console.warn(`[RemoteBridge] Remote control offline: config.json could not be read or saved. Retrying in ${delay / 1000} s.`);
        this.initRetryTimeout = setTimeout(() => this.init(), delay);
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
