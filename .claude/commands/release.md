---
description: Pre-flight checks, GH_TOKEN validation, patch version bump, build and publish to GitHub Releases
allowed-tools: Read, Bash(npm run test:unit), Bash(npm run test:run), Bash(npm run test:clean), Bash(npm run lint), Bash(npm run tsc), Bash(git status:*), Bash(git log:*), Bash(git branch:*), Bash(node -e:*), Bash(npm run release), Bash(node -r dotenv/config node_modules/electron-builder/cli.js:*)
---

Cut a release.

- Branch: !`git branch --show-current`
- Working tree: !`git status --short`
- Current version: !`node -e "console.log(require('./package.json').version)"`

Releasing publishes an installer to GitHub Releases where real users will auto-update to it. Every gate below exists because something got shipped broken once. Run them in order and stop at the first failure.

## Pre-flight

**1. Must be on `main` with a clean tree.** `npm run release` tags and pushes; uncommitted work either gets left behind or shipped unreviewed. Run `/commit` first if there are changes.

**2. Type check** — `npm run tsc`, zero errors.

**3. Unit tests** — `npm run test:unit`, all pass.

**4. E2E** — `npm run test:run`, all pass. Requires `dist-electron/main.js` to exist from a prior build or `npm run dev`.

**5. Clean artifacts** — `npm run test:clean`.

**6. Validate `GH_TOKEN` before the bump, not after.** The token in `.env` expires silently, and discovering that *after* `npm version patch` has already tagged and pushed leaves the repo in a half-released state (see recovery below).

```bash
node -e "require('dotenv').config(); const https = require('https'); https.get('https://api.github.com/user', { headers: { 'Authorization': 'token ' + process.env.GH_TOKEN, 'User-Agent': 'gcal-simplified' } }, res => { let d=''; res.on('data', c => d+=c); res.on('end', () => console.log('Status:', res.statusCode, JSON.parse(d).login || JSON.parse(d).message)); });"
```

If it returns `401`, pull a working token from the GitHub CLI, which keeps its own OAuth session:

```bash
& "C:\Program Files\GitHub CLI\gh.exe" auth status -t
```

Then set it for the publish step (PowerShell): `$env:GH_TOKEN = "<token>"`.

**Never print the token value into the transcript.** Read the status output, use the token, don't echo it.

## Release

`npm run release` does all of this in one shot:
- `npm version patch` — bumps the patch version in `package.json`
- pushes the version commit + git tag to `origin/main`
- `tsc` + `vite build`
- `electron-builder --publish always` — uploads the installer to GitHub Releases

For a minor or major release, run `npm version minor` / `npm version major` manually **first**, then only the build+publish step below.

## Recovering from a partial failure

If `npm run release` fails *after* the version bump has tagged and pushed but before publish completes:

**Do not re-run `npm run release`** — `npm version patch` fails on the existing tag and you end up debugging the wrong problem.

Run only the build + publish step:

```bash
node -r dotenv/config node_modules/electron-builder/cli.js --publish always
```

## After

- The local installer lands in `release/<version>/`.
- Verify the new version appears at https://github.com/natanbr/gcal-simplified/releases
- Report the version shipped and the release URL.
