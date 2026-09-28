import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { BrowserWindow } from 'electron';
import crypto from 'node:crypto';
import { store, type StoreFailure, type WriteResult } from './store';
import { isRecord, openRemoteMessage, sealRemoteMessage } from './remote-auth';

interface Pairing { roomId: string; remoteKey: string }

/** What remote:regenerate resolves to: the new pairing, or why the old one was kept. */
export type RegenerateKeysResult = ({ ok: true } & Pairing) | StoreFailure;

/** Actions older or newer than this are refused (clock drift allowance). */
const MAX_ACTION_AGE_MS = 60_000;
/** At least twice the age window: an action dated a full window ahead stays
 *  acceptable for two windows, so a shorter memory lets it be replayed once. */
const SEEN_ID_TTL_MS = 2 * MAX_ACTION_AGE_MS;
/** The pairing format this build writes; an unmarked (v1) pairing is renewed once. */
const PAIRING_VERSION = 2;

/** The verified content of an action message: every field required. */
function parseActionContent(content: Record<string, unknown>):
    { action: Record<string, unknown> & { type: string }; msgId: string; timestamp: number } | null {
    const { action, msgId, timestamp } = content;
    if (!isRecord(action)) return null;
    const { type } = action;
    if (typeof type !== 'string' || type === '') return null;
    if (typeof msgId !== 'string' || msgId === '') return null;
    if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return null;
    return { action: { ...action, type }, msgId, timestamp };
}

/** Cryptographically random pairing credentials for the remote channel. */
function generatePairingKeys(): Pairing {
    return {
        roomId: crypto.randomUUID(),
        remoteKey: crypto.randomBytes(15).toString('base64url'),
    };
}

/** Retry schedule while config.json cannot be read: 5 s, doubling, capped at 5 min. */
const INIT_RETRY_FIRST_MS = 5_000;
const INIT_RETRY_MAX_MS = 5 * 60_000;

/** Saves a pairing with the protocol v2 marker. */
function savePairing(pairing: Pairing): WriteResult {
    return store.update({ remoteRoomId: pairing.roomId, remoteKey: pairing.remoteKey, remotePairingVersion: PAIRING_VERSION });
}

/**
 * The pairing to join, generating and saving one on first run and renewing one
 * that predates protocol v2: v1 broadcast its key in plain text, and a signature
 * keyed with a leaked key proves nothing. Null when the settings file cannot be
 * read (never renew from a fallback), or the new pairing cannot be saved:
 * joining a room that was never saved leaves the phone on a room nobody can
 * reach, and the pairing being replaced is the leaked one. Synchronous on
 * purpose: main.ts runs createWindow() and then remoteBridge.init() in the same
 * tick, so a renewed pairing is on disk before the renderer can ask for it.
 */
function currentPairing(): Pairing | null {
    const current = store.read();
    if (current.kind === 'unreadable') return null;
    const { remoteRoomId, remoteKey, remotePairingVersion } = current.config;
    if (remoteRoomId && remoteKey && remotePairingVersion === PAIRING_VERSION) return { roomId: remoteRoomId, remoteKey };

    const pairing = generatePairingKeys();
    if (!savePairing(pairing).ok) return null;
    if (remoteRoomId && remoteKey) {
        console.log('[RemoteBridge] Pairing renewed for signed messages (protocol v2): scan the QR code again on the phone.');
    }
    return pairing;
}

export class RemoteBridge {
    private supabase: SupabaseClient | null = null;
    private channel: RealtimeChannel | null = null;
    /** What this bridge last joined with. The main process is the pairing's only owner (settings:save never
     *  writes it), so a file that turns unreadable mid-session must not change who may act. */
    private pairing: Pairing | null = null;
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

        // First, credentials or not: settings:get must never hand out a v1 key.
        const pairing = currentPairing();

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
                    if (now - timestamp > SEEN_ID_TTL_MS) {
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

        if (!pairing) {
            this.goOfflineAndRetry();
            return;
        }
        this.join(pairing);
    }

