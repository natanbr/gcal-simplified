# Release QA plan

Nathan and a Claude session looking around the build that will ship, before the version bump in
`/release`. Automated suites cover a lot; this covers what they cannot see: touch, scaling, idle
CPU, restarts, sign-in over hours, the phone, and upgraded state. The full catalogue, one stable ID
per item, is [release-qa-checklist.md](release-qa-checklist.md).

**Time, honestly.** The must-do list (section 4) takes about 45–60 minutes, with a Claude session
doing the `[claude]` items in parallel, plus 5+ minutes per changed area (section 3) and a relaunch
at each of the three display scalings (3.13.1). The full catalogue takes 2–3 hours, spread across releases by
rotation. Spend any spare time on what changed (section 3).

**Tags.** `[human]` needs eyes, touch or judgement · `[glance]` an E2E spec already covers it, so a
quick look is enough (spec named) · `[claude]` a Claude session can verify it by driving the app.
**(why: …)** points at the journal entry (`.claude/skills/project-journal/references/`), spec section
(`docs/requirements.md`) or CLAUDE.md rule the item exists for.

## 1. How to run

**Who runs what.** Nathan runs the `[human]` items. The releasing Claude session starts a separate
Claude session or subagent for the `[claude]` items, so both halves run in parallel and the
releasing session keeps its context for the go/no-go call. Results go **only outside this repo**,
because the repo is public: copy the run-log template (section 7) to `qa-runs/<version>.md` in a
private location, never into a commit, PR or issue here.

**Build: QA the same source that ships.** `vite build` never empties `dist-electron/`, and chunks
from January 2026 have been found there, packaged into installers. From the release commit on `main`,
before the version bump:

```powershell
Remove-Item -Recurse -Force dist, dist-electron -ErrorAction SilentlyContinue
npx tsc; if ($?) { npx vite build }
```

That gives `dist-electron/main.js`, which Playwright and every `[claude]` item drive. The published
binary is not this file: `/release` rebuilds after the version bump, from the same source. Install
items need the packaged app too: `npx electron-builder --publish never` writes the NSIS installer to
`release/<version>/`. It carries the same version number as the release already installed, because
the bump comes after QA, so tell the two apart by the installer's timestamp and record the build SHA.
The real auto-update can only be checked after publishing (3.1.6).

**Order of a pass.**
1. Build (above). The Claude session builds the previous release for profile (b) at the same time,
   so both builds finish before any measurement.
2. Nathan signs in on profile (a) (3.3.1) and starts the 10-minute idle wait of 3.4.1 before
   anything else. While it runs, Claude only measures (3.4.4): building or seeding in parallel
   loads the machine and spoils the reading (section 5, idle thresholds).
3. Nathan's must-do items while Claude runs its own; then rotation items as time allows.
4. Offline steps (3.2.2, 3.11.5, 3.12.5, profile (c)) cut the Claude session's connection too:
   batch them, and tell it first. Offline means Wi-Fi off **and** Ethernet unplugged (or airplane
   mode), checked: `Test-NetConnection github.com -Port 443` must fail. Windows can reconnect Wi-Fi
   by itself, so check again before each offline step.
5. Cleanup (section 2).

**Mind the clock.** A manual launch starts the mission whose window is open (defaults 06:00–06:30
and 19:00–20:00), and its overlay covers both views. That includes a mission still running on the
profile from an earlier launch: it runs its full duration past the window's end, and only the
phone's Stop ends it early (the desktop has no stop gesture since 2026-09-24). Plan the pass outside those windows unless an item needs a mission. The
E2E suite is immune (`launchApp`); a hand-driven or Claude-driven pass is not.

**Claude driving the app.** A window that is never shown renders at about 2 fps, so animation and
drag items look broken when they aren't, and CPU reads low. Show the window without focus
(`BrowserWindow.showInactive()` through `electronApp.evaluate`) before judging motion or measuring.
Touch through CDP `Input.dispatchTouchEvent` is emulated, not a finger on glass, so `[human]` touch
items stay human.

**Claude driving the Calendar.** An isolated profile has no Google sign-in and shows the login
screen. Reach the Dashboard by replacing the `auth:check` and data handlers through
`electronApp.evaluate(({ ipcMain }) => …)` and reloading, as `e2e/week-display-customization.spec.ts`
does, but give the `weather:get` mock a full `hourly` block next to `daily.time`. That spec's mock has
none, and opening the weather drawer on it blanks the whole window (the app has no React error
boundary). Each reload writes another `SESSION_START` to the audit trail (3.14.2).

