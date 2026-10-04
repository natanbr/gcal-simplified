// @vitest-environment node
// ============================================================
// Package key guard — CLAUDE.md → Git & release → "No admin key in a package".
// ------------------------------------------------------------
// vite.config.ts writes VITE_SUPABASE_ANON_KEY from .env into
// dist-electron/main.js, and whatever sits in dist/ and dist-electron/ is what
// electron-builder packs into the public installer. The desktop app needs only
// a public key (the legacy anon JWT or an sb_publishable_ key) for Realtime; a
// service_role JWT or an sb_secret_ key bypasses every Supabase control.
//
// The guard reads the files about to be packaged, not .env: a stale
// dist-electron from an earlier build ships whatever key that build had.
// ============================================================

import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { repoRoot } from './helpers/sourceFiles';
import {
    minifiedBundle, projectFactory, secretWindows,
    syntheticJwt, syntheticPublishableKey, syntheticSecretKey,
} from './helpers/syntheticKeys';
import { beforePack, findAdminKeys, scanProject, PACKAGED_ROOTS } from '../../scripts/package-key-guard.mjs';

const SERVICE_ROLE = syntheticJwt('service_role');
const ANON = syntheticJwt('anon');
const SECRET = syntheticSecretKey();
const PUBLISHABLE = syntheticPublishableKey();

const projects = projectFactory();
afterEach(() => projects.cleanup());

/** A build as `npx vite build` leaves it: the renderer in dist/, the main process in dist-electron/. */
const build = (mainJs: string, rendererJs = 'console.log("renderer")') => ({
    'dist/index.html': '<!doctype html><script src="./assets/index-abc123.js"></script>',
    'dist/assets/index-abc123.js': rendererJs,
    'dist-electron/main.js': mainJs,
    'dist-electron/preload.mjs': 'const{contextBridge}=require("electron");',
});

const contextFor = (projectDir: string, files: unknown = [...PACKAGED_ROOTS]) =>
    ({ packager: { projectDir, config: { files } } });

async function refusal(projectDir: string, files?: unknown): Promise<string> {
    const outcome = await beforePack(contextFor(projectDir, files)).then(
        () => 'packaged',
        (error: unknown) => (error instanceof Error ? error.message : String(error)),
    );
    expect(outcome, 'beforePack let the package through').not.toBe('packaged');
    return outcome;
}

function expectNoSecretIn(text: string, key: string): void {
    const leaked = secretWindows(key).filter(window => text.includes(window));
    expect(leaked, 'the output printed part of the key beyond its 4-character prefix').toEqual([]);
}

describe('package key guard — happy path: public keys package', () => {
    it.each([
        ['a legacy anon JWT', ANON],
        ['an sb_publishable_ key', PUBLISHABLE],
        ['no Supabase key at all', ''],
    ])('packages a build holding %s', async (_label, key) => {
        const dir = projects.make(build(minifiedBundle(key)));
        await expect(beforePack(contextFor(dir))).resolves.toBeUndefined();
        expect(scanProject(dir).hits).toEqual([]);
    });

    it('does not take a bare sb_secret_ prefix for a key (a library checking a key\'s prefix)', () => {
        expect(findAdminKeys('if(k.startsWith("sb_secret_"))throw new Error("secret key in a browser")')).toEqual([]);
    });

    it('ignores JWT-shaped text whose payload is not JSON', () => {
        expect(findAdminKeys('var t="eyJhbGciOi.bm90LWpzb24.c2ln"')).toEqual([]);
    });
});

