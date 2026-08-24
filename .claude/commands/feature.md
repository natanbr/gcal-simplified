---
description: Full UI feature flow — discovery, mockup, adversarial plan review, approval gate, implement, adversarial code review, visual verification
argument-hint: [feature description]
allowed-tools: Read, Write, Edit, Glob, Grep, Task, Agent, Skill, Artifact, Bash(npm run test:unit), Bash(npm run test:run), Bash(npm run test:clean), Bash(npm run lint), Bash(npm run tsc), Bash(git status:*), Bash(git diff:*), mcp__Claude_Browser__preview_start, mcp__Claude_Browser__navigate, mcp__Claude_Browser__computer, mcp__Claude_Browser__read_page, mcp__Claude_Browser__resize_window, mcp__Claude_Browser__read_console_messages
---

Build: **$ARGUMENTS**

This is the heavyweight flow for user-facing features. It puts adversarial review at the two points where it pays: **before** code exists (to kill a bad plan cheaply) and **after** it's written (to catch what you missed). Use `/task` instead for smaller work — this ceremony is not free.

Branch: !`git branch --show-current`

## 1. Discovery

Identify the target surface and which of the two design systems it belongs to (Calendar/Tailwind vs Mission Control/`mc.css` — see `CLAUDE.md`). Trace the data flow that feeds it: IPC channel → hook → component. Read the real code; don't reason from the file names.

Capture the current state visually so the final report has a "before". `preview_start` with the `renderer` config runs `npm run dev` and serves the renderer on :5173.

## 2. Design the change

Decide how the new UI slots into the existing one — replace, extend, or new surface. Load the `premium-ui` skill for motion, depth, and token discipline on the surface you're targeting.

Make it concrete before debating it in words. A mockup as an HTML artifact, an inline visual, or an annotated description of the layout all work — the goal is that the user can react to something specific rather than imagine it.

## 3. Write the plan, then attack it

Draft a step-by-step implementation plan: files to create/modify, data flow, types, states (loading/empty/error/success), test plan, and performance impact.

Then run the `devils-advocate` skill in **plan review** mode. It fans out `architect`, `ui-reviewer`, `user-critic`, and `qa-engineer` over the plan and returns mandatory amendments and open questions.

Amend the plan with what survives arbitration.

## 4. Approval gate — stop here

Present to the user: the mockup, the amended plan, the review findings, and any open questions.

**Wait for explicit approval before writing implementation code.** This gate is the entire reason to run this flow instead of `/task` — the value is spending review effort while changing direction is still cheap.

## 5. Implement

Tests first where the logic is testable (see `/task` step 2). Then build, respecting the boundaries in `CLAUDE.md` and the performance checklist for anything that adds a timer, effect, animation, or store write.

## 6. Attack it again

Run `devils-advocate` in **code review** mode over the diff. Fix everything that survives arbitration — including the MEDIUMs, unless you can say why they're acceptable.

## 7. Verify — visually and mechanically

```
npm run test:unit
npm run lint
npm run tsc
npm run test:run
```

Then look at the running app: `preview_start`, navigate to the feature, resize to a narrow window and a wide one, check the console for React warnings, and exercise the empty and error states — not just the happy path. Anything gated behind real IPC needs the actual Electron app, not the browser pane.

## 8. Report

- Before / after visuals
- What the plan review caught, and what the code review caught
- The architectural approach and why it beat the alternatives
- Test coverage added
- `docs/requirements.md` updated (append a dated entry to the end of the changelog)
