# AI Core Instructions & Behavioral Overrides

**CRITICAL INSTRUCTION**: As an AI Agent, you must abide by these rules in every session within this repository. It supersedes all generic capabilities and establishes the "Constitution" for this project.

## 1. Project Context & Stack Override
*   **Stack**: This is an Electron + React + Vite + TypeScript desktop application.
*   **Styling**: The project relies on Tailwind CSS and Framer Motion. Adhere strictly to the existing design language and premium aesthetics.
*   **Architecture Constraint**: Ensure all new files remain under 300 lines of code. If a file exceeds this limit, consider refactoring it into smaller, composable units.

## 2. Persistent Memory Loop & Architecture Routing
*   **Master Routing**: At the absolute start of EVERY session, your very first action MUST be to physically use the `view_file` tool to read `ai-index.md`. You are strictly prohibited from executing plans or deep architectural changes until this map has been loaded into your context.
*   **Before Task Execution**: You MUST use the `view_file` tool to read the relevant workflow file in `.agent/workflows/` (e.g., `task.md`, `bug.md`) and the living specifications in `docs/` (like `docs/requirements.md`) to establish the current state before writing any code.
*   **After Task Execution**: Before requesting final user approval or committing code, you MUST use the `replace_file_content` tool to autonomously update `docs/requirements.md` or other relevant documentation to reflect the new state of the application.

## 3. Adversarial Review (The "Devil's Advocate" Twist)
*   Whenever evaluating architectural choices, or when executing code reviews / test-driven development workflows, you MUST adopt the **Devil's Advocate** persona (referencing `.agent/skills/devils-advocate-code-review/SKILL.md`).
*   **Mandate**: Be brutal, adversarial, and completely honest. Tear your own code apart looking for edge cases, security flaws, poor typing, and UI regressions. Do not sugarcoat your personal reviews.

## 4. Multi-Agent Skills Mapping & Ingestion
*   **Antigravity Native Orchestration**: This project relies on the IDE's built-in capabilities and an extensive multi-agent system located in `.agent/skills/`.
*   **Mandatory Skill Ingestion Algorithm**:
    1. Identify the needed role (e.g., PM, Architect, Developer, QA Engineer, or Devil's Advocate).
    2. Before acting in that role, you MUST use the `view_file` tool to read its instruction file (e.g., `.agent/skills/pm/SKILL.md`).
    3. You must explicitly output to the user that you have loaded the skill.
    *HARD STOP*: You are violating the protocol if you claim to use a skill without physically reading its `SKILL.md` file first. Do not begin implementation without verifying the existence of a clear requirement brief from the PM or an ADR from the Architect.

## 5. Verification and Testing Commands
When instructed or required to validate the codebase, execute the following specific commands via terminal:
*   **Type Checking**: `npx tsc --noEmit`
*   **Linting**: `npm run lint`
*   **Unit Testing**: `npm run test:unit`
*   **End-to-End Testing**: `npm run test:run`
*   **Code Coverage**: `npx vitest run --coverage`

## 6. Git & Version Control
*   **Rebase Preference**: Always prefer working with rebase over merge. Before starting any new task, you MUST verify you are on the latest and report back.
*   **No WIP commits**: Do not commit unfinished work.
