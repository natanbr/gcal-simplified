// ============================================================
// Mission Control — the phone remote's pairing URL (the QR code's content).
// ------------------------------------------------------------
// Remote protocol v2: room id and pairing key ride in the URL FRAGMENT, never
// the query string. A browser never sends the fragment to the server, so the
// key stays out of the remote host's request logs. `v=2` tells the phone to
// speak only the signed protocol (electron/remote-auth.ts). The phone reads the
// fragment, falls back to the query string for old QR codes, and wipes both.
// ============================================================

const REMOTE_APP_URL = 'https://mc-remote.vercel.app/';

export function buildPairingUrl(roomId: string, remoteKey: string): string {
    const url = new URL(REMOTE_APP_URL);
    url.hash = new URLSearchParams({ room: roomId, key: remoteKey, v: '2' }).toString();
    return url.toString();
}

export interface RemotePairing { roomId: string; remoteKey: string }

/** The protocol version the pairing must be marked with (electron/remote-pairing.ts). */
const PAIRING_VERSION = 2;

const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value !== '';

/**
 * The pairing an untrusted settings:get result may draw as a QR code: room and
 * key only when marked for protocol v2. settings:get already leaves an
 * unmarked pairing out (it is the leaked v1 one); this checks again.
 */
export function readPairing(config: unknown): RemotePairing | null {
    if (typeof config !== 'object' || config === null) return null;
    const roomId = 'remoteRoomId' in config ? config.remoteRoomId : undefined;
    const remoteKey = 'remoteKey' in config ? config.remoteKey : undefined;
    const version = 'remotePairingVersion' in config ? config.remotePairingVersion : undefined;
    if (version !== PAIRING_VERSION || !nonEmpty(roomId) || !nonEmpty(remoteKey)) return null;
    return { roomId, remoteKey };
}

