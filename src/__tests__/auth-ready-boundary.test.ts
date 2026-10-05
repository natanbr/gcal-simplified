// ============================================================
// Google credentials load after ready — structural pin (source-reading test).
// ------------------------------------------------------------
// electron/auth_app_ready.test.ts proves auth.ts itself touches no safeStorage
// method while it is imported. It cannot see a CALLER: a module-scope
// `authService.isAuthenticated()` in main.ts runs while main.js is imported,
// before `app` is ready, so it throws and no window opens on any launch, yet
// every suite that loads main.ts mocks './auth' (a reviewer added exactly that
// line and all 2234 unit tests stayed green, 2026-10-01). So this walks every
// production file under electron/ with the TypeScript parser
// (helpers/importTimeReads.ts) and lists the code that runs on import and reads
// `authService` or `safeStorage`, or opens an electron-store (a corrupt
// auth-store.json then threw before the single-instance lock and no window
// opened, 2026-10-04).
//
// "Runs on import", followed within the same file: module-scope statements; an
// immediately invoked arrow or function expression; a function declaration,
// or a `const` arrow or function expression, called at module scope or as a
// template tag (with its default parameters, and what it calls in turn); a
// same-file class's static method (`Boot.warm()`) and a same-file object's
// method or arrow (`tray.warm()`) called at module scope; a class's decorators,
// heritage, computed member names, static initializers and static blocks; every
// instance field initializer (wherever the class is built); and for `new X()`,
// X's constructor, the same-file constructors it inherits, and the methods,
// arrow properties and getters reached through `this.` from them, on X or a
// same-file base class.
// Resolved: renamed imports, `* as x`, electron's default import, an alias or
// destructuring of authService/safeStorage at module scope (flagged itself), and
// electron-store taken as a default, `{ default as X }`, `* as x` or a subclass.
// Each shape has its own probe below.
//
// Not covered: a function or class imported from another file and called or
// built at module scope; a function held in a `let` or `var` that is assigned
// again before the call; a callback that a module-scope call runs straight away
// (`[1].forEach(() => authService.x())`); computed access (`x['safeStorage']`,
// `this[name]()`); reflection (`Reflect.construct`, `.call`/`.apply`); a method
// reached through `super.` or through an object other than `this`; and a value
// reached through what a function returns. auth_app_ready's import case covers
// auth.ts itself whatever the shape.
//
// verifiedRedBy: see the registry entry in rule-registry.test.ts.
// ============================================================

import { describe, it, expect } from 'vitest';
import { productionSources, readSource, toRepoPath } from './helpers/sourceFiles';
import { importTimeReads } from './helpers/importTimeReads';

const SOURCES = productionSources(['electron']).map(f => ({ path: toRepoPath(f), code: readSource(f) }));

