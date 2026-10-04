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
import { pathToFileURL } from 'node:url';
import { repoRoot } from './helpers/sourceFiles';
import {
    minifiedBundle, projectFactory, secretWindows,
    syntheticJwt, syntheticPublishableKey, syntheticSecretKey, viteBuild as build,
} from './helpers/syntheticKeys';
import {
    beforePack, findAdminKeys, invokedDirectly, scanProject, PACKAGED_ROOTS, type PackContext,
} from '../../scripts/package-key-guard.js';

const SERVICE_ROLE = syntheticJwt('service_role');
const ANON = syntheticJwt('anon');
const SECRET = syntheticSecretKey();
const PUBLISHABLE = syntheticPublishableKey();

const projects = projectFactory();
afterEach(() => projects.cleanup());

interface Overrides {
    /** More top-level config (extraResources, extraFiles). */
    config?: Record<string, unknown>;
    /** The platform level electron-builder merges in (win, mac or linux). */
    platform?: Record<string, unknown>;
    /** Where electron-builder takes `files` from, when not the project folder. */
    appDir?: string;
}

const contextFor = (projectDir: string, files: unknown = [...PACKAGED_ROOTS], overrides: Overrides = {}): PackContext => ({
    packager: {
        projectDir,
        info: { appDir: overrides.appDir ?? projectDir },
        config: { files, ...overrides.config },
        platformSpecificBuildOptions: overrides.platform ?? {},
    },
});

async function refusal(projectDir: string, files?: unknown, overrides?: Overrides): Promise<string> {
    const outcome = await beforePack(contextFor(projectDir, files, overrides)).then(
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

    it('says what to do: the publishable key wherever the build reads it, a clean rebuild, and revoking a key that shipped', async () => {
        const dir = projects.make(build(minifiedBundle(SERVICE_ROLE)));
        const message = await refusal(dir);
        expect(message).toContain('VITE_SUPABASE_ANON_KEY');
        expect(message).toContain('sb_publishable_');
        expect(message).toContain('Project Settings → API Keys');
        // vite's loadEnv reads all four files in production mode, and the environment over them.
        for (const source of ['.env,', '.env.local', '.env.production,', '.env.production.local', 'environment']) {
            expect(message).toContain(source);
        }
        expect(message).toContain('npx vite build');
        expect(message).toMatch(/revoke or rotate/);
        expect(message).toMatch(/withdraw/);
    });

    it('recommends only the publishable key: a legacy anon JWT stops working when the legacy JWT secret is rotated', async () => {
        const dir = projects.make(build(minifiedBundle(SERVICE_ROLE)));
        expect(await refusal(dir)).not.toMatch(/anon key|anon JWT/i);
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
        ['a file set with only a source', [{ filter: [...PACKAGED_ROOTS] }, { from: 'assets', filter: ['**/*'] }], 'assets'],
        ['a file set with only a destination', [{ filter: [...PACKAGED_ROOTS] }, { to: 'extra', filter: ['dist'] }], 'extra'],
        ['no files list, so electron-builder packs the whole project', [], 'whole project'],
        ['only exclusions (-c.files=\'!**/*.map\'), which packs the whole project', [{ filter: ['!**/*.map'] }], 'whole project'],
        ['a double negation, which includes again', ['dist', 'dist-electron', '!!.env'], '!!.env'],
        ['a pattern that climbs out with ..', ['dist', 'dist-electron', '!x/../.env'], '!x/../.env'],
    ])('refuses a config that packages %s', async (_label, files, named) => {
        const dir = projects.make(build(minifiedBundle(ANON)));
        expect(await refusal(dir, files)).toContain(named);
    });

    it.each([
        ['platform-level files', { platform: { files: ['src'] } }, 'src'],
        ['platform-level extraResources', { platform: { extraResources: ['assets'] } }, 'extraResources'],
        ['platform-level extraFiles', { platform: { extraFiles: [{ from: 'bin' }] } }, 'extraFiles'],
        ['top-level extraResources', { config: { extraResources: 'assets' } }, 'extraResources'],
        ['top-level extraFiles', { config: { extraFiles: ['bin'] } }, 'extraFiles'],
    ])('refuses %s, which add files the guard does not read', async (_label, overrides, named) => {
        const dir = projects.make(build(minifiedBundle(ANON)));
        expect(await refusal(dir, undefined, overrides)).toContain(named);
    });

    it('reads the folder electron-builder takes the files from (appDir), not the project folder', async () => {
        const project = projects.make(build(minifiedBundle(ANON)));
        const app = projects.make(build(minifiedBundle(SERVICE_ROLE)));
        expect(await refusal(project, undefined, { appDir: app })).toContain('dist-electron/main.js');
    });

    it('reads a packaged root that is a file, not a folder', async () => {
        const dir = projects.make({ 'dist/index.html': '<!doctype html>', 'dist-electron': minifiedBundle(SERVICE_ROLE) });
        expect(await refusal(dir)).toContain('dist-electron: a JWT with role "service_role"');
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
    const SCRIPT = join(repoRoot, 'scripts/package-key-guard.js');
    const run = (cwd: string, script = SCRIPT) => spawnSync(process.execPath, [script], { cwd, encoding: 'utf8' });

    it('exits 1 on a stale admin key, and 0 with its success line once the build is clean, printing no key', () => {
        const dir = projects.make(build(minifiedBundle(SERVICE_ROLE)));
        const refused = run(dir);
        expect(refused.status).toBe(1);
        expect(refused.stderr).toContain('dist-electron/main.js');
        expectNoSecretIn(refused.stdout + refused.stderr, SERVICE_ROLE);

        projects.write(dir, 'dist-electron/main.js', minifiedBundle(ANON));
        const passed = run(dir);
        expect(passed.status, passed.stderr).toBe(0);
        // /release step 5 requires this line: an exit 0 without it means the check never ran.
        expect(passed.stdout).toMatch(/^No admin Supabase key in dist, dist-electron \(\d+ files read\)\./);
    });

    it('runs when named without its .js extension', () => {
        const dir = projects.make(build(minifiedBundle(SERVICE_ROLE)));
        expect(run(dir, SCRIPT.replace(/\.js$/, '')).status).toBe(1);
    });

    it('exits 1 when run where there is no build', () => {
        const dir = projects.make({ 'package.json': '{}' });
        expect(run(dir).status).toBe(1);
    });

    it('knows it was run directly from the entry path Node was given, by its real path', () => {
        const url = pathToFileURL(SCRIPT).href;
        expect(invokedDirectly(url, SCRIPT)).toBe(true);
        expect(invokedDirectly(url, SCRIPT.replace(/\.js$/, ''))).toBe(true);
        expect(invokedDirectly(url, join(repoRoot, 'scripts/clean-tests.js'))).toBe(false);
        expect(invokedDirectly(url, join(repoRoot, 'node_modules/electron-builder/cli.js'))).toBe(false);
        expect(invokedDirectly(url, undefined)).toBe(false);
    });
});
