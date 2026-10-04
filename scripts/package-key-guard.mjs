// ============================================================
// Package key guard: no installer ships an admin Supabase key.
// ------------------------------------------------------------
// vite.config.ts writes VITE_SUPABASE_ANON_KEY from .env into
// dist-electron/main.js. The desktop app needs only a public key there (the
// legacy anon JWT or an sb_publishable_ key: Realtime broadcast). A
// service_role JWT or an sb_secret_ key bypasses every Supabase control, and
// anyone who downloads the installer can read it.
//
// Runs as electron-builder's beforePack hook (electron-builder.json5), so every
// packaging path runs it: `npm run build`, `npx electron-builder` and /release's
// publish command. Not in `vite build`: local E2E and QA build with whatever
// .env holds. It reads the files about to be packaged, never .env, because a
// stale dist-electron ships the key of the build that made it.
//
// `node scripts/package-key-guard.mjs` runs the same check on the build in the
// current folder (/release runs it before the version bump).
//
// It never prints a key: at most its first 4 characters.
// ============================================================

import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The folders electron-builder.json5 packages (`files`). The hook refuses a config that packages anything else. */
export const PACKAGED_ROOTS = Object.freeze(['dist', 'dist-electron']);

const PREFIX_LENGTH = 4;
const JWT_AT = /eyJ[A-Za-z0-9_-]*\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]*/y;
// A body is required: a library checking a key's prefix holds the bare "sb_secret_".
const SECRET_KEY = /sb_secret_[A-Za-z0-9_-]{16,}/g;

function roleOf(payloadSegment) {
    try {
        const claims = JSON.parse(Buffer.from(payloadSegment, 'base64url').toString('utf8'));
        return claims !== null && typeof claims === 'object' ? claims.role : undefined;
    } catch {
        return undefined;
    }
}

/** Every distinct admin key in `text`, as its kind and a 4-character prefix. */
export function findAdminKeys(text) {
    const keys = new Map();
    // Every "eyJ" is tried as a start, overlapping: in a minified bundle the
    // token before a key (another key the minifier folded into the same string)
    // runs straight into it, and a match from there would swallow its header.
    for (let at = text.indexOf('eyJ'); at !== -1; at = text.indexOf('eyJ', at + 1)) {
        JWT_AT.lastIndex = at;
        const match = JWT_AT.exec(text);
        if (match && roleOf(match[1]) === 'service_role') keys.set(match[0], 'service_role');
    }
    for (const [key] of text.matchAll(SECRET_KEY)) keys.set(key, 'sb_secret');
    return [...keys].map(([key, kind]) => ({ kind, prefix: key.slice(0, PREFIX_LENGTH) }));
}

function filesUnder(directory, seen = new Set()) {
    let entries;
    try {
        entries = readdirSync(directory);
    } catch {
        return [];
    }
    const real = realpathSync(directory);
    if (seen.has(real)) return [];
    seen.add(real);
    return entries.flatMap(entry => {
        const path = join(directory, entry);
        return statSync(path).isDirectory() ? filesUnder(path, seen) : [path];
    });
}

/** Reads every file under PACKAGED_ROOTS in `projectDir`. */
export function scanProject(projectDir) {
    const files = PACKAGED_ROOTS.flatMap(root => filesUnder(join(projectDir, root)));
    const hits = files.flatMap(file => findAdminKeys(readFileSync(file, 'latin1')).map(key => ({
        file: relative(projectDir, file).split(sep).join('/'),
        ...key,
    })));
    return { files: files.length, hits };
}

function describeKey({ kind, prefix }) {
    return kind === 'sb_secret' ? `an sb_secret_ key (starts "${prefix}…")` : `a JWT with role "${kind}" (starts "${prefix}…")`;
}

/** What is wrong with the build in `projectDir`, or null. */
function problemWith(projectDir) {
    const { files, hits } = scanProject(projectDir);
    if (files === 0) {
        return {
            files,
            problem: `Nothing to check: no files in ${PACKAGED_ROOTS.join(' or ')} under ${projectDir}. ` +
                'Build first (npx vite build), then package.',
        };
    }
    if (hits.length === 0) return { files, problem: null };
    return {
        files,
        problem: [
            'Refusing to package: an admin Supabase key is in the files electron-builder packs into the installer.',
            ...hits.map(hit => `  ${hit.file}: ${describeKey(hit)}`),
            'An admin key bypasses every Supabase control, and anyone with the installer can read it.',
            'The desktop app needs only a public key, for Realtime.',
            "Fix: in .env, set VITE_SUPABASE_ANON_KEY to the project's publishable key (sb_publishable_…) or its",
            'legacy anon key (Supabase dashboard → Project Settings → API Keys). Then delete dist and dist-electron',
            '(vite build does not empty them) and rebuild with `npx vite build`. If .env already holds a public key,',
            'this build is stale: the same rebuild replaces it.',
        ].join('\n'),
    };
}

/** The patterns electron-builder packages. It hands the hook its normalized form,
 *  `[{ filter: [...] }]`; a config can also give plain strings. */
function packagedPatterns(files) {
    return [files ?? []].flat().flatMap(entry => {
        if (typeof entry === 'string') return [entry];
        if (entry !== null && typeof entry === 'object' && entry.from == null && entry.to == null) {
            return [entry.filter ?? []].flat();
        }
        return [JSON.stringify(entry)]; // a file set copied from elsewhere: not read by this guard
    });
}

/** electron-builder's beforePack hook: a throw stops the packaging. */
export async function beforePack(context) {
    const { projectDir, config } = context.packager;
    const patterns = packagedPatterns(config.files);
    const unscanned = patterns.filter(pattern => !pattern.startsWith('!') && !PACKAGED_ROOTS.includes(pattern));
    if (patterns.length === 0 || unscanned.length > 0) {
        throw new Error(
            `Refusing to package: electron-builder's "files" packages ${unscanned.join(', ') || 'the whole project (no files list)'}, ` +
            `which this guard does not read. It reads only ${PACKAGED_ROOTS.join(', ')}: ` +
            'add the folder to PACKAGED_ROOTS in scripts/package-key-guard.mjs.',
        );
    }
    const { problem } = problemWith(projectDir);
    if (problem) throw new Error(problem);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const { files, problem } = problemWith(process.cwd());
    if (problem) {
        console.error(problem);
        process.exit(1);
    }
    console.log(`No admin Supabase key in ${PACKAGED_ROOTS.join(', ')} (${files} files read).`);
}
