---
name: Feature Implementation Flow
description: >
  A repeatable, UI-driven development workflow starting from UI discovery, mockups, 
  adversarial plan review, implementation, adversarial code review, and final visual reporting
  for the gcal-simplified application.
---

# 🚀 Flow: UI Feature Implementation

> **Purpose**: A structured 8-step workflow to implement UI features cleanly. It incorporates "Devil's Advocate" at two crucial points: once to catch architectural/design flaws in the plan, and once to catch bugs in the code.

## PRE-REQUISITES
- The project is running locally (`npm run dev`).
- You have access to the browser sub-agent if interacting with a browser representation, or know how to test desktop changes.

## THE 8-STEP FLOW

### 1. Discovery and UI Capture
- Identify the target UI component and the Google Calendar data structures involved.
- Take screenshots of the current state for the final report.
- Identify the data flow (Context, custom hooks, or Electron IPC).

### 2. Mockup Generation
- Analyze how we are going to inject or replace the existing UI cleanly.
- Use Stitch MCP or Generate Image tools to create the new UI for the new card/scenario based on the screenshots and user requirements. 
- Ensure adherence to the 'Abyssal Command' Tailwind design system.

### 3. Generate Implementation Plan & Devil's Advocate
- Draft a step-by-step technical implementation plan via `implementation_plan.md`.
- **ACTION**: Run the `devils-advocate-plan-review` skill. Instruct the Arbitrator to organize the isolated findings of the Architect, QA, User Critic, and UX roles.
- Summarize the Arbitrator's findings.

### 4. Wait for Approval
- Generate an explicit `approval_request.md` Artifact presenting the planned changes, mockups, and Arbitrator's plan review findings to the user.
- Add checkboxes effectively `[ ] Approved` and `[ ] Needs Revision`. 
- **STOP and WAIT** for explicit user approval before writing any code.

### 5. Implement
- Write the source code changes.
- Prioritize clean architecture, DRY principles, React best practices, and secure Electron IPC boundaries.

### 6. Devil's Advocate (Code Review)
- **ACTION**: Run the `devils-advocate-code-review` skill on your implementation diff.
- Cross-check against React hook dependency issues, stale closures, missing keys, and architectural breaches.
- **6.A Fix Issues**: Run code-fixing sessions as required to address ALL issues found by the Arbitrator.

### 7. Visual Testing
- Verify the changes locally, explicitly testing the Electron IPC boundaries using mock data or evaluating the actual `preload.ts` bridge.
- Take an "After" screenshot or capture logs for the final report. 

### 8. Final Report
- Write a walkthrough/final report containing:
  - Before and After screenshots (side-by-side or stacked).
  - Highlights of the Devil's Advocate findings (Plan vs Code) and what was patched.
  - A summary of the architectural approach chosen.
