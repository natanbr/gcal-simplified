// @vitest-environment node
// ============================================================
// Package key guard — what counts as an admin key, in the forms a bundle or a
// packaged file can hold one, and what must not count. The hook, the config
// checks and the command are in package-key-guard.test.ts.
// ============================================================

import { describe, it, expect, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import {
    deterministicBase64, minifiedBundle, projectFactory, syntheticJwt,
    syntheticPublishableKey, syntheticSecretKey, utf16, viteBuild,
} from './helpers/syntheticKeys';
import { checkProject, findAdminKeys } from '../../scripts/package-key-guard.js';

const SERVICE_ROLE = syntheticJwt('service_role');
const ANON = syntheticJwt('anon');
const SECRET = syntheticSecretKey();
const HIT = [{ kind: 'service_role', prefix: SERVICE_ROLE.slice(0, 4) }];
const [HEADER, PAYLOAD, SIGNATURE] = SERVICE_ROLE.split('.');
const middle = (key: string) => Math.floor(key.length / 2);

const projects = projectFactory();
afterEach(() => projects.cleanup());

describe('package key guard — a key not held as one plain run of characters', () => {
    it.each([
        ['split across string literals joined with +', `var k="${SERVICE_ROLE.slice(0, middle(SERVICE_ROLE))}"+"${SERVICE_ROLE.slice(middle(SERVICE_ROLE))}";`],
        ['split across lines and quote styles', `var k = '${HEADER}.' +\n    "${PAYLOAD}." + \`${SIGNATURE}\`;`],
        ['with its dots written \\u002e', `"${HEADER}\\u002e${PAYLOAD}\\u002E${SIGNATURE}"`],
        ['with its dots written \\x2e', `"${HEADER}\\x2e${PAYLOAD}\\x2e${SIGNATURE}"`],
        ['with its dots escaped', `"${HEADER}\\.${PAYLOAD}\\.${SIGNATURE}"`],
        ['in JSON that escapes its slashes', `{"url":"https:\\/\\/synthetic.supabase.co","key":"${SERVICE_ROLE}"}`],
    ])('finds a service_role JWT %s', (_label, text) => {
        expect(findAdminKeys(text)).toEqual(HIT);
    });

    it('finds an sb_secret_ key split across string literals', () => {
        const text = `const k="${SECRET.slice(0, 14)}" + "${SECRET.slice(14)}";`;
        expect(findAdminKeys(text)).toEqual([{ kind: 'sb_secret', prefix: SECRET.slice(0, 4) }]);
    });

    it.each([
        ['ES256 with a key id', { alg: 'ES256', kid: 'synthetic-key-id', typ: 'JWT' }],
        ['RS256 without typ', { alg: 'RS256' }],
    ])('finds a service_role JWT whose header is %s', (_label, header) => {
        const key = syntheticJwt('service_role', header);
        expect(findAdminKeys(minifiedBundle(key))).toEqual([{ kind: 'service_role', prefix: key.slice(0, 4) }]);
    });

    it.each(['le', 'be'] as const)('finds a key in a UTF-16 (%s) file', order => {
        const dir = projects.make({ ...viteBuild(minifiedBundle(ANON)), 'dist/strings.txt': utf16(`key=${SERVICE_ROLE}`, order) });
        expect(checkProject(dir).problem).toContain('dist/strings.txt: a JWT with role "service_role"');
    });

    it('finds a key in a source map', () => {
        const map = JSON.stringify({ version: 3, sources: ['../electron/main.ts'], sourcesContent: [`const key = "${SERVICE_ROLE}";`], mappings: 'AAAA' });
        const dir = projects.make({ ...viteBuild(minifiedBundle(ANON)), 'dist-electron/main.js.map': map });
        expect(checkProject(dir).problem).toContain('dist-electron/main.js.map');
    });
});

describe('package key guard — no false positive', () => {
    it.each([
        ['an anon JWT', ANON],
        ['an anon JWT split across string literals', `"${ANON.slice(0, middle(ANON))}"+"${ANON.slice(middle(ANON))}"`],
        ['an anon JWT with escaped dots', ANON.replaceAll('.', '\\u002e')],
        ['an sb_publishable_ key', syntheticPublishableKey()],
        ['a JWT with no role claim', `${HEADER}.${Buffer.from('{"iss":"supabase"}').toString('base64url')}.${SIGNATURE}`],
    ])('finds nothing in %s', (_label, text) => {
        expect(findAdminKeys(`var k="${text}";`)).toEqual([]);
    });

    it('finds nothing in a megabyte of random base64 full of JWT-shaped runs', () => {
        const noise = deterministicBase64(1_000_000).replace(/(.{500})(.{3})/g, '$1eyJ');
        expect(findAdminKeys(noise)).toEqual([]);
    });

    it('finds nothing in a file of random bytes (NUL bytes included)', () => {
        const bytes = Buffer.concat(Array.from({ length: 4096 }, (_, i) => createHash('sha256').update(`bytes-${i}`).digest()));
        const dir = projects.make({ ...viteBuild(minifiedBundle(ANON)), 'dist/assets/font.woff2': bytes });
        expect(checkProject(dir).problem).toBeNull();
    });
});

describe('package key guard — a file too large to read', () => {
    it('refuses it by name rather than packaging it unchecked', () => {
        const dir = projects.make(viteBuild(minifiedBundle(ANON)));
        const { problem } = checkProject(dir, { maxFileBytes: 64 });
        expect(problem).toContain('dist-electron/main.js');
        expect(problem).toMatch(/larger than/);
    });
});
