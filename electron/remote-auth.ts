// ============================================================
// Remote protocol v2 — the signed envelope of the remote-control channel.
// ------------------------------------------------------------
// `remote-control:{roomId}` is a public Supabase broadcast channel: whoever
// holds the room id can listen and send. So the pairing key never travels on
// it. Every message, both directions, is `{ v: 2, body, sig }` where
//   sig = base64url(HMAC-SHA256(key = remoteKey, message = event + "\n" + body))
//
// Two non-obvious rules:
// - Sign and verify the `body` STRING, never a re-serialized object. Realtime
//   decodes and re-encodes JSON in transit, so an object's key order is not
//   preserved; a string field is opaque to the transport.
// - The event name is inside the MAC (domain separation), so a captured signed
//   state-update can never be replayed as an action.
//
// The phone app (mc-remote) implements the same with WebCrypto and pins the
// same test vector (electron/remote-auth.test.ts). Pure: no electron imports.
// ============================================================

import { createHmac, timingSafeEqual } from 'node:crypto';

export type RemoteEvent = 'action' | 'state-update';

export interface RemoteEnvelope {
    v: 2;
    /** JSON.stringify of the content — signed as this exact string. */
    body: string;
    /** base64url HMAC-SHA256 of `event + "\n" + body`, no padding. */
    sig: string;
}

/** A plain JSON object: not null, not an array. */
export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function signRemoteMessage(key: string, event: RemoteEvent, body: string): string {
    return createHmac('sha256', key).update(`${event}\n${body}`, 'utf8').digest('base64url');
}

/** Constant-time check of `sig`. Never throws: anything that is not the exact
 *  expected string — wrong type, wrong length, wrong key — is simply false. */
export function verifyRemoteMessage(key: string, event: RemoteEvent, body: string, sig: unknown): boolean {
    // An empty key signs with an HMAC anybody can compute.
    if (key.length === 0 || typeof sig !== 'string') return false;
    const expected = Buffer.from(signRemoteMessage(key, event, body), 'utf8');
    const received = Buffer.from(sig, 'utf8');
    // timingSafeEqual throws on a length mismatch; the length of a MAC is public.
    if (expected.length !== received.length) return false;
    return timingSafeEqual(expected, received);
}

export function sealRemoteMessage(key: string, event: RemoteEvent, content: unknown): RemoteEnvelope {
    const body = JSON.stringify(content);
    return { v: 2, body, sig: signRemoteMessage(key, event, body) };
}

/** Verifies an untrusted payload and returns its content, or null when it is
 *  not a genuine v2 envelope for `event` whose body is a JSON object. The
 *  signature is checked before the body is parsed. */
export function openRemoteMessage(key: string, event: RemoteEvent, payload: unknown): Record<string, unknown> | null {
    if (!isRecord(payload) || payload.v !== 2) return null;
    const { body, sig } = payload;
    if (typeof body !== 'string' || !verifyRemoteMessage(key, event, body, sig)) return null;
    let content: unknown;
    try {
        content = JSON.parse(body);
    } catch {
        return null;
    }
    return isRecord(content) ? content : null;
}
