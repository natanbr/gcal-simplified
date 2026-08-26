---
name: devils-advocate
description: Adversarial multi-lens review for gcal-simplified — fan out independent specialist subagents over a diff, a file, or an implementation plan, then arbitrate their findings into one deduplicated, severity-ranked report with a ship/no-ship verdict. Use before merging or shipping anything non-trivial, when asked to review code or a plan, when a change touches electron/ or the always-mounted tree, and any time the honest answer to "is this actually good?" matters more than moving fast.
---

# Devil's advocate

The point of this skill is to stop *you* from being the only reviewer of your own work. A single pass by the author finds the bugs the author was already worried about. Independent lenses, each with a narrow mandate and no knowledge of what the others found, surface the ones nobody was looking for.

Two modes: **plan review** (kill bad ideas on paper, before code exists) and **code review** (interrogate a diff). Same three phases.

---

## Phase 0 — Establish scope and load prior knowledge

Get concrete about what is being reviewed before spawning anything:
- Code review → the diff. `git diff main...HEAD`, `git diff --staged`, or specific files the user names.
- Plan review → the written plan, plus any mockups or before/after screenshots.

Then read `.claude/skills/project-journal/references/architecture-patterns.md` yourself, specifically the **confirmed false positives** list. You are the arbitrator; you are the one who has to throw out findings that were already settled. The specialist agents read their own journal files.

---

## Phase 1 — Fan out

Launch the relevant subagents **in a single message so they run concurrently**. Give each one the same scope but let it apply its own mandate — do not tell it what to look for beyond the scope, or you'll get your own biases back in four voices.

Pick the lenses that actually apply. Running an irrelevant lens produces filler findings, which is worse than skipping it.

| Agent | Bring it in when |
|---|---|
| `architect` | Structure changed, files grew, boundaries or state placement are in play — almost always |
| `perf-sentinel` | Timers, effects, animations, store writes, render-path work, or anything in the always-mounted tree |
| `security-sentinel` | Anything under `electron/`, IPC channels, auth/tokens, external URLs, remote control |
| `qa-engineer` | Always for code review — is it tested, and does the test actually fail without the fix? |
| `ui-reviewer` | Any visual change |
| `user-critic` | Plan review, and any user-facing feature — "is this worth building as specified" |

Prompt each with: the scope, the command to get the diff, and a reminder to report findings with `file:line` and a concrete failure path. For plan review, hand them the plan text and ask what it forgets rather than what it gets wrong.

If you also want a broad sweep for issues nobody's lens covers, one `general-purpose` agent asked to find bugs with fresh eyes is a reasonable addition.

### When one round of lenses isn't enough

Plain fan-out has a known weakness: each lens reports once, and a confident-sounding finding that is actually wrong reaches arbitration with the same weight as a real one. For a release, an `electron/` change, or anything the user calls a thorough audit, a **deterministic workflow** is the better instrument — it can pipeline each finding straight into an adversarial verify stage (independent skeptics prompted to *refute* the finding, majority vote kills it) instead of leaving verification to your judgement alone.

Workflows spawn many agents and cost real tokens, so they run only when the user has opted in — they said "use a workflow"/"ultracode", or ultracode is on for the session. Without that opt-in, run the normal fan-out above and say that a deeper verified pass is available if they want it. Don't launch one silently.

---

## Phase 2 — Arbitrate

You do the synthesis, not the raw analysis. That separation is the whole design: the specialists are free to be paranoid because you are the one accountable for precision.

Work through the findings:

1. **Deduplicate.** The same defect often arrives from three angles. Merge them and note the consensus — a finding three lenses independently reached is much stronger than one.
2. **Verify before promoting.** For anything you'd rank CRITICAL or HIGH, open the file and confirm it. Specialists reason from a diff and sometimes miss context that makes the concern moot.
3. **Kill the uncertain ones.** If you can't state a concrete path from cause to consequence, drop it. A report padded with maybes trains the reader to skim, which costs you the real findings.
4. **Check against the false-positive list.** Drop anything already settled, and say you dropped it.
5. **Rank by what would actually hurt.** Not by how many agents mentioned it.

### Output — code review

