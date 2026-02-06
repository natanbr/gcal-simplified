---
description: Workflow for a task including documentation, TDD (unit + e2e), implementation, and verification.
---

1. **Document Requirements**
   - Identify the requirements for the task.
   - Update documentation (e.g., in `docs/requirements.md`) to reflect these requirements.
   - If the requierments are not clear or there is conflict with other features and requierments stop and get back to me for clarifications before continue!
   - **Goal**: Ensure clarity on what is being built or changed.

2. **Add Tests (Red Phase)**
   - **Unit Test**:
     - Write a unit test for the specific business logic or component logic.
     - (If no unit test runner exists, set one up, e.g., Vitest).
     - Run the test to confirm it fails.
   - **E2E Test**:
     - Write an end-to-end test (e.g., using Playwright in `e2e/`) covering the full flow.
     - Run the test to confirm it fails.

3. **Perform Task**
   - Implement the feature or fix in the code.

4. **Verify Tests (Green Phase)**
   - Run the unit tests and ensure they pass.
   - Run the E2E tests and ensure they pass.
   - Debug and fix if they do not pass.

5. **Verify Documentation Update**
   - Check the documentation updated in Step 1.
   - Verify it accurately reflects the final implementation.
   - Make any necessary adjustments.
