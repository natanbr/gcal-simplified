// ============================================================
// Remote pairing key — structural boundary (remote protocol v2).
//
// What this protects: the pairing key never travels on the public
// `remote-control:{roomId}` channel and never sits in a URL query string. It
// used to do both — every state-update carried `{ key, state }`, and the QR
// URL was `?room=…&key=…`, which reaches the host's request logs. Behavioural
// tests pin the one broadcast and the one URL that exist today; they cannot see
// a NEW one, which is by definition not covered by an existing case.
//
//   (i)  A URL carrying the key is built in exactly one place, the pairing-URL
//        builder, which puts it in the fragment. No other production file may
//        contain `vercel.app/?`, `vercel.app/#` or a `?key=` / `&key=` /
//        `#key=` parameter. (The bare host shown as text on the settings
//        screen is not a URL and does not match.)
//   (ii) Every broadcast object literal — `type: 'broadcast'` — in production
//        code takes its payload straight from `sealRemoteMessage(`. Matching the
//        literal rather than `.send(` also catches a message built elsewhere and
//        sent by name. Deliberately strict: `payload: sealed` (a variable) fails
//        too; write the call inline so the guard can see it.
//
// verifiedRedBy (proven 2026-09-28): see the rule-registry entry
// 'The remote pairing key is never on the wire'.
// ============================================================

import { describe, it, expect } from 'vitest';
import { productionSources, readSource, toRepoPath } from './helpers/sourceFiles';

const PAIRING_URL_BUILDER = 'src/mission-control/utils/pairingUrl.ts';
const KEY_IN_URL = /vercel\.app\/[?#]|[?&#]key=/;
const BROADCAST_TYPE = /\btype\s*:\s*['"`]broadcast['"`]/g;
const SEALED_PAYLOAD = /\bpayload\s*:\s*sealRemoteMessage\(/;

/** Test kits live beside production code but are test support (CLAUDE.md → Testing → Fixtures). */
const KIT_NAME = /(test-?kit|fixtures?)\.tsx?$/i;

// Read once: every case scans the same files.
const SOURCES = productionSources(['src', 'electron'])
    .map(file => ({ rel: toRepoPath(file), src: readSource(file) }))
    .filter(({ rel }) => !KIT_NAME.test(rel));

/** The object literal enclosing `index`: back to its unmatched `{`, forward to the matching `}`. */
function enclosingObject(src: string, index: number): string {
    let depth = 0;
    let open = index;
    for (; open >= 0; open--) {
        if (src[open] === '}') depth++;
        else if (src[open] === '{') {
            if (depth === 0) break;
            depth--;
        }
    }
    let close = open;
    for (depth = 0; close < src.length; close++) {
        if (src[close] === '{') depth++;
        else if (src[close] === '}' && --depth === 0) break;
    }
    return src.slice(open, close + 1);
}

function lineOf(src: string, index: number): number {
    return src.slice(0, index).split('\n').length;
}

const broadcasts = SOURCES.flatMap(({ rel, src }) =>
    [...src.matchAll(BROADCAST_TYPE)].map(match => ({
        where: `${rel}:${lineOf(src, match.index)}`,
        object: enclosingObject(src, match.index),
    })));

describe('remote pairing key boundary', () => {
    it('(i) only the pairing-URL builder may put a key into a URL', () => {
        const offenders = SOURCES
            .filter(({ rel }) => rel !== PAIRING_URL_BUILDER)
            .flatMap(({ rel, src }) => src.split(/\r?\n/)
                .map((line, i) => ({ line, at: `${rel}:${i + 1}` }))
                .filter(({ line }) => KEY_IN_URL.test(line))
                .map(({ line, at }) => `  ${at}  ${line.trim()}`));

        expect(
            offenders,
            `A URL carrying the remote pairing key is built outside ${PAIRING_URL_BUILDER}.\n` +
            `Use buildPairingUrl(): it puts room, key and v=2 in the fragment, which never reaches a server.\n` +
            offenders.join('\n'),
        ).toEqual([]);
        expect(SOURCES.some(({ rel }) => rel === PAIRING_URL_BUILDER), `${PAIRING_URL_BUILDER} is missing`).toBe(true);
    });

    it('(ii) every broadcast takes its payload straight from sealRemoteMessage(', () => {
        // Vacuity: the scan must find the state-update broadcast in remote-bridge.ts,
        // or a renamed call would pass this guard by matching nothing.
        expect(broadcasts.some(b => b.where.startsWith('electron/remote-bridge.ts:'))).toBe(true);

        const unsealed = broadcasts.filter(b => !SEALED_PAYLOAD.test(b.object)).map(b => `  ${b.where}`);
        expect(
            unsealed,
            `Broadcast(s) whose payload is not \`payload: sealRemoteMessage(...)\` — the channel is public,\n` +
            `so an unsigned payload is readable and forgeable by anyone who knows the room id:\n${unsealed.join('\n')}`,
        ).toEqual([]);
    });
});