```markdown
## 😈 Devil's advocate — code review
**Scope**: [files / diff range]
**Lenses**: [agents run]

### Verdict
SHIP | FIX FIRST | DO NOT SHIP — [one sentence why]

### Executive summary
[3–5 sentences. What this change does, and what the real risk is.]

### Confirmed issues

#### [1] [Title]
- **Severity**: CRITICAL | HIGH | MEDIUM | LOW
- **Consensus**: STRONG (n lenses) | SINGLE
- **Location**: `file.tsx:120`
- **Problem**: [what is wrong]
- **Failure path**: [concrete inputs/state → wrong behaviour]
- **Fix**: [actionable]

### Risk report
| Dimension | Status | Notes |
|---|---|---|
| Architecture & boundaries | 🟢🟡🔴 | |
| Code quality | 🟢🟡🔴 | |
| Performance / idle budget | 🟢🟡🔴 | |
| Security (IPC, tokens, remote) | 🟢🟡🔴 | |
| Test coverage | 🟢🟡🔴 | |
| UX & state coverage | 🟢🟡🔴 | |
| **Overall ship risk** | 🟢🟡🔴 | |

### Dismissed
[findings thrown out, with the reason — this is how the user calibrates trust in the report]
```

### Output — plan review

```markdown
## 😈 Devil's advocate — plan review

### Verdict
APPROVE | APPROVE WITH AMENDMENTS | BACK TO THE DRAWING BOARD

### Executive summary
[Does this plan survive the four lenses, or not?]

### Mandatory amendments
- [change the plan must make before implementation starts]

### Open questions
- [what the plan doesn't answer and will block on]

### Decision
- [ ] Approved — proceed with implementation
- [ ] Needs revision
```

Present the plan verdict to the user and **wait** for a decision before writing code. That gate is the entire value of reviewing a plan.

---

## Phase 3 — Journal what generalises

If the review surfaced a new architectural invariant, a recurring anti-pattern, or a finding that was investigated and turned out to be **deliberate**, append it to the right file under `.claude/skills/project-journal/references/`. The false-positive entries are the highest-value ones: they are the only thing that stops the next review from re-litigating a settled decision.

Don't journal the individual bugs. Git history has those.

---

## Project-specific checklist

Use this to sanity-check that the lenses covered the ground. It reflects how *this* codebase actually breaks.

**Boundaries**
- [ ] Nothing in `src/mission-control/` imports from `src/components/`, `src/hooks/`, `src/utils/`
- [ ] No cross-imports between game modules under `games/`
- [ ] All modified files under 300 lines
- [ ] `mcReducer.ts` still pure

**Types & hygiene**
- [ ] No `any`, no `as unknown as X`
- [ ] No `console.log` left in production paths
- [ ] No commented-out code
- [ ] Barrel `index.ts` exports where the pattern expects them

**Styling**
- [ ] Calendar app uses Tailwind tokens; Mission Control uses `--mc-*` from `mc.css`. Neither leaks into the other.
- [ ] No raw hex/rgb in components
- [ ] Conditional classes via `clsx`, not string concatenation

**Electron & security**
- [ ] New IPC channels added to both the preload whitelist and an `ipcMain` handler
- [ ] IPC inputs validated at the handler (types, and `isNaN(date.getTime())` for dates)
- [ ] External URLs built with `URL`/`URLSearchParams`
- [ ] `contextIsolation` on, `nodeIntegration` off, window-open denied, permissions default-deny
- [ ] No hardcoded secrets

**Performance** (see `perf-sentinel` for the full five checks)
- [ ] New `setInterval` gated and registered in `timer-registry.test.ts`
- [ ] Nothing new runs unconditionally on an idle Calendar
- [ ] No `repeat: Infinity` / CSS `infinite` in the always-mounted tree; animations unmount rather than fade
- [ ] Reducer returns the same state reference when nothing changed
- [ ] Every effect cleans up its timers/listeners/subscriptions

**Testing**
- [ ] Vitest coverage for new hooks, utils, reducer cases
- [ ] E2E considered for user-visible flows
- [ ] `npm run test:unit`, `npm run lint`, `npm run tsc` all clean

**Docs & commit**
- [ ] `docs/requirements.md` updated if shipped behaviour changed (append a dated entry to the end of the changelog)
- [ ] Conventional commit message that explains *why*
