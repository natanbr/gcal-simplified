// The walker behind src/__tests__/auth-ready-boundary.test.ts: the code in one
// file that runs while the file is imported and reads `authService` or
// `safeStorage`, or opens an electron-store. Its header lists what is followed
// and what is not.

import ts from 'typescript';

const READY_ONLY_EXPORTS = [
    { from: /(^|\/)auth$/, name: 'authService' },
    { from: /^electron$/, name: 'safeStorage' },
];
const READY_ONLY_NAMES = new Set(READY_ONLY_EXPORTS.map(e => e.name));
const STORE_MODULE = 'electron-store';

interface Facts {
    /** Local names bound to authService or safeStorage (renamed imports included). */
    readyOnly: Set<string>;
    /** `* as x`, or a default import, of a module that exports one of them. */
    namespaces: Set<string>;
    /** Local names of electron-store's default export, and `* as x` of electron-store. */
    stores: Set<string>;
    storeNamespaces: Set<string>;
    functions: Map<string, ts.FunctionLikeDeclaration>;
    classes: Map<string, ts.ClassLikeDeclaration>;
}

function topLevelFacts(file: ts.SourceFile): Facts {
    const facts: Facts = {
        readyOnly: new Set(READY_ONLY_NAMES), namespaces: new Set(), stores: new Set(), storeNamespaces: new Set(),
        functions: new Map(), classes: new Map(),
    };
    for (const statement of file.statements) {
        if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
            const from = statement.moduleSpecifier.text;
            const exported = READY_ONLY_EXPORTS.filter(e => e.from.test(from)).map(e => e.name);
            const clause = statement.importClause;
            const named = clause?.namedBindings;
            if (from === STORE_MODULE) {
                if (clause?.name) facts.stores.add(clause.name.text);
                if (named && ts.isNamespaceImport(named)) facts.storeNamespaces.add(named.name.text);
                if (named && ts.isNamedImports(named)) {
                    for (const element of named.elements) if (element.propertyName?.text === 'default') facts.stores.add(element.name.text);
                }
            }
            if (exported.length === 0) continue;
            if (clause?.name) facts.namespaces.add(clause.name.text);
            if (named && ts.isNamespaceImport(named)) facts.namespaces.add(named.name.text);
            if (named && ts.isNamedImports(named)) {
                for (const element of named.elements) {
                    if (exported.includes((element.propertyName ?? element.name).text)) facts.readyOnly.add(element.name.text);
                }
            }
        } else if (ts.isFunctionDeclaration(statement) && statement.name) {
            facts.functions.set(statement.name.text, statement);
        } else if (ts.isClassDeclaration(statement) && statement.name) {
            facts.classes.set(statement.name.text, statement);
        } else if (ts.isVariableStatement(statement)) {
            for (const { name, initializer } of statement.declarationList.declarations) {
                if (!ts.isIdentifier(name) || !initializer) continue;
                if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) facts.functions.set(name.text, initializer);
                if (ts.isClassExpression(initializer)) facts.classes.set(name.text, initializer);
            }
        }
    }
    return facts;
}

const unwrap = (node: ts.Expression): ts.Expression => (ts.isParenthesizedExpression(node) ? unwrap(node.expression) : node);
const isThisAccess = (node: ts.Node): node is ts.PropertyAccessExpression =>
    ts.isPropertyAccessExpression(node) && node.expression.kind === ts.SyntaxKind.ThisKeyword;
const memberName = (member: ts.ClassElement) =>
    member.name && (ts.isIdentifier(member.name) || ts.isPrivateIdentifier(member.name) || ts.isStringLiteral(member.name)) ? member.name.text : undefined;
const decorators = (node: ts.Node) => (ts.canHaveDecorators(node) ? ts.getDecorators(node) ?? [] : []);

/** A name in a position where it is declared or names a property, not a value read. */
function isNotAValue(node: ts.Identifier): boolean {
    const parent = node.parent;
    if (ts.isPropertyAccessExpression(parent) && parent.name === node) return true;
    if (ts.isPropertyAssignment(parent) && parent.name === node) return true;
    return (ts.isVariableDeclaration(parent) || ts.isFunctionDeclaration(parent) || ts.isClassDeclaration(parent)
        || ts.isParameter(parent) || ts.isBindingElement(parent) || ts.isPropertyDeclaration(parent)
        || ts.isMethodDeclaration(parent)) && parent.name === node;
}

