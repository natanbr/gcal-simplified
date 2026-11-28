# Phone-only manual mission starts

Requested by the owner on 2026-11-10. Automatic scheduled starts remain enabled
(confirmed in chat). Implementation branch in both repositories:
`codex/phone-mission-starts`.

## Problem and required behavior

The child can use MC Settings' Start buttons after a failed mission ends to create
a fresh paid attempt. The parent must decide when another attempt is available.

- Remove manual Morning and Evening Start controls from desktop MC Settings.
- Keep morning/evening scheduled starts, including the existing occurrence,
  resume, missed-window and one-running-mission protections.
- Keep manual starts on the paired phone, outside scheduled windows as well as
  inside them. A completed, failed or stopped attempt must not impose a daily
  limit: the parent can start another session of either phase the same day.
- Only one mission can run at a time. A new start must not replace a running one.
- The phone can reset only the checklist or deliberately restart the running
  session with a fresh checklist and timer. Restart requires confirmation.
- A retry preserves the miss already charged. It resets attempt-specific state;
  completion follows the existing bonus and one-step shield recovery rules.
- Controls must explain repeat starts and unavailable actions. Session start,
  stop, reset and restart
  controls send no actions while the phone is disconnected or waiting on a
  session command; existing task, timer and whining controls keep their behavior.
- Desktop gestures must not start, stop or reset a mission. Extend the existing
  action-literal structural guard rather than adding a new authorization protocol.

## Architecture decision

The desktop reducer already permits repeated phone starts without a per-day gate.
The phone's prior Done Today badge described failed attempts as done too, which
made the available repeat start unclear. Reuse SET_ACTIVE_MISSION for idle starts,
RESET_MISSION for checklist resets and RESET_MISSION_WITH_TIMER for running
restarts. Preserve the signed transport and the existing remote action allowlist.
No new persistent state, timers, IPC channels or scheduler changes were needed for this first change (the follow-ups below added three fields, `startsAtChangedAt`, `retimeCoversDay` and `savedIntoWindows`, and a read in `occurrenceHandled`).

Desktop start-time editing remains in MC Settings. Changing a running mission's
start time can end it, as specified before this feature; this change removes the
manual restart path, not all access to scheduling settings.

## Status of the two repositories

- Desktop (this change): the Settings Start buttons are removed, the structural
  guard pins every sender of SET_ACTIVE_MISSION, and phone starts keep working
  with the phone on mc-remote main.
- Phone: [mc-remote #6](https://github.com/natanbr/mc-remote/pull/6) is **not yet
  merged**. It adds the confirmed Restart session button, the repeat-start labels
  and the disabled controls. Until it is merged the full Reset
  (RESET_MISSION_WITH_TIMER) stays allowlisted with no sender, and
  `useRemoteControl.drift.test.ts` is unchanged from main (mc-remote 7372b89).
  Update the drift test's captured list in the same change that merges the phone.

## Known gap (closed 2026-11-13)

Closed by the owner's decision of 2026-11-13: a Settings save that moves a phase
which already ran never starts it again as a fresh attempt. The save is stamped
on the mission (`startsAtChangedAt`) when the run covered its occurrence at the
old time (it was running, ran at or after the old start, or concluded), and the
scheduler then counts as run the occurrence of the run's day and the next one
when the run is nearer its start than the window before it
(`store/occurrenceHandled.ts`). A phone run that ended before the old window
covers nothing, so the moved window still starts. Pinned by the
`useMissionScheduler.settings-retime*` tests and
`store/occurrenceHandled.test.ts`. Known gap: a move made hours after the run to
a time early the next day is weighed the same way (an evening missed at 00:30,
moved at 08:00 to 08:30, skips that 08:30); the phone can start it. The save
still ends a running mission with no miss (PR 170, open). What it was:

Saving a new start time in MC Settings while a mission runs ends the run with no
outcome and stamps `lastActiveAt` before the new time. The scheduler then reads
the occurrence at the new time as not run and starts a fresh attempt with a full
timer. It can be repeated, so a child can dodge a miss. Past midnight, after a
miss in an overnight phase, a save that moves the start time to just after
midnight can pull the next day's occurrence forward the same way. After a miss is logged, a
same-day change of the start time starts nothing, because the scheduler reads
`lastCompletedOrFailed*Date`; `useRemoteControl.start.test.tsx` pins that. So
"only the phone starts a retry" holds for desktop gestures, not for this path.

## Known gap: a Settings save as a start on demand (closed 2026-11-15)

Owner-approved follow-up. A mission that had not run could be started from MC
Settings: save its start time as a minute ago, or lengthen its duration so a
window that closed unseen opened again. The scheduler found the window open and
its occurrence unrun, and started it with a full timer, a desktop-started mission.

Now a save that moves a start time or changes a length records the window it
opens, one that was not open at that start before, by its start
(`savedIntoWindows`, written only by `stampMissionActivity`), and
`occurrenceHandled` counts exactly the window that starts there as handled (an
entry in the future is ignored until the clock reaches it). The entry records no
run, so `saveKeepsRun` ignores it. The phone
start path (SET_ACTIVE_MISSION through REMOTE_ALLOWED_ACTIONS) is unchanged, and a
start still ahead at the save stays automatic.

The rule is no start into the past, not no start from Settings. Known gaps, each
an owner decision (most found reviewing PR 209):
- a start saved one minute ahead still starts a minute later, with a full timer
  (a time still ahead stays automatic by design);
- moving an open window that waits behind another running mission to a different
  open start is recorded, so the scheduler never starts it (the phone can);
- a save that ends the RUNNING mission (a new start time for it) lets the other
  phase's window, open and waiting behind it, start at once (pinned in
  `useMissionScheduler.no-start-on-demand.coverage.test.tsx`);
