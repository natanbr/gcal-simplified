---
description: Pre-flight checks, GitHub token check, patch version bump, build and publish to GitHub Releases
allowed-tools: Read, Bash(npm run test:unit), Bash(npm run test:run), Bash(npm run test:clean), Bash(npm run lint), Bash(npm run tsc), Bash(npx tsc), Bash(npx vite build), Bash(git status:*), Bash(git log:*), Bash(git branch:*), Bash(node -e:*), Bash(npm version patch)
---

Cut a release.

- Branch: !`git branch --show-current`
- Working tree: !`git status --short`
- Current version: !`node -e "console.log(require('./package.json').version)"`

Releasing publishes an installer to GitHub Releases where real users will auto-update to it. Every gate below exists because something got shipped broken once. Run them in order and stop at the first failure.

## Pre-flight

**1. Must be on `main` with a clean tree.** The version bump tags and pushes; uncommitted work either gets left behind or shipped unreviewed. Run `/commit` first if there are changes.

**2. Type check** — `npm run tsc`, zero errors.

**3. Unit tests** — `npm run test:unit`, all pass.

**4. E2E, on a build made just now.** `npm run test:run` never rebuilds: it launches whatever sits in `dist-electron/`, and `vite build` never empties that folder (renderer chunks from January 2026 were found there, packaged into an installer). So:

```powershell
Remove-Item -Recurse -Force dist, dist-electron -ErrorAction SilentlyContinue
```

then `npx tsc`, then `npx vite build`, then `npm run test:run`. Compare the *set* of failing specs to a baseline run, never the count: on an unsigned profile the calendar specs that need a Google account check nothing (five skip, three report passed; the QA plan names them), and a loaded machine has turned 8 failures into 24 on identical code.

The time of day no longer matters: every launch goes through `e2e/helpers/launchApp.ts`, which keeps a mission window or a running mission from covering the app (CLAUDE.md → Testing). If clicking specs fail with the mission overlay in the page snapshot, that chokepoint has been bypassed. Treat it as a bug in the suite, not as flakiness.

**5. Release QA pass, before the bump** — run [`docs/release-qa-plan.md`](../../docs/release-qa-plan.md) (catalogue: [`docs/release-qa-checklist.md`](../../docs/release-qa-checklist.md)) on that same build: its must-do list, both profiles (fresh and upgrade), and every changed area. Start a separate Claude session or subagent for the `[claude]` items. Record the run log only in a private location outside this repo, which is public. **Go/no-go:** any rule on the plan's blocking list (section 5, G1–G13, with its idle thresholds and its rule for a blocker that already shipped) stops the release. Everything else is logged as a follow-up and does not block.

**6. Clean artifacts** — `npm run test:clean`.

**7. Check the GitHub token before the bump, not after.** Discovering a bad token *after* the bump has tagged and pushed leaves the repo in a half-released state (see recovery below). The publish step takes its token from the GitHub CLI's own sign-in:

```powershell
& "C:\Program Files\GitHub CLI\gh.exe" auth status
```

It must report the github.com account as logged in, with `repo` among the token scopes. If not, Nathan runs `gh auth login`. Never add `-t`: it prints the token. `.env`'s `GH_TOKEN` has expired silently before; it is only a fallback now.

**Never print the token value into the transcript.** Read the status output, use the token, don't echo it.

## Release

The GitHub token goes to the publish step only: the bump and the build run without it in their environment. That is why this is three steps and not `npm run release`, which chains them all, so a token set before it reaches every step.

1. **Bump** — two separate commands: `npm version patch` (bumps `package.json`, commits, tags), then `git push origin main --follow-tags`. Not `npm run version-tag`, which chains the same two: the ask rule in `.claude/settings.json` matches `git push … main` only when the push is the command itself, so the separate push is where Nathan is asked to confirm the release before the tag leaves the machine. Git authenticates through its own credential helper (on this machine gh's, `gh auth git-credential`), so the push needs no `GH_TOKEN` in the environment. For a minor or major release run `npm version minor` (or `major`) and `git push origin main --follow-tags` instead.
2. **Rebuild** — the bump changed the version, so rebuild the QA'd source from an empty folder: `Remove-Item -Recurse -Force dist, dist-electron -ErrorAction SilentlyContinue`, then `npx tsc`, then `npx vite build`.
3. **Publish**, in **one** PowerShell invocation, which never displays the token:

   ```powershell
   $t = & "C:\Program Files\GitHub CLI\gh.exe" auth token; if (-not $t) { throw "gh is not signed in: stop, do not publish" }; $env:GH_TOKEN = $t.Trim(); node -r dotenv/config node_modules/electron-builder/cli.js --publish always
   ```

   It must be one invocation. Environment variables do not persist between tool calls, and `dotenv` does not override a variable that is already set, so the gh token only beats a stale `.env` value when both run in the same process. The `throw` keeps an empty gh token from falling back to that stale value. The publish command is deliberately not in `allowed-tools`. electron-builder uploads the installer to GitHub Releases.

One leak this ordering cannot close: `vite.config.ts` reads every `.env` key (`loadEnv(mode, cwd, '')`), so a `GH_TOKEN` kept in `.env` still reaches the build process's memory, though only four named keys reach the bundle. With the gh token there is no reason to keep one in `.env`.

## Recovering from a partial failure

If the publish step fails *after* the bump has tagged and pushed:

**Do not re-run the bump** (`npm version patch`, `npm run version-tag` or `npm run release`): `npm version patch` fails on the existing tag and you end up debugging the wrong problem.

Fix the cause (usually the token: step 7), then re-run step 2 if `dist-electron/` is missing or older than the bump, and step 3 exactly as written above, prefix and all.

## After

- The local installer lands in `release/<version>/`.
- **Publish the draft.** electron-builder leaves the GitHub release as a DRAFT (its URL reads `releases/tag/untagged-<hash>`), and users do not auto-update to a draft. It writes no release notes either. Write them to a file (the changelog entries since the last tag, plus the QA run's changed areas, with no household details: the notes are public), then (`& "C:\Program Files\GitHub CLI\gh.exe"` if `gh` is not on PATH):

  ```powershell
  gh release edit vX.Y.Z --draft=false --latest --notes-file <notes.md> --repo natanbr/gcal-simplified
  gh release view vX.Y.Z --json isDraft,url --repo natanbr/gcal-simplified
  ```

  Confirm `isDraft` is `false`.
- Verify the new version appears at https://github.com/natanbr/gcal-simplified/releases
- Run the plan's post-publish item (3.1.6): the previous version, installed, offers this update and installs it.
- **If that fails, the release is already public.** Stop the offer: set it back to draft (`gh release edit vX.Y.Z --draft=true --repo natanbr/gcal-simplified`; the updater does not see drafts) or delete it (`gh release delete vX.Y.Z --repo natanbr/gcal-simplified`). Then fix and ship a patch: machines that already updated leave the broken version only through a newer one.
- **The same steps apply when the update installs fine but hurts users** (lost coins, a blank calendar, a mission at the wrong time): set the release back to draft first. Prefer draft to delete, which keeps the installer for diagnosis. The tag stays, so the fix ships as the next patch number. The family machine checks 5 s after start and every 4 h, so assume it has already updated.
- Report the version shipped and the release URL.
