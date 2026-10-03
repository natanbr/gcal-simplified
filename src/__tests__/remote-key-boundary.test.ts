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
//        In renderer code (src/, test kits excluded):
//          - the field names remoteRoomId, remoteKey and remotePairingVersion
//            (as an identifier, or inside a string or template literal) appear
//            only in the files that read the main process's answer and draw it
//            (PAIRING_READERS), plus the one RETIRED_PAIRING_FIELDS declaration
//            hydration drops from an old blob;
//          - those readers name none of dispatch, useMCDispatch, useMCStore,
//            MCStoreProvider, MCContext, localStorage or 'SET_SETTINGS';
//          - utils/pairingUrl and utils/regeneratePairing, which turn the answer
//            into a pairing, are imported only by RemotePairingPanel.tsx.
//        A field added back to MCSettings, a SET_SETTINGS patch naming one, or a
//        store file calling readPairing fails here. What it cannot see: code
//        that copies the answer without naming a field or importing those
//        modules (a spread of the whole settings:get answer, a key built from
//        pieces). pairingCopy.test.tsx checks the saved blob by value for the
//        paths that exist; a new path is a review matter.
//        Parsed with the TypeScript compiler, not a comment stripper:
//        stripComments reads an apostrophe in JSX text as a string opener and
//        misread five files from there to their end (review of PR 188).
//
// verifiedRedBy (proven 2026-09-28, part iii 2026-10-03): see the rule-registry
// entry 'The remote pairing key is never on the wire'.
// ============================================================

import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { posix } from 'node:path';
import { productionSources, readSource, toRepoPath } from './helpers/sourceFiles';

