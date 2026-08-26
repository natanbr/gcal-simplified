---
description: Adversarial multi-lens review of a diff, a file, or a plan — fan out specialist subagents and arbitrate
argument-hint: [scope — e.g. "the staged diff", "src/mission-control/store/", "docs/tasks/my-plan.md"]
allowed-tools: Read, Glob, Grep, Task, Agent, Skill, Bash(git diff:*), Bash(git status:*), Bash(git log:*), Bash(npm run test:unit), Bash(npm run lint), Bash(npm run tsc)
---

Adversarially review: **$ARGUMENTS**

If no scope was given, default to the uncommitted + staged changes.

Working tree: !`git status --short`
Diff stat vs main: !`git diff main...HEAD --stat`

Load the `devils-advocate` skill and follow it: establish scope, read the confirmed false-positive list, fan out the relevant specialist subagents **in a single message** so they run concurrently, then arbitrate their findings into one deduplicated, severity-ranked report with a verdict.

Be a real arbitrator. Verify anything you'd rank CRITICAL or HIGH by opening the file yourself — specialists reason from a diff and sometimes miss context that makes a concern moot. Drop findings you can't state a concrete failure path for, and list what you dropped and why. A short report the user trusts beats a long one they skim.
