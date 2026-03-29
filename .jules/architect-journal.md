## 2024-05-24 - Workflow Diligence

**Learning:** When using temporary scripts (like python or bash scripts) to programmatically edit large files, I must remember to delete these throwaway files before committing. Also, I must strictly adhere to the requested scope of work and not get sidetracked by fixing unrelated failing tests or minor type warnings in other parts of the codebase, as this clutters the PR and can introduce unexpected test failures.
**Action:** Always run `git status` to verify the exact list of files being committed and ensure no garbage files or unrelated modified files are included in the staging area.
