// ============================================================
// What a name refers to where it is used, by the language's scope rules, read
// off the parse tree alone (no program, no type checker): the initializer of the
// `const` the nearest scope declares it with, or null for anything else. Used by
// settings-fixture-clock-boundary.test.ts, whose file-wide map of `const`s let
// an outer `const` of a fixed date vouch for a parameter of the same name
// (review of PR 209).
// ============================================================

import ts from 'typescript';

/** Whether a binding name (an identifier or a destructuring pattern) declares `name`. */
function binds(node: ts.BindingName, name: string): boolean {
    if (ts.isIdentifier(node)) return node.text === name;
    return node.elements.some(el => !ts.isOmittedExpression(el) && binds(el.name, name));
}

/** Whether `scope` (a function or the file) declares `name` with a `var` anywhere in it, outside nested functions: hoisted, it shadows from there. */
function declaresVar(scope: ts.Node, name: string): boolean {
    let found = false;
    const visit = (node: ts.Node): void => {
        if (found || (node !== scope && ts.isFunctionLike(node))) return;
        if (ts.isVariableDeclarationList(node) && (node.flags & ts.NodeFlags.BlockScoped) === 0 && node.declarations.some(d => binds(d.name, name))) found = true;
        ts.forEachChild(node, visit);
    };
    ts.forEachChild(scope, visit);
    return found;
}

/** Whether `statement` declares `name` other than as a variable: a function, class or enum, or an import. */
function declaresOther(statement: ts.Statement, name: string): boolean {
    if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement)) return statement.name?.text === name;
    if (!ts.isImportDeclaration(statement) || statement.importClause === undefined) return false;
    const { name: defaultName, namedBindings } = statement.importClause;
    if (defaultName?.text === name) return true;
    if (namedBindings === undefined) return false;
    return ts.isNamespaceImport(namedBindings) ? namedBindings.name.text === name : namedBindings.elements.some(el => el.name.text === name);
}

/**
 * What `use` names where it is used, by the language's scope rules: the
 * initializer of the `const` the nearest scope declares it with, or null for
 * anything else (a parameter, a `let` or `var`, a loop or catch variable, a
 * function, class or import, or nothing in scope). The nearest declaration
 * decides: an outer `const` of a fixed date does not vouch for a parameter of
 * the same name (`seed(timestamp?)` called as `seed()` passes undefined).
 */
export function constInitializer(use: ts.Identifier): ts.Expression | null {
    const name = use.text;
    for (let node: ts.Node | undefined = use.parent; node !== undefined; node = node.parent) {
        if (ts.isFunctionLike(node)) {
            if (node.parameters.some(p => binds(p.name, name)) || declaresVar(node, name)) return null;
            if (!ts.isFunctionDeclaration(node) && node.name !== undefined && ts.isIdentifier(node.name) && node.name.text === name) return null;
        }
        if (ts.isCatchClause(node) && node.variableDeclaration !== undefined && binds(node.variableDeclaration.name, name)) return null;
        if ((ts.isForStatement(node) || ts.isForOfStatement(node) || ts.isForInStatement(node))
            && node.initializer !== undefined && ts.isVariableDeclarationList(node.initializer)
            && node.initializer.declarations.some(d => binds(d.name, name))) return null;
        if (ts.isSourceFile(node) && declaresVar(node, name)) return null;
        const statements = ts.isSourceFile(node) || ts.isBlock(node) || ts.isModuleBlock(node) || ts.isCaseClause(node) || ts.isDefaultClause(node) ? node.statements : undefined;
        for (const statement of statements ?? []) {
            if (declaresOther(statement, name)) return null;
            if (!ts.isVariableStatement(statement)) continue;
            const declaration = statement.declarationList.declarations.find(d => binds(d.name, name));
            if (declaration === undefined) continue;
            const isConst = (ts.getCombinedNodeFlags(declaration) & ts.NodeFlags.Const) !== 0;
            return isConst && ts.isIdentifier(declaration.name) && declaration.initializer !== undefined ? declaration.initializer : null;
        }
    }
    return null;
}
