// ============================================================
// Rule Registry — the index of every rule CLAUDE.md declares, and whether
// anything actually enforces it.
// ------------------------------------------------------------
// The lesson that produced this file: a rule written in CLAUDE.md and reviewed
// by hand for months (Mission Control isolation) was already broken in two
// places the first time a guard was pointed at it. Prose does not enforce
// anything, and "we all know the rule" is not a mechanism.
//
// This registry does not try to parse CLAUDE.md — curated data beats a fragile
// prose diff. What it does is make the *enforcement status* of every rule
// explicit, so "nothing is watching this one" is visible rather than assumed.
//
// Four honest states:
//   guarded     — a test fails if the rule is broken. The real thing.
//   ratcheted   — already broken at scale; current state frozen, new violations
//                 blocked. Stops the bleeding without a big-bang cleanup.
//   manual      — needs human judgement; no guard is feasible or worth it.
//                 An honest `manual` is better than a guard that fakes it.
//   unguardable — cannot be caught by a test in principle, usually because it
//                 is about code that does NOT exist. Needs a different defence.
// ============================================================

import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from './helpers/sourceFiles';

type Status = 'guarded' | 'ratcheted' | 'manual' | 'unguardable';

interface Rule {
    /** The rule, as CLAUDE.md states it. */
    rule: string;
    /** Where it is declared. */
    source: string;
    status: Status;
    /** Repo-relative path to the enforcing test. Required for guarded/ratcheted. */
    guard?: string;
    /** How the guard was proven to actually fail. Manual recipe, deliberately
     *  not automated — a mutation-testing framework is more machinery than this
     *  project wants. */
    verifiedRedBy?: string;
    /** For manual/unguardable: what defends the rule instead. */
    defence?: string;
}