const PROBES: Array<[shape: string, lines: string[], flagged: string[]]> = [
    ['a module-scope read', ['authService.isAuthenticated();', 'const available = safeStorage.isEncryptionAvailable();'],
        ['1 authService.isAuthenticated', '2 safeStorage.isEncryptionAvailable']],
    ['a read inside a handler or a whenReady callback (not import time)', [
        "ipcMain.handle('auth:check', () => authService.isAuthenticated());",
        'app.whenReady().then(function () { safeStorage.decryptString(blob); });',
    ], []],
    ['a renamed import', ["import { authService as auth } from './auth';", 'auth.isAuthenticated();'], ['2 auth.isAuthenticated']],
    ['a namespace import', ["import * as electron from 'electron';", 'electron.safeStorage.isEncryptionAvailable();'],
        ['2 electron.safeStorage.isEncryptionAvailable']],
    ["electron's default import", ["import electron from 'electron';", 'electron.safeStorage.decryptString(blob);'],
        ['2 electron.safeStorage.decryptString']],
    ['an arrow IIFE', ['(() => authService.getAuthClient())();'], ['1 authService.getAuthClient']],
    ['a function-expression IIFE', ['(function () { safeStorage.isEncryptionAvailable(); })();'], ['1 safeStorage.isEncryptionAvailable']],
    ['a function declaration called at module scope, and what it calls', [
        'function check() { return helper(); }',
        'function helper() { return authService.isAuthenticated(); }',
        'function later() { return authService.getAuthClient(); }',
        'check();',
    ], ['2 authService.isAuthenticated']],
    ['an arrow helper called at module scope', ['const warmUp = () => authService.isAuthenticated();', 'warmUp();'],
        ['1 authService.isAuthenticated']],
    ['a function-expression helper called at module scope', [
        'const warmUp = function () { return safeStorage.isEncryptionAvailable(); };', 'warmUp();',
    ], ['1 safeStorage.isEncryptionAvailable']],
    ['a default parameter', ['function f(ready = authService.isAuthenticated()) { return ready; }', 'f();'],
        ['1 authService.isAuthenticated']],
    ['a template tag', ['function tag() { return authService.isAuthenticated(); }', 'tag`now`;'], ['1 authService.isAuthenticated']],
    ['a static initializer', ['class A { static peek = authService.isAuthenticated(); }'], ['1 authService.isAuthenticated']],
    ['a static block', ['class A { static { safeStorage.isEncryptionAvailable(); } }'], ['1 safeStorage.isEncryptionAvailable']],
    ['an instance field, wherever the class is built', ['export class A { signedIn = authService.isAuthenticated(); }'],
        ['1 authService.isAuthenticated']],
    ['a class-expression singleton', [
        'const Bridge = class { constructor() { authService.isAuthenticated(); } };', 'export const bridge = new Bridge();',
    ], ['1 authService.isAuthenticated']],
    ['a constructor and the method it calls through this', [
        'class Service {',
        '    constructor() { this.load(); }',
        '    load() { return safeStorage.decryptString(blob); }',
        '    unused() { return authService.isAuthenticated(); }',
        '}',
        'export const service = new Service();',
    ], ['3 safeStorage.decryptString']],
    ['an arrow property called through this', [
        'class Tray {', '    private refresh = () => authService.isAuthenticated();', '    constructor() { this.refresh(); }', '}', 'const tray = new Tray();',
    ], ['2 authService.isAuthenticated']],
    ['a getter read through this', [
        'class Tray {', '    get signedIn() { return authService.isAuthenticated(); }', '    constructor() { if (this.signedIn) { /* */ } }', '}', 'new Tray();',
    ], ['2 authService.isAuthenticated']],
    ['a static method called at module scope', [
        'class Boot { static warm() { return authService.isAuthenticated(); } }', 'Boot.warm();',
    ], ['1 authService.isAuthenticated']],
    ['an object method and an object arrow called at module scope', [
        'const tray = {',
        '    warm() { return authService.isAuthenticated(); },',
        '    peek: () => safeStorage.isEncryptionAvailable(),',
        '    later() { return authService.getAuthClient(); },',
        '};',
        'tray.warm();',
        'tray.peek();',
    ], ['2 authService.isAuthenticated', '3 safeStorage.isEncryptionAvailable']],
    ['an inherited method called through this from a child constructor', [
        'class Base { load() { return safeStorage.decryptString(blob); } }',
        'class Child extends Base { constructor() { super(); this.load(); } }',
        'new Child();',
    ], ['1 safeStorage.decryptString']],
    ['an inherited constructor', [
        'class Base { constructor() { safeStorage.isEncryptionAvailable(); } }', 'class Child extends Base {}', 'new Child();',
    ], ['1 safeStorage.isEncryptionAvailable']],
    ['a heritage expression', ['class Mixed extends pick(authService.isAuthenticated()) {}'], ['1 authService.isAuthenticated']],
    ['a decorator and a computed member name', [
        '@track(authService.isAuthenticated())', 'class A { [safeStorage.isEncryptionAvailable() ? "a" : "b"]() { return 1; } }',
    ], ['1 authService.isAuthenticated', '2 safeStorage.isEncryptionAvailable']],
    ['an alias and a destructuring', ['const s = safeStorage;', 'const { isAuthenticated } = authService;'],
        ['1 safeStorage (alias)', '2 authService (alias)']],
    ['a namespace alias', ["import * as electron from 'electron';", 'const s = electron.safeStorage;'], ['2 electron.safeStorage (alias)']],
    ['an electron-store opened on import, not in a function', [
        "import Store from 'electron-store';",
        "const tokens = new Store({ name: 'auth-store' });",
        "export function open() { return new Store({ name: 'auth-store' }); }",
    ], ['2 new Store']],
    ['electron-store renamed or taken whole', [
        "import { default as Conf } from 'electron-store';", "import * as ES from 'electron-store';", 'new Conf();', 'new ES.default();',
    ], ['3 new Conf', '4 new ES.default']],
    ['an electron-store subclass', [
        "import Store from 'electron-store';", 'class TokenStore extends Store {}', 'export const tokens = new TokenStore();',
    ], ['3 new TokenStore (extends Store)']],
    ['types, which do not run', ['let s: typeof safeStorage;', 'type T = typeof authService;'], []],
];

describe('Google credentials are never read while main.js is imported', () => {
    it('no production file under electron/ reads authService or safeStorage, or opens a store, on import', () => {
        expect(SOURCES.length, 'the file walk found nothing — the guard would pass vacuously').toBeGreaterThan(10);
        expect(SOURCES.flatMap(({ path, code }) => importTimeReads(path, code))).toEqual([]);
    });

    it.each(PROBES)('%s', (_shape, lines, flagged) => {
        expect(importTimeReads('probe.ts', lines.join('\n')).sort()).toEqual(flagged.map(f => `probe.ts:${f}`).sort());
    });
});