**What `[glance]` is worth.** Mission Control specs and `week-display-customization` run on an
isolated profile and always execute. The other calendar specs need a signed-in Google account, and
without one they check nothing in two different ways. `week-navigation`, `monthly-view`,
`weather-modal`, `settings-power` and `calendar-cache` call `test.skip` and show as **skipped**.
`dashboard`, `event-colors` and `day-header-enhancement` see the login screen, `return`, and show as
**passed** (their output says "Skipping"); `event-colors` also passes with zero events. So check the
report for skips and those three specs' output before trusting a `[glance]` there. Coverage is also
narrower than the names: `mc-bank-management` reaches the real "⚙️ Bank Admin" only for "+1" (its
other tests open the look-alike trap), Activity's "Claim" (+3) has no automated test, and
`event-colors` checks colour classes, not measured contrast.

## 2. Profiles

Never the real one. A profile is Electron's userData directory: the Mission Control store
(`localStorage` key `mc-state-v5`), `config.json` (settings and the phone's pairing keys),
`auth-store.json` (Google tokens) and `audit-log.ndjson`.
- **(a) Fresh:** `npx electron dist-electron/main.js --user-data-dir=$env:TEMP\gcal-qa-fresh`
  (delete the folder first). Claude: `createIsolatedUserData()` + `userDataArg()` from
  `e2e/helpers/userDataDir.ts`, or the `mcTest` fixture in `e2e/helpers/mcApp.ts`.
- **(b) Upgrade:** state saved by the previous release, loaded by the new build. Hydration and
  sanitisation bugs only show here. Recipe: `git worktree add` the previous tag (`$T`, section 3).
  If `git diff $T HEAD -- package-lock.json` is empty, link `node_modules` (`cmd /c mklink /J`);
  otherwise run `npm ci` there, so the old state comes from the code that actually shipped. Build it
  the same way, launch it with `--user-data-dir=$env:TEMP\gcal-qa-upgrade`, and create realistic
  state (tokens in the bank and a goal, a completed mission, a suspended privilege, a few quiz
  answers, 30+ log entries). Write down what the screen shows, quit, then launch the **new**
  `dist-electron/main.js` on the same folder. Create the state through the old build's own UI, so
  the old code writes it; Claude uses `patchMCState` only for what the UI cannot reach quickly (a
  streak, a suspension already past its end), then lets the old build run a minute so it rewrites
  the store itself, and reads back with `readMCField`. The same old build is the "previous release" for the idle comparison (3.4.4).
- **(c) Optional, realistic upgrade state:** quit the installed app (a copy of a live LevelDB can be
  torn), copy `%APPDATA%\gcal-simplified` to `$env:TEMP\gcal-qa-copy`, **go offline** (Order of a
  pass, step 4: Wi-Fi and Ethernet, checked), and launch the new build on the copy. It holds the
  household's live pairing keys and Google tokens, so it must never go online: it would join the
  family's real remote room. Close it and delete the copy before reconnecting (3.12.9).
- The real profiles: `%APPDATA%\Electron` (dev runs and the unisolated E2E specs) and
  `%APPDATA%\gcal-simplified` (the installed app: `auth-store.json`, `config.json`,
  `audit-log.ndjson`, `Local Storage`). A run pointed at either rewrites real state and joins the
  household's real remote room. The one deliberate exception is 3.2.2.
- Humans reach Mission Control through the Calendar's "⭐ Command Center", so sign in with Google on
  each QA profile first. Claude opens it directly with `?mc=1`, which needs no sign-in.
- The single-instance lock is per profile: a second launch on the *same* profile must quit (3.2.3),
  while one on another profile runs alongside. Still close the E2E suite, `npm run dev` and the
  installed app first. They skew CPU readings, and the installed app holds the real profile.
  Close the installed app only when no mission is running on it, and reopen it before its next
  mission window (the family's own times, in its MC ⚙️ "🕒 Missions Time"): quitting mid-mission and
  relaunching after the window counts a miss against the real child's shield (3.12.8).

**Cleanup after the pass.** Close every Electron you started (`tasklist | findstr /i electron`
empty). Remove (b)'s link first (`cmd /c rmdir <worktree>\node_modules`), then `git worktree remove`:
a recursive delete that follows the junction empties the main checkout's real `node_modules`. Delete
the throwaway profiles (`gcal-qa-fresh`, `gcal-qa-upgrade`, `gcal-qa-copy`, and any
`createIsolatedUserData()` folders): a signed-in one holds a Google refresh token. Revoking the grant
at myaccount.google.com is optional and only safe with a separate test account: it removes the
grant from every install on that account, the family's included.

## 3. What changed

```bash
T=$(git describe --tags --abbrev=0)               # before the bump: the last published tag, e.g. v0.0.42
git log --oneline --no-merges $T..HEAD            # every change since
git diff --dirstat=files,3 $T..HEAD -- src electron   # which areas moved
git diff $T..HEAD -- docs/requirements.md | grep '^+### '   # changelog entries added since
```

QA runs before the bump, so `git describe` returns the previous release. Once the release commit
is tagged it returns the new tag and the range is empty: then use `git describe --tags --abbrev=0
HEAD^` (right after the bump) or the second line of `git tag --sort=-creatordate`.

Read each new changelog entry in `docs/requirements.md` in full: it states the intended behaviour and
usually the bug it fixes. For each changed area, spend 5+ extra minutes past the checklist, trying to
break exactly what the entry claims. Record each area and what you tried in the run log.

## 4. Must-do list

Every release runs these, plus every changed area (section 3). Each go/no-go rule (section 5) has at
least one item; the Space Rescue row lists every item that guards the drop rule.

| Rule | Must-do items |
|---|---|
| G1 tokens, goals or log lost or duplicated | 3.7.3, 3.8.2, 3.13.4, 3.14.1 |
| G2 upgrade loses state | 3.12.7 |
| G3 a second instance boots | 3.2.3; 3.2.2 too when `electron/main.ts` or `electron/single-instance.ts` changed since `$T` |
| G4 mission at the wrong time or twice | 3.5.7, 3.5.12, 3.12.8 |
| G5 shield lock traps the parent | 3.6.4, 3.11.6 |
| G6 idle CPU or memory | 3.4.1 with 3.4.4 |
| G7 install, launch, auto-update | 3.1.1, 3.1.2, 3.1.3; 3.1.6 right after publishing |
| G8 crash or blank screen | 3.1.3, 3.3.14 |
| G9 audit trail | 3.14.1 |
| G10 Space Rescue drop off the ghost | 3.10.1, 3.10.2, 3.10.3, 3.10.6, 3.13.1 |
| G11 Google sign-in lost | 3.3.1, 3.3.12 |
| G12 phone connection or remote control | 3.11.1, 3.11.2, 3.11.5 |
| G13 remote allowlist | 3.11.6 |

That is 28 items (29 with 3.2.2). A must-do item that cannot be run (no spare device, no touchscreen)
needs a reason in the run log and Nathan's explicit OK before a GO.
An item that fails only on its listed known bug is judged by that bug: it blocks when the bug itself
breaks a rule (bug 1 breaks G4, and is already shipped: section 5), not otherwise (bug 8 in 3.1.3).

**Everything else rotates.** Pick a different slice each release, favouring areas near the changes.
An item skipped in three releases running becomes must-do in the next: read the "Skipped IDs" lines
of the last three run logs.

## 5. Go / no-go

Any of these blocks the release:
- **G1** token, goal or log data lost, reverted or duplicated;
- **G2** the upgrade profile loses or resets state;
- **G3** a second instance boots;
- **G4** a mission starts at the wrong time or twice;
- **G5** the shield lock blocks a parent tool or completing a mission (the lock becomes inescapable);
- **G6** idle CPU or memory over the thresholds below;
- **G7** install or launch fails, or the post-publish auto-update fails (recovery below);
- **G8** a crash or blank screen anywhere: Calendar, Mission Control or a game;
- **G9** the audit trail stops appending;
- **G10** a Space Rescue drop lands somewhere the ghost did not show;
- **G11** Google sign-in is lost: the adult has to sign in again;
- **G12** the phone loses its connection to the desktop and does not recover, or a remote action
  does not land;
- **G13** the desktop accepts a remote action that is not on `REMOTE_ALLOWED_ACTIONS`, or a
  malformed payload changes state.

**Idle thresholds (G6).** Starting values, to tune as runs accumulate. Measure as 3.4.4 describes:
renderer and total CPU over the 10-minute idle, average and peak, in % of one core, and total memory
at the first and last sample. Compare with the previous release on the same machine, same method,
with the system otherwise quiet. Blocking: an average (renderer or total) more than 1 percentage
point above the previous release's, or memory growing more than 50 MB over the 10 minutes. Record
the peaks too; they block only with a cause. A busy machine adds noise, so if a reading breaches
while the system was busy (Claude building, say), re-measure on a quiet system before calling it.

**A blocker already in the installed release.** When the same rule also fails on the build already
out, blocking protects no one by itself (bug 1's code path came with commit 73080e7, first tagged
v0.0.41). Record the blocker with its origin commit and the release that shipped it, and decide
explicitly: ship with a scheduled fix, or fix first. Never block, or ship, silently.

**A post-publish failure is already public.** If 3.1.6 fails, users on the previous version are
being offered the broken one. Set the GitHub release back to draft (`gh release edit vX.Y.Z
--draft=true --repo natanbr/gcal-simplified`: the updater does not see drafts, so the offer stops) or
delete it (`gh release delete vX.Y.Z --repo natanbr/gcal-simplified`), then fix and ship a patch.
Machines that already updated leave the broken version only through a newer one. `/release` → After
has the same steps.

Everything else (cosmetic, dark-mode contrast, a scaling glitch that does not move a drop, game
polish) is logged as a follow-up with a file and a one-line repro, and does not block.

## 6. Open questions and known bugs

Kept out of the checklist, so every item there has an expected result. Each known bug has a
pass/fail check that says "(currently fails: bug N)" until the bug is fixed. A fix branch named
under Status is in the build only once it is merged to `main`; check before expecting its item to
pass, and update this table when it merges.

**Known bugs**, from the first run (v0.0.42, 2026-09-21); the numbers match that run's log.

| # | Bug | Status | Check |
|---|---|---|---|
| 1 | Stopping a scheduled mission inside its window restarts it at once (code path from 73080e7, v0.0.41) | fixed 2026-09-23, PR 170 (dce4ab0), on `main` | 3.5.12 |
| 2 | A mission started while a game is open draws under the game; its timer runs out of sight | decision D1 | 3.10.14 |
| 3 | The goal picker shows a custom reward cost but the goal needs the catalogue cost | fix in progress: `claude/fix-reward-cost` | 3.8.4 |
| 4 | An expired privilege suspension never lifts | fix in progress: `claude/fix-privilege-expiry` | 3.9.3 |
| 5 | "The Bank", "+ Add goal" and the coins look live while the shield is broken | decision D3 | 3.6.3 |
| 6 | At 5 mood tokens a full gauge silently drops to ~0 % | fix in progress: `claude/fix-mood-cap-reset` | 3.7.2 |
| 7 | "🎁 Use!" stays live up to ~60 s after the evening start when no mission fires | open | 3.8.8 |
| 8 | The production CSP blocks Google Fonts, so Nunito, Inter and Space Grotesk never load | decision D2 | 3.1.3 |
| 9 | The lifted shape hides an exactly aligned red (or green) ghost | open, confirm on glass | 3.10.2 |
| 10 | Quitting the app mid-game never writes "🏁 Quick Game ended" | open | 3.12.2 |
| 11 | Privilege suspend and reinstate write no activity-log line | open | 3.9.2 |
| 12 | The "Solve Math" rescue slot also asks reading questions | open, cosmetic | 3.10.7 |
| 13 | Refusal labels are light grey on light grey | open, cosmetic | 3.6.2 |
| 14 | A Quick Game refund's log line says 0 tokens | open, cosmetic | 3.8.9 |
| 15 | After picking, the new goal renders pushed down until the picker's exit ends | unconfirmed | 3.8.3 |
| 16 | The bank trap overlay stays ~10 s instead of 5 s | open, cosmetic | 3.8.1 |
| 17 | Overlapping week cards overhang their day column by ~3 px | open, cosmetic | 3.3.4 |
| S1 | A weather failure at launch shows "Failed to load calendar data." and leaves settings unloaded (`Dashboard.tsx`: `weather:get` sits before `settings:get` in one `try`) | suspected from code, not yet seen | 3.3.14 |

**Decisions for Nathan**
- **D1 A mission starting under an open game** (bug 2). End the game when the mission starts (refund
  its token or not), show the mission above a paused game, or hold the mission until the game closes
  (its timer then starts late). Each keeps the timer visible; which one is a product call. The cost
  while it stays open: a timeout counts wherever the overlay is (3.5.8), so the child can lose a
  shield segment for a mission they never saw.
- **D2 The CSP blocking Google Fonts** (bug 8). Either add `fonts.googleapis.com` and
  `fonts.gstatic.com` to the meta CSP in `vite.config.ts` (the header CSP in `electron/main.ts`
  already lists them, but both policies apply and the stricter wins), or bundle the three fonts with
  the app. Recommendation: bundle. It works offline, makes no third-party request, and keeps the CSP
  strict.
- **D3 Frozen controls that don't look frozen** (bug 5). Grey "The Bank", "+ Add goal" and the coins
  like the other frozen controls, or accept the spring-back as the signal and change the
  requirement. Recommendation: grey them; the requirement already says every frozen control looks
  refused, because a refusal writes no log line.

**Open questions**
- **Q1** Active Hours: the Settings copy promises "Before" / "After" buckets and the spec "Pre" /
  "Post" buckets; the app lists out-of-hours events unlabeled with the all-day events (3.3.5). Fix
  the copy and spec, or build the buckets?
- **Q2** The requirements' "Earning is never blocked" (Streak shield) contradicts the lock freezing
  the child's own earning (CLAUDE.md → Mission streak shield; 3.6.2). The requirement looks stale.
- **Q3** Snake is keyboard-only (3.10.9): does the child's setup have a keyboard?
- **Q4** Phone "Effects" and "Reactions" show nothing while the desktop is on the Calendar, because
  the overlay lives in MC (3.11.4). Intended?
- **Q5** Sleeping through a window: the wake-up re-arm may cancel the timer before "⏭️ … skipped"
  is written (3.12.3).
- **Q6** A Windows clock jump has no specified behaviour (3.12.4).
- **Q7** A revoked Google grant leaves a small red "Failed to load …" in the header and never
  returns to "Sign in with Google", because a stored token counts as signed in (`auth:check`). Is
  "Reconnect Account" in Settings enough of a way out (3.3.13)?

**Doc drift to fix in a docs change:** `docs/performance.md` says the Perf HUD is always on (it is
opt-in, 3.4.2); the spec says the day-header weather covers the current week only (it covers 16
days, 3.3.6).

## 7. Run-log template

```markdown
# QA run: v<version>   date: <YYYY-MM-DD>   testers: <name> + <Claude session title>
Build SHA: <git rev-parse --short HEAD>   previous tag ($T): <tag>   dist-electron emptied first: yes/no
Installer built (electron-builder --publish never): yes/no   Display scaling tried: 100 / 125 / 150
Profiles: (a) fresh: yes/no   (b) upgrade from $T: yes/no   (c) installed copy, offline: yes/no
Items run: <IDs>
Skipped IDs: <IDs>        (an ID skipped in three runs in a row is must-do next time)

## Areas changed this release (section 3)
| Area / changelog entry | What I tried | Result |
|---|---|---|

## Must-do (section 4)              (list fails and skips only; a skipped item needs a reason and Nathan's OK)
| ID | Result | Note |
|---|---|---|

## Idle (3.4.4)                     (% of one core; memory = all app processes)
| Build | Renderer avg / peak | Total avg / peak | Memory first → last (MB) | System CPU |
|---|---|---|---|---|
| new | | | | |
| previous ($T) | | | | |

## Results by area                  (pass / fail / skipped counts; list only fails and skips)
| Area | Result | Notes |
|---|---|---|
| 3.1 Install, update, launch | | |
| 3.2 Single instance | | |
| 3.3 Calendar | | |
| 3.4 Idle performance | | |
| 3.5 Missions | | |
| 3.6 Shield | | |
| 3.7 Mood gauge and tokens | | |
| 3.8 Bank, goals, quick-game window | | |
| 3.9 Responsibilities, privileges, log | | |
| 3.10 Games | | |
| 3.11 Remote control | | |
| 3.12 Resilience | | |
| 3.13 Display and input | | |
| 3.14 Audit trail | | |

## Blockers (go/no-go rule hit)
- <ID> → <rule G1–G13> → <repro> → also in the installed release? <no | yes: origin commit, decision>

## Follow-ups
- <ID> → <file, one-line repro> → <task link>

## Cleanup
Electron processes left: 0   Throwaway profiles deleted: yes/no   (b) worktree removed, link first: yes/no

Verdict: GO / NO-GO
```