const REGISTRY: Rule[] = [
    // ── Performance ──────────────────────────────────────────────────────────
    {
        rule: 'Every recurring setInterval must be registered; idle-Calendar timers capped at 4',
        source: 'CLAUDE.md → Performance → 1',
        status: 'guarded',
        guard: 'src/__tests__/timer-registry.test.ts',
        verifiedRedBy: 'add a setInterval to an unregistered file',
    },
    {
        rule: 'Scheduler is gated when idle; the behaviour heartbeat is churn-free on the Calendar view',
        source: 'CLAUDE.md → Performance → 2, 4',
        status: 'guarded',
        guard: 'src/mission-control/__tests__/idle-performance.test.tsx',
        verifiedRedBy: 'make applyBehaviorSync return a new object on a no-op tick',
    },
    {
        rule: 'No repeat: Infinity / CSS infinite animation in the always-mounted tree',
        source: 'CLAUDE.md → Performance → 3',
        status: 'manual',
        defence: 'Reviewed by the perf-sentinel subagent. Currently zero occurrences in the always-mounted tree; a guard would need to model the mount graph to know which components are always-mounted.',
    },
    {
        rule: 'Every setInterval/setTimeout/subscription is cleared in its effect cleanup',
        source: 'CLAUDE.md → Performance → 5',
        status: 'manual',
        defence: 'react-hooks lint rules catch the common shapes; full enforcement needs dataflow analysis. Covered case-by-case in hook unit tests (e.g. the scheduler unsubscribe test).',
    },

    // ── Architecture / boundaries ────────────────────────────────────────────
    {
        rule: 'Mission Control never imports from src/components, src/hooks, src/utils',
        source: 'CLAUDE.md → Conventions',
        status: 'guarded',
        guard: 'src/__tests__/mission-control-isolation.test.ts',
        verifiedRedBy: 'found two live violations on its first run (2026-08-19)',
    },
    {
        rule: 'Every ipcMain.handle channel is whitelisted in preload, and vice versa',
        source: 'CLAUDE.md → Process Model',
        status: 'guarded',
        guard: 'electron/preload_contract.test.ts',
        verifiedRedBy: "remove 'audit:append' from ALLOWED_INVOKE_CHANNELS",
    },
    {
        rule: 'A non-whitelisted IPC channel throws — it does not silently no-op',
        source: 'CLAUDE.md → Process Model',
        status: 'guarded',
        guard: 'electron/preload.test.ts',
        verifiedRedBy: 'replace the throw with a return in preload.ts',
    },
    {
        rule: 'Only one instance of the app may run',
        source: 'CLAUDE.md → Single Instance',
        status: 'unguardable',
        defence: 'Enforced by Electron/the OS, not by a code path a unit test can call. Presence is checked structurally in electron/preload_contract.test.ts; real behaviour is proven by launching the built app twice: node scripts/verify-single-instance.mjs',
    },
    {
        rule: 'mcReducer.ts is a pure reducer — no side effects',
        source: 'CLAUDE.md → Conventions',
        status: 'guarded',
        guard: 'src/mission-control/store/mcReducer.purity.test.ts',
        verifiedRedBy: 'mutate state.bankCount in place inside any case',
    },

    // ── Token economy / attribution ──────────────────────────────────────────
    {
        rule: 'Game tokens come only from the mood gauge; no calendar-day or on-mount grant',
        source: 'CLAUDE.md → Conventions → Token economy',
        status: 'guarded',
        guard: 'src/mission-control/store/mcReducer.token-generation.test.ts',
        verifiedRedBy: 'restore useGameTokenScheduler.ts and wire it into MCStoreProvider',
    },
    {
        rule: 'Earning a token resets moodWind to 0',
        source: 'CLAUDE.md → Conventions → Token economy',
        status: 'guarded',
        guard: 'src/mission-control/store/mcReducer.token-generation.test.ts',
        verifiedRedBy: 'drop the nextMoodWind = 0 line in applyBehaviorSync',
    },
    {
        rule: 'Every log entry carries a source; a token movement with no attribution is a bug',
        source: 'CLAUDE.md → Conventions → Attribution',
        status: 'guarded',
        guard: 'src/mission-control/store/activityLog.attribution.test.ts',
        verifiedRedBy: 'remove `source` from deriveSnapshots',
        defence: 'Covers only the entries createLogEntry DERIVES. An entry built by hand and dispatched straight as ADD_LOG never reaches it — which is exactly how the two useQuickGameSession entries shipped with source undefined (fixed 2026-08-21). That hook is the only hand-building site today and carries its own guard: src/mission-control/hooks/useQuickGameSession.test.ts asserts source === local on both entries. A new hand-built entry anywhere else needs its own test; nothing catches one structurally.',
    },
    {
        rule: 'One game close, one 🏁 entry — END_GAME derives nothing because its dispatcher hand-writes the richer entry',
        source: 'Corollary of CLAUDE.md → Conventions → Attribution (a parent cannot see who moved what if one event logs twice, or not at all). Stated in full at UNLOGGED_ACTIONS in src/mission-control/store/activityLog.ts',
        status: 'guarded',
        guard: 'src/mission-control/store/activityLog.attribution.test.ts',
        verifiedRedBy: 'add a SECOND END_GAME dispatcher as a new file under src/mission-control/, written multi-line (the type sits on its own line) — the dispatcher list goes red naming both paths (proven 2026-08-21). Counterpart proof: a file whose only occurrence is inside a line comment stays GREEN. The previous literal-substring matcher failed both ways round — red on the comment, green on the real multi-line dispatch.',
    },
    {
        rule: 'REMOTE_ALLOWED_ACTIONS is an allowlist; remote buttons must be added to it',
        source: 'CLAUDE.md → Conventions → Remote actions',
        status: 'guarded',
        guard: 'src/mission-control/hooks/useRemoteControl.allowlist.test.ts',
        verifiedRedBy: 'dispatch CLEAR_LOGS over the channel and expect it through',
    },
    {
        rule: 'skillProgress never rides the remote broadcast; reading content stays quiz-internal',
        source: 'CLAUDE.md → Conventions → Skill progress',
        status: 'guarded',
        guard: 'src/mission-control/__tests__/skill-progress-boundaries.test.ts',
        verifiedRedBy: 'caught its own author twice while being written (2026-08-20): a prose "state.skillProgress" mention in useRemoteSync, and useQuizEngine importing reading/ directly',
    },

    // ── Ratcheted: declared, but already broken at scale ──────────────────────
    {
        rule: 'Keep files under 300 lines',
        source: 'CLAUDE.md → Conventions → File size limit',
        status: 'ratcheted',
        guard: 'src/__tests__/file-size-ratchet.test.ts',
        verifiedRedBy: 'append lines to any baselined file',
        defence: '12 files were already over the limit when the guard was written. Frozen at current size; may shrink, never grow. mcReducer.ts (1019) is the top split candidate.',
    },
    {
        rule: 'No raw hex values in components — use the owning design system\'s token',
        source: 'CLAUDE.md → Conventions → Styling',
        status: 'ratcheted',
        guard: 'src/__tests__/style-token-ratchet.test.ts',
        verifiedRedBy: 'add a #rrggbb literal to a file with no baseline entry',
        defence: 'Violated in 34 files when the guard was written — the codebase does not actually follow this rule. NEEDS A HUMAN DECISION: change the rule, or schedule the cleanup. Frozen meanwhile.',
    },
    {
        rule: 'The two design systems are disjoint — no cross-contamination of tokens',
        source: 'CLAUDE.md → Conventions → Styling',
        status: 'guarded',
        guard: 'src/__tests__/style-token-ratchet.test.ts',
        verifiedRedBy: 'use bg-family-cyan inside a Mission Control component',
    },

    // ── Manual ───────────────────────────────────────────────────────────────
    {
        rule: 'Each game directory follows the types/use[Game]Game/[Game]Canvas/[Game]GameOverlay/index shape',
        source: 'CLAUDE.md → Conventions → Game structure pattern',
        status: 'manual',
        defence: 'The four existing games diverge from the template in small, deliberate ways (fruits has fruitPhysics.ts, blocks has a grid split). A guard would mostly generate false positives.',
    },
    {
        rule: 'Game hooks use local useState only; integration via onClose(score)',
        source: 'CLAUDE.md → Conventions → Game state',
        status: 'manual',
        defence: 'Partially implied by the MC isolation guard (games cannot reach the parent app). Store access from a game would need an import-graph rule per game directory — worth adding if a game ever grows a store dependency.',
    },
    {
        rule: 'TypeScript strict: no any, no `as unknown as X` laundering',
        source: 'CLAUDE.md → Conventions → TypeScript',
        status: 'guarded',
        guard: '.eslintrc.cjs',
        verifiedRedBy: 'npm run lint with an explicit any — @typescript-eslint/no-explicit-any errors',
        defence: 'One justified `as unknown as` remains in PerformanceHud.tsx for the non-standard performance.memory API.',
    },
    {
        rule: 'Production build injects a strict Content-Security-Policy',
        source: 'CLAUDE.md → Conventions → CSP',
        status: 'guarded',
        guard: 'electron/main_security.test.ts',
        verifiedRedBy: 'loosen the production CSP string in bootstrap()',
    },
];

