// ============================================================
// Mission Control — the remote pairing, as the renderer sees it.
// ------------------------------------------------------------
// The pairing (room id and key) is the main process's: config.json, written by
// electron/remote-pairing.ts. Mission Control's state keeps no copy of it. The
// Remote tab reads settings:get when it is shown (RemotePairingPanel), and the
// phone payload never carries it. Up to v0.0.43 mc-state-v5.settings held a
// copy, possibly the leaked v1 key, in plain localStorage: hydration drops it
// (withoutPairingCopy), so the first save after a load writes a blob without it.
//
// The main process replaces a leaked v1 pairing once, by itself, and keeps
// `remotePairingRenewedAt` in config.json until the phone has sent one verified
// message. Until then the phone is in the old room and does nothing. The Remote
// tab shows a notice and the activity log gets one line, so the parent learns
// it without a console. "Already logged" is `settings.remotePairingRenewalLogged`
// in Mission Control state, not a search of the log: a CLEAR or 200 newer lines
// would bring it back.
// ============================================================

import type { ActivityLogEntry, MCSettings } from '../types';

export const PAIRING_RENEWED_LOG_MESSAGE = 'Remote re-paired for security: scan the QR code again (⚙️ → 📱 Remote)';

/** The pairing fields v0.0.43 and earlier saved in mc-state-v5.settings. Read nowhere; dropped at load. */
export const RETIRED_PAIRING_FIELDS = ['remoteRoomId', 'remoteKey'] as const;

/** A saved settings object without the pairing copy an older build kept in it. */
export function withoutPairingCopy(saved: Partial<MCSettings>): Partial<MCSettings> {
    const kept = { ...saved };
    for (const field of RETIRED_PAIRING_FIELDS) Reflect.deleteProperty(kept, field);
    return kept;
}

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

/** The renewal time to save as "already logged", or null when nothing is pending or it is saved already. */
export function renewalToMark(config: unknown, loggedMarker: string | undefined): string | null {
    const renewedAt = pendingRenewalAt(config);
    return renewedAt && renewedAt !== loggedMarker ? renewedAt : null;
}
