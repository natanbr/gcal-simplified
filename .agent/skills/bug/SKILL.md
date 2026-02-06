# Bug Fixing Skill

This skill focuses on a structured approach to fixing existing bugs using Test-Driven Development (TDD) principles and ensuring system stability through regression testing.

## Guidelines

1. **Verify Documentation**: Before starting, clarify the expected behavior. If the requirements are unclear or conflict with other behaviors, pause and seek clarification from the user.
2. **Add Red Test**: Write a unit or E2E test that reproduces the bug. Run only this specific test to confirm it fails.
3. **Fix the Bug**: Apply the necessary code changes to resolve the bug.
4. **Verify Fix**: Re-run the specific test created in step 2 to ensure it now passes (green).
5. **Regression Testing**: Run the entire test suite to ensure no other functionality was broken. If regressions are found, re-evaluate the fix.
6. **Cleanup**: Execute `npm run test:clean` to maintain a clean environment.
7. **Commit**: Commit the changes with a concise message explaining what was fixed.