/** Each import-time read in `code`, as "file:line what". */
export function importTimeReads(path: string, code: string): string[] {
    const file = ts.createSourceFile(path, code, ts.ScriptTarget.Latest, true);
    const facts = topLevelFacts(file);
    const found: string[] = [];
    const followed = new Set<ts.Node>();
    const report = (node: ts.Node, what: string) =>
        found.push(`${path}:${file.getLineAndCharacterOfPosition(node.getStart()).line + 1} ${what}`);

    const namespaceReach = (node: ts.Node) => ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)
        && facts.namespaces.has(node.expression.text) && READY_ONLY_NAMES.has(node.name.text);
    const reachesReadyOnly = (node: ts.Node) => (ts.isIdentifier(node) && facts.readyOnly.has(node.text)) || namespaceReach(node);

    const follow = (fn: ts.FunctionLikeDeclaration | undefined, cls?: ts.ClassLikeDeclaration) => {
        if (!fn || followed.has(fn)) return;
        followed.add(fn);
        for (const parameter of fn.parameters) if (parameter.initializer) visit(parameter.initializer, cls);
        if (fn.body) visit(fn.body, cls);
    };

    /** `this.x()` or `this.x`: the method, arrow property or getter it runs. */
    const followThis = (access: ts.PropertyAccessExpression, cls: ts.ClassLikeDeclaration, called: boolean) => {
        for (const member of cls.members) {
            if (memberName(member) !== access.name.text) continue;
            if (called && ts.isMethodDeclaration(member)) follow(member, cls);
            if (called && ts.isPropertyDeclaration(member) && member.initializer
                && (ts.isArrowFunction(member.initializer) || ts.isFunctionExpression(member.initializer))) follow(member.initializer, cls);
            if (!called && ts.isGetAccessorDeclaration(member)) follow(member, cls);
        }
    };

    /** `new X()` runs X's constructor and the ones it inherits from in this file; extending electron-store opens a store. */
    const construct = (cls: ts.ClassLikeDeclaration, site: ts.NewExpression) => {
        if (followed.has(cls)) return;
        followed.add(cls);
        const base = cls.heritageClauses?.find(c => c.token === ts.SyntaxKind.ExtendsKeyword)?.types[0]?.expression;
        if (base && ts.isIdentifier(base)) {
            if (facts.stores.has(base.text)) report(site, `new ${site.expression.getText()} (extends ${base.text})`);
            const parent = facts.classes.get(base.text);
            if (parent) construct(parent, site);
        }
        follow(cls.members.find(ts.isConstructorDeclaration), cls);
    };

    /** Defining a class runs its decorators, heritage, computed names and static parts; instance fields are counted too, wherever the class is built. */
    const define = (cls: ts.ClassLikeDeclaration) => {
        for (const decorator of decorators(cls)) visit(decorator.expression);
        for (const clause of cls.heritageClauses ?? []) for (const type of clause.types) visit(type.expression);
        for (const member of cls.members) {
            for (const decorator of decorators(member)) visit(decorator.expression);
            if (member.name && ts.isComputedPropertyName(member.name)) visit(member.name.expression);
            if (ts.isClassStaticBlockDeclaration(member)) visit(member.body, cls);
            if (ts.isPropertyDeclaration(member) && member.initializer) visit(member.initializer, cls);
        }
    };

    const visit = (node: ts.Node, cls?: ts.ClassLikeDeclaration): void => {
        if (ts.isTypeNode(node) || ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
            || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return;
        if (ts.isCallExpression(node)) {
            const callee = unwrap(node.expression);
            if (ts.isArrowFunction(callee) || ts.isFunctionExpression(callee)) follow(callee, cls);
            else if (ts.isIdentifier(callee)) follow(facts.functions.get(callee.text));
            else if (cls && isThisAccess(callee)) followThis(callee, cls, true);
        }
        if (cls && isThisAccess(node) && !(ts.isCallExpression(node.parent) && node.parent.expression === node)) followThis(node, cls, false);
        if (ts.isTaggedTemplateExpression(node) && ts.isIdentifier(node.tag)) follow(facts.functions.get(node.tag.text));
        if (ts.isNewExpression(node)) {
            const target = unwrap(node.expression);
            if (ts.isIdentifier(target) && facts.stores.has(target.text)) report(node, `new ${target.text}`);
            if (ts.isPropertyAccessExpression(target) && ts.isIdentifier(target.expression) && facts.storeNamespaces.has(target.expression.text)) {
                report(node, `new ${target.getText()}`);
            }
            const built = ts.isIdentifier(target) ? facts.classes.get(target.text) : ts.isClassExpression(target) ? target : undefined;
            if (built) construct(built, node);
        }
        if (ts.isClassLike(node)) return define(node);
        if (ts.isFunctionLike(node)) return;
        if (ts.isPropertyAccessExpression(node) && reachesReadyOnly(node.expression)) {
            report(node, node.getText());
        } else if (reachesReadyOnly(node) && !(ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node)
            && !(ts.isIdentifier(node) && isNotAValue(node))) {
            report(node, `${node.getText()} (alias)`);
        }
        ts.forEachChild(node, child => visit(child, cls));
    };

    visit(file);
    return found;
}
