---
description: Fix a bug with a regression test that proves it and guard tests that protect the neighbours
argument-hint: [describe the bug]
allowed-tools: Read, Write, Edit, Glob, Grep, Task, Agent, Bash(npm run test:unit), Bash(npm run test:run), Bash(npm run test:clean), Bash(npm run lint), Bash(npm run tsc), Bash(npx vitest run:*), Bash(npx playwright test:*), Bash(git status:*), Bash(git diff:*), Bash(git log:*)
---

Fix: **$ARGUMENTS**

Current state:
- Branch: !`git branch --show-current`
- Working tree: !`git status --short`

## 1. Establish the correct behaviour

Before reproducing anything, be sure what "correct" means. Check `docs/requirements.md` and the surrounding code. **If the expected behaviour is unclear, or fixing this would contradict another feature, stop and ask** — some bugs are two features disagreeing, and picking a side silently is worse than the bug.

Check `.claude/skills/project-journal/references/` too. A surprising number of bugs here are a documented pattern recurring.

## 2. Reproduce, then locate

Find the actual cause, not the symptom's location. `git log` on the relevant files often points straight at it. Say what the root cause is before you change anything — if you can't articulate it, you're about to paper over it.

## 3. Red phase — two kinds of test

**Regression test** — exercises the buggy path and asserts the *correct* behaviour, so it fails today. Run it alone (`npx vitest run path/to/file.test.ts`) and read the failure: it must fail because of the bug, not because of a typo, a missing stub, or an unhydrated fixture.

**Guard tests** — pick the 1–3 functions or components most likely to be collateral damage from the fix. Confirm they're covered and GREEN *before* the fix. These are the only thing that will tell you afterwards that you didn't trade one bug for another.

The `qa-engineer` subagent can do this phase and knows the Vitest/Playwright split and the preload-mocking situation.

## 4. Fix

Minimal and targeted. Resist fixing unrelated things you notice on the way — note them separately instead; an unfocused diff hides the actual fix and introduces surprise failures.

## 5. Verify

```
npx vitest run path/to/regression.test.ts   # now green
npm run test:unit                            # nothing regressed
npm run lint
npm run tsc
npm run test:clean
```

If a guard test broke, the fix is wrong — go back to step 4 rather than adjusting the guard.

## 6. Report and commit

State the root cause, the fix, and what the regression test now locks in. If the cause was a pattern likely to recur, append it to the right file under `.claude/skills/project-journal/references/`.

Commit as `fix: [what was broken] — [why it happened]`.
