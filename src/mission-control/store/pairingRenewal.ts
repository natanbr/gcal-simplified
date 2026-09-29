// ============================================================
// Mission Control — an automatic remote-pairing renewal, as the renderer sees it.
// ------------------------------------------------------------
// The main process (electron/remote-bridge.ts) replaces a leaked v1 pairing
// once, by itself, and keeps `remotePairingRenewedAt` in config.json until the
// phone has sent one verified message. Until then the phone is in the old room
// and does nothing. The Remote tab shows a notice (RemotePairingHeader) and the
// activity log gets one line, so the parent learns it without a console.
// ============================================================

import type { ActivityLogEntry } from '../types';

export const PAIRING_RENEWED_LOG_MESSAGE = 'Remote re-paired for security: scan the QR code again (⚙️ → 📱 Remote)';

/** The pending renewal time from an untrusted settings:get result, or null. */
export function pendingRenewalAt(config: unknown): string | null {
    if (typeof config !== 'object' || config === null || !('remotePairingRenewedAt' in config)) return null;
    const value = config.remotePairingRenewedAt;
    // The time becomes the log entry's timestamp: an unreadable one would render as "Invalid Date".
    return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
}

/**
 * The one-time log line for a pending renewal, or null when nothing is pending
 * or the line is already in the log. Built by hand: it describes no action, so
 * createLogEntry never derives it, and it is nothing the shield lock refuses.
 * The id is derived from the renewal time, so a restart cannot add it twice.
 */
export function pairingRenewedLogEntry(config: unknown, logs: readonly ActivityLogEntry[]): ActivityLogEntry | null {
    const renewedAt = pendingRenewalAt(config);
    if (!renewedAt) return null;
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
