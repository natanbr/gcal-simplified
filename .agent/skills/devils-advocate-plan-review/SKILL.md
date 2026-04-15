---
name: Devil's Advocate — Adversarial Plan Review
description: >
  Multi-lens adversarial review system for implementation PLANS and MOCKUPS. 
  An Arbitrator calls upon the standalone Architect, UX, PM, and QA skills to interrogate
  the implementation plan independently. Identifies flaws before code is written.
---

# 😈 Devil's Advocate — Plan Review

> **Primary mission**: Kill bad ideas on paper. Evaluate proposed architectures, UX mockups, and testing strategies using the standalone agent team's expertise before implementation begins.

---

## ⚡ BEFORE YOU START — Input Required

This skill requires:
1. A written **Implementation Plan** (usually markdown).
2. **Screenshots** of the target "Before" state and **Mockups / Stitch MCP outputs** for the "After" state.

---

## PHASE 1 — Call the Agents (Parallel Review)

> ⚠️ **Rule**: The Arbitrator does NOT do the raw analysis. Rely on the robust, standalone intelligence of the specialized team.

**Process**:
Read the proposed plan and UI mockups. Then invoke the internal perspectives aligned closely with the existing standalone team members:

1. **The Architect (`.agent/skills/architect/SKILL.md`)**
   - **Check**: Are component boundaries right? Is state managed correctly (Context vs Props)? Is IPC isolation handled safely?
2. **The UI/UX Expert (`.agent/skills/ui_ux_expert/SKILL.md`)**
   - **Check**: Does the mockup respect the Abyssal Command design language/Tailwind? Is the desktop viewport dimension respected?
3. **The User / PM (`.agent/skills/pm/SKILL.md`)**
   - **Check**: Did the plan forget error states, missing Google credentials, offline failure modes, or edge-case strings?
4. **The QA Engineer (`.agent/skills/qa/SKILL.md`)**
   - **Check**: Did the plan include a robust strategy for mocking `.preload` bridges for Playwright and Vitest?

---

## PHASE 2 — Arbitration & Artifact Generation

### ⚖️ THE ARBITRATOR (Plan Verdict)

**Identity**: Final synthesiser. Combines the 4 reviews into a Go/No-Go verdict.
**Process**:
1. Group duplicated findings.
2. Produce a combined list of **Mandatory Plan Amendments**.
3. Generate an explicit Approval Request format.

**Output format**:

*Note: Instead of just logging text, the Arbitrator must generate an `approval_request.md` Artifact for the user including this format:*

```markdown
## 😈 DEVIL'S ADVOCATE: PLAN REVIEW

### EXECUTIVE SUMMARY
[Should we approve this plan or revise it based on Architect/QA/UX warnings?]

### 🛑 MANDATORY PLAN AMENDMENTS
- [Fix 1]
- [Fix 2]

### ❓ OPEN QUESTIONS / CLARIFICATIONS
- [Question 1]

---

### DECISION
- [ ] Approved - Proceed with implementation
- [ ] Needs Revision - Back to drawing board
```

## PHASE 3 — Knowledge Sync
If the plan review reveals a recurring architectural constraint or an IPC boundary standard, record it in `.jules/architect-journal.md`.
