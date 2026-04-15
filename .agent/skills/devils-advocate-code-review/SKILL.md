---
name: Devil's Advocate — Adversarial Code Quality Review
description: >
  Multi-lens adversarial review system for the gcal-simplified React/Electron app.
  An Arbitrator calls upon the standalone Architect, Developer, PM, and QA Engineer skills
  to independently interrogate code. The Arbitrator synthesises results into a deduplicated, 
  severity-ranked issue list and appends findings to .jules/architect-journal.md.
---

# 😈 Devil's Advocate — gcal-simplified Code Review

> **Primary mission**: Ship clean, maintainable, well-architected code in the gcal-simplified React/Electron application.
> The bar here is separation of concerns, DRY principles, proper React patterns (hooks, side-effects, memoization),
> excellent UI edge-case handling based on the Abyssal Command design system, and risk-aware tested IPC boundaries.

---

## ⚡ BEFORE YOU START — Read the Journal

**MANDATORY FIRST STEP**: Read `.jules/architect-journal.md` and `.jules/communication-board.md`.
The journal records:
- Known false-positive patterns (do NOT re-flag these)
- Confirmed bugs and their fix status
- Architecture gotchas and recurring anti-patterns for Electron integrations.

---

## PHASE 1 — Call the Agents (Parallel Review)

> ⚠️ **Rule**: The Arbitrator does NOT do the raw analysis. Rely on the robust, standalone intelligence of the specialized team.

**Process**:
Read the target code files. Then invoke the internal personas or sub-agents aligned with the following existing skills (do not rewrite their rules, just follow them as defined in their standalone SKILL files):

1. **The Architect (`.agent/skills/architect/SKILL.md`)**
   - Focus: Component layering, SOLID principles, Electron/IPC isolations, File size.
2. **The Developer (`.agent/skills/developer/SKILL.md`)**
   - Focus: React hooks/dependency arrays, TypeScript `any`, stale closures, styling via Abyssal Command.
3. **The PM (`.agent/skills/pm/SKILL.md`)**
   - Focus: UX loading states, error states, empty array fallbacks, missing permissions.
4. **The QA Engineer (`.agent/skills/qa/SKILL.md`)**
   - Focus: Missing Vitest tests, insecure `preload.ts` exposure, unthrottled listeners.

*Note: The user specifies which file(s) or feature area to review. Feed the diff or the full file context evenly to the perspectives above.*

---

## PHASE 2 — Arbitration (Run after perspectives are collected)

### ⚖️ THE ARBITRATOR

**Identity**: Final synthesiser. Combines reviews into a single deduplicated issue list and risk report.

**Process**:
1. Cross-reference, deduplicate, merge, and score.
2. Validate issues against actual context (if known).
3. If an issue is uncertain or a false-positive, throw it out.

**Output format**:
```markdown
## 😈 DEVIL'S ADVOCATE CONSENSUS REPORT
### Scope reviewed: [file(s)]

### EXECUTIVE SUMMARY
[3-5 sentences]

---

### ✅ CONFIRMED ISSUES (sorted by severity)

#### [ISSUE-N] [Short descriptive title]
- **Severity**: CRITICAL | HIGH | MEDIUM | LOW
- **Consensus**: STRONG | SINGLE
- **Location**: `filename.tsx:line`
- **Problem**: Clear, direct description
- **Evidence**: [Code snippet]
- **Recommended fix**: [Actionable suggestion]

---

### 📊 RISK REPORT
| Dimension | Status | Notes |
|-----------|--------|-------|
| Architecture / Separation of Concerns | 🟢 / 🟡 / 🔴 | |
| Code Quality (Clean Code, DRY, SOLID)  | 🟢 / 🟡 / 🔴 | |
| Product / UX (Loading, Empty, Error states) | 🟢 / 🟡 / 🔴 | |
| Test Coverage (critical paths) | 🟢 / 🟡 / 🔴 | |
| Security (Electron IPC bounds) | 🟢 / 🟡 / 🔴 | |
| Performance | 🟢 / 🟡 / 🔴 | |
| **Overall Ship Risk** | 🟢 / 🟡 / 🔴 | |
```

---

## PHASE 3 — Knowledge Sync

After the Arbitrator produces the report, explicitly record any new architectural invariants, recurring false positives, or major component anti-patterns into `.jules/architect-journal.md`. Do not keep isolated logs.
