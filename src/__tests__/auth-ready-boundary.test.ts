// ============================================================
// Google credentials load after ready — structural pin (source-reading test).
// ------------------------------------------------------------
// electron/auth_app_ready.test.ts proves auth.ts itself touches no safeStorage
// method while it is imported. It cannot see a CALLER: a module-scope
// `authService.isAuthenticated()` in main.ts runs while main.js is imported,
// before `app` is ready, so it throws and no window opens on any launch, yet
// every suite that loads main.ts mocks './auth' (a reviewer added exactly that
// line and all 2234 unit tests stayed green, 2026-10-01). So this walks every
// production file under electron/ with the TypeScript parser and lists the code
// that runs on import and reads `authService` or `safeStorage`, or opens an
// electron-store (a corrupt auth-store.json then threw before the
// single-instance lock and no window opened, 2026-10-04).
//
// "Runs on import": module-scope statements, and, followed inside the same
// file, an immediately invoked function, a function called at module scope (and
// what it calls), a class's static initializers, and the constructor and
// instance initializers of a class built at module scope (and the methods it
// calls through `this.`, which is how the original bug read safeStorage).
// Imports renamed (`{ authService as a }`) or taken whole (`* as x`, electron's
// default) are resolved.
//
// Not covered: a function imported from another file and called at module
// scope, an alias (`const s = safeStorage`), computed access (`x['safeStorage']`)
// and a callback that a module-scope call runs straight away
// (`[1].forEach(() => authService.x())`).
//
// verifiedRedBy: see the registry entry in rule-registry.test.ts.
// ============================================================

import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { productionSources, readSource, toRepoPath } from './helpers/sourceFiles';

const READY_ONLY_EXPORTS = [
    { from: /(^|\/)auth$/, name: 'authService' },
    { from: /^electron$/, name: 'safeStorage' },
];
const READY_ONLY_NAMES = new Set(READY_ONLY_EXPORTS.map(e => e.name));
const STORE_MODULE = 'electron-store';

type Body = ts.Node | undefined;

/** What the file binds at its top level: the names that reach a ready-only object, and its own functions and classes. */
function topLevelFacts(file: ts.SourceFile) {
    const readyOnly = new Set(READY_ONLY_NAMES);
    const namespaces = new Set<string>();
    const stores = new Set<string>();
    const functions = new Map<string, Body>();
    const classes = new Map<string, ts.ClassDeclaration>();
    for (const statement of file.statements) {
        if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
            const from = statement.moduleSpecifier.text;
            const exported = READY_ONLY_EXPORTS.filter(e => e.from.test(from)).map(e => e.name);
            const clause = statement.importClause;
            if (clause?.name && from === STORE_MODULE) stores.add(clause.name.text);
            if (clause?.name && exported.length > 0) namespaces.add(clause.name.text);
            const named = clause?.namedBindings;
            if (named && ts.isNamespaceImport(named) && exported.length > 0) namespaces.add(named.name.text);
            if (named && ts.isNamedImports(named)) {
                for (const element of named.elements) {
                    if (exported.includes((element.propertyName ?? element.name).text)) readyOnly.add(element.name.text);
                }
            }
        } else if (ts.isFunctionDeclaration(statement) && statement.name) {
            functions.set(statement.name.text, statement.body);
        } else if (ts.isVariableStatement(statement)) {
            for (const { name, initializer } of statement.declarationList.declarations) {
                if (ts.isIdentifier(name) && initializer && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))) {
                    functions.set(name.text, initializer.body);
                }
            }
        } else if (ts.isClassDeclaration(statement) && statement.name) {
            classes.set(statement.name.text, statement);
        }
    }
    return { readyOnly, namespaces, stores, functions, classes };
}

const isStatic = (member: ts.ClassElement) =>
    ts.canHaveModifiers(member) && (ts.getModifiers(member) ?? []).some(m => m.kind === ts.SyntaxKind.StaticKeyword);

function unwrap(node: ts.Expression): ts.Expression {
    return ts.isParenthesizedExpression(node) ? unwrap(node.expression) : node;
}

