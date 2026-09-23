// ============================================================
// Privilege suspension — structural boundary pin (source-reading test,
// streak-writer-boundary style).
//
// What this protects: "is this privilege suspended right now" has exactly one
// answer, `isPrivilegeSuspended` in store/privileges.ts, which reads the stored
// `status` AND the clock. The stored `status: 'suspended'` is only the parent's
// last decision; it stays stored as suspended until EXPIRE_SUSPENSIONS lands
// (at the end time, or at the next launch), so a reader that trusts it is
// wrong for that gap.
//
// That is the bug this pins (QA 2026-09-22): four readers compared
// `status === 'suspended'` directly — the card, the dashboard summary, the Goal
// picker filter and the "Use!" lock — so a 1-day suspension never lifted. A
// behavioural test cannot catch the NEXT reader that does the same, because a
// new component is by definition not covered by the existing tests.
//
// verifiedRedBy: on the pre-fix tree this failed naming GoalPedestal.tsx (x2),
// PrivilegeCardButton.tsx and PrivilegesPanel.tsx. To re-prove it, add
// `const x = p.status === 'suspended';` to any MC component.
// ============================================================

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const mcRoot = resolve(here, '..');

function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full, out);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
    }
    return out;
}

/** The predicate's own module is the one place allowed to read the raw flag. */
const PREDICATE_MODULE = 'store/privileges.ts';

/** A READ of the stored flag, either operand order. `status: 'suspended'` (a
 *  write, e.g. the Suspend button's dispatch) deliberately does not match. */
const RAW_READ = [
    /\bstatus\s*[!=]==?\s*['"]suspended['"]/,
    /['"]suspended['"]\s*[!=]==?\s*[\w.?]*\bstatus\b/,
];

/** `action.status` is what a dispatch ASKS for (suspend / reinstate), not the
 *  stored record, so branching on it decides nothing about the clock. */
const isRawRead = (line: string) => {
    const withoutIntent = line.replace(/\baction\.status\b/g, 'action.requested');
    return RAW_READ.some(re => re.test(withoutIntent));
};

describe('privilege suspension is decided in one place', () => {
    it('the pattern catches both operand orders and ignores writes', () => {
        // Keeps the guard honest: a regex that matches nothing passes forever.
        expect(isRawRead("const s = p.status === 'suspended';")).toBe(true);
        expect(isRawRead("if ('suspended' !== priv?.status) return;")).toBe(true);
        expect(isRawRead("filter(({ status }) => status == \"suspended\")")).toBe(true);
        expect(isRawRead("dispatch({ type: 'SET_PRIVILEGE_STATUS', status: 'suspended' })")).toBe(false);
        expect(isRawRead("if (action.status === 'suspended') {")).toBe(false);
        expect(isRawRead("if (card.status === 'suspended' && action.status === 'active')")).toBe(true);
    });

    it('no Mission Control source reads the stored status directly', () => {
        const files = walk(mcRoot);
        expect(files.length, 'scanner found no sources — the guard would pass vacuously').toBeGreaterThan(50);

        const offenders: string[] = [];
        for (const file of files) {
            const rel = relative(mcRoot, file).split(/[\\/]/).join('/');
            if (rel === PREDICATE_MODULE) continue;
            readFileSync(file, 'utf-8').split('\n').forEach((line, i) => {
                if (/^\s*(\/\/|\*)/.test(line)) return;
                if (isRawRead(line)) offenders.push(`${rel}:${i + 1} — ${line.trim()}`);
            });
        }

        expect(
            offenders,
            'These read `status === \'suspended\'` directly, so an expired suspension never ' +
            'lifts for them. Use isPrivilegeSuspended(card) from store/privileges.ts:\n  ' +
            offenders.join('\n  '),
        ).toEqual([]);
    });
});
