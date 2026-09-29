// ============================================================
// The remote pairing on disk: room id + key in the settings file, owned by the
// main process (settings:save cannot write them, see settings-dialog.ts).
// ------------------------------------------------------------
// Protocol v2 (remote-auth.ts) changed how the key is used, not which key, and
// v1 had broadcast that key in plain text for months. So a pairing without the
// v2 marker is replaced once, and the Remote tab tells the parent to re-scan
// until the phone's first verified message (remotePairingRenewedAt).
// Reads and writes go through store.read() / store.update() only: update()
// re-reads the file, refuses one it cannot read and reports whether the write
// landed. The bridge (remote-bridge.ts) keeps the pairing it joined in memory.
// ============================================================

import crypto from 'node:crypto';
import { store, type WriteResult } from './store';

/** The pairing format this build writes; an unmarked (v1) pairing is renewed once. */
export const PAIRING_VERSION = 2;

export interface Pairing { roomId: string; remoteKey: string }

/** The pairing to join, and whether the Remote tab's re-scan notice is on disk. */
export interface CurrentPairing { pairing: Pairing; renewalPending: boolean }

/** Cryptographically random pairing credentials for the remote channel. */
export function generatePairing(): Pairing {
    return { roomId: crypto.randomUUID(), remoteKey: crypto.randomBytes(15).toString('base64url') };
}

/**
 * The one pairing write: room, key and marker, plus the renewal notice when
 * given, in ONE update. The notice must never be on disk without the pairing
 * it describes, or the Remote tab would send the parent to scan an old QR.
 */
export function savePairing(pairing: Pairing, renewedAt?: string): WriteResult {
    return store.update({
        remoteRoomId: pairing.roomId,
        remoteKey: pairing.remoteKey,
        remotePairingVersion: PAIRING_VERSION,
        ...(renewedAt ? { remotePairingRenewedAt: renewedAt } : {}),
    });
}

/**
 * The pairing to join this session, or null to stay offline. Synchronous on
 * purpose: main.ts runs createWindow() and then remoteBridge.init() in the same
 * tick, and the store's I/O is synchronous, so a renewed pairing is on disk
 * before the renderer can ask for it (settings:get).
 */
export function currentPairing(): CurrentPairing | null {
    const current = store.read();
    // An unreadable file is not a missing pairing: never renew from a fallback.
    if (current.kind === 'unreadable') return null;
    const { remoteRoomId, remoteKey, remotePairingVersion, remotePairingRenewedAt } = current.config;
    if (remoteRoomId && remoteKey && remotePairingVersion === PAIRING_VERSION) {
        return { pairing: { roomId: remoteRoomId, remoteKey }, renewalPending: Boolean(remotePairingRenewedAt) };
    }

    // Any earlier room (v1, or one whose key no longer reads) means a phone that
    // must re-scan. A brand-new install has none, so it gets no notice.
    const renewing = Boolean(remoteRoomId);
    const pairing = generatePairing();
    // Never fall back to the pairing being replaced: it is the leaked v1 key, and a write that
    // keeps failing (read-only or locked file) would keep it working indefinitely.
    if (!savePairing(pairing, renewing ? new Date().toISOString() : undefined).ok) return null;
    if (renewing) console.log('[RemoteBridge] Pairing renewed for signed messages (protocol v2): scan the QR code again on the phone.');
    return { pairing, renewalPending: renewing };
}

/** The phone answered under the current key: drop the renewal notice. Undefined deletes the key. */
export function clearRenewalNotice(): WriteResult {
    return store.update({ remotePairingRenewedAt: undefined });
}
