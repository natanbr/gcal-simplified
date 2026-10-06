// ============================================================
// The structural guards' own helper (decisionCalls.ts): a call counts only
// when it is code, written with the action itself.
// ============================================================

import { describe, it, expect } from 'vitest';
import { callsWithStateAndAction } from './decisionCalls';

describe('callsWithStateAndAction', () => {
    it.each([
        ['a statement', 'const change = decide(state, action);'],
        ['a nested expression', 'return decide(state, action) && { id, ...snap() };'],
        ['a call beside a comment naming it', '// decide(state, action)\nconst x = decide(state, action);'],
    ])('finds the call in %s', (_label, source) => {
        expect(callsWithStateAndAction(source, 'decide')).toBe(true);
    });

    it.each([
        ['a line comment only', '// decide(state, action)\nconst x = 1;'],
        ['a block comment only', '/* decide(state, action) */ const x = 1;'],
        ['a string only', "const s = 'decide(state, action)';"],
        ['a template string only', 'const s = `decide(state, action)`;'],
        ['other arguments', 'const x = decide(state, { ...action });'],
        ['another function', 'const x = decideMore(state, action);'],
        ['a method of that name', 'const x = rules.decide(state, action);'],
    ])('does not count %s', (_label, source) => {
        expect(callsWithStateAndAction(source, 'decide')).toBe(false);
    });
});
