import { describe, it, expect } from 'vitest';
import { buildPairingUrl } from './pairingUrl';

const ROOM = '5f0c2a9e-7b1d-4c3e-9a8f-2d6b4e1c7a90';
const KEY = 'q7Lk2mPz9XwR4tYb8NcV';

describe('buildPairingUrl', () => {
    it('is the exact v2 form the phone app parses', () => {
        expect(buildPairingUrl(ROOM, KEY)).toBe(`https://mc-remote.vercel.app/#room=${ROOM}&key=${KEY}&v=2`);
    });

    it('carries room, key and v=2 in the fragment, never in the query string', () => {
        // A fragment is never sent to the server, so the key stays out of the
        // host's request logs; a query string is sent on every load.
        const url = new URL(buildPairingUrl(ROOM, KEY));
        expect(url.origin).toBe('https://mc-remote.vercel.app');
        expect(url.search).toBe('');
        const fragment = new URLSearchParams(url.hash.slice(1));
        expect(fragment.get('room')).toBe(ROOM);
        expect(fragment.get('key')).toBe(KEY);
        expect(fragment.get('v')).toBe('2');
    });

    it('encodes characters that would otherwise split or corrupt a parameter', () => {
        const awkwardKey = 'a+b/c=d&e f#g';
        const url = new URL(buildPairingUrl('room&v=1', awkwardKey));
        expect(url.search).toBe('');
        const fragment = new URLSearchParams(url.hash.slice(1));
        expect(fragment.get('room')).toBe('room&v=1');
        expect(fragment.get('key')).toBe(awkwardKey);
        expect(fragment.getAll('v')).toEqual(['2']);
    });
});