/** Each import-time read, as "file:line authService.x", "file:line electron.safeStorage.x" or "file:line new Store". */
function importTimeReads(path: string, code: string): string[] {
    const file = ts.createSourceFile(path, code, ts.ScriptTarget.Latest, true);
    const facts = topLevelFacts(file);
    const found: string[] = [];
    const followed = new Set<ts.Node>();
    const at = (node: ts.Node) => `${path}:${file.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;

    const reachesReadyOnly = (expression: ts.Expression) =>
        (ts.isIdentifier(expression) && facts.readyOnly.has(expression.text))
        || (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression)
            && facts.namespaces.has(expression.expression.text) && READY_ONLY_NAMES.has(expression.name.text));

    const follow = (body: Body, cls?: ts.ClassLikeDeclaration) => {
        if (!body || followed.has(body)) return;
        followed.add(body);
        visit(body, cls);
    };

    /** `new X()` runs X's constructor and instance initializers. */
    const construct = (cls: ts.ClassDeclaration) => {
        for (const member of cls.members) {
            if (ts.isConstructorDeclaration(member)) follow(member.body, cls);
            else if (ts.isPropertyDeclaration(member) && !isStatic(member)) follow(member.initializer, cls);
        }
    };

    const visit = (node: ts.Node, cls?: ts.ClassLikeDeclaration): void => {
        if (ts.isCallExpression(node)) {
            const callee = unwrap(node.expression);
            if (ts.isArrowFunction(callee) || ts.isFunctionExpression(callee)) follow(callee.body, cls);
            else if (ts.isIdentifier(callee)) follow(facts.functions.get(callee.text));
            else if (cls && ts.isPropertyAccessExpression(callee) && callee.expression.kind === ts.SyntaxKind.ThisKeyword) {
                const method = cls.members.find(m => ts.isMethodDeclaration(m) && m.name.getText() === callee.name.text);
                if (method && ts.isMethodDeclaration(method)) follow(method.body, cls);
            }
        }
        if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)) {
            if (facts.stores.has(node.expression.text)) found.push(`${at(node)} new ${node.expression.text}`);
            const built = facts.classes.get(node.expression.text);
            if (built) construct(built);
        }
        if (ts.isClassLike(node)) {
            // Defining a class runs its heritage and static parts; the rest runs on `new`, or never.
            for (const clause of node.heritageClauses ?? []) visit(clause, cls);
            for (const member of node.members) {
                if (ts.isPropertyDeclaration(member) && isStatic(member)) follow(member.initializer, node);
                if (ts.isClassStaticBlockDeclaration(member)) follow(member.body, node);
            }
            return;
        }
        if (ts.isFunctionLike(node)) return;
        if (ts.isPropertyAccessExpression(node) && reachesReadyOnly(node.expression)) {
            found.push(`${at(node)} ${node.getText()}`);
        }
        ts.forEachChild(node, child => visit(child, cls));
    };

    visit(file);
    return found;
}

const SOURCES = productionSources(['electron']).map(f => ({ path: toRepoPath(f), code: readSource(f) }));

describe('Google credentials are never read while main.js is imported', () => {
    it('no production file under electron/ reads authService or safeStorage, or opens a store, on import', () => {
        expect(SOURCES.length, 'the file walk found nothing — the guard would pass vacuously').toBeGreaterThan(10);
        expect(SOURCES.flatMap(({ path, code }) => importTimeReads(path, code))).toEqual([]);
    });

    it('flags a module-scope read and allows the same read inside a handler', () => {
        const probe = [
            'authService.isAuthenticated();',
            "ipcMain.handle('auth:check', () => authService.isAuthenticated());",
            'const available = safeStorage.isEncryptionAvailable();',
            'app.whenReady().then(function () { safeStorage.decryptString(blob); });',
        ].join('\n');

        expect(importTimeReads('probe.ts', probe)).toEqual([
            'probe.ts:1 authService.isAuthenticated',
            'probe.ts:3 safeStorage.isEncryptionAvailable',
        ]);
    });

    it('follows renamed and whole imports, IIFEs, helpers, static parts and constructors run on import', () => {
        const probe = [
            "import { authService as auth } from './auth';",
            "import * as electron from 'electron';",
            "import Store from 'electron-store';",
            'auth.isAuthenticated();',
            'electron.safeStorage.isEncryptionAvailable();',
            '(() => auth.getAuthClient())();',
            'function check() { return helper(); }',
            'function helper() { return auth.isAuthenticated(); }',
            'check();',
            'function later() { return auth.isAuthenticated(); }',
            'class Service {',
            '    static peek = electron.safeStorage.isEncryptionAvailable();',
            '    constructor() { this.load(); }',
            '    load() { return electron.safeStorage.decryptString(blob); }',
            '    unused() { return auth.isAuthenticated(); }',
            '}',
            'export const service = new Service();',
            "const tokens = new Store({ name: 'auth-store' });",
            "export function open() { return new Store({ name: 'auth-store' }); }",
            "app.whenReady().then(() => electron.app.getPath('userData'));",
        ].join('\n');

        expect(importTimeReads('probe.ts', probe).sort()).toEqual([
            'probe.ts:12 electron.safeStorage.isEncryptionAvailable',
            'probe.ts:14 electron.safeStorage.decryptString',
            'probe.ts:18 new Store',
            'probe.ts:4 auth.isAuthenticated',
            'probe.ts:5 electron.safeStorage.isEncryptionAvailable',
            'probe.ts:6 auth.getAuthClient',
            'probe.ts:8 auth.isAuthenticated',
        ]);
    });
});
