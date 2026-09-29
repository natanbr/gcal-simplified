import { describe, it, expect } from 'vitest';
import {
    signRemoteMessage,
    verifyRemoteMessage,
    sealRemoteMessage,
    openRemoteMessage,
} from './remote-auth';

// The shared test vector of remote protocol v2. The phone repo (mc-remote) pins
// the SAME constants against WebCrypto; if either side changes how it builds the
// MAC, one of the two suites goes red instead of the pairing silently failing.
const VECTOR_KEY = 'AbCdEfGhIjKlMnOpQrSt';
const ACTION_BODY = '{"action":{"type":"SYNC_REQUEST"},"msgId":"m-1","timestamp":1700000000000}';
const ACTION_SIG = 'N771384DdDp5v20_e8LCmHQnbH7C1o8yAYVXxFa9VfM';
const STATE_BODY = '{"state":{"bankCount":3},"timestamp":1700000000000}';
const STATE_SIG = 'l3J5hlOhZqkzzhj_c3T0F8eAs74hYWJH-5Wm1gVU910';

describe('signRemoteMessage — shared test vector', () => {
    it('reproduces the action vector byte-for-byte', () => {
        expect(signRemoteMessage(VECTOR_KEY, 'action', ACTION_BODY)).toBe(ACTION_SIG);
    });

    it('reproduces the state-update vector byte-for-byte', () => {
        expect(signRemoteMessage(VECTOR_KEY, 'state-update', STATE_BODY)).toBe(STATE_SIG);
    });
});

describe('verifyRemoteMessage', () => {
    it('accepts both vectors', () => {
        expect(verifyRemoteMessage(VECTOR_KEY, 'action', ACTION_BODY, ACTION_SIG)).toBe(true);
        expect(verifyRemoteMessage(VECTOR_KEY, 'state-update', STATE_BODY, STATE_SIG)).toBe(true);
    });

    it('rejects a tampered body', () => {
        const tampered = ACTION_BODY.replace('SYNC_REQUEST', 'ADD_TOKENS');
        expect(verifyRemoteMessage(VECTOR_KEY, 'action', tampered, ACTION_SIG)).toBe(false);
    });

    it('rejects a signature made for the other event name (domain separation)', () => {
        // A captured signed state must never pass as an action, and vice versa.
        expect(verifyRemoteMessage(VECTOR_KEY, 'action', STATE_BODY, STATE_SIG)).toBe(false);
        expect(verifyRemoteMessage(VECTOR_KEY, 'state-update', ACTION_BODY, ACTION_SIG)).toBe(false);
        // Independent of the pinned vector: the same body signed under each
        // event name yields two different signatures.
        const asState = signRemoteMessage(VECTOR_KEY, 'state-update', ACTION_BODY);
        expect(asState).not.toBe(signRemoteMessage(VECTOR_KEY, 'action', ACTION_BODY));
        expect(verifyRemoteMessage(VECTOR_KEY, 'action', ACTION_BODY, asState)).toBe(false);
    });

    it('rejects a wrong key', () => {
        expect(verifyRemoteMessage('AbCdEfGhIjKlMnOpQrSu', 'action', ACTION_BODY, ACTION_SIG)).toBe(false);
    });

    it('rejects an empty key — an HMAC keyed with "" is one anybody can compute', () => {
        const forged = signRemoteMessage('', 'action', ACTION_BODY);
        expect(verifyRemoteMessage('', 'action', ACTION_BODY, forged)).toBe(false);
    });

    it('fails closed — no throw — when the key is 123, {}, null or undefined (a hand-edited or missing key)', () => {
        // createHmac throws ERR_INVALID_ARG_TYPE on these, on every message.
        for (const key of [123, {}, null, undefined]) {
            expect(() => verifyRemoteMessage(key, 'action', ACTION_BODY, ACTION_SIG)).not.toThrow();
            expect(verifyRemoteMessage(key, 'action', ACTION_BODY, ACTION_SIG)).toBe(false);
            expect(() => openRemoteMessage(key, 'action', { v: 2, body: ACTION_BODY, sig: ACTION_SIG })).not.toThrow();
            expect(openRemoteMessage(key, 'action', { v: 2, body: ACTION_BODY, sig: ACTION_SIG })).toBeNull();
        }
    });

    it('rejects a signature of the wrong length without throwing', () => {
        for (const sig of ['', 'abc', ACTION_SIG.slice(0, -1), `${ACTION_SIG}A`, `${ACTION_SIG}=`]) {
            expect(() => verifyRemoteMessage(VECTOR_KEY, 'action', ACTION_BODY, sig)).not.toThrow();
            expect(verifyRemoteMessage(VECTOR_KEY, 'action', ACTION_BODY, sig)).toBe(false);
        }
    });

    it('rejects a signature of the right length with one character changed', () => {
        const flipped = `${ACTION_SIG.slice(0, -1)}${ACTION_SIG.endsWith('M') ? 'N' : 'M'}`;
        expect(verifyRemoteMessage(VECTOR_KEY, 'action', ACTION_BODY, flipped)).toBe(false);
    });

    it('rejects a non-string signature without throwing', () => {
        const junk: unknown[] = [undefined, null, 42, {}, [ACTION_SIG], Buffer.from(ACTION_SIG)];
        for (const sig of junk) {
            expect(() => verifyRemoteMessage(VECTOR_KEY, 'action', ACTION_BODY, sig)).not.toThrow();
            expect(verifyRemoteMessage(VECTOR_KEY, 'action', ACTION_BODY, sig)).toBe(false);
        }
    });
});