    private join(pairing: Pairing) {
        if (!this.supabase) return;
        if (this.initRetryTimeout) {
            clearTimeout(this.initRetryTimeout);
            this.initRetryTimeout = null;
        }
        this.initRetryDelayMs = INIT_RETRY_FIRST_MS;

        if (this.channel) {
            this.supabase.removeChannel(this.channel);
        }
        this.pairing = pairing;

        const currentChannel = this.supabase.channel(`remote-control:${pairing.roomId}`);
        this.channel = currentChannel;

        // The room id is now the one thing a listener needs: logs carry a prefix only.
        const fullRoomId = pairing.roomId;
        const shortRoomId = `${fullRoomId.slice(0, 8)}…`;
        console.log(`[RemoteBridge] Initializing. Room ID: ${shortRoomId}`);

        currentChannel
            .on('broadcast', { event: 'action' }, (message: { payload?: unknown }) => {
                this.handleAction(message?.payload);
            })
            .subscribe((status, err) => {
                if (this.channel !== currentChannel) return;

                // The message only: a join error can quote the topic, and its
                // cause (the raw server reply) would print in full.
                const detail = err ? err.message.split(fullRoomId).join(shortRoomId) : '';
                console.log(`[RemoteBridge] Supabase Realtime status: ${status}`, detail);
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

    regenerateKeys(): RegenerateKeysResult {
        const pairing = generatePairingKeys();
        const saved = savePairing(pairing);
        if (!saved.ok) return saved;

        // Join what was just saved, with no re-read: a lock right after the save must not
        // leave the bridge in the room being revoked.
        this.join(pairing);
        return { ok: true, ...pairing };
    }

    /** Stay offline rather than join a room the phone does not know, and try again.
     *  Offline means out of the old room too: after a regenerate it would carry the new key there. */
    private goOfflineAndRetry() {
        if (this.channel && this.supabase) this.supabase.removeChannel(this.channel);
        this.channel = null;
        if (this.isOnline) {
            this.isOnline = false;
            this.sendToRenderer('remote:status-changed', false);
        }

        const delay = this.initRetryDelayMs;
        this.initRetryDelayMs = Math.min(delay * 2, INIT_RETRY_MAX_MS);
        console.warn(`[RemoteBridge] Remote control offline: the settings file could not be read or saved. Retrying in ${delay / 1000} s.`);
        this.initRetryTimeout = setTimeout(() => this.init(), delay);
    }

    /** Protocol v2 (remote-auth.ts): verify the signature before reading
     *  anything, then require every field, then the age window, then de-dup.
     *  Never logs the key, the body or the signature. */
    private handleAction(raw: unknown) {
        // The joined pairing, never a fresh read: a read that fails has no key.
        const content = openRemoteMessage(this.pairing?.remoteKey, 'action', raw);
        if (!content) {
            console.warn(isRecord(raw) && 'key' in raw
                ? '[RemoteBridge] ❌ Rejected unsigned action (protocol v1): the phone was paired from an old QR code. Scan the current one (MC settings → Remote).'
                : '[RemoteBridge] ❌ Rejected action: missing or invalid signature.');
            return;
        }

        const parsed = parseActionContent(content);
        if (!parsed) {
            console.warn('[RemoteBridge] ❌ Rejected signed action: malformed body.');
            return;
        }
        const { action, msgId, timestamp } = parsed;

        if (Math.abs(Date.now() - timestamp) > MAX_ACTION_AGE_MS) {
            console.warn(`[RemoteBridge] Ignoring stale ${action.type}. Remote time: ${new Date(timestamp).toLocaleTimeString()}, Local time: ${new Date().toLocaleTimeString()}`);
            return;
        }

        if (this.seenIds.has(msgId)) {
            console.log(`[RemoteBridge] Ignoring duplicate msgId: ${msgId}`);
            return;
        }
        // Recorded only now, after the signature verified, so unauthenticated
        // traffic can neither grow the map nor pre-burn a genuine msgId.
        this.seenIds.set(msgId, Date.now());

        if (action.type === 'SYNC_REQUEST') {
            console.log('[RemoteBridge] 🔄 Sync request received. Asking renderer to broadcast state.');
            this.sendToRenderer('remote:request-sync', null);
            return;
        }

        // Authorisation stays in the renderer's REMOTE_ALLOWED_ACTIONS.
        console.log(`[RemoteBridge] ✅ Verified action: ${action.type} (msgId: ${msgId})`);
        this.sendToRenderer('remote-control:action', action);
    }

    private sendToRenderer(channel: string, data: unknown) {
        const wins = BrowserWindow.getAllWindows();
        wins.forEach(win => {
            win.webContents.send(channel, data);
        });
    }

    async broadcastState(state: unknown) {
        if (!this.channel || !this.pairing) return;

        try {
            console.log('[RemoteBridge] Broadcasting state update...');
            // Signed with the joined key, never carrying it: the channel is public (remote-auth.ts).
            await this.channel.send({
                type: 'broadcast',
                event: 'state-update',
                payload: sealRemoteMessage(this.pairing.remoteKey, 'state-update', { state, timestamp: Date.now() }),
            });
        } catch (e) {
            console.error('[RemoteBridge] Broadcast state failed:', e);
        }
    }
}

export const remoteBridge = new RemoteBridge();
