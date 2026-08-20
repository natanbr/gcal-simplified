---
name: project-journal
description: The accumulated engineering memory of gcal-simplified — every performance regression, security vulnerability, architectural pattern, and confirmed false positive this project has already worked through. Load this before reviewing code, diagnosing a performance or CPU problem, touching electron/ or the IPC boundary, designing a new Mission Control feature, or hunting a bug that smells familiar. Also use it to append a new learning after solving something non-obvious, so the next session starts where this one ended.
---

# Project journal

This project has been through many review cycles, and the same handful of mistakes keep trying to come back. Everything in `references/` is a real thing that happened in this codebase — a regression that shipped, a vulnerability that was found, or a pattern that was settled after an argument.

Two reasons to read it before doing review or design work:

- **Speed.** Most findings in this codebase are a repeat of something already documented. Recognising "this is the infinite-Framer-loop thing again" takes seconds; rediscovering it takes a review cycle.
- **Not wasting the user's time.** `architecture-patterns.md` records confirmed **false positives** — things that look wrong but are deliberate. Re-flagging them makes reviews noisy and trains the user to skim.

## Which file to read

| File | Read it when |
|---|---|
| `references/perf-learnings.md` | Anything touching timers, effects, animations, render paths, store writes, or the "CPU is spinning" complaint |
| `references/security-learnings.md` | Anything in `electron/` — IPC channels, OAuth, token storage, external URLs, the remote-control channel |
| `references/architecture-patterns.md` | Designing or reviewing structure: state placement, module boundaries, game modules, persistence/migrations, test isolation. **Contains the false-positive list.** |

Read the whole relevant file — they are short, and the value is in recognising a pattern you weren't looking for.

## Appending a learning

Append when you solved something whose lesson generalises beyond the immediate fix — a non-obvious failure mode, a pattern that should now be the default, a false positive worth suppressing. Don't append routine bug fixes; git history already records those, and a journal that logs everything stops being read.

Add to the end of the right file, newest last:

```markdown
## YYYY-MM-DD — [Short title]

**Learning:** [what was actually true, and why it wasn't obvious. Name the real files.]
**Action:** [the pattern to apply from now on, concretely enough to follow without re-deriving it]
```

For a settled false positive, say so explicitly and give the reason it's intentional — the next reviewer needs to know it was considered, not overlooked:

```markdown
**False positive: [what looks wrong].** [Why it's deliberate.] Do NOT flag this in future reviews.
```

Keep entries tight. The journal earns its place by being readable in one sitting; if a file grows past roughly 300 lines, consolidate related entries rather than letting it sprawl.
