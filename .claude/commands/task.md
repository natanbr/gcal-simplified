---
description: Implement a feature with the full TDD loop — requirements, red tests, implementation, green, docs
argument-hint: [what to build]
allowed-tools: Read, Write, Edit, Glob, Grep, Task, Agent, Bash(npm run test:unit), Bash(npm run test:run), Bash(npm run test:clean), Bash(npm run lint), Bash(npm run tsc), Bash(npx vitest run:*), Bash(npx playwright test:*), Bash(git status:*), Bash(git diff:*)
---

Implement: **$ARGUMENTS**

Current state:
- Branch: !`git branch --show-current`
- Working tree: !`git status --short`

## 1. Requirements — get clarity before touching code

Identify what is actually being asked. Read the relevant existing code and `docs/requirements.md` to establish current behaviour rather than assuming it.

**If the requirement is ambiguous, or conflicts with an existing feature or invariant, stop and ask.** Building the wrong thing correctly is the most expensive outcome here — a clarifying question costs one message.

Write down the requirement: what changes, what the acceptance criteria are, and explicitly what is *not* in scope. Each acceptance criterion should map to a test you're about to write.

For anything non-trivial in structure or approach, get an ADR first — launch the `architect` subagent with the requirement and let it define the data flow before you commit to one.

## 2. Red phase — tests first

Launch the `qa-engineer` subagent to write the failing tests, or write them yourself following the same standard:

- **Unit (Vitest)** for the logic, hook, or reducer transition
- **E2E (Playwright, `e2e/*.spec.ts`)** for the user-visible flow
- **Edge cases**: missing data, API failure, unauthenticated, empty list — and for Mission Control, the gated/idle path

Run them and confirm they fail **for the right reason**. A test that passes before the feature exists asserted something already true; a test that fails on a typo or missing stub tells you nothing. Read the actual failure output.

## 3. Implement

Write the change. While you do:

- Types first, then hook/logic, then rendering
- Reuse what exists — search before creating a new component or hook
- Respect the boundaries in `CLAUDE.md`: Mission Control isolation, 300-line files, no `any`, the right design-system tokens for the surface
- Run the **performance checklist** if you added a timer, effect, animation, or store write. New `setInterval` must be gated and registered in `src/__tests__/timer-registry.test.ts`.

## 4. Green phase — verify honestly

```
npm run test:unit
npm run lint
npm run tsc
npm run test:run     # if the change is user-visible
npm run test:clean
```

All four gates in the Definition of Done must pass. If something fails, fix it — don't report partial success. If there are pre-existing failures unrelated to this change, name them explicitly rather than folding them into a vague summary.

## 5. Close the loop

Update `docs/requirements.md` to reflect the shipped behaviour (one document, one `# ` heading — append a dated entry to the end of the changelog). Then report: what changed, which files, what the tests prove, and anything you deliberately left out of scope.

Consider `/devils-advocate` before committing if the change touches `electron/`, the always-mounted tree, or more than a couple of files.
