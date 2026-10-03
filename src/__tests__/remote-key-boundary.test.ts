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
//  (iii) Mission Control's state keeps no copy of the pairing (2026-10-03). Up
//        to v0.0.43 it kept one in mc-state-v5.settings, in plain localStorage.
//        In renderer code the pairing fields are named only by the files that
//        read the main process's answer (settings:get, remote:regenerate) and
//        draw it, and none of those can reach the store; plus the one
//        declaration of the fields hydration drops from an old blob. A field
//        added back to MCSettings, or a SET_SETTINGS patch naming one, fails
//        here. A spread of the whole settings:get answer into the state names
//        no field: pairingCopy.test.tsx catches that one by value.
//
// verifiedRedBy (proven 2026-09-28, part iii 2026-10-03): see the rule-registry
// entry 'The remote pairing key is never on the wire'.
// ============================================================

import { describe, it, expect } from 'vitest';
import { productionSources, readSource, stripComments, toRepoPath } from './helpers/sourceFiles';

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

/** The pairing as config.json stores it. `roomId` alone is too common a name to scan for. */
const PAIRING_FIELD = /\b(?:remoteRoomId|remoteKey|remotePairingVersion)\b/;
/** They read the main process's answer and draw it; none of them may reach Mission Control's store. */
const PAIRING_READERS = new Set([
    'src/mission-control/utils/pairingUrl.ts', // readPairing: the settings:get answer
    'src/mission-control/utils/regeneratePairing.ts', // the remote:regenerate answer
    'src/mission-control/components/RemotePairingPanel.tsx', // the QR code, in its own useState
]);
const STORE_ACCESS = /\bdispatch\b|\buseMCDispatch\b|\buseMCStore\b|\bSET_SETTINGS\b|\blocalStorage\b/;
/** The one declaration naming the fields hydration drops from a blob v0.0.43 or earlier saved. */
const RETIRED_COPY = { file: 'src/mission-control/store/pairingRenewal.ts', line: /^export const RETIRED_PAIRING_FIELDS = \[/ };

/** Renderer code with comments removed: a comment may describe the pairing. */
const RENDERER = productionSources(['src'])
    .map(file => ({ rel: toRepoPath(file), lines: stripComments(readSource(file)).split(/\r?\n/) }));

/** Every line of `files` that matches `pattern`, as `path:line  code`. */
function linesMatching(files: typeof RENDERER, pattern: RegExp): Array<{ at: string; line: string }> {
    return files.flatMap(({ rel, lines }) => lines
        .map((line, i) => ({ at: `${rel}:${i + 1}`, line }))
        .filter(({ line }) => pattern.test(line)));
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

    it('(iii) Mission Control state keeps no copy of the pairing: only its readers name it, and they cannot reach the store', () => {
        const naming = linesMatching(RENDERER, PAIRING_FIELD);
        // Vacuity: readPairing names all three fields, or a rename would pass by matching nothing.
        expect(naming.some(({ at }) => at.startsWith('src/mission-control/utils/pairingUrl.ts:'))).toBe(true);
        expect(RENDERER.filter(({ rel }) => PAIRING_READERS.has(rel)), 'a pairing reader was renamed or removed').toHaveLength(PAIRING_READERS.size);

        const elsewhere = naming
            .filter(({ at }) => !PAIRING_READERS.has(at.slice(0, at.lastIndexOf(':'))))
            .filter(({ at, line }) => !(at.startsWith(`${RETIRED_COPY.file}:`) && RETIRED_COPY.line.test(line)))
            .map(({ at, line }) => `  ${at}  ${line.trim()}`);
        expect(
            elsewhere,
            `The remote pairing is named outside the files that read it from the main process.\n` +
            `Mission Control state must not hold it: config.json is its one home, the Remote tab reads\n` +
            `settings:get when it is shown, and a copy in mc-state-v5 sits in plain localStorage.\n` +
            elsewhere.join('\n'),
        ).toEqual([]);

        const readersReachingStore = linesMatching(RENDERER.filter(({ rel }) => PAIRING_READERS.has(rel)), STORE_ACCESS)
            .map(({ at, line }) => `  ${at}  ${line.trim()}`);
        expect(
            readersReachingStore,
            `A file that reads the pairing reaches Mission Control's store, so it could save the pairing there:\n` +
            readersReachingStore.join('\n'),
        ).toEqual([]);
    });
});
