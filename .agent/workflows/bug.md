---
description: Workflow for fixing an existing bug, including verification, TDD, and regression testing.
---

1. **Verify Documentation**
   - Clarify the expected behavior.
   - If the behavior is not clear OR conflicts with other existing behavior, stop and get back to the user with clarification before proceeding.
   - **Goal**: Ensure the "correct" behavior is fully understood.

2. **Add Red Test**
   - Add a unit test or E2E test for the expected behavior.
   - Run **only** this single test to confirm it fails (red phase).
   - Use `-t` or equivalent flags for Vitest/Playwright to run only the relevant test.

3. **Fix the Bug**
   - Implement the fix in the code to make the test pass.

4. **Verify Single Test**
   - Re-run the single test to ensure it is now green.

5. **Run All Tests**
   - Run all tests to verify no other behavior has changed (regression check).
   - If other tests fail, re-evaluate the plan to fix the bug without breaking existing functionality.

6. **Clean Test**
   - Run `npm run test:clean` to ensure a clean state.

7. **Commit the Fix**
   - Commit the fix with a short message explaining the fix and the bug it addresses.