const PAIRING_URL_BUILDER = 'src/mission-control/utils/pairingUrl.ts';
const KEY_IN_URL = /vercel\.app\/[?#]|[?&#]key=/;
const BROADCAST_TYPE = /\btype\s*:\s*['"`]broadcast['"`]/g;
const SEALED_PAYLOAD = /\bpayload\s*:\s*sealRemoteMessage\(/;

/** Test kits live beside production code but are test support (CLAUDE.md → Testing → Fixtures). */
const KIT_NAME = /(test-?kit|fixtures?)\.tsx?$/i;
/** Test-only by location, as test-kit-boundary.test.ts reads it: global setup and the guards' helpers. */
const TEST_ONLY_DIR = /^src\/test\/|\/__tests__\//;

// Read once: every case scans the same files.
const SOURCES = productionSources(['src', 'electron'])
    .map(file => ({ rel: toRepoPath(file), src: readSource(file) }))
    .filter(({ rel }) => !KIT_NAME.test(rel) && !TEST_ONLY_DIR.test(rel));

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

// ── (iii) ────────────────────────────────────────────────────────────────────

/** The pairing as config.json stores it. `roomId` alone is too common a name to scan for. */
const PAIRING_FIELDS = new Set(['remoteRoomId', 'remoteKey', 'remotePairingVersion']);
const PAIRING_FIELD_IN_TEXT = /\b(?:remoteRoomId|remoteKey|remotePairingVersion)\b/;
/** They read the main process's answer and draw it; none of them may name the store. */
const PAIRING_READERS = new Set([
    'src/mission-control/utils/pairingUrl.ts', // readPairing: the settings:get answer
    'src/mission-control/utils/regeneratePairing.ts', // the remote:regenerate answer
    'src/mission-control/components/RemotePairingPanel.tsx', // the QR code, in its own useState
]);
const STORE_NAMES = new Set(['dispatch', 'useMCDispatch', 'useMCStore', 'MCStoreProvider', 'MCContext', 'localStorage']);
/** The modules that turn the answer into a pairing, and the one file that may import them. The
 *  whole module is fenced, a type-only import included. Splitting the panel into several files
 *  means adding each new file to BOTH this list and PAIRING_READERS. */
const PAIRING_MODULES = new Set(['src/mission-control/utils/pairingUrl', 'src/mission-control/utils/regeneratePairing']);
const PAIRING_MODULE_IMPORTERS = new Set(['src/mission-control/components/RemotePairingPanel.tsx']);
/** The declaration naming the fields hydration drops from a blob v0.0.43 or earlier saved. */
const RETIRED_COPY = { file: 'src/mission-control/store/pairingRenewal.ts', name: 'RETIRED_PAIRING_FIELDS' };

interface Hit { at: string; text: string }
interface Scan { pairing: Hit[]; store: Hit[]; imports: Hit[] }

const isTextLiteral = (node: ts.Node): node is ts.StringLiteralLike | ts.TemplateLiteralToken =>
    ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node);

/** Repo path of a relative import, without its extension; null for a package. */
function importedModule(fromFile: string, specifier: string): string | null {
    if (!specifier.startsWith('.')) return null;
    return posix.normalize(posix.join(posix.dirname(fromFile), specifier)).replace(/\.(tsx?|jsx?)$/, '').replace(/\/index$/, '');
}

/** What a file names of the pairing and the store, and what it imports, from its syntax tree. */
function scan(rel: string, src: string): Scan {
    const kind = rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const file = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, kind);
    const hit = (node: ts.Node, text: string): Hit =>
        ({ at: `${rel}:${file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1}`, text });
    const out: Scan = { pairing: [], store: [], imports: [] };
    const visit = (node: ts.Node): void => {
        if (rel === RETIRED_COPY.file && ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === RETIRED_COPY.name) return;
        if (ts.isIdentifier(node)) {
            if (PAIRING_FIELDS.has(node.text)) out.pairing.push(hit(node, node.text));
            if (STORE_NAMES.has(node.text)) out.store.push(hit(node, node.text));
        } else if (isTextLiteral(node)) {
            if (PAIRING_FIELD_IN_TEXT.test(node.text)) out.pairing.push(hit(node, `'${node.text}'`));
            if (node.text === 'SET_SETTINGS') out.store.push(hit(node, `'${node.text}'`));
        }
        const specifier = (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) ? node.moduleSpecifier
            : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword ? node.arguments[0]
                : undefined;
        if (specifier && ts.isStringLiteral(specifier)) {
            const target = importedModule(rel, specifier.text);
            if (target) out.imports.push(hit(specifier, target));
        }
        ts.forEachChild(node, visit);
    };
    visit(file);
    return out;
}

const RENDERER = SOURCES.filter(({ rel }) => rel.startsWith('src/')).map(({ rel, src }) => ({ rel, ...scan(rel, src) }));
const show = (hits: Hit[]) => hits.map(({ at, text }) => `  ${at}  ${text}`);

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

    it('(iii) the scan reads names in code and literals, never in comments or JSX text', () => {
        const found = scan('probe.tsx', [
            "const V = () => <p>It's the remoteKey</p>;",
            '// remoteKey in a comment',
            "const k = { remoteKey: 1 }; const s = 'settings.remoteRoomId';",
            'dispatch(x); /* localStorage */',
        ].join('\n'));
        expect(found.pairing.map(({ at }) => at)).toEqual(['probe.tsx:3', 'probe.tsx:3']);
        expect(found.store.map(({ text }) => text)).toEqual(['dispatch']);
    });

    it('(iii) Mission Control state keeps no copy of the pairing: only its readers name it, and they name no store', () => {
        // Vacuity: readPairing names all three fields, or a rename would pass by matching nothing.
        expect(RENDERER.find(({ rel }) => rel === PAIRING_URL_BUILDER)?.pairing.length).toBeGreaterThanOrEqual(3);
        expect(RENDERER.filter(({ rel }) => PAIRING_READERS.has(rel)), 'a pairing reader was renamed or removed').toHaveLength(PAIRING_READERS.size);

        const elsewhere = show(RENDERER.filter(({ rel }) => !PAIRING_READERS.has(rel)).flatMap(({ pairing }) => pairing));
        expect(
            elsewhere,
            `The remote pairing is named outside the files that read it from the main process.\n` +
            `Mission Control state must not hold it: config.json is its one home, the Remote tab reads\n` +
            `settings:get when it is shown, and a copy in mc-state-v5 sits in plain localStorage.\n` +
            elsewhere.join('\n'),
        ).toEqual([]);

        const readersNamingStore = show(RENDERER.filter(({ rel }) => PAIRING_READERS.has(rel)).flatMap(({ store }) => store));
        expect(
            readersNamingStore,
            `A file that reads the pairing names Mission Control's store, so it could save the pairing there:\n` +
            readersNamingStore.join('\n'),
        ).toEqual([]);
    });

    it('(iii) only RemotePairingPanel.tsx imports the modules that turn the settings:get answer into a pairing', () => {
        const importers = RENDERER.flatMap(({ rel, imports }) => imports
            .filter(({ text }) => PAIRING_MODULES.has(text))
            .map(found => ({ rel, found })));
        // Vacuity: the panel's own import must be found, or a resolver change would pass by matching nothing.
        expect(importers.some(({ rel }) => PAIRING_MODULE_IMPORTERS.has(rel))).toBe(true);

        const others = show(importers.filter(({ rel }) => !PAIRING_MODULE_IMPORTERS.has(rel)).map(({ found }) => found));
        expect(
            others,
            `A pairing module (named after each file below) is imported outside RemotePairingPanel.tsx. The\n` +
            `whole module is fenced, a type-only import included: a store file that reads the pairing can save\n` +
            `it into mc-state-v5 under any field name. Draw it, never keep it. If the panel was split into\n` +
            `several files, add each one to PAIRING_MODULE_IMPORTERS and PAIRING_READERS:\n${others.join('\n')}`,
        ).toEqual([]);
    });
});