describe('package key guard — negative: an admin key anywhere in the package is refused', () => {
    it('refuses a service_role JWT in dist-electron/main.js, naming the file and the role', async () => {
        const dir = projects.make(build(minifiedBundle(SERVICE_ROLE)));
        const message = await refusal(dir);
        expect(message).toContain('dist-electron/main.js');
        expect(message).toContain('service_role');
    });

    it('refuses an sb_secret_ key in the renderer bundle, naming the file', async () => {
        const dir = projects.make(build(minifiedBundle(ANON), `const k="${SECRET}";`));
        const message = await refusal(dir);
        expect(message).toContain('dist/assets/index-abc123.js');
        expect(message).toContain('sb_secret');
    });

    it.each([
        ['inside a longer string', `headers:{Authorization:"Bearer ${SERVICE_ROLE}"}`],
        ['glued to the code around it', `x${SERVICE_ROLE}y`],
        ['right after a public key the minifier folded into the same string', `"${ANON}${SERVICE_ROLE}"`],
        ['after a JWT-like fragment that would swallow its header', `"eyJ0.e30.${SERVICE_ROLE}"`],
    ])('finds a service_role JWT %s', (_label, text) => {
        expect(findAdminKeys(text)).toEqual([{ kind: 'service_role', prefix: SERVICE_ROLE.slice(0, 4) }]);
    });

    it('finds an sb_secret_ key glued inside a longer string', () => {
        expect(findAdminKeys(`a="x${SECRET}"`)).toEqual([{ kind: 'sb_secret', prefix: SECRET.slice(0, 4) }]);
    });

    it('says what to do: a publishable or anon key in .env, then rebuild', async () => {
        const dir = projects.make(build(minifiedBundle(SERVICE_ROLE)));
        const message = await refusal(dir);
        expect(message).toContain('VITE_SUPABASE_ANON_KEY');
        expect(message).toContain('sb_publishable_');
        expect(message).toContain('Project Settings → API Keys');
        expect(message).toContain('npx vite build');
    });

    it('prints no part of either key beyond a 4-character prefix', async () => {
        const dir = projects.make(build(minifiedBundle(SERVICE_ROLE), `const k="${SECRET}";`));
        const message = await refusal(dir);
        expectNoSecretIn(message, SERVICE_ROLE);
        expectNoSecretIn(message, SECRET);
    });

    it.each([
        ['a folder it does not read', ['dist', 'dist-electron', 'public'], 'public'],
        ['the same, in the form electron-builder hands the hook', [{ filter: ['dist', 'dist-electron', 'public'] }], 'public'],
        ['files copied from elsewhere', [{ filter: ['dist', 'dist-electron'] }, { from: 'assets', to: 'assets' }], 'assets'],
        ['no files list, so electron-builder packs the whole project', [], 'whole project'],
    ])('refuses a config that packages %s', async (_label, files, named) => {
        const dir = projects.make(build(minifiedBundle(ANON)));
        expect(await refusal(dir, files)).toContain(named);
    });

    it('accepts the normalized form of the files it reads', async () => {
        const dir = projects.make(build(minifiedBundle(ANON)));
        await expect(beforePack(contextFor(dir, [{ filter: [...PACKAGED_ROOTS] }]))).resolves.toBeUndefined();
    });
});

describe('package key guard — lifecycle: what is on disk is what ships', () => {
    it('refuses a stale dist-electron from an earlier build even though .env is clean now', async () => {
        const dir = projects.make({ ...build(minifiedBundle(SERVICE_ROLE)), '.env': `VITE_SUPABASE_ANON_KEY=${ANON}\n` });
        const message = await refusal(dir);
        expect(message).toContain('dist-electron/main.js');
    });

    it('packages once that build is replaced by one made with a public key', async () => {
        const dir = projects.make(build(minifiedBundle(SERVICE_ROLE)));
        await refusal(dir);
        projects.write(dir, 'dist-electron/main.js', minifiedBundle(ANON));
        await expect(beforePack(contextFor(dir))).resolves.toBeUndefined();
    });

    it('refuses when there is no build to check, rather than passing over nothing', async () => {
        const dir = projects.make({ 'package.json': '{}' });
        const message = await refusal(dir);
        expect(message).toContain('npx vite build');
    });
});

describe('package key guard — the command /release runs before the bump', () => {
    const SCRIPT = join(repoRoot, 'scripts/package-key-guard.mjs');
    const run = (cwd: string) => spawnSync(process.execPath, [SCRIPT], { cwd, encoding: 'utf8' });

    it('exits 1 on a stale admin key and 0 once the build is clean, printing no key', () => {
        const dir = projects.make(build(minifiedBundle(SERVICE_ROLE)));
        const refused = run(dir);
        expect(refused.status).toBe(1);
        expect(refused.stderr).toContain('dist-electron/main.js');
        expectNoSecretIn(refused.stdout + refused.stderr, SERVICE_ROLE);

        projects.write(dir, 'dist-electron/main.js', minifiedBundle(ANON));
        const passed = run(dir);
        expect(passed.status, passed.stderr).toBe(0);
    });

    it('exits 1 when run where there is no build', () => {
        const dir = projects.make({ 'package.json': '{}' });
        expect(run(dir).status).toBe(1);
    });
});
