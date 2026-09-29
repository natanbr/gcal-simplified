// ============================================================
// Mission Control — the remote pairing, as the renderer sees it.
// ------------------------------------------------------------
// The main process (electron/remote-pairing.ts) replaces a leaked v1 pairing
// once, by itself, and keeps `remotePairingRenewedAt` in config.json until the
// phone has sent one verified message. Until then the phone is in the old room
// and does nothing. The Remote tab shows a notice (RemotePairingPanel) and the
// activity log gets one line, so the parent learns it without a console.
// "Already logged" is `settings.remotePairingRenewalLogged` in Mission Control
// state, not a search of the log: a CLEAR or 200 newer lines would bring it back.
// ============================================================

import type { ActivityLogEntry, MCSettings } from '../types';
import { readPairing } from '../utils/pairingUrl';

export const PAIRING_RENEWED_LOG_MESSAGE = 'Remote re-paired for security: scan the QR code again (⚙️ → 📱 Remote)';

/** A readable ISO time, or nothing: an unreadable one would render as "Invalid Date". */
const isoTime = (value: unknown): string | undefined =>
    typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : undefined;

/** The pending renewal time from an untrusted settings:get result, or null. */
export function pendingRenewalAt(config: unknown): string | null {
    if (typeof config !== 'object' || config === null || !('remotePairingRenewedAt' in config)) return null;
    return isoTime(config.remotePairingRenewedAt) ?? null;
}

/** The "already logged" marker as hydration keeps it: anything but a readable time reads as not logged. */
export function renewalLoggedMarker(value: unknown): string | undefined {
    return isoTime(value);
}

/**
 * The one-time log line for a pending renewal, or null when nothing is pending
 * or this renewal was already logged (the marker, or the line still in the log).
 * Built by hand: it describes no action, so createLogEntry never derives it,
 * and it is nothing the shield lock refuses.
 */
export function pairingRenewedLogEntry(config: unknown, logs: readonly ActivityLogEntry[], loggedMarker: string | undefined): ActivityLogEntry | null {
    const renewedAt = pendingRenewalAt(config);
    if (!renewedAt || renewedAt === loggedMarker) return null;
    const id = `pairing-renewed-${renewedAt}`;
    if (logs.some(log => log.id === id)) return null;
    return {
        id,
        timestamp: renewedAt,
        icon: '📱',
        message: PAIRING_RENEWED_LOG_MESSAGE,
        type: 'system',
        colorKey: 'system',
        source: 'system',
    };
}

/**
 * What the mount-time settings:get changes in Mission Control's settings, or
 * null for nothing: the room and key of a v2 pairing, or clearing them when
 * none is handed out (a leaked v1 key must not linger in mc-state-v5), and the
 * "already logged" marker for a pending renewal.
 */
export function remotePairingSettings(config: unknown, current: MCSettings): Partial<MCSettings> | null {
    const patch: Partial<MCSettings> = {};
    const pairing = readPairing(config);
    if (pairing && (pairing.roomId !== current.remoteRoomId || pairing.remoteKey !== current.remoteKey)) {
        patch.remoteRoomId = pairing.roomId;
        patch.remoteKey = pairing.remoteKey;
    } else if (!pairing && (current.remoteRoomId !== undefined || current.remoteKey !== undefined)) {
        patch.remoteRoomId = undefined;
        patch.remoteKey = undefined;
    }
    const renewedAt = pendingRenewalAt(config);
    if (renewedAt && renewedAt !== current.remotePairingRenewalLogged) patch.remotePairingRenewalLogged = renewedAt;
    return Object.keys(patch).length > 0 ? patch : null;
}
