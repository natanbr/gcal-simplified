# Release QA checklist

The full catalogue for [the release QA plan](release-qa-plan.md): how to run it, the profiles, the
tags, the must-do list and the go/no-go rules live there. Every item has a stable ID (`3.5.4` = area
3.5, item 4) so run logs and lists can point at it. The `3.` prefix is kept from when this was
section 3 of the plan. Never renumber: a new item takes the next free number in its area, and a
retired number is not reused.

Every item states its expected result. "(currently fails: bug N)" marks a known bug from the plan's
[Open questions and known bugs](release-qa-plan.md#6-open-questions-and-known-bugs): the item
passes only once the bug is fixed, and a fail with that note is not a new finding.

On-screen names are quoted as the app shows them. In Mission Control (MC, the kid area) the
game tokens the mood gauge earns are called **mood tokens**; bank coins are separate.

**Before 3.7, 3.8 and 3.10**, open the quick-game window: it is open only between the day's missions
(after the morning concluded, until the evening start), and shut from the evening start to midnight.
MC ⚙️ → "🕒 Missions Time" → evening "Auto-trigger at" later than now → "✅ Save Settings" (this
reschedules the mission, not only the setting), then complete a morning with "▶ Start" (Claude can
seed `lastCompletedOrFailedMorningDate` = today instead). The mood gauge also accrues only until the
evening start plus its duration. Put the evening time back afterwards.

## 3.1 Install, update, launch
- [ ] **3.1.1** `[human]` On a second Windows user account with the previous version installed (the installer is per user, `perMachine: false`, so the family's install and profile stay untouched), run `release/<version>/GCal Simplified-Windows-<version>-Setup.exe` over the previous version → the wizard offers an install folder, installs, opens fullscreen, old state intact. (why: `electron-builder.json5` nsis `oneClick: false`, `deleteAppDataOnUninstall: false`)
- [ ] **3.1.2** `[human]` Cold start of the installed build (on the 3.1.1 account) → no white screen; the week or "Sign in with Google" appears. Check the version only on an installed build: ⚙️ "Configuration" → "General" → "About" → "Application Version" shows the installer's version. Before publishing that is the same number as the release already out (the bump comes later), so identify the build by the installer's timestamp or the build SHA in the run log. An unpackaged `npx electron dist-electron/main.js` shows Electron's own version (40.4.1) there and in every audit line's `v`: expected, not a bug.
- [ ] **3.1.3** `[claude]` Launch on profile (a) → login screen; no uncaught error in the console, and the only Content-Security-Policy (CSP, the browser's allowlist of what the page may load) line is the expected one: the 'frame-ancestors' directive is ignored when delivered via a <meta> element. Any other CSP line is a finding (currently fails: bug 8, the Google Fonts stylesheet is blocked; decision D2). (why: requirements 2026-06-10)
- [ ] **3.1.4** `[claude]` Production bundle: `?lab=1` does not open the Quiz Lab (a dev-only question-tuning screen that shows answers), and `dist/assets/*.js` has no hit for "What each game asks for" (Quiz Lab) or "Grid Renders" (the blocks dev HUD). (why: perf-learnings 2026-09-10, "A DEV gate strips the mount")
- [ ] **3.1.5** `[human]` "About" → "Check for Updates" → "Checking for updates..." for ~2 s, no error (it never says "up to date").
- [ ] **3.1.6** `[human]` **Post-publish**, previous version installed: launch → within seconds an "UPDATE v<new>" control appears → tap → "DOWNLOADING n%" → "Restarting..." with no confirmation → new version runs ("Application Version" shows `v<new>`), state intact. A fail here is already public: follow the plan's post-publish recovery. (why: `electron/main.ts` checks 5 s after start and every 4 h, `autoDownload` off; drafts never update, see `/release`)

## 3.2 Single instance
- [ ] **3.2.1** `[human]` Installed app open, launch it again from Start or a shortcut → no second window; the running one is restored and focused. (why: CLAUDE.md → Single instance; journal 2026-08-19 "Shared userData")
- [ ] **3.2.2** `[human]` `node scripts/verify-single-instance.mjs` → exit 0. **The one deliberate exception to "never the real profile":** it launches on the dev profile `%APPDATA%\Electron` (it takes no `--user-data-dir` yet, see "To automate later" A10), so it would join that profile's remote room and sync its Google calendar. Run it offline (plan → Order of a pass, step 4: Wi-Fi off and Ethernet unplugged, checked), and only when no Electron is running (`tasklist | findstr /i electron` empty; it exits 2 if anything holds the lock). The human runs it: turning Wi-Fi off also cuts the Claude session's connection. (why: journal 2026-08-19 "Verify an OS-level guarantee")
- A launch with a *different* `--user-data-dir` opens a second window. Expected, not a bug.
- [ ] **3.2.3** `[human]` New build: while `npx electron dist-electron/main.js --user-data-dir=$env:TEMP\gcal-qa-fresh` runs, run the same command again → no second window, the second command returns within seconds, the first window comes to the front. (why: CLAUDE.md → Single instance; the lock is per profile, so this proves it on the build that ships without touching a real profile)

## 3.3 Calendar
- [ ] **3.3.1** `[human]` Profile (a): "Sign in with Google" → consent in the browser → "Syncing with Google..." → the week. Quit, relaunch → the week loads with no "Sign in with Google" and no red "Failed to load …" in the header. (A stored token alone skips the login screen, so the loaded week is the proof, not the missing button.) (why: security-learnings 2026-08-19, refresh tokens)
- [ ] **3.3.2** `[glance]` "Next Week" / "Previous Week" / "Back To Today"; "Previous Week" disabled on the current week; navigated weeks start Monday; no Monday highlight in future weeks — `week-navigation.spec`.
- [ ] **3.3.3** `[glance]` "Weekly" / "Monthly" toggle, month navigation, back to today — `monthly-view.spec`.
- [ ] **3.3.4** `[human]` Cards span their duration; overlaps sit side by side inside their day column (currently fails: bug 17, overlapping cards overhang ~3 px); titles containing garbage or trash, recycle, swim or pool, scout, karate or martial show an icon; text readable on every colour. `event-colors.spec` is no `[glance]` here: it checks the text-colour class (`text-white` / `text-black`), not measured contrast, and passes without sign-in or with zero events.
- [ ] **3.3.5** `[human]` An event outside "Active Hours" shows under the day header after the all-day events, unlabeled, and not in the hourly grid. (The Settings copy promises "Before" / "After" buckets: open question Q1.)
- [ ] **3.3.6** `[glance]` Header weather pill → "Weather Forecast" → "Hourly Forecast" (Time, Cond, Temp, Rain, Wind) — `weather-modal.spec`. `[human]` Day headers show icon + "max-min" for this week and next (16-day fetch; the spec's "current week only" is stale).
- [ ] **3.3.7** `[glance]` ⚙️ "Configuration" → "General" → "Week Starts On" today / sunday / monday re-lays the grid — `week-display-customization.spec` (isolated, always runs).
- [ ] **3.3.8** `[human]` "Active Hours" start/end, a calendar in "Calendars (n)", a list in "Task Lists (n)" → "Save Changes" applies each; "Cancel" discards.
- [ ] **3.3.9** `[human]` "Theme Mode" "MANUAL" with "Day End" an hour ago → dark within a minute; back to "AUTO (Sun)". "Sleep Schedule" around now, idle 5 min → screen off; mouse wakes it. (why: `useTheme.ts` 60 s tick; `electron/power-policy.ts`)
- [ ] **3.3.10** `[human]` Leave 5+ min → "Refreshing..." shows briefly while the week stays visible. (why: requirements → Enhanced Loading Indicator)
- [ ] **3.3.11** `[human]` "⭐ Command Center" → MC; "← Calendar" → back (the Calendar re-syncs: expected). Leave MC untouched past the "Auto-Return to Calendar" timeout (default 5 min) → back on the Calendar; never while a mission or game is open. (why: `useMCAutoReturn.ts`; architecture-patterns → "Pause idle timers during gameplay")
- [ ] **3.3.12** `[claude]` The token-refresh path, which a relaunch within the hour never touches. Tokens live in `<profile>\auth-store.json` (electron-store `auth-store`), field `tokens`: on Windows a `safeStorage`-encrypted base64 blob (`isEncrypted: true`), so it cannot be edited by hand. On signed-in profile (a), with the human's window closed: launch it with Playwright; inside `electronApp.evaluate(({ safeStorage }, blob) => …)` decrypt the blob, set `expiry_date` to an hour ago, re-encrypt, and return only the new ciphertext (the plaintext never leaves the app); close the app, then write that ciphertext into `tokens`. Relaunch → the week loads (google-auth-library refreshed on the first fetch, and the `tokens` listener in `electron/auth.ts` saved the result); close; check in-process that the stored blob has a `refresh_token` and an `expiry_date` in the future (return booleans only, never print a token); relaunch again → the week loads. Without Claude: relaunch more than 1 h after signing in, and again more than 1 h after that → the week loads both times. (why: security-learnings 2026-08-19, the refresh response carries no `refresh_token` and once overwrote it)
- [ ] **3.3.13** `[human]` Revoked grant, **with a separate test Google account only**: revoking removes the grant from every install on that account, so on the family account it would sign the installed app out too. Sign profile (a) in with the test account, revoke the app at myaccount.google.com → Security → third-party connections, then wait for the next refresh (up to 1 h, or backdate as in 3.3.12) → the week area stays readable and the header shows "Failed to load calendar data." (at launch) or "Failed to load calendar events." (at a refresh); no blank panel. ⚙️ "Configuration" → "Google Account" → "Reconnect Account" → consent → the week returns. (The app keeps its stored token, so it never falls back to "Sign in with Google" by itself: open question Q7.)
- [ ] **3.3.14** `[claude]` Bad-day data on the mocked Dashboard (plan section 1): `data:events` returning `[]` → the grid with its day headers and no cards, no error, not stuck on "Syncing with Google..."; `weather:get` throwing, then reload → the week and events still show, no weather pill, no blank panel. Code says a weather failure at launch also shows "Failed to load calendar data." and leaves the saved settings unloaded (suspected bug S1: record what you see).
- [ ] **3.3.15** `[human]` A day crowded with long titles (for example three overlapping events with 80-character titles): short events cut the title with "…", long events wrap, nothing spills into the next column, and the week is readable from across the room (~3 m).

## 3.4 Idle performance (the #1 performance invariant)
- [ ] **3.4.1** `[human]` Start this first (plan → Order of a pass). Signed in, Calendar, no mission, untouched 10 min on the new build; the Claude session measures it (3.4.4). Then the same on the previous release's build. Expected: within the plan's idle thresholds. (why: `docs/performance.md`; CLAUDE.md → Performance; perf-learnings 2026-07)
- [ ] **3.4.2** `[human]` Then turn the Perf HUD on: open DevTools with Ctrl+Shift+I (nothing in `electron/main.ts` removes Electron's default menu, which carries that shortcut; not yet confirmed on an installed build), run `localStorage.setItem('perf-hud','on')`, reload. If DevTools do not open, the Claude session sets the key through Playwright on the same profile. The HUD is opt-in (`docs/performance.md` still says always-on). Expected: MEM grows less than 50 MB over 10 min, JANK stays green. Turn it off after: its own frame loop costs CPU.
- [ ] **3.4.3** `[claude]` Mocked Dashboard (plan section 1), 60 s idle → `document.getAnimations().length === 0`. (why: perf-learnings 2026-07 #3; CLAUDE.md → Performance 3)
- [ ] **3.4.4** `[claude]` The measurement behind 3.4.1: every 10 s for 10 min, per process type. On a Playwright launch (the signed-in profile or the mocked Dashboard), call `BrowserWindow.showInactive()` first (a never-shown window renders at ~2 fps and understates CPU), then `app.getAppMetrics()`: `cpu.percentCPUUsage` is % of one core since the previous call; `idleWakeupsPerSecond` is always 0 on Windows. On the human's own window, sample `Get-Process` CPU seconds and working set instead, and tell the renderer by `--type=renderer` in its command line (`Get-CimInstance Win32_Process`). Record renderer and total (all app processes) CPU average and peak, total memory at the first and last sample, and the system's total CPU. Same method on the previous release's build, same machine. Expected: within the plan's idle thresholds.
- [ ] **3.4.5** `[human]` Play a game, close it, return to the Calendar → within a minute CPU is back at the 3.4.1 level.
- [ ] **3.4.6** `[claude]` The same measurement on the upgrade profile (b) once it is paired to a spare device (3.11.1), with its full log: the Realtime connection is open and a remote client is in the room. Expected: within the plan's idle thresholds against the previous release's 3.4.1 numbers.

## 3.5 Missions
Order matters. A mission that completed or timed out today never auto-starts again today, and the
quick-game window (3.8) closes at the evening start. Test the scheduler on a mission not yet used
today, and put the evening time back afterwards. "▶ Start" always works, even on a finished mission.
A running mission's overlay covers ⚙️, "Logs" and "← Calendar", so minimise it first ("— Minimize").
- [ ] **3.5.1** `[glance]` Overlay slides in, a task tap completes it, "— Minimize" leaves a pill — `mission-control.spec`.
- [ ] **3.5.2** `[human]` MC ⚙️ → "🕒 Missions Time" → "▶ Start" (morning) → "It's time for your" / "Morning Mission"; log "☀️ morning mission started", Who "👤 HERE". The overlay also shows over the Calendar.
- [ ] **3.5.3** `[human]` Pill shows done/total, a tap restores it; holding "— Minimize" 5 s also only minimizes: the pill appears, the mission keeps running, no "⏹️ Mission stopped". Only the phone's Stop stops a mission. (why: requirements 2026-09-24, "Only the phone can stop a mission")
- [ ] **3.5.4** `[human]` "↺ Reset" tap → tasks reset, timer keeps running; hold 2 s → tasks and timer reset ("🔄 Mission fully reset (tasks + timer)"). (why: requirements → Streak shield, "Reset re-arms the occurrence")
- [ ] **3.5.5** `[human]` Hold 600 ms on the left / right half of the progress bar → −5 / +5 min ("⏱️ Mission time adjusted"); no press feedback, by design. (why: architecture-patterns → false positives)
- [ ] **3.5.6** `[human]` All tasks done without whining → "Mission Complete!" → "Collect 2 Bonus Stars!" → bank +2, "🎉 Morning mission completed", shield full. After "😤 Whining?" → "😠 Whining!" the button reads "Collect 1 Bonus Star!" and pays 1.
- [ ] **3.5.7** `[human]` "Auto-trigger at" 2 min from now, "✅ Save Settings", go to the Calendar → the overlay appears on time; Who "⏰ CLOCK". (why: requirements 2026-08-19, mission timing; CLAUDE.md → Attribution)
- [ ] **3.5.8** `[human]` Duration "🔧 10s", leave a task undone → "Time's up! 🔔" (up to 15 s) → "🕐 Morning mission expired"; shield −1; no auto-restart today. Repeat minimised and on the Calendar → still counted. (why: requirements 2026-09-02, "Reliability"; 2026-06-05)
- [ ] **3.5.9** `[human]` Same with every task done → bonus collected automatically, Who "⚙️ AUTO". (why: requirements 2026-08-25)
- [ ] **3.5.10** `[claude]` Seed streak 2 plus yesterday's `loggedTimeoutAt`, start and expire the morning → streak 3. (why: CLAUDE.md → "A mission re-trigger clears `loggedTimeoutAt`")
- [ ] **3.5.11** `[human]` "Auto-trigger at" 2 min ahead, "Duration" 30 min, "✅ Save Settings", quit before it fires; relaunch once that time has passed → the mission starts at launch, for its full duration from launch. (Saving a start time that has already passed starts it at once, on Save; a relaunch then only continues it.) (why: requirements 2026-08-25, "an app started inside an open window")
- [ ] **3.5.12** `[claude]` A scheduler-started mission inside its window (evening "Auto-trigger at" a few minutes ago, today's evening not yet recorded): the phone's Stop → "⏹️ Mission stopped" and it stays stopped (the desktop has no stop gesture). Bug 1, fixed 2026-09-23 in PR 170 (dce4ab0): it used to restart at once with a fresh timer, Who "⏰ CLOCK".

## 3.6 Shield (missed-mission lockout)
- [ ] **3.6.1** `[claude]` Seed `missedMissionStreak` m = 0…6 → "Shield (6 − m) / 6" (the card counts the segments LEFT), green at 0–2 missed, amber 3–4, red 5; at 6 "💔" and "🔒 Bank locked — finish your next mission", no other caption. (why: requirements → Shield bar)
- [ ] **3.6.2** `[human]` Reach 6 with six "▶ Start" runs at "🔧 10s" left unfinished (or seed it) → "🔒 Shield broken — 6 missions missed in a row. Bank and goals locked." Then each is refused and writes no log line: a coin onto a goal (springs back), a goal coin dragged out (springs back), "💨 All", picking a goal, "🎁 Use!" ("🔒 Locked"), Quick Game ("🔒 Bank locked"), responsibility "+1" and "Claim" (greyed). The refusal labels are readable at a glance (currently fails: bug 13, light grey on light grey). (why: CLAUDE.md → Mission streak shield; → Refusals must be silent in the log and visible on screen)
- [ ] **3.6.3** `[human]` At 6 every frozen control also looks refused, including "The Bank", "+ Add goal" and the coins (currently fails: bug 5, they look live; how they should look is decision D3). (why: requirements → Streak shield, "Every frozen control also *looks* refused")
- [ ] **3.6.4** `[human]` Reach 6 as in 3.6.2 (or have Claude seed it). At 6 these still work: "⚙️ Bank Admin" +1 / +2 / −1, phone "+1" / "-1", a phone mood-token grant, "🗑️" refund, completing a mission → "🛡️ Shield restored — bank and goals unlocked.", bar full. (why: CLAUDE.md → never-lock list)
- [ ] **3.6.5** `[human]` Mood Gauge frozen while locked; after unlocking it does not jump by the frozen time. (why: CLAUDE.md → Mission streak shield)
- [ ] **3.6.6** `[human]` A stopped mission (the phone's Stop) leaves the shield unchanged. (why: requirements 2026-09-02, "What counts as a miss")

## 3.7 Mood gauge and mood tokens
- [ ] **3.7.1** `[human]` Phone "Mood Wind" → "Mood Update" toast on the desktop (3 s); the gauge moves only inside the active window, never at night. (why: CLAUDE.md → Token economy)
- [ ] **3.7.2** `[claude]` Seed the gauge just below full, mood +2, inside the active window → within ~60 s +1 mood token, "😊 Mood token earned (mood gauge full)", Who "⚙️ AUTO", mood back to neutral. At 5 mood tokens nothing is earned, the mood stays and the gauge stays full (currently fails: bug 6, fix in progress: it silently drops to ~0 %). (why: requirements 2026-08-19, 2026-08-25)
- [ ] **3.7.3** `[claude]` Note mood tokens, relaunch three times → unchanged: no token minted on launch. (why: requirements 2026-08-19, "Removed `useGameTokenScheduler`")

## 3.8 Bank, goals, quick-game window
- [ ] **3.8.1** `[glance]` Hold "The Bank" header → "⚙️ Bank Admin" → "+1" — `mc-bank-management.spec` exercises only this through the long-press; its other tests open the look-alike trap. `[human]` "+2" / "−1" change the bank. A short tap opens the trap: any button → 🥺 overlay, "🚨 Unauthorized bank access attempt!", red dot on "Logs"; the overlay clears within ~5 s (currently ~10 s, two 5 s timers in a row: bug 16).
- [ ] **3.8.2** `[human]` By finger: coin bank → goal, goal → bank, goal → goal; "💨 All"; "🗑️" returns coins; one log line each.
- [ ] **3.8.3** `[human]` "Add goal" → "🌟 Pick a Goal" costs 💻 3, 🎮 6, 🏹 4, 🎬 8, 🎣 10, 🍿 12, 🔥 14, ❓ 50, 🐍 1 → the picked goal settles in place (possibly fails: bug 15, unconfirmed) → fill one → "🎉 Done!" → "🎁 Use!" takes the coins, no refund ("Used: …"). `[glance]` `mission-control.spec` (Use!).
- [ ] **3.8.4** `[human]` "🎁 Rewards": change one reward's "Tokens:" (for example Game 6 → 2), "✅ Save Settings" → the picker shows the new cost and a new goal needs that many (currently fails: bug 3, fix in progress: the goal needs the catalogue cost); a reward switched off disappears from the picker.
- [ ] **3.8.5** `[glance]` Phone Games suspended hides 🎮 Game — `mission-control-responsibility-privilege.spec`.
- [ ] **3.8.6** `[human]` Window closed (today's morning not completed or timed out): no 🐍 in the picker; an existing Quick Game goal shows "⏰ Not right now", disabled, token kept. (why: CLAUDE.md → Quick-game window; requirements → Quick-Game Availability Window)
- [ ] **3.8.7** `[human]` Open it: "▶ Start" the morning and complete it → 🐍 appears (picking it costs 1 mood token, "1 mood token ready") → "🎁 Use!" → "Choose Quick Game 🕹️". A stopped morning does not open it.
- [ ] **3.8.8** `[claude]` Goal ready; the window shuts two ways, test both. (a) Evening not yet run, its start = now + 1 min → when the mission fires, "Use!" becomes "⏰ Not right now" at once. (b) Evening already concluded today, evening start = the next minute → it flips by the clock alone within that minute (currently fails: bug 7, up to ~60 s late; a tap in between is refused and the goal kept). Goal intact both times; also shut while any mission runs. (why: requirements 2026-09-02, the `CONSUME_CASE` guard)
- [ ] **3.8.9** `[human]` "🗑️" on a Quick Game goal → the mood token comes back, and the refund log line counts it (currently fails: bug 14, the line says 0 tokens).

## 3.9 Responsibilities, privileges, activity log
- [ ] **3.9.1** `[glance]` "+1", "DONE ✓", "Claim" on ♻️ Recycling — `mission-control-responsibility-privilege.spec`. `[human]` 🛼 Activity's "Claim" pays +3 (no automated coverage); Recycling pays nothing in-app ("Keep the bottle depot money! 🍾").
- [ ] **3.9.2** `[glance]` ⚙️ "🛡️ Privileges" → "🚫 1 Day" … "✅ Reinstate", countdown on the card — same spec. `[human]` Each suspend and reinstate writes an activity-log line (currently fails: bug 11, none is written).
- [ ] **3.9.3** `[claude]` Seed a suspension whose `suspendedUntil` has passed → the card returns to active and 🎮 Game comes back in "🌟 Pick a Goal", without anyone pressing "✅ Reinstate" (currently fails: bug 4, fix in progress: it stays suspended with no countdown, across relaunches).
- [ ] **3.9.4** `[human]` "Logs" → "Activity History": strip (Bank, Total, Mood tokens, Earned today, Spent today, Who counts); filters "💰 Tokens" (default), "🎯 Missions", "⚙️ Automatic", "📱 Phone", "📋 All". Every token move from this pass appears once with the right Who badge. (why: CLAUDE.md → Attribution; requirements 2026-08-19)

## 3.10 Games
Space Rescue first, on the touchscreen: it is where the child's misses were. It opens on a
"Play Game! 🚀" start screen. When the lifted shape sits exactly over its ghost it hides it, so judge
the ghost at its edges.
- [ ] **3.10.1** `[human]` Drag a shape by finger → it floats ~1.5 cells above the fingertip with a green ghost; lift → it lands exactly on the ghost. Repeat at all edges and corners. (why: requirements 2026-09-07; journal 2026-09-07 "Measure the browser's layout")
- [ ] **3.10.2** `[human]` Aim slightly off a valid spot → the ghost snaps to the nearest valid one (under a cell away) before lifting; nothing near → red ghost, visible over filled cells, and the shape returns to the tray (currently fails when the lifted shape sits exactly over the conflict: bug 9, confirm on glass). (why: requirements 2026-09-07; journal 2026-09-10 z-index)
- [ ] **3.10.3** `[human]` A second finger or palm mid-drag neither moves nor drops the shape; a tap without moving returns it; a refused drop leaves it visible in the tray, no blink. Mouse: no lift. (why: journal 2026-09-07 "pointerId")
- [ ] **3.10.4** `[human]` Every third placement deals three shapes you can grab at once, each of which fits somewhere on the board in the orientation it is dealt. When that third placement clears a line, the bank stays empty until the explosion ends (~1.2 s), then the three arrive. (why: requirements 2026-09-07, 250 ms mask removed; 2026-09-21, "Space Rescue deals a hand")
- [ ] **3.10.5** `[human]` A full row or column explodes ~1.2 s then empties with "GOOD!" / "GREAT!" / "EXCELLENT!"; it scores once; a drop during the explosion adds nothing; a second line completed during it empties together with it; clearing via the last free cell never shows "Mission Failed". (why: requirements 2026-09-18, "line clears resolve exactly once")
- [ ] **3.10.6** `[human]` Hold a shape still over the board through a clear, then lift → the outcome matches the ghost's colour at lift. (why: perf-learnings 2026-09-07, "ref caching a validated decision")
- [ ] **3.10.7** `[human]` 🔒 "Solve Math" → "🔓 Solve to Unlock the Golden Shape!" → usable; a wrong answer moves on to a new question; ✕ and reopen → the same question returns; "🔄 Refresh" is disabled only while the rescue shape is dragged or the slot is empty (a drop that empties it during an explosion: "A new shape arrives when the explosion ends"), and re-locks the slot. The slot's label matches the question (currently fails: bug 12, "Solve Math" also asks reading questions). (why: requirements 2026-08-21, "Cancelling a quiz is not a reroll")
- [ ] **3.10.8** `[human]` "Try Again 🔄" within a second of a clear → clean board, no late explosion. (why: requirements 2026-09-18)
- [ ] **3.10.9** `[human]` Snake: "Press an arrow key to start!", arrows steer; on "Hard" or "Expert" (on "Easy" the snake is too slow to reach a wall in reasonable time) a death → "🧠 Answer to Revive!" (3 correct); "✕ Close" / Esc exits. (Keyboard only: open question Q3.)
- [ ] **3.10.10** `[human]` Fruit Merge: "▶ Play", tap to drop, equal fruits merge; "🧠 Delete Fruit" → tap a fruit → quiz with ✕; ends with "Game Over" or "Time's Up!", "Play Again" / "Done".
- [ ] **3.10.11** `[human]` Quizzes: reading shows 4 tiles, a wrong tap greys it and freezes ~1.5 s; math uses the numpad (⌫, ✓). No level, score or percentage visible to the child. (why: `docs/mission-control.md` → Invisible-Level Contract)
- [ ] **3.10.12** `[human]` After each game closed in the app, exactly one "🕹️ Quick Game started" and one "🏁 Quick Game ended — Score: N (…)" line, Who "👤 HERE". (Quitting the app mid-game: 3.12.2.) (why: requirements 2026-08-21, "one event, one entry")
- [ ] **3.10.13** `[human]` MC ⚙️ → hold "📈 Learning" 600 ms (a tap does nothing) → charts include this session's answers; a fresh profile shows "No practice yet". `[glance]` `learning-progress.spec` (opening).
- [ ] **3.10.14** `[human]` A mission starts (phone or scheduler) while a game is open → the child sees the mission and its timer never runs out of sight (currently fails: bug 2, the overlay draws under the game and the game stays playable; decision D1 picks the fix).
- [ ] **3.10.15** `[claude]` Game farming: open a Quick Game and close it within 2 s → the mood token stays spent, one start and one end line; a second game needs a second token. Quitting the app mid-game is the other path, and there the end line is missing (bug 10, 3.12.2). (why: CLAUDE.md → Token economy; a free replay is a token leak)

## 3.11 Remote control (phone app: `mc-remote`, a separate repo)
- [ ] **3.11.1** `[human]` MC ⚙️ → "📱 Remote" → "Remote Control Pairing" QR for `mc-remote.vercel.app`. Open it on a spare device or in a desktop browser's private window, not the family phone or a browser that already holds a pairing (either would be re-paired to the throwaway profile) → phone "🟢 Live", desktop "Remote" dot green.
- [ ] **3.11.2** `[human]` Phone "Bank Tokens" "+1" → desktop bank +1 within ~2 s, log with 📱 and "📱 PHONE". Repeat with the desktop on the Calendar, then open MC: the coin is there. (why: requirements → Global Listener; architecture-patterns → "Global listeners mount at global scope")
- [ ] **3.11.3** `[human]` Phone "Missions": start, tick a task, whining, adjust time, cancel → the desktop follows; desktop changes reach the phone within ~1 s; both morning and evening cards shown.
- [ ] **3.11.4** `[human]` Phone "Effects" and "Reactions" → animation on MC; "Privileges" and "Responsibilities" land. (On the Calendar nothing shows: open question Q4.)
- [ ] **3.11.5** `[human]` Wi-Fi off → desktop dot red, phone "🔴 Offline"; Wi-Fi on → both recover without a restart. Tell the Claude session first: it loses its connection too. (why: requirements 2026-05-14, 2026-05-22)
- Not testable yet: shield +/− from the phone. `ADJUST_SHIELD` is live on the desktop, but `mc-remote` has no button (requirements → Parent-adjustable shields).
- [ ] **3.11.6** `[claude]` Remote trust, from a second Realtime client in profile (a)'s throwaway room (a script until "To automate later" A9 exists). Take `remoteRoomId` and `remoteKey` from profile (a)'s `config.json` under `%TEMP%`, never one under `%APPDATA%` (the control `ADD_TOKENS` below would give the real child a coin), and `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` from `.env`; broadcast event `action` on channel `remote-control:<roomId>` with payload `{ key, action, msgId, timestamp }`, using the room's own key, a new `msgId` and `timestamp: Date.now()` on every send. `electron/remote-bridge.ts` drops a reused `msgId` and a message more than 60 s off the desktop clock with only a main-process log line, which looks like a rejection in the renderer; it refuses a wrong key there too, before the checks below run. Send (1) an action type not on `REMOTE_ALLOWED_ACTIONS`, for example `ADD_LOG` or `CONSUME_CASE`; (2) `ADD_TOKENS` with a non-numeric `amount` (JSON has no NaN: send `null` or `"5"`). Expected: state and log unchanged, and the renderer console shows "[Remote] Rejected disallowed action type: …" and "[Remote] Rejected ADD_TOKENS: malformed payload". Then `ADD_TOKENS` with `amount: 1` lands exactly once, as the control: if it does not land, the run is invalid, not a pass. Last, with the streak seeded at 6, send `{ type: 'ADJUST_SHIELD', delta: 1 }` → the shield reads 1 / 6 and the bank unlocks. It is the parent's way out of the lock, and no desktop screen sends it. (why: CLAUDE.md → Remote actions; `useRemoteControl.ts` payload validators)

## 3.12 Resilience
- [ ] **3.12.1** `[human]` Quit mid-mission, relaunch inside its duration → same mission, countdown continued from its original start, no second start. (why: `useMissionScheduler.ts` resume; journal 2026-08-19 "Restart-transient state")
- [ ] **3.12.2** `[human]` Quit mid-game, relaunch → no game open, and the phone offers no running game. The log's "🕹️ Quick Game started" gets a matching end line (currently fails: bug 10, no "🏁 Quick Game ended" is written). (why: requirements 2026-08-19, "Ghost game fix")
- [ ] **3.12.3** `[human]` Unused mission, "Auto-trigger at" 3 min ahead, "Duration" 30 min, sleep the PC, wake inside the window → the mission starts. Repeat with "Duration" 5m and wake after it ends → no start, shield unchanged, and "⏭️ Morning mission skipped — the HH:MM window was missed (machine asleep)" in the log (see open question Q5). (why: requirements 2026-08-25; 2026-09-02)
- [ ] **3.12.4** `[human]` Optional: move the Windows clock forward 2 h and back with MC open → no token burst, no duplicate mission. Record anything else that happens (open question Q6).
- [ ] **3.12.5** `[human]` Wi-Fi off on the Calendar → the week stays; after the next refresh "Failed to load calendar events." in the header; no crash; online again → cleared at the next refresh.
- [ ] **3.12.6** `[human]` Optional overnight soak: leave the build on the Calendar → next morning the date rolled over, the morning mission started on time (Who "⏰ CLOCK") or logged a skip, CPU still within the idle thresholds.
- [ ] **3.12.7** `[claude]` Upgrade profile (b): everything written down before the quit is identical after: bank, goals, mood tokens, shield, privilege countdowns, log entries, Learning charts, settings, pairing; no game open. Compare `mc-state-v5` field by field (`readMCField`); the only differences allowed are the sanitisations the changelog documents (v0.0.42 added `missedMissionStreak` as 0). The human looks at the before / after screenshots. (why: plan section 2; architecture-patterns → "Hydration migrations")
- [ ] **3.12.8** `[claude]` A scheduler-started mission (its window runs from "Auto-trigger at" for "Duration"): quit mid-mission, relaunch after the window has ended → within ~15 s exactly one "🕐 … mission expired" line, shield −1, and no restart today: the miss counts. Quick version: "Auto-trigger at" 1 min ahead, "Duration" 5m, quit once it starts, relaunch 6+ min later. (why: `useMissionScheduler.ts`: the relaunch re-arm aims at tomorrow once the window is over, and the 15 s expiry check records the miss; CLAUDE.md → Mission streak shield)
- [ ] **3.12.9** `[human]` Optional, realistic upgrade state (plan → profile (c), offline as the plan defines it): the new build on a copy of the installed profile shows the installed app's bank, goals, shield, privileges, settings and log; the Calendar shows its offline state without a blank panel. Delete the copy afterwards.

## 3.13 Display and input
- [ ] **3.13.1** `[human]` At 100 / 125 / 150 % Windows scaling: Calendar text unclipped, MC fits without scrolling, dialogs reachable, Space Rescue drops still land on the ghost. (why: journal 2026-09-07, fractional borders snap per scale)
- [ ] **3.13.2** `[human]` Dark theme: event text legible, weather drawer and "Configuration" readable. MC keeps its own pastel palette.
- [ ] **3.13.3** `[human]` Every child control works by finger: coins, goals, task cards, game selector, quiz tiles and numpad; the parent holds (600 ms, 2 s) work by finger too.
- [ ] **3.13.4** `[human]` Rapid taps by finger, five fast each: "Collect 2 Bonus Stars!" → bank +2 once, one "🎉 … mission completed" line; "🎁 Use!" → one "Used: …" line, coins taken once; phone "+1" → the bank grows by exactly the number of new "📱" lines, never by more (the phone disables the button while a send is in flight, so fewer than five can land). (why: CLAUDE.md → Attribution; `COMPLETE_MISSION_ROUTINE` idempotency guard; remote `msgId` de-duplication)

## 3.14 Audit trail
- [ ] **3.14.1** `[claude]` After the pass, `<profile>\audit-log.ndjson` exists, every line parses, this session starts with `SESSION_START` "App started", each action appears once with its `src`. (why: CLAUDE.md → Audit trail)
- [ ] **3.14.2** `[claude]` Relaunch and stay on the first screen → the file grows by exactly one `SESSION_START` line. Each renderer load writes one, so a reload or a `?mc=1` navigation adds another: expected. (why: requirements 2026-08-25, no re-appended log ring)
- [ ] **3.14.3** `[human]` "CLEAR" → "CONFIRM CLEAR" → the list holds only "🧹 Activity log cleared (N entries)"; "EXPORT" still saves `mission-control-audit-<date>.ndjson` containing the cleared entries. (why: requirements 2026-08-25)

## To automate later

Done by hand or by a driven session today; each fits the isolated-profile fixture as an E2E spec.
- **A1** Space Rescue touch drop on the built app at device scale factor 1.25 and 1.5 (touch pointer
  events): the placed cells equal the last green ghost (3.10.1, 3.13.1). CDP `Input.dispatchTouchEvent`
  `touchEnd` releases every finger; to lift one, send `touchMove` with the remaining points.
- **A2** Upgrade hydration: previous tag's build seeds a profile, the new build loads it, every
  `mc-state-v5` field compares equal except the documented sanitisations (3.12.7).
- **A3** Idle budget: sample `app.getAppMetrics()` on the mocked Dashboard for 10 minutes and fail on
  a regression against a stored baseline; plus `document.getAnimations()` empty (3.4.3, 3.4.4).
- **A4** Shield refusal matrix: seed a streak of 6, attempt every frozen control, assert state and log
  unchanged; then every parent tool and a mission completion succeed (3.6.2, 3.6.4).
- **A5** Quick-game window boundary with a controlled clock: redeem refused before the morning
  concludes and at the evening start, goal intact both times (3.8.8).
- **A6** Restart lifecycle: relaunch mid-mission (countdown continues), after the mission's end (one
  expiry, shield −1) and mid-game (no ghost game, no free token) on the same isolated profile (3.12.1,
  3.12.2, 3.12.8).
- **A7** Scheduler fire: morning start set to now + 1 minute, view on Calendar; the overlay appears on
  time and the log entry is attributed to the scheduler; a stop inside the window stays stopped
  (3.5.7, 3.5.12).
- **A8** Audit trail across relaunch: line count grows by exactly one `SESSION_START` plus new actions
  (3.14.2).
- **A9** Remote round trip: a second Realtime client in the test room sends an allowlisted action, a
  non-allowlisted one, a malformed payload and a wrong key; only the first lands (3.11.6).
- **A10** `scripts/verify-single-instance.mjs` takes a throwaway `--user-data-dir`, so 3.2.2 stops
  touching the dev profile and a Claude session can run it online.
