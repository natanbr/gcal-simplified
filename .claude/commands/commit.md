---
description: Clean test artifacts, stage, and commit with a conventional message
argument-hint: [optional: what the change is]
allowed-tools: Read, Bash(npm run test:clean), Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git add:*), Bash(git commit:*)
---

Commit the current work. Context from the user: $ARGUMENTS

State:
- Branch: !`git branch --show-current`
- Status: !`git status --short`
- Staged diff: !`git diff --staged --stat`
- Unstaged diff: !`git diff --stat`
- Recent commits (for message style): !`git log --oneline -8`

## Steps

1. **Clean test artifacts** — `npm run test:clean`, so generated files don't end up in the commit.

2. **Review what's actually being committed.** Read the diff. Watch specifically for: throwaway scripts, debug `console.log`, `.env` or credentials, and unrelated files swept in. This project has a documented history of temporary edit-scripts landing in commits — check the file list deliberately rather than reaching for `git add -A`.

3. **No WIP commits.** If the work is unfinished, say so and stop rather than committing a half-state.

4. **Stage** the files that belong to this change.

5. **Commit** with a conventional message whose subject says *what* and whose body says *why*:
   - `feat: [capability added]`
   - `fix: [what was broken] — [root cause]`
   - `perf: [what got faster] — [the mechanism]`
   - `refactor:` / `test:` / `docs:` / `chore:`

Do not push unless asked.
