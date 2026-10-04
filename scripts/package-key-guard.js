// ============================================================
// Package key guard: no package made from this config holds an admin Supabase key
// in dist/ or dist-electron/. (electron-builder also packs package.json and the
// production node_modules, which this guard does not read.)
// ------------------------------------------------------------
// vite.config.ts writes VITE_SUPABASE_ANON_KEY into dist-electron/main.js. The
// desktop app needs only the project's publishable key there (Realtime
// broadcast). A service_role JWT or an sb_secret_ key bypasses every Supabase
// control, and anyone who downloads the installer can read it.
//
// It is electron-builder's beforePack hook (electron-builder.json5), so it runs
// for every package electron-builder makes from that config: `npm run build`,
// `npm run release` and /release's publish command. A run that replaces the
// config or the project (`--config`, `-c.beforePack=…`, `--projectDir`) or
// packs a prepackaged app (`--prepackaged`) can skip it; those commands are
// pinned without such flags by src/__tests__/package-key-guard-wiring.test.ts.
// Not in `vite build`, so local E2E and QA build with whatever .env holds. It
// reads the files about to be packaged, never .env, because a stale
// dist-electron ships the key of the build that made it.
//
// `node scripts/package-key-guard.js` runs the same check on the build in the
// current folder (/release runs it before the QA pass and the version bump).
//
// It never prints a key: at most its first 4 characters.
// ============================================================

import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The folders electron-builder.json5 packages (`files`). The hook refuses a config that packages anything else. */
export const PACKAGED_ROOTS = Object.freeze(['dist', 'dist-electron']);

/** Larger files are refused, not read: a JavaScript string holds at most about 512 MB. */
export const MAX_FILE_BYTES = 256 * 1024 * 1024;

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

/** The text as written, and as it reads with string literals joined (`"ab" + "cd"`)
 *  and escaped dots (`\.`, `\x2e`, `\u002e`) written plainly. Each is scanned. */
