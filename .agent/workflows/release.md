---
description: release a new version of the app (bump patch, build, publish)
---

## Pre-release checklist (run manually, in order)

// turbo
1. Type-check — must be zero errors
   ```
   npx tsc --noEmit
   ```

// turbo
2. Unit tests — must all pass
   ```
   npm run test:unit
   ```

// turbo
3. E2E tests — must all pass (requires dist-electron/main.js to exist from a prior build or `npm run dev`)
   ```
   npm run test:run
   ```

// turbo
4. Clean test artifacts
   ```
   npm run test:clean
   ```

5. Commit everything — all changes must be committed to `main` before releasing
   - Run `/commit` workflow if there are uncommitted changes

## Release

The `npm run release` script does everything in one shot:
- Bumps the **patch** version in package.json (`npm version patch`)
- Pushes the version commit + git tag to `origin/main`
- Runs `tsc` + `vite build`
- Runs `electron-builder --publish always` (uploads installer to GitHub Releases)

// turbo
6. Run the release
   ```
   npm run release
   ```

## Notes

- **Requires `.env`** with `GH_TOKEN` set (or `GITHUB_TOKEN`) for electron-builder to publish to GitHub Releases.
- The built installer lands in `release/<version>/` locally.
- The GitHub Release is created/updated automatically by electron-builder `--publish always`.
- Current version: check `package.json` → `"version"` field (`npm run version-tag` bumps patch only; for minor/major use `npm version minor` or `npm version major` manually before step 6).
- After release, verify the new version appears at: https://github.com/natanbr/gcal-simplified/releases
