// ============================================================
// Test-only helper for the "one decision, asked by the reducer and by the log"
// guards: adjustedMissionEnd, isStaleMissionAction, responsibilityPointChange
// and responsibilityClaim. It reads a store file with the TypeScript parser and
// answers whether its CODE calls `fn(state, action)`. A plain text match was
// satisfied by the call left in a comment (PR 195 review), and a string naming
// it would have satisfied it too. Here, under __tests__/, because the isolation
// guard forbids src/mission-control/ importing src/__tests__/helpers.
// ============================================================

import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const STORE = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Whether the code in `source` calls `fn(state, action)`: comments and strings do not count. */
export function callsWithStateAndAction(source: string, fn: string): boolean {
    const file = ts.createSourceFile('source.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const visit = (node: ts.Node): boolean =>
        (ts.isCallExpression(node)
            && ts.isIdentifier(node.expression)
            && node.expression.text === fn
            && node.arguments.map(arg => arg.getText(file)).join(', ') === 'state, action')
        || (ts.forEachChild(node, child => visit(child) || undefined) ?? false);
    return visit(file);
}

/** The same, for a file under src/mission-control/store/. */
export function storeFileCalls(file: string, fn: string): boolean {
    return callsWithStateAndAction(readFileSync(resolve(STORE, file), 'utf-8'), fn);
}