describe('sealRemoteMessage', () => {
    it('produces exactly { v: 2, body, sig } with the body as a JSON string and no key', () => {
        const envelope = sealRemoteMessage(VECTOR_KEY, 'action', {
            action: { type: 'SYNC_REQUEST' }, msgId: 'm-1', timestamp: 1700000000000,
        });
        expect(Object.keys(envelope).sort()).toEqual(['body', 'sig', 'v']);
        expect(envelope).toEqual({ v: 2, body: ACTION_BODY, sig: ACTION_SIG });
        expect(JSON.stringify(envelope)).not.toContain(VECTOR_KEY);
    });
});

describe('openRemoteMessage', () => {
    const genuine = { v: 2, body: STATE_BODY, sig: STATE_SIG };

    it('returns the parsed content of a genuine envelope', () => {
        expect(openRemoteMessage(VECTOR_KEY, 'state-update', genuine)).toEqual({
            state: { bankCount: 3 }, timestamp: 1700000000000,
        });
    });

    it('round-trips what sealRemoteMessage produced', () => {
        const content = { action: { type: 'ADD_TOKEN', amount: 2 }, msgId: 'x', timestamp: 5 };
        const sealed = sealRemoteMessage(VECTOR_KEY, 'action', content);
        expect(openRemoteMessage(VECTOR_KEY, 'action', sealed)).toEqual(content);
    });

    it('returns null when v is missing or is not 2', () => {
        expect(openRemoteMessage(VECTOR_KEY, 'state-update', { body: STATE_BODY, sig: STATE_SIG })).toBeNull();
        expect(openRemoteMessage(VECTOR_KEY, 'state-update', { ...genuine, v: 1 })).toBeNull();
        expect(openRemoteMessage(VECTOR_KEY, 'state-update', { ...genuine, v: '2' })).toBeNull();
        expect(openRemoteMessage(VECTOR_KEY, 'state-update', { ...genuine, v: 3 })).toBeNull();
    });

    it('returns null for a non-string body or sig', () => {
        const asObject: unknown = JSON.parse(STATE_BODY);
        expect(openRemoteMessage(VECTOR_KEY, 'state-update', { ...genuine, body: asObject })).toBeNull();
        expect(openRemoteMessage(VECTOR_KEY, 'state-update', { ...genuine, body: undefined })).toBeNull();
        expect(openRemoteMessage(VECTOR_KEY, 'state-update', { ...genuine, sig: 7 })).toBeNull();
        expect(openRemoteMessage(VECTOR_KEY, 'state-update', { ...genuine, sig: undefined })).toBeNull();
    });

    it('returns null for a bad signature, the wrong event, or the wrong key', () => {
        expect(openRemoteMessage(VECTOR_KEY, 'state-update', { ...genuine, sig: ACTION_SIG })).toBeNull();
        expect(openRemoteMessage(VECTOR_KEY, 'action', genuine)).toBeNull();
        expect(openRemoteMessage('AbCdEfGhIjKlMnOpQrSu', 'state-update', genuine)).toBeNull();
    });

    it('returns null for a v1 payload that carries the key in plain text', () => {
        const v1 = { key: VECTOR_KEY, action: { type: 'ADD_TOKEN' }, msgId: 'm', timestamp: 1 };
        expect(openRemoteMessage(VECTOR_KEY, 'action', v1)).toBeNull();
    });

    it('returns null — without throwing — for unparseable JSON under a VALID signature', () => {
        const garbage = '{"state": oops';
        const envelope = { v: 2, body: garbage, sig: signRemoteMessage(VECTOR_KEY, 'state-update', garbage) };
        expect(verifyRemoteMessage(VECTOR_KEY, 'state-update', garbage, envelope.sig)).toBe(true);
        expect(() => openRemoteMessage(VECTOR_KEY, 'state-update', envelope)).not.toThrow();
        expect(openRemoteMessage(VECTOR_KEY, 'state-update', envelope)).toBeNull();
    });

    it('returns null for a payload that is not an object (null, string, array, number)', () => {
        const notObjects: unknown[] = [null, undefined, 'v=2', [genuine], 2];
        for (const payload of notObjects) {
            expect(openRemoteMessage(VECTOR_KEY, 'state-update', payload)).toBeNull();
        }
    });

    it('returns null when a validly signed body is not a JSON object (null, string, array)', () => {
        for (const body of ['null', '"state"', '[1,2]', '42']) {
            const envelope = { v: 2, body, sig: signRemoteMessage(VECTOR_KEY, 'state-update', body) };
            expect(openRemoteMessage(VECTOR_KEY, 'state-update', envelope)).toBeNull();
        }
    });
});