const GUARDED_STATUSES: Status[] = ['guarded', 'ratcheted'];

describe('rule registry', () => {
    it('names a guard file for every guarded or ratcheted rule', () => {
        const missing = REGISTRY
            .filter(r => GUARDED_STATUSES.includes(r.status) && !r.guard)
            .map(r => r.rule);

        expect(missing, `status says enforced but no guard file is named:\n  ${missing.join('\n  ')}`).toEqual([]);
    });

    it('points every guard at a file that actually exists', () => {
        const broken = REGISTRY
            .filter(r => r.guard && !existsSync(join(repoRoot, r.guard)))
            .map(r => `  ${r.rule}\n    → missing: ${r.guard}`);

        expect(
            broken,
            `Registry points at guard file(s) that do not exist. A guard that was renamed or\n` +
            `deleted leaves the rule silently unenforced — the exact failure this registry exists\n` +
            `to prevent.\n\n${broken.join('\n')}`
        ).toEqual([]);
    });

    it('explains what defends every rule that has no guard', () => {
        const unexplained = REGISTRY
            .filter(r => !GUARDED_STATUSES.includes(r.status) && !r.defence)
            .map(r => r.rule);

        expect(
            unexplained,
            `manual/unguardable rules must say what defends them instead — otherwise the status\n` +
            `is just a shrug:\n  ${unexplained.join('\n  ')}`
        ).toEqual([]);
    });

    it('records how each guard was proven to fail', () => {
        // A guard nobody has ever seen fail may not be capable of failing.
        const unverified = REGISTRY
            .filter(r => GUARDED_STATUSES.includes(r.status) && !r.verifiedRedBy)
            .map(r => r.rule);

        expect(
            unverified,
            `Guarded rule(s) with no recorded way to make the guard go red.\n` +
            `Break the rule locally, watch the test fail, then record the recipe here:\n  ${unverified.join('\n  ')}`
        ).toEqual([]);
    });

    it('does not let the unenforced share of the rulebook grow silently', () => {
        // Not a quality bar — a tripwire. Adding a rule without a guard is
        // allowed, but it has to be a deliberate edit to this number.
        const unenforced = REGISTRY.filter(r => r.status === 'manual' || r.status === 'unguardable');

        expect(
            unenforced.length,
            `${unenforced.length} of ${REGISTRY.length} rules have no automated guard:\n  ` +
            unenforced.map(r => r.rule).join('\n  ') +
            `\n\nIf you added a rule without a guard, raise this number deliberately.`
        ).toBeLessThanOrEqual(5);
    });

    it('covers a meaningful share of the rulebook', () => {
        expect(REGISTRY.length).toBeGreaterThanOrEqual(18);
    });
});
