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