- a clock moved backward past a save's time releases the window it covered (an
  entry in the future is ignored until the clock reaches it), and a restart while
  the clock is still behind makes that permanent: hydration drops an entry in the
  future, so the window stays released once the clock is put right; only the
  save made under the wrong clock: a later save made with the clock ahead keeps
  an earlier save's coverage;
- the first start move on the spring-forward night onto another name of the
  same instant (03:40 to 02:40) can change whether that occurrence is handled,
  as the same-instant keep needs a decision to keep (PR 207 did the same);
- after the clock is set back, a new run whose activity is older than an earlier
  save's stamp is read as the run that save kept and inherits its covered day;
- a mission whose last run predates `baseDurationMins` (v0.0.45) and has not run
  since weighs the window behind with the length of the moment;
- a covered window pushed out of the four kept days (or past 64) is covered no
  more: a later look-back may report it "skipped", and saves under a clock
  running ahead on four later days can push out the real open window;
- saves that open windows on four or more later days under a clock days ahead
  push out an earlier covered window that is still valid: the four days are
  those in the list, not the real clock's (Monday 07:00 covered, saves on the
  17th to the 20th under a clock ahead, the clock put back at Monday 07:01, a
  relaunch: a scheduler start);
- 64 distinct starts saved in one day and a length-only save the next day push
  out a window the look-back still asks about: a launch writes its "skipped"
  line (a log line only);
- a save made once the clock is right does not always replace a stamp left in
  the future, as `saveKeepsRun` refuses before `movedStamp` compares them (the
  06:00 morning stopped at 06:10, moved to 07:00 under a clock reading tomorrow
  06:15, then today at 06:20 to 07:10: 07:10 reads unhandled despite the run;
  so on 70e3241 too);
- the fixture-clock guard reads a spread after the timestamp (`...overrides`) as
  the timestamp, though the spread can set it back to undefined;
- a skip made through Settings costs the child nothing: no start, no miss, no
  shield step and no "skipped" line; the save's one "not started" line (owner
  decision 2026-11-16, `store/savedIntoWindowLog.ts`, left out for a mission that
  already ran in the window; a running mission ended by the same save gets only
  the "ended" line) is the only trace.

Pinned by `useMissionScheduler.no-start-on-demand*.test.tsx`,
`store/saveIntoWindow.test.ts`, `store/occurrenceHandled.test.ts`,
`store/__tests__/settings-covers-window-log*.test.tsx`, `persistence-time.test.ts`,
`persistence-saved-windows.test.ts` and `activity-stamp-boundary.test.ts`.

## A length-only save changed which window starts (fixed 2026-11-27)

Found reviewing PR 209. Two decisions were read with the mission's length at the
time of reading: the retime rule's occurrence ahead (nearer its start than the
end of the window behind it, which is as long as the mission) and whether a save
was made before the window it covered closed. So a later save that changed only
the length changed them: an evening missed at 19:30 and moved at 06:20 to 06:40
(held back, rightly) was released by lengthening it at 06:39, a fresh full-timer
attempt after the miss; and shortening a 120-min evening the phone stopped at
19:01 held back the 06:40 start that was due. Both are now decided at the save
and stored, `retimeCoversDay` beside `startsAtChangedAt` and the opened window's
start in `savedIntoWindows`, and `occurrenceHandled` reads no length. Pinned by
`store/occurrenceHandled.duration-save.test.ts`,
`hooks/useMissionScheduler.duration-save.test.tsx` and the property test
`store/occurrenceHandled.duration-property.test.ts`.

The same review found a covered window reported missed: a wake after a save
that shortened the covered window, or after a save that covered the next day's
window at the same start (the only stamp was overwritten), wrote a "skipped"
line beside the save's "not started" line. Each opened window now keeps its own
entry, with its earliest save, and a mission keeps those of its four latest days;
pinned by `hooks/useMissionScheduler.saved-window-kept.test.tsx` and
`store/saveIntoWindow.test.ts`.

The second review round (2026-11-27) found five more. A later start move onto
the same instant (02:40 and 03:40 on the spring-forward night) cleared what the
first had covered, and a length save between two moves changed what the second
decided: the window behind is now as long as the run was (`baseDurationMins`),
and a move onto the same instant keeps the decision. A profile saved by PR 207
has the stamp and no decision, so load decides it once. Covered windows were
kept by age, from a save a fast clock could misdate: a mission kept the
eight that start latest (by day since the third round), and hydration applies
the same rule. A window opened
again took its later save; it keeps its earliest. And the log line read the
covered window off the list, which a save covering it again leaves unchanged; it
now asks `openedWindow`, as the stamp does.

