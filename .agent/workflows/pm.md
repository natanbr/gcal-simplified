---
description: Primary orchestration workflow. Route any user request through the PM agent, coordinate all other agents, and manage the shared communication board.
---

# Multi-Agent Orchestration Workflow

This workflow activates the full agent team. **Always start here for any feature request, bug report, or feedback.**

---

## How It Works

Every user request flows through the **PM Agent** first. The PM reads the communication board, determines which agents to activate (and in what order), and coordinates parallel work where possible.

The PM is the **only agent that talks directly to the user** — all other agents communicate through `COMMS.md`.

---

## Step 1 — Activate the PM Agent

Read and fully internalize the PM skill before proceeding:

```
.agent/skills/pm/SKILL.md
```

As PM:
1. Read `.agent/COMMS.md` fully.
2. Clean up any handled temporary messages.
3. Identify the user's request type (see routing table below).

---

## Step 2 — Route the Request

Use the routing table to determine which agents to activate next.

### Request Routing Table

| User Request Type | Lead Agent | Supporting Agents | Parallel Possible? |
|---|---|---|---|
| New feature (UI only) | PM → UI/UX Expert | Developer, QA | UI spec + test plan can run in parallel |
| New feature (data/API) | PM → Hydrography Engineer | Architect, QA | All three can run in parallel |
| Bug (visual) | PM → UI/UX Expert | Developer | Sequential |
| Bug (data/calculation) | PM → QA → Hydrography Eng | Developer | QA + Hydro run in parallel |
| Performance concern | PM → Architect | Developer | Sequential |
| Security concern | PM → Architect | PM review | Sequential |
| User feedback / safety concern | PM → QA → Hydrography Eng | UI/UX if UI issue | QA + Hydro in parallel |
| Code review request | PM → Architect + QA | — | Both in parallel |
| Documentation update | PM → QA | — | — |
| UI consistency pass | PM → UI/UX Expert | — | — |

---

## Step 3 — Requirements Brief (PM)

For any non-trivial request, PM produces a Requirements Brief before other agents begin. Template:

```markdown
## Requirements Brief — [Feature Name]
**Date**: [date]
**Requested by**: User
**Safety implications**: [Yes/No — describe if yes]

### What
[Clear description of what is being built or changed]

### Why
[User need or problem being solved]

### Scope
[What is included and explicitly what is NOT included]

### Open Questions
[Any unresolved questions — block these before proceeding]

### Acceptance Criteria
- [ ] [Specific, testable criteria]
- [ ] [Each criterion maps to a test case]
```

Post this to `COMMS.md` under ACTIVE THREADS.

---

## Step 4 — Parallel Agent Activation

Activate agents in parallel when they have no dependency on each other:

### Tier 1 — Specification (can run simultaneously)
- **Hydrography Engineer**: Review data requirements, define API strategy, validate data rules.
- **Architect**: Define component structure, data flow, hook design, and ADR.
- **QA**: Draft the test plan and identify mock data needed.

### Tier 2 — Design (starts after Tier 1 produces spec)
- **UI/UX Expert**: Design the UI based on PM brief + Architect component tree.

### Tier 3 — Implementation (starts only when Tier 1 + 2 are complete)
- **Developer**: Implement per ADR + Requirements Brief. Uses QA test plan.

### Tier 4 — Verification (runs after implementation)
- **QA**: Run test plan, verify data correctness against raw API.
- **UI/UX Expert**: Visual QA pass — screenshot each breakpoint.
- **User/Critic**: End-to-end review from ocean athlete perspective.

### Tier 5 — Close
- **PM**: Review all agent sign-offs, update documentation, report to user.

---

## Step 5 — Agent Skill References

Activate each agent by reading its skill file:

```
PM:                     .agent/skills/pm/SKILL.md
Architect:              .agent/skills/architect/SKILL.md
Hydrography Engineer:   .agent/skills/hydrography_data_engineer/SKILL.md
UI/UX Expert:           .agent/skills/ui_ux_expert/SKILL.md
Developer:              .agent/skills/developer/SKILL.md
QA Engineer:            .agent/skills/qa/SKILL.md
User/Critic:            .agent/skills/user_critic/SKILL.md
```

---

## Step 6 — COMMS.md Maintenance (PM)

After every session:
1. Update sprint task table in `COMMS.md` with current statuses.
2. Delete temporary messages that are fully resolved.
3. Move any new permanent decisions to the PINNED section.
4. Summarize any long threads before archiving.

---

## Special Cases

### ⚠️ Safety-Critical Path (Fast Track)
If a user or User/Critic agent raises a **safety concern about data**:
1. PM immediately assigns to QA + Hydrography Engineer simultaneously.
2. All other sprint work is paused until resolved.
3. Developer is on standby for a hotfix.
4. PM does not close the thread until User/Critic confirms resolution.

### 🧭 When User Asks "Where Are We?" / Status Check
PM reads `COMMS.md` sprint table and responds with:
- Current sprint tasks and their status.
- Any blockers.
- Next steps.

### 💡 When User Wants to Brainstorm
PM leads a structured discussion:
1. Restate the problem to confirm understanding.
2. Ask 2–3 focused questions to sharpen the idea.
3. Propose 2–3 approaches with trade-offs.
4. Recommend one approach and ask for approval.
5. Only then proceed to create a Requirements Brief.