function readings(text) {
    const joined = text
        .replace(/["'`]\s*\+\s*["'`]/g, '')
        .replace(/\\(?:u002[eE]|x2[eE]|\.)/g, '.');
    return joined === text ? [text] : [text, joined];
}

/** Every distinct admin key in `text`, as its kind and a 4-character prefix. */
export function findAdminKeys(text) {
    const keys = new Map();
    for (const reading of readings(text)) {
        // Every "eyJ" is tried as a start, overlapping: in a minified bundle the
        // token before a key (another key the minifier folded into the same string)
        // runs straight into it, and a match from there would swallow its header.
        for (let at = reading.indexOf('eyJ'); at !== -1; at = reading.indexOf('eyJ', at + 1)) {
            JWT_AT.lastIndex = at;
            const match = JWT_AT.exec(reading);
            if (match && roleOf(match[1]) === 'service_role') keys.set(match[0], 'service_role');
        }
        for (const [key] of reading.matchAll(SECRET_KEY)) keys.set(key, 'sb_secret');
    }
    return [...keys].map(([key, kind]) => ({ kind, prefix: key.slice(0, PREFIX_LENGTH) }));
}

/** A file's text as latin1 (every byte one character), and, when it holds NUL
 *  bytes, again without them: UTF-16 text (either byte order) then reads as ASCII. */
function textsOf(bytes) {
    const text = bytes.toString('latin1');
    return text.includes('\0') ? [text, text.replaceAll('\0', '')] : [text];
}

/** Every file at or under `path` (a root may be a file). A root that does not exist has none. */
function filesAt(path, seen = new Set()) {
    let stats;
    try {
        stats = statSync(path);
    } catch (error) {
        if (error.code === 'ENOENT') return [];
        throw error;
    }
    if (!stats.isDirectory()) return [{ path, bytes: stats.size }];
    const real = realpathSync(path);
    if (seen.has(real)) return [];
    seen.add(real);
    return readdirSync(path).flatMap(entry => filesAt(join(path, entry), seen));
}

/** Reads every file under PACKAGED_ROOTS in `appDir`. */
export function scanProject(appDir, { maxFileBytes = MAX_FILE_BYTES } = {}) {
    const files = PACKAGED_ROOTS.flatMap(root => filesAt(join(appDir, root)));
    const name = path => relative(appDir, path).split(sep).join('/');
    const unread = files.filter(file => file.bytes > maxFileBytes).map(file => ({ file: name(file.path), bytes: file.bytes }));
    const hits = files.filter(file => file.bytes <= maxFileBytes).flatMap(file => {
        const keys = new Map();
        for (const text of textsOf(readFileSync(file.path))) {
            for (const key of findAdminKeys(text)) keys.set(`${key.kind}:${key.prefix}`, key);
        }
        return [...keys.values()].map(key => ({ file: name(file.path), ...key }));
    });
    return { files: files.length, hits, unread };
}

function describeKey({ kind, prefix }) {
    return kind === 'sb_secret' ? `an sb_secret_ key (starts "${prefix}…")` : `a JWT with role "${kind}" (starts "${prefix}…")`;
}

const FIX = [
    "Fix: set VITE_SUPABASE_ANON_KEY to the project's publishable key (sb_publishable_…, Supabase dashboard →",
    'Project Settings → API Keys) wherever the build reads it: .env, .env.local, .env.production,',
    '.env.production.local, or the environment, which overrides them all. Then delete dist and dist-electron, so',
    'no file from an earlier build survives, and rebuild with `npx vite build`.',
    'An admin key that was ever packaged into an installer must be treated as public: revoke or rotate it in the',
    'Supabase dashboard, and withdraw any installer that holds it.',
];

/** The refusal for the build in `appDir`, or a null problem. */
export function checkProject(appDir, options) {
    const { files, hits, unread } = scanProject(appDir, options);
    if (files === 0) {
        return {
            files,
            problem: `Nothing to check: no files in ${PACKAGED_ROOTS.join(' or ')} under ${appDir}. ` +
                'Build first (npx vite build), then package.',
        };
    }
    const lines = [
        ...hits.map(hit => `  ${hit.file}: ${describeKey(hit)}`),
        ...unread.map(({ file, bytes }) => `  ${file}: ${Math.ceil(bytes / 2 ** 20)} MB, larger than this guard reads; refused rather than packed unchecked`),
    ];
    if (lines.length === 0) return { files, problem: null };
    return {
        files,
        problem: [
            hits.length > 0
                ? 'Refusing to package: an admin Supabase key is in the files electron-builder packs into the installer.'
                : 'Refusing to package: a file electron-builder packs into the installer is too large to check for an admin Supabase key.',
            ...lines,
            ...(hits.length > 0 ? ['An admin key bypasses every Supabase control, and anyone with the installer can read it.', ...FIX] : []),
        ].join('\n'),
    };
}

/** The patterns in a `files` value. electron-builder hands the hook the top
 *  level normalized (`[{ filter: [...] }]`) and the platform level as written. */
function patternsOf(files) {
    return [files ?? []].flat().flatMap(entry => {
        if (typeof entry === 'string') return [entry];
        if (entry !== null && typeof entry === 'object' && entry.from == null && entry.to == null) {
            return [entry.filter ?? []].flat();
        }
        return [JSON.stringify(entry)]; // a file set with its own source or destination: not read by this guard
    });
}

/** What the config packages that this guard does not read. */
function configProblems(levels) {
    const problems = [];
    const patterns = levels.flatMap(options => patternsOf(options?.files));
    if (!patterns.some(pattern => typeof pattern === 'string' && !pattern.startsWith('!'))) {
        problems.push('"files" includes no folder, so electron-builder packs the whole project');
    }
    for (const pattern of patterns) {
        const escapes = typeof pattern !== 'string' || pattern.startsWith('!!') || pattern.split(/[\\/]/).includes('..');
        if (escapes || (!pattern.startsWith('!') && !PACKAGED_ROOTS.includes(pattern))) {
            problems.push(`"files" packages ${typeof pattern === 'string' ? pattern : JSON.stringify(pattern)}`);
        }
    }
    for (const key of ['extraResources', 'extraFiles']) {
        if (levels.some(options => patternsOf(options?.[key]).length > 0)) problems.push(`${key} adds files`);
    }
    return problems;
}

/** electron-builder's beforePack hook: a throw stops the packaging. */
export async function beforePack(context) {
    const { packager } = context;
    const problems = configProblems([packager.config, packager.platformSpecificBuildOptions]);
    if (problems.length > 0) {
        throw new Error(
            `Refusing to package: ${problems.join('; ')}, which this guard does not read. ` +
            `It reads only ${PACKAGED_ROOTS.join(', ')}: package only those folders, or teach the guard ` +
            '(PACKAGED_ROOTS in scripts/package-key-guard.js) to read the new ones first.',
        );
    }
    const { problem } = checkProject(packager.info?.appDir ?? packager.projectDir);
    if (problem) throw new Error(problem);
}

/** Whether the module at `moduleUrl` is the entry Node was started with, by real
 *  path: Node accepts the entry without its extension and through a link. */
export function invokedDirectly(moduleUrl, entry) {
    if (!entry) return false;
    try {
        const resolved = createRequire(moduleUrl).resolve(resolve(entry));
        return realpathSync.native(resolved) === realpathSync.native(fileURLToPath(moduleUrl));
    } catch {
        return false;
    }
}

if (import.meta.main ?? invokedDirectly(import.meta.url, process.argv[1])) {
    const { files, problem } = checkProject(process.cwd());
    if (problem) {
        console.error(problem);
        process.exit(1);
    }
    console.log(`No admin Supabase key in ${PACKAGED_ROOTS.join(', ')} (${files} files read).`);
}