The third round (2026-11-28) found five more and a weak test. A later start
move made with the clock ahead wrote a stamp in the future over the first
save's, so the covered window started once the clock was put right: the older
stamp of the same run now stays. Kept by a count of eight, eight saves in a day
and a ninth window the next pushed out a window the look-back still asks
about: a mission now keeps every window of its four latest local days, 64 at
most. A PR 207 stamp is decided as PR 207 read it (the length in the profile).
A one-second run's own length read as invalid; a run's length is now any real
length under a day. A stored decision on an impossible day was kept; it must be
a real day beside a stamp. And the property file gained two fixed cases of the
nearness. Pinned by `store/occurrenceHandled.retime-clock-ahead.test.ts`,
`store/saveIntoWindow.test.ts`, `hooks/useMissionScheduler.saved-window-kept.test.tsx`,
`store/persistence-saved-windows.test.ts`, `store/persistence-retime-decision.test.ts`,
`store/occurrenceHandled.duration-save.test.ts` and the property file.

The final round (2026-11-28) fixed four things the third introduced. The round
trip also dropped a damaged run day, and the outcome fell back to the calendar:
a phone start at 00:30 for the 19:00 evening (yesterday's, made up) marked that
day's evening done before it ran; a run's day is kept by its shape again, and
the round trip is for the stored decision only. A decision present but
unreadable was decided again like an absent one, with the length in the
profile, and held back a start that was due; only an absent one is PR 207's,
anything else reads as none. A run's length above zero let 5e-324 work the +/-
cap from an empty run; it must be at least one second. And the 10,000-entry
load was timed with the faked clock; it uses the real one. Pinned by
`store/persistence-run-fields.test.ts`, `store/persistence-retime-decision.test.ts`,
`store/hhmm.test.ts` and `store/persistence-saved-windows.test.ts`.

## Verification and handoff

Status: development and independent architecture, QA, security and UI review
complete for the desktop change; the review follow-ups of 2026-11-13 and of PR
209 (2026-11-27: the length-only save, a covered window reported missed, two
saves at one instant, strict stamp hydration, the fixture-clock guard's holes,
the log wording and known gaps) are in, and so is its second round (a later
start move onto the same instant, the upgrade from PR 207, the count of covered
windows, the earliest save, the log line's question, the property and the
fixture-clock guard) and its third (a clock-ahead move, covered windows by day,
the upgrade as PR 207 read it, a one-second run's length, an impossible stored
day, the nearness pinned) and its final round (a damaged run day, a damaged
stored decision, a run length under a second, the load timing); the PR 209 follow-up awaits its own review. No merge or
production release. The phone change is mc-remote #6, not yet merged.

- Desktop: component and structural tests must fail with the old Start controls;
  remote lifecycle tests must prove repeat starts and overlap refusal, a relaunch
  inside the open window after a logged miss, and a later start time after one,
  each with a control that does start without the logged outcome.
- Phone: test repeat eligibility after outcomes, disconnection/pending state and
  the restart confirmation/action contract.
- Run desktop unit suite, lint, complete typecheck and rebuilt isolated E2E;
  run phone tests, lint and build. Verify the actual UI before handoff.
- Branch in both repositories: `codex/phone-mission-starts`. Desktop base:
  `5686470` (latest main checked again before commit).
- Desktop at the first review: all **2,977 tests in 250 files**, lint and full
  `npm run tsc` passed. All **34 rebuilt isolated Electron E2E tests passed**
  (13.7 minutes). The eight Google-authenticated calendar specs that use the real
  household profile are excluded from that run.
- Desktop after the 2026-11-13 review follow-up: **2,984 tests in 250 files** (2,982
  passed, 2 skipped; three load-sensitive cases failed once in the full run and
  passed when re-run alone), lint and full `npm run tsc` clean, and
  `e2e/mc-settings.spec.ts` passed 5 of 5 on a rebuilt app.
- Desktop after the PR 209 review follow-up (2026-11-27): **3,214 tests in 268
  files** (3,212 passed, 2 skipped), lint and full `npm run tsc` clean. E2E not
  re-run for this follow-up (no Electron or E2E change; QA step 3.5.11b is new).
- Phone: **114 tests**, lint and production build/typecheck passed. The final
  diff also passes the whitespace check. Vercel's PR preview check passed.
- Interactive phone review at 390 x 844: repeat morning/evening starts, restart
  Cancel (no action), confirmed restart (one full-reset action), and disconnected
  and pending controls verified on real components with synthetic state only.
  The temporary fixture server was stopped afterwards.
- Review finding fixed: Stop has a separate eligibility rule, preserving its
  supported recovery of an active card when the global phase is none. Reset and
  restart retain their stricter running-phase checks.
- Desktop screenshot: `phone-only-start-settings.png` in the E2E Settings test's
  results. Both sections retain schedule fields without Start controls.
- No production deployment, release or merge was performed. The phone's Vercel
  preview is automatic PR infrastructure. Both PRs are for owner review.
