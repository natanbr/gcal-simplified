# Project Requirements: Google Calendar Simplified

## Overview

A simplified desktop calendar application inspired by Google Calendar, built with Electron, React, TypeScript, and Tailwind CSS. The application provides a focused, single-screen view of the scheduling week with integrated weather and outdoor activity information.

## Core Features

### Calendar View

- **7-Day View**: The calendar displays 7 days in a week view.
  - **Data Fetching and Caching**: Events are always fetched and loaded a full month at a time and cached locally. Navigating between weeks within a cached month is instantaneous, while a background process verifies the data is up-to-date.
  - **Default View**: Shows the current week. Its first day depends on Settings > General > Week Starts On: today (the default: today and the next 6 days), Monday or Sunday of the current week.
  - **Week Navigation**:
    - **Next Week Button**: Navigates forward to the next week.
    - **Previous Week Button**: Navigates backward to the previous week.
    - **Navigation Limit**: Cannot navigate to weeks before the current week (today).
    - **"Current Week" / "Back To Today" Button**: Reads "Current Week" while the current week is shown; elsewhere it reads "Back To Today" and returns to the current week view.
  - **Week Start**: Weeks start on Monday for the `today` and `monday` settings and on Sunday for the `sunday` setting. With `today`, the current week is the one exception: it starts on today.
    - Example (`today` and `monday` settings): If today is Wednesday and user clicks "Next Week", the view shows Monday-Sunday of the following week.
    - **This includes the `today` setting.** `Week Starts On = today` anchors the *current* week only (returning to it lands on today again); every other week starts on Monday. Consequence: from a Thursday, "Next Week" re-shows the Mon-Wed already visible in the current view. Intended — a rolling window has no stable weekday anchor once you leave the current week.
    - Guarded by `src/utils/__tests__/weekNavigation.test.ts` ("today mode anchors navigation to Monday from every weekday"), which exercises all seven weekdays so the rule cannot be verified only on the day the author happened to run it.
- **Monthly View**: The calendar also supports a full month view.
  - **Grid Layout**: Displays a standard 6-week grid, typically 42 days, starting from the week that contains the 1st of the month.
  - **View Toggle**: Users can switch between "Weekly" and "Monthly" views using a toggle in the header.
  - **Month Navigation**:
    - **Next Month**: Navigates forward to the next month.
    - **Previous Month**: Navigates backward to the previous month.
    - **Navigation Limit**: Cannot navigate to months before the current month.
  - **Event Display**: Events in the monthly view are displayed as compact pill-shaped items spanning their respective days.
- **Forecast Limitation**: Weather forecast data is only available and displayed for the current week (next 7 days from today). Future weeks beyond the current week will not show forecast data.
- **Hourly Grid**: The layout is divided into vertical hour slots.
- **Active Hours**:
  - The grid displays only "active hours" (customizable, default typically 7 AM - 9 PM) to reduce clutter and avoid scrolling.
  - Events outside these hours are grouped into "Pre" (Before) and "Post" (After) scrollable buckets.
- **Event Cards**:
  - Time slots/Event cards visually span the actual duration of the event on the grid (`top` % and `height` % calculated based on duration).
  - Cards support overlap handling (side-by-side positioning for conflicting times).
- **Special Event Styling**:
  - **Color Coding Priority**:
    1. **Google Calendar Colors** (Primary): Events display colors assigned in Google Calendar via `colorId` (1-11), mapped to closest Tailwind color
    2. **Name-based Colors** (Fallback): If no `colorId`, events containing specific names are color-coded:
       - Natan: Blue
       - Alon: Green
       - Uval: Purple
       - Marta: Pink
    3. **Default**: Zinc/Gray
  - **Color Mapping**: Google Calendar colors (colorId 1-11) are mapped to Tailwind colors:
    - Lavender/Blueberry (1, 9) → Blue
    - Sage/Basil (2, 10) → Green
    - Grape (3) → Purple
    - Flamingo (4) → Pink
    - Banana (5) → Yellow
    - Tangerine (6) → Orange
    - Peacock (7) → Cyan
    - Graphite (8) → Gray
    - Tomato (11) → Red
  - **Text Contrast**: All event text colors ensure WCAG AA compliance (≥4.5:1 contrast ratio)
  - **Icons by Keyword**: Events containing specific keywords display icons:
    - Garbage/Trash: Trash Can
    - Recycle: Recycle Icon
    - Pool/Swim: Waves
    - Scout: Users/Group
    - Karate/Martial: Swords

## Weather & Marine Integration

### Daily Weather

### Enhanced Day Header Cells

- **Structure**: The day header of each day in the calendar grid is enhanced for better information density.
- **Layout**:
  - The weather icon is moved to the right of the day name and date.
  - The temperature range (high-low) for the day is displayed underneath the weather icon.
- **Typography**:
  - Day font size (e.g., Sunday, Monday) is slightly increased for better legibility.
  - **Full Day Names**: Use full day names (e.g., "Sunday" instead of "Sun") to take advantage of available horizontal space.
- **Behavior**: The behavior of full-day events (holidays) remains unchanged, appearing below the date and weather information.

### Side Drawers (Slide-over Panels)

- **Weather Panel**:
  - **Hourly Forecast Table**: Dense table showing Time, Conditions (Icon), Temperature, Rain %, and Wind.
  - **Design**: Minimal spacing to maximize data on one screen.


- **Weather Panel**:
  - **Hourly Forecast Table**: Dense table showing Time, Conditions (Icon), Temperature, Rain %, and Wind.
  - **Design**: Minimal spacing to maximize data on one screen.

## Authentication & Systems


- **Google Login**:
  - Custom Login Screen with "Sign in with Google" button.
  - Uses Electron IPC (`auth:login`) to handle OAuth flow.
  - Stays signed in across relaunches: the saved (encrypted) tokens are loaded once the app is
    ready, and "signed in?" answers from the same credentials the Google calls use. Saved tokens
    that cannot be read show the Sign in screen, never an empty week.
  - Google refusing the saved sign-in (access revoked, or the refresh token expired) signs the app
    out and shows the Sign in screen, without a relaunch, on the first Google read that fails.
    Offline or a Google outage does not sign out. A token file that cannot be parsed is moved
    aside and shows Sign in; it never stops the app from starting, and the moved-aside copy is
    deleted on the next sign-in or sign-out. A token file held for a moment by another program
    is read again for up to about 15 s before the app shows Sign in.
- **Settings**:
  - **Active Hours**: Configurable Start and End times (0-23h).
  - **Calendars**: Toggle visibility of specific Google Calendars.
  - **Task Lists**: Toggle visibility of specific Task Lists.
  - **Auto-Refresh**: Data refreshes every 5 minutes. A refresh that cannot reach Google never
    replaces what is on screen (UX / UI Enhancements → A refresh that fails, 2026-10-06).
- **Remote Control (Mission Control)**:
  - **Remote indicator** (the "Remote" chip in Mission Control's top bar): a filled green dot while the phone remote's channel is connected, a hollow red ring while offline, labelled "Remote: connected" / "Remote: offline" (tooltip and screen reader). The dot pulses 3 times (6 s) when Mission Control opens and when the status changes, then stands still; a change less than 30 s after the last pulse started changes the colour without pulsing again, so a remote that keeps reconnecting does not keep it pulsing. It never loops: a looping pulse cost 20-25 % of one CPU core for as long as Mission Control was open (2026-10-04).
  - **Secure Bridge**: Established via Supabase Realtime (Broadcast) and Electron IPC.
  - **Main Process Isolation**: All Supabase connections and key validations are restricted to the Main process.
  - **Only a public Supabase key in the package (2026-10-04)**: the bridge needs only the project's publishable key (`sb_publishable_…`), which `vite.config.ts` writes into `dist-electron/main.js`; a legacy `anon` JWT also works until the legacy JWT secret is rotated. Packaging refuses an admin key: a JWT whose `role` is `service_role`, or an `sb_secret_…` key, anywhere in `dist/` or `dist-electron/` (`scripts/package-key-guard.js`, electron-builder's `beforePack` hook).
  - **Shared Secret Pairing**: Uses a 20-character secret key and unique Room ID for secure mobile pairing. The key never travels on the channel, because anyone who knows the room id can join it; it is only used to sign.
  - **Signed messages (remote protocol v2, 2026-09-28)**: every message in both directions (the phone's actions and its sync request, the desktop's state updates) is `{ v: 2, body, sig }`: `body` is a JSON string and `sig` an HMAC-SHA256 of the event name and the body, keyed with the pairing key (`electron/remote-auth.ts`). The desktop checks the signature before anything else, then requires a message id and a timestamp within 60 seconds of its own clock, then drops a message id it has already seen. A v1 message (the key in plain text) is refused even when the key is right, with the log line "Rejected unsigned action (protocol v1): the phone was paired from an old QR code. Scan the current one (MC settings → Remote)." The phone never switches protocol on its own: a pairing from a `#room=…&key=…&v=2` QR code speaks only v2, an old `?room=…&key=…` link only v1. The room id is logged as an 8-character prefix only. A signature that is not 43 characters (base64url HMAC-SHA256) or a body over 64 KB is refused before any HMAC is computed; the largest real message, a state-update, is about 10 KB.
  - **Integrity, not confidentiality**: v2 stops anyone without the key from sending actions; it does not hide the state. Anyone who knows the room id can still read every state-update: the last 20 activity-log lines, the missions and their tasks, privileges and token counts.
  - **The main process owns the pairing**: `settings:save` keeps the stored room id, key, `remotePairingVersion` and `remotePairingRenewedAt` and ignores whatever the renderer sends for them, so a settings screen opened before a renewal cannot write the old key back. `settings:get` hands out a room id and key only for a pairing marked `remotePairingVersion: 2`: an unmarked one is the leaked v1 pairing, or one the bridge has not managed to replace yet. Mission Control's state keeps no copy of the pairing: the Remote tab reads `settings:get` when it is shown, and a copy an older build saved in `mc-state-v5.settings` (`remoteRoomId` / `remoteKey`, up to v0.0.43) is dropped when the state loads, so the next save writes a blob without it (2026-10-03). A room id or key in `config.json` that is not a non-empty string reads as absent, and a fresh pairing is generated.
  - **A pairing write must land**: every pairing write is one `store.update` (`electron/remote-pairing.ts`), which re-reads the file, refuses one it cannot read and reports a failed write. If the renewed pairing cannot be saved, remote control stays offline and retries (5 s, doubling to 5 min), and never joins the pairing it was replacing: that is the leaked key, and a locked or read-only `config.json` can last. The re-scan notice is written in the same update as the new room and key. "Regenerate Keys" that cannot save returns the refusal (the Remote tab explains it) and keeps the current pairing. The bridge checks and signs with the pairing it joined; the first verified message after a join clears the notice with one write attempt (a refused one is logged once and tried again at the next join, never once per message).
  - **Replay and clock steps**: state-updates carry a strictly increasing timestamp (never older than or equal to the previous one, even when the clock steps back or two go out in one millisecond), because the phone keeps only newer states. The phone also refuses a state stamped more than 120 s ahead of its own clock, so when the last stamp is further ahead than that (the desktop clock was corrected backwards), the next one starts again from the clock instead of counting on from the fast time. A forgotten message id leaves a floor behind: no action sent at or before the newest forgotten one is accepted, so a backward clock step cannot make a captured action fresh again. Ids are forgotten after twice the 60-second window, so that floor never rises above a genuine message from a second phone whose clock is off the other way (one 50 s fast, one 50 s slow). After a restart the desktop remembers no ids, so an action captured in the last 60 seconds could be replayed once; accepted residual risk.
  - **QR Code Pairing**: Displayed in Settings for easy mobile connection. The URL is `https://mc-remote.vercel.app/#room=<roomId>&key=<key>&v=2`: the pairing data rides in the URL fragment, which a browser never sends to the server, so the key stays out of the host's request logs. `v=2` tells the phone to speak only the signed protocol. The Remote tab reads `settings:get` when it is shown and draws the QR code from that read only, never from Mission Control's state. With no v2 pairing in it (the renewal could not be saved yet, or the settings file cannot be read) there is no QR code and the tab says "Remote is not paired yet — waiting to save a new pairing."; a "Regenerate Keys" that cannot save then says "Keys not changed: the new pairing could not be saved, so remote control stays offline until it can. Try again in a moment." instead of "The current QR code still works".
  - **Rollout of v2**: the v2 desktop works only with an `mc-remote` build that speaks protocol v2. The phone app deploys first (old pairings keep working with the installed v1 desktop; a scan of the new QR code gives a v2 pairing), then the desktop release. **The first start of the v2 desktop renews the pairing by itself, once** (a pairing without `remotePairingVersion: 2` gets a new room id and key before the renderer can read it, and the log says "Pairing renewed for signed messages (protocol v2): scan the QR code again on the phone."), because the old key was sent in plain text for months and a signature keyed with it proves nothing. **The phone must re-scan the QR code after the update**; until then it is in the old room and does nothing. The parent is told where they look, not in a console: until the phone's first verified message the Remote tab (⚙️ → 📱 Remote) shows "Remote was re-paired for security. Scan this QR code again on the phone.", and the activity log gets one line, "Remote re-paired for security: scan the QR code again (⚙️ → 📱 Remote)" (source `system`, once per renewal: Mission Control state remembers which renewal it logged, `settings.remotePairingRenewalLogged`, so neither a restart nor CLEAR nor 200 newer lines bring it back; a later renewal gets its own line). A brand-new install and a manual "Regenerate Keys" show neither.
  - **Remote Actions**: Supports triggering game tokens, adjusting mission timers, and firing special animations (Fireworks, Confetti).
  - **Only the phone can stop a mission (decided 2026-09-24)**: the phone's Stop sends `CANCEL_MISSION`, which stays on `REMOTE_ALLOWED_ACTIONS`. The desktop has no stop gesture: "— Minimize" only minimizes, a short tap and a long hold alike, because a stop sticks for the rest of the window without moving the shield, so a hold let the child end a mission. "↺ Reset" and its 2 s hold are unchanged (not decided yet). One desktop path still ends a mission: saving a new start time for the **running** mission in MC Settings ends it (no miss, the shield does not move). That is kept, and logged as "⏹️ Morning/Evening mission ended: its start time was changed in Settings", attributed 👤 (open decision for Nathan, PR 170; it used to be silent).
  - **A Stop, a Reset, a time adjustment, a whining toggle or a task tap for a mission that is not running is refused (2026-09-28; plain Reset and time adjustment 2026-10-05; whining and tasks 2026-10-06)**: a phone Stop naming the other phase (a stale second tap), a Reset hold that fires after its mission ended, a phone Reset (tasks only), +/-, "Whining?" or task tap that lands after its mission ended (stopped or expired) or names the other phase changes nothing and writes no log line. The phone draws each card from the last broadcast, so its buttons can name a mission that has just ended; a plain Reset used to set that mission active again with nothing running (hidden on the desktop, never expiring, saved across a restart), a +/- for it wrote "⏱️ Mission time adjusted" for nothing, an un-mark of whining right after a Stop marked it instead (−10 on the mood gauge where the un-mark gives +2), and a Cream tap right after a Stop counted a second application. A task card still on screen while the overlay slides away takes the same refusal and shows no "done" flash (it checks the last rendered state, so a tap landing after a Stop but before the next render, a few ms, can still flash; the tick itself is refused either way). The global whining flag (phase none, no sender in either app today) names no mission and is not refused.
  - **A mission can be made at most 60 min longer than its own length (2026-10-05)**: the phone's +1 / +5 / +10 and the overlay's +5 bar hold may take a run up to its length when it started (its window's length, Settings → Duration, at the start or the last full Reset; a Settings save during the run does not move it) + 60 min, so a 60-min evening up to 120 min, compared in whole seconds. A press that would go past that is refused whole (not clamped): nothing changes and no line is written, so the phone's countdown simply does not move. Shortening is always allowed, down to the 1-minute floor; a press that changes nothing (−5 at the floor) or a minus press that would lengthen a run shorter than the floor (the 10-second test run) is refused and writes no line. The line names the move that really happened: −10 on a 5-min run is "(-4m)", a move of less than a whole minute is named in seconds ("(-10s)"). A full Reset restarts the run at its window's length, so the 60 min are available again. Before, there was no ceiling: one stale or tampered payload (`deltaMinutes: 1e9`) made a mission that never ended, blocking every other mission and the quick-game window, saved across a restart.
  - **Shield −1 / +1 buttons (shipped in mc-remote 2026-09-28)**: the phone's Shield card has "−1 shield" and "+1 shield". They send `ADJUST_SHIELD` with `delta: -1` / `delta: 1`, which the desktop accepts (allowlist, validator, reducer). Details under Mission Streak Shield → Parent-adjustable shields.
  - **Sync & Identification**: Immediate state synchronization upon remote connection; remote-initiated actions are visually identified in the Activity Log with a 📱 emoji.
  - **Global Listener**: The remote action listener is registered globally in the application shell. This guarantees that remote commands are processed continuously, even when viewing the calendar or when the mission overlay is active.
  - **Detailed Mission State Reflection**: The remote control displays individual card views for both Morning and Evening missions simultaneously. Each card reflects its current state (Active/Inactive), live countdown timers, adjustment buttons, task checklist progress (percentage bar and expandable/collapsible checkbox list), and whining status (highlighted pulsing indicator).
- **Mission Control Responsibilities & Privileges**:
  - **Responsibility Progress**: Point-based tracking using visual point dots (no text counters). Shows Done status and a "Claim" button once the target point goal is met.
  - **Points and the log (2026-10-06)**: a point comes from the desktop card's +1 (`ADD_RESPONSIBILITY_POINT` with no amount) or the phone's ➕ / ➖ (amount `1` / `-1`). Each press that moves the count writes one line naming the move and the new count, with the task's icon and colour, attributed to whoever pressed (📱 for the phone): "♻️ +1 point for Recycling (2/3)", "♻️ -1 point for Recycling (1/3)". The point that meets the goal adds " — ready to claim" ("+1 point for Recycling (3/3) — ready to claim"), and a ➖ that takes a completed task below its goal adds " — no longer complete" ("-1 point for Recycling (2/3) — no longer complete"): Claim goes away until the point is earned again. A point is not a token, so the line carries no token delta. A press that changes nothing leaves the responsibilities as they were and writes no line: a ➖ at 0, a ➕ on a completed task (it waits for Claim), a task id that does not exist, and any press while the shield is broken, the parent's phone ➖ included (decided 2026-10-06: a point ➖ moves no token and is no way out of the lock; the phone greys both buttons out then). The phone's amount must be `1`, `-1` or absent: anything else (`null` too) is dropped before it reaches the store, and refused by the reducer too. The reducer and the log ask one decision, `responsibilityPointChange` in `store/responsibilityPoint.ts`.
  - **Claim (2026-10-06)**: the card's Claim button (`RESET_RESPONSIBILITY`; the phone cannot send it) pays the task's own reward and starts the task over at 0: Activity 3 bank tokens, logged "🛼 Activity completed +3"; Recycling nothing in the app, its reward being the bottle-depot money ("♻️ Recycling completed", no delta). Only a completed task can be claimed: a Claim on a task below its goal (a tap racing the phone's ➖) or on an unknown task changes nothing and writes no line, and a second tap (the button stays on screen while it fades out, and takes no pointer then) pays nothing more. The reward is read from the task (`tokenReward`), never from the action. The reducer and the log ask one decision, `responsibilityClaim` in `store/responsibilityClaim.ts`.
  - **Privilege Suspension System**:
    - Privileges can be suspended for a duration (1 Day, 3 Days, 1 Week, or 2 Weeks).
    - **A suspension ends by itself** at its end time (`suspendedUntil`), with no action from the parent. Every surface asks one predicate, `isPrivilegeSuspended` in `store/privileges.ts`, which reads the stored status *and* the clock: the card's red hazard look, the dashboard summary, the Goal picker and the "Use!" lock. The stored `status: 'suspended'` is only the parent's last decision and is never trusted on its own. A suspension with no readable end time is not in force. The end time is read one way everywhere (`parseSuspensionEnd`): a date string, never a number.
    - At the end time, one `setTimeout` (`store/useSuspensionExpiry.ts`, armed only while a suspension is stored) dispatches `EXPIRE_SUSPENSIONS`. The stored card becomes active, every surface re-renders at once (including a completed Game goal's "Use!" and the Settings tab), and the phone is sent the change. The timer is clamped to what `setTimeout` can hold and re-aimed when the machine wakes.
    - On relaunch, a suspension that ended while the app was closed is loaded as it was stored, and is not in force for any reader. The expiry timer fires at once and lifts it through the same logged action. The phone remote receives what is in force at each broadcast, so an ended suspension reaches it as active with no end time.
    - Suspending, reinstating and the automatic end each write an activity-log line: "🚫 **Phone Games** suspended for 1 day (until 23 Sep 10:00)", "✅ **Phone Games** reinstated" and "✅ **Phone Games** suspension ended (23 Sep 10:00)". Suspend and reinstate are attributed to this machine or to the phone; the automatic end is attributed `auto`. The end line names the end time because a suspension that ended while the app was closed is logged at the next launch. A request that changes nothing writes no line: reinstating a privilege that is already in force, suspending with an end time that has passed, and re-sending the identical suspension. Unlocking a `locked` card logs "reinstated".
    - The phone's `SET_PRIVILEGE_STATUS` is validated before it reaches the store: a known status, a string card id, and, only when suspending, a readable date-string end time that is still ahead (otherwise `null` or absent). A suspension already over on arrival is refused, so the log never shows "suspension ended" without a "suspended" line.
    - Shows remaining time with a countdown badge on the button and in an active suspensions summary below the buttons.
    - Located inside a dedicated card (`PrivilegesPanel`) in Column 3, underneath the Snake Game/Game Token panel.
    - Synchronized with the mobile remote web application (`mc-remote`) in real-time.
  - **Phone Games Privilege**:
    - Adding a new privilege for "Phone Games" (`phone-games` ID, `Smartphone` / `📱` icon).
    - When suspended, it blocks the selection of the "Game" reward (default cost 6 tokens) from the Goal Pedestals list of choices, and disables/locks the "Use!" button on any active completed "Game" goals.
    - The "Quick Game" (Snake, default cost 1 token) goal remains active and unaffected.
  - **Quick Game Reward Option (Snake & Space Rescue)**:
    - **Game Choice Selector**: Clicking the completed "Quick Game" pedestal opens a selector overlay allowing children to choose between playing **Snake** 🐍 or **Space Rescue** 🚀.
    - **Space Rescue Game Rules**:
      - **8x8 Space Grid**: Renders an 8x8 debris-clearing canvas with 10 handcrafted initial layouts. Cleared horizontal rows or vertical columns clear debris, scoring points and filling a Rocket Flight Path meter.
      - **Line clears resolve exactly once**: a completed row or column explodes for 1.2s, then empties, and its satellite/electricity effects and the level's obstacles are applied once. A line scores once: a drop during the explosion that completes nothing new neither re-scores the exploding line nor delays it. A line completed while another is still exploding joins it: both empty together 1.2s after the later drop, and the feedback card stays up until then. The game is never declared over mid-explosion — those cells are about to be free. Starting a new game (which reopening Space Rescue does) cancels a pending clear. A drop in the same frame as a clear is judged against the cleared board.
      - **Proactive Shapes Generator**: In the tray (under the board, or beside it in two rows on a short, wide screen, see 2026-10-02), 3 active shapes are dealt as one coherent hand rather than three independent draws, so the child is given a set that can actually be played out. Every dealt shape is guaranteed to have a valid placement **in the exact orientation it is dealt, at the moment it is dealt**. When the bank (or the rescue slot) is emptied while a line is exploding — by the drop that completed it, or by a later drop during the explosion — the emptied slots stay empty and are dealt when the clear resolves, after its obstacles have landed, so the new hand fits the board the child is actually left with. The rescue slot's Refresh is unavailable while the slot waits, so it cannot deal ahead of that. What the promise does not cover: shapes already in the bank before a clear resolves can still lose their space to the obstacles it adds (the level's asteroids and satellite, and the two asteroids a cleared electricity cell throws). The deal runs in four steps:
        1. **Line-finisher**: with probability `X` the first shape is one that can complete a row or column. If the board is too empty for any shape to complete a line, this step is skipped rather than forced.
        2. **Look-ahead**: if that shape can finish a line, the board is forecast forward as if the child plays it at its most profitable anchor and the line drains away. The remaining two shapes are judged against that forecast.
        3. **Co-placement**: with probability `Y` the other two shapes are chosen so that *both* can be placed in the same round (in either order). If the board is too tight for any such pair, the deal falls back to shapes that finish a line — buying the space back — and then to two independent picks.
        4. **Shuffle**: the three are shuffled before reaching the bank, so the helpful shape is not always in slot one.
        `Y > X` at every level, and both ease off as altitude rises: `X` 0.8 → 0.5 and `Y` 1.0 → 0.85 across levels 0–3. The board already fights back with asteroids and satellites, so the deal deliberately stays generous. Rates live in `DIFFICULTY_BY_LEVEL` in `dealer.ts`.
      - **4th Slot (Golden Rescue Shape)**: Holds a shape that is guaranteed to fit somewhere (ensuring players can always avoid game-over by solving math). Locked behind a math quiz (single-digit addition under 10). Tapping "Refresh" regenerates a new shape but locks the slot. Placing the 4th shape immediately replenishes the slot with a new locked shape.
      - **Game-Over Condition**: The game is over when none of the 3 standard shapes have any valid placements on the grid, the current Golden Rescue Shape does not fit, AND no other shape in the pool fits **in any of its orientations** (meaning the grid is fully blocked and refreshing the Golden Rescue Shape cannot generate a placement).
      - **Rocket Path Progression**: As the rocket ascends (score clears), it triggers altitude levels:
        - *Level 1: Asteroid Impact*: Spawns unfillable locked "asteroid holes" on the grid.
        - *Level 2: Satellite Orbit*: Spawns a satellite block. Clearing the row/column containing it unlocks the 4th shape slot for free.
        - *Level 3: Space Storm*: Increases shape sizes (e.g. 3x3 blocks, crosses `+`).
        - **Drag-and-Drop (touchscreen-first)**: The dragged shape follows the finger through direct DOM `transform` writes on a `position: fixed` proxy, so pointer movement never goes through React rendering. A `<ProjectionOverlay>` draws the landing projection and a development-only Performance HUD tracks frame rate and handler script time.
          - **One gesture owns the drag.** The drag records the `pointerId` that started it and ignores every `pointermove`, `pointerup` and `pointerdown` from any other pointer. On a touchscreen a second finger or a resting palm must not steer, drop, or hijack a shape in flight. `pointercancel` ends the drag as a return-to-bank.
          - **What the child sees is what is placed.** The drop uses the cell coordinates the green projection last showed, never the coordinates of the lift. A finger that rolls on release, or a projection one frame behind the finger, must not change the outcome. A tap with no movement has no projection and is a return-to-bank, not a placement.
          - **Grab point is honest.** The cell the child grabbed is derived from the cell size actually rendered in that slot (36px standard tray, 22px rescue slot), not from the 48px board cell, so the shape does not jump under the finger at pickup.
          - **The shape is lifted clear of the hand.** On touch input the proxy is offset above the fingertip so the shape and its projection are never hidden by the hand; mouse input keeps the shape under the cursor. The projection is derived from the lifted shape's own position on the board, not from where the fingertip is.
          - **Forgiveness snapping, never a surprise.** When the shape's rounded anchor is not placeable, the eight neighbouring anchors are tested and the nearest valid one within **less than one cell** is used. Snapping is computed continuously while the finger is down — and recomputed when the board itself changes under a still finger, so a line clear or a newly spawned meteor cannot leave a stale green ghost — and is always shown as the green projection *before* release, so a snap the child does not want can be corrected by moving; and the bounded radius means a shape can never travel to a distant free spot. When nothing valid is within the radius the projection shows red at the rounded position and the lift returns the shape to the bank.
          - **A refused drop is silent.** The tray slot is emptied only when placement actually succeeded; a rejected drop leaves the shape visible in the bank rather than blanking and restoring it.
          - **The landing projection paints above the board.** The ghost overlay outranks the cells (`zIndex: 20` against a cell's 1, or 10 mid-explosion). Without it the cells win — a grid item takes a `z-index` without being positioned — and the red "you cannot put it here" warning is hidden behind the very block that makes the spot invalid, since a filled cell is opaque while an empty one is not.
          - **Refresh is refused while the rescue shape is in flight.** Refreshing re-locks the slot, which would make the game refuse a drop the child had already been shown in green. The button is disabled for the duration of a rescue drag only; a standard-tray drag leaves it live.
        - **Unique Shape Instances & Jump-Back Prevention**: All generated shape instances are assigned unique IDs upon selection in `useBlocksGame.ts`, avoiding React key collisions. The slots in the tray are rendered transparent during dragging and unmounted upon successful placement, resolving the used shape "jump-back" visual glitch and ensuring proper state resets.

- **Mission scheduling (morning / evening windows)**:
  - The scheduler starts each window's mission **once per occurrence**. It leaves an occurrence alone once that occurrence concluded (completed or failed; an outcome is dated by the day its occurrence started, recorded when the run starts, see "A mission duration must be a real length" below), or once the mission **ran at any point since the window's start time**: it is running now, or it started or ended at or after that time, whoever started it (the scheduler, ▶ Start, or the phone).
  - **A stopped mission stays stopped for the rest of its window (fixed 2026-09-22)**. A stop (the phone's Stop, the only stop control since 2026-09-24; a settings save that moves the running mission's start time also ends it, logged) is not a miss (the shield does not move) and not a conclusion (a stopped morning does not open the quick-game window). It still counts as the occurrence having run, so the scheduler does not start it again, including after a relaunch inside the same window. This holds for a mission started by hand *before* its window, still running when the window opens, and stopped inside it (closed 2026-09-23). ▶ Start and the phone's Start still start it by hand. The next day's occurrence starts as normal.
  - A stop covers only the occurrences its run overlapped. Moving that phase's start time to later makes a new occurrence, and it starts at the new time. A mission started by hand *before* its window and stopped before the window opens does not cancel the scheduled one (completing or failing it early still does: that is today's outcome). Moving it to a start at or before the run's stop (or, for a running mission, before now) makes an occurrence that run already covers: it is not started again (open decision for Nathan, PR 170; before this fix a running mission moved earlier restarted at once).
  - The stamp uses this computer's clock, never the phone's: a phone Stop's own timestamp is dropped on arrival (`useRemoteControl`), so a phone that runs behind cannot stamp the stop before the window. A stamp later than now (written while the clock was set ahead) is ignored by the scheduler and dropped at load. A run that ended unnoticed (the app was closed or the machine slept past its end, or an earlier day's stuck run is ended at load) is stamped as ended at its due end (start + duration), not when it was noticed, so a launch inside the same phase's next window still starts that window's mission (2026-10-05).
  - While any mission is running, the scheduler does not aim at an open window (it waits for tomorrow's): when that mission ends it re-arms once and starts the open window's mission if that occurrence has not run. A window timer that fires late (the machine slept) while its own mission is still running logs no "skipped" line.
  - **Which occurrence is open (2026-10-06).** An occurrence's window runs from its start time for the mission's duration, in real time (a DST night counts its real length), and belongs to the day it started; a window shorter than 5 min (the 10-second test step) stays open 5 min, the scheduler's late-start tolerance. At launch, on waking from sleep, when a mission ends and after a Settings save, the scheduler starts the open occurrence if it has not run, so a relaunch or a wake at 00:10 inside an evening at 23:30 for 60 min starts that evening, dated the evening before; at 00:40 it is over and does not start. Before, only a late timer started it: a relaunch or a wake after midnight aimed at the next 23:30. The occurrences come from one module, `store/missionOccurrence.ts`: the scheduler's arm asks `lastClosedOccurrence`, `openOccurrence` and `nextOccurrence`, its late-fire check `hasClosed`, the hand-start rule below `occurrenceOn` (today's and yesterday's occurrence), and the dating of a run saved before the stored day existed `openOccurrence`. **A late start runs the mission's full duration from the moment it starts**, as a late start always has: a relaunch or a wake at 00:20 inside an evening at 23:30 for 60 min starts it at 00:20 and it runs to 01:20, and if it times out unfinished it costs a shield segment while the child is likely asleep; the same as a launch at 19:50 inside the default 19:00–20:00 evening, which runs to 20:50. Whether a late start should end with its window instead is an open product question for the owner (follow-up list, item 39).
  - **A window missed unseen is logged once (2026-10-06).** When a mission's most recent window closed without the mission running, because the app was closed or the machine asleep, the scheduler writes one line: "⏭️ Evening mission skipped — the 23:30 window was missed (app closed or machine asleep)" (the words "(machine asleep)" until 2026-10-06). It is written by whichever comes first: a launch, the re-arm after a wake, or the timer for that window firing late. A re-arm for a change to the missions (a mission starting or ending, a task tap, a Settings save) never writes it: the app was up. The scheduler remembers each line it wrote or found in the log while it runs, so a CLEAR does not bring it back in that session, and a later launch finds it in the log (the line names its occurrence; see the known limits below). Only the most recent window per mission is reported: a weekend with the app closed gives one line per mission, not one per day. It needs evidence the app was there to run it: the mission ran at some time before that window, or the window began while the app was open (it slept through it). So the morning at 06:00–06:30, which ran on an earlier day, with the app closed until 07:00 gets one line at 07:00 and none on a relaunch at 09:00; a profile on which the mission never ran gets no line at launch. A window the mission did not run because another mission ran through all of it gets no line when that run ends; the next launch or wake reports it, with the same words. A skip moves nothing: no shield (a skip is not a miss, as before), no outcome date, so a skipped morning keeps the quick-game window shut; the parent's way out is ▶ Start. When a window was missed and the next one is open now (closed for a whole day, relaunched at 19:10), the line comes first and the open mission starts a second later. Both missions overdue at one launch get one line each.
  - **Known limits (2026-10-06)**: "logged once" is checked against the activity log at a launch. After the parent clears the log, or 200 newer lines push the line out, a relaunch before that mission's next window closes writes it once more (a wake in the same session does not). A Settings save that moves a start time to a time already passed today writes nothing, but if today's mission has not concluded (not run, or stopped before the new time), the next launch or wake that day reports the window at the new time. **One line per mission per day**: the line's id names the mission and the day, not the window, so once a mission has a "skipped" line for a day, a second window of it that day (its start time moved, then that window missed too) gets no line of its own; the line shown names the first window's time.
  - **A mission start time must be a real time (fixed 2026-09-24).** Settings → "Auto-trigger at" cannot be saved empty: Save is disabled, the empty field is outlined, and the footer names the empty time and its tab ("Set the Morning auto-trigger time (🕒 Missions Time tab) to save.") until both times are filled in. `SET_SETTINGS` also ignores a start time that is not `HH:MM` (it keeps the stored one and does not stop a running mission), a profile saved empty by an older version loads with the default time (06:00 / 19:00) and a window re-derived from its duration, and the log gets one system line saying which time was reset and why ("🔧 Mission settings repaired at startup: the evening start time was empty, reset to 19:00", 2026-10-05; it used to be silent), and the scheduler arms nothing for a time that is not a real `HH:MM`.
  - **A mission duration must be a real length (2026-09-26).** At least one second and less than 24 h (the 10-second test step counts; the duration slider starts at 5 min, so it cannot offer 0). `SET_SETTINGS` keeps the stored duration for anything else, and a profile holding one (JSON saves NaN as `null`) loads with the default (30 / 60 min), named in the same startup line ("the evening duration could not be read, reset to 60 min"). At load the mission window is always re-derived from the settings, never trusted from the saved copy, and a mission saved running with no readable duration gets its window's length, so it can end (named in the same startup line since 2026-10-05: "the running evening mission had no length, set to its window's 60 min"). If that run's window closed before today, it is ended just after load instead (a logged system action, so it reaches the audit trail), with no outcome (no miss, no conclusion date, like a Stop) and one system log line ("Evening mission from <date> ended at startup: its saved record was incomplete"); ending it on the first tick would charge a miss (a shield segment) for a data bug. Every reader of an entered time (scheduler, mood gauge, quick-game window) uses the same strict `HH:MM` rule and does nothing with a time it cannot read; a mission end past midnight (`24:30`) is read as 00:30 the next day, so a launch, a wake from sleep or a late timer inside such a window starts it, before or after midnight (since 2026-10-06 also a relaunch or a wake after midnight: "Which occurrence is open" above). **An outcome is dated by the day its occurrence started (2026-10-05)**, and that day is decided when the run starts and stored on it: the scheduler names the occurrence it starts (a late fire after midnight is still last night's); a start by hand or from the phone **never belongs to a future day's occurrence** (decided for Nathan by the review of PR 193, reversible): at or after today's window start it is today's (a morning made up at 19:30, an evening started late at 21:00); before it, it is whichever is nearer in real time, today's start ahead or the previous occurrence's end behind, a tie going to today, and inside the previous occurrence's window (an overnight tail) it is that one. So a morning at 06:00 started at 05:50 is today's, an evening at 19:00–20:00 started at 00:20 is the evening before and at 14:00 today's. A full Reset keeps the day. So an evening that ends after midnight, finished or timed out, marks the evening that began before midnight as done, not the next day's, and the next evening still starts; a Settings save during the run does not move it. The phone's "Done Today" badge follows the same date, so after an evening that ended at 00:15 it reads "Inactive" until that night's evening. A morning run left from an earlier day concludes that day, not today, so today's games stay shut until today's morning concludes (the quick-game rule below).

- **School Bag task — school days only (added 2026-09-27)**:
  - Owner's rule: organizing the bag for school is a task in both routines, only on school days — not on holidays or Pro-D days. Read from the calendar when one is connected; otherwise Monday to Friday.
  - **Morning**: the last task, when *today* is a school day. **Evening**: immediately before Bed, when *tomorrow* is a school day — the bag is packed the night before (Sunday evening yes, Friday evening no, the evening before a Pro-D day no). An evening mission started after midnight but before the morning mission's start time (by ▶ Start or the phone, e.g. Fri 00:20) is still that night, so it packs for the same day (Friday); a start time that cannot be read keeps the plain next-day rule.
  - **Order with Cream (one rule, both phases)**: Cream first, then the School Bag — morning: …, Cream, School Bag; evening: …, Cream, School Bag, Bed. A bag carried over from an earlier run is put back in that place at every mission start, and Cream enabled mid-run goes in before the bag.
  - **School day** = Monday to Friday and not a no-school date. A date has no school when the calendar has a BC statutory holiday on it (the holiday feed the calendar view already shows), or an **all-day** event whose title matches `NO_SCHOOL_KEYWORDS` in `store/schoolDays.ts` (Pro-D with a dash of any kind or a space, or "ProD Day" — "prod" on its own is not; professional development; no school; school closed or closure; non-instructional; spring/winter/summer/Christmas/mid-winter break, vacation or holiday(s); case-insensitive, editable). A title that announces something about a break or a closure never counts — one containing before, after, reopen(s), resume(s), start(s), begin(s), camp, concert, registration, bus, fair, dismissal or report card(s) (`NOT_A_CLOSURE`), e.g. "Classes resume after Spring Break" or "No school bus today". Timed events never count; a birthday or an observance such as Halloween does not count either (the calendar's own "holiday" flag is ignored — it is set on birthdays too).
  - **Which calendars**: only the calendars ticked in Settings — the same selection the Calendar view shows. Unticking the school's calendar there also stops Pro-D detection. Known risk: an all-day event from anyone, in a calendar that is read (an invite, a shared calendar), titled with one of the keywords removes the bag that day.
  - **Fallback**: no calendar connected, or a date outside the 16 days last read → plain Monday to Friday.
  - **Decided once, when the mission starts** — by the scheduler, ▶ Start or the phone alike — and never changed mid-run. A restart mid-mission keeps the task and its tick.
  - **Refreshed** on launch, when a mission ends, when the computer wakes, and when a calendar is connected; no timer, and no new read starts while a mission runs (a read already under way when a mission starts is still saved; it serves the next mission). The last answer is saved, so a morning with no network still knows a Pro-D day.
  - **All or nothing (changed 2026-09-27, review)**: the school days are read in the calendar feed's *strict* mode. Offline, a sign-in that has expired, any one ticked calendar failing, or the holiday feed failing makes the whole read fail, and the saved days are kept unchanged until a later read succeeds. A read that succeeds replaces them — even when it finds no closures at all. (The first version kept an empty answer as "no news", but offline the feed answered holidays only, which is not empty, and overwrote the saved Pro-D days.) The Calendar view keeps a forgiving read, which forgives less since 2026-10-06: it skips a calendar Google refuses and, while the holiday feed is down, shows no holidays for a year it has not read yet, but fails when Google cannot be reached, and the view keeps the events it shows.
  - **The log says why**: the mission-start line ends with the decision — "morning mission started · 🎒 School Bag", "… · 🎒 School Bag (weekday; calendar not read)", "… · no School Bag (tomorrow is Saturday)", "… · no School Bag (Pro-D day)", "… · no School Bag (Thanksgiving)". The reason is a fixed label per keyword (Pro-D day, no school, school closed, non-instructional day, school break) or a statutory holiday's public name — never the title of someone's event, because the log is also sent to the phone. A statutory holiday's name is stripped of control and invisible formatting characters and cut to 40 characters. A start refused because another mission is running writes no line.
  - **Room on screen**: the mission's task cards shrink from 180 to 120 px wide when needed, so 7 task cards (the routine plus Cream and the bag) and the "Whining?" card stay visible at 1366 and 1280 px wide; at 1920 they are unchanged. (Found because the bag pushed "Whining?" off-screen at 1366.)
  - **Known limits**:
    - A calendar newly ticked in Settings is read only at the next refresh (a mission ending, a restart, a wake, a sign-in).
    - A Pro-D day added to the calendar between the morning and the evening mission, while the computer stays awake, is not seen by the evening mission: the last read was when the morning mission ended. Reading just before the evening window would need a new idle timer, and all 4 idle-timer slots are taken.
    - **A ticked calendar that fails for good — deleted, or no longer shared with this account (Google answers 403 or 404) — makes every strict read fail, with no sign on screen or in the log.** Pro-D detection stops; once the saved 16 days run out the log shows "(weekday; calendar not read)" and the bag follows Monday to Friday. Unticking that calendar in Settings restores reading. A parent-visible signal is a follow-up.
    - A strict read follows every page of a calendar's answer (Google may send fewer events than a page holds, even none, with a "more" token); a calendar still sending pages after 10 fails the read.
    - A **timed** event titled "Pro-D day" is ignored — only all-day events count — and the phone's Calendar app creates timed events by default.
    - A real break or closure whose title also contains an announcement word (before, after, reopens, starts, camp, bus, …) is missed, e.g. an all-day "Winter Break – school reopens Jan 5": the bag shows on those days. The words veto only the break / no school / closed keywords; a Pro-D or non-instructional day is never vetoed ("Pro-D Day camp" is still a Pro-D day).

- **Mood gauge and game tokens**:
  - The mood gauge is the only generator of game tokens. It fills at the mood's rate (`MOOD_TOKENS_PER_DAY`) during the active window and drains at a negative mood. A full gauge (100 %) grants a game token, and a grant resets the mood to 0.
  - **At the cap (5 game tokens) the gauge holds at full.** Nothing is earned, the mood is left alone, and the gauge stays at 100 % instead of wrapping to empty. The token it earned is waiting for room: after the child spends a game token, it arrives within about two heartbeats, logged, and the mood resets — during the active window and while the mood is not negative (a negative mood drains the gauge instead). A negative mood still drains a held gauge.
  - **A Quick-Game goal holds its token against the cap.** Picking a Quick Game takes a game token out of the balance, and trashing the goal gives it back, so while the goal exists its token still counts toward the 5. A held gauge therefore stays held after a pick; it pays out once the game is played (or another token is spent), never into the gap a trash would need. The parent's manual grant obeys the same count: with 4 coins and a Quick-Game goal the child is at the cap, so the grant is refused (and writes no log line), and trashing the goal always gives its coin back. The trash writes "Game token returned from Quick Game", not "0 tokens refunded".
  - **A parent removing a token does not empty a held gauge.** If the gauge is held full when the parent takes a token away (the phone's remove button, logged "Mood token removed") or resets tokens to zero, the held token then arrives within about two heartbeats, logged as `auto`. Whether a take-away should also empty the held gauge is an open decision for Nathan (PR 175).
  - **Who pays how many tokens.** The heartbeat pays every whole token that fits. A mission bonus and a parent's gauge adjustment pay at most one token each, as before; progress beyond that leaves the gauge full, and the heartbeat pays the next token. Whining and a missed mission move the gauge but never pay a token themselves.
  - One writer for every path: `moveGauge()` in `store/moodGauge.ts` is the only code that writes the gauge during a dispatch (guarded by `gauge-writer-boundary.test.ts`), so none of them can wrap at the cap or zero the mood without a grant.
  - **A broken setting cannot mint tokens.** A mission time cleared in Settings stops accrual instead of producing a NaN rate; a non-finite adjustment is ignored; and at load a corrupt token count (NaN is saved as `null`) becomes 0, not a fresh 5, and a corrupt gauge becomes empty. At load the cap also counts a Quick-Game goal: a saved 5 coins plus a goal (possible in v0.0.42) settles to 4, so the trash brings it back to 5 rather than 6. **The removal is logged (2026-09-24)**: one line, attributed to the system ("1 game token removed at load: 5 game tokens plus 1 Quick-Game goal is over the 5-token cap"), which also reaches the audit trail and shows under the log's default "💰 Tokens" filter, counted under 💻 System in the Who row (2026-09-28). It carries no bank delta, like every game-token line: the bank did not move, so the day's "spent" total and the audit file's `d` stay untouched. It happens once, on the launch that settles the balance; later launches load a balance already within the cap and write nothing. A corrupt count that loads as 0 writes no line: there is no real count to report.
  - A held gauge costs nothing while idle: every heartbeat returns the same state object until a token is spent (guarded in `idle-performance.test.tsx`).

- **Mission Streak Shield (missed-mission lockout)**:
  - **One shared counter**: `missedMissionStreak` counts *failed* mission occurrences across morning and evening, minus completions — each miss takes one shield, each completion gives one back. Six net misses is roughly three days of earning nothing.
  - **Miss / give back (changed 2026-09-27)**: only an expired mission with unfinished tasks counts as a miss. A parent-cancelled mission and a mission skipped because the machine was asleep leave the counter alone. Each completed mission routine gives back **one** shield (counter − 1, never below 0), with or without whining. Until 2026-09-27 a completion reset the counter to 0, so one good morning wiped any number of misses. **A run whose timeout is already logged is a miss and is never also paid (decided 2026-10-07)**: the run stays on screen for up to 15 s after its timer runs out, and finishing its last tasks then pays no bonus, gives no shield back and shows no "Mission Complete!"; it ends as expired. The ticks themselves still land (a Cream tick still counts). A full Reset is a fresh attempt and clears this (see "Reset re-arms the occurrence").
  - **Reset re-arms the occurrence (decided 2026-09-03)**: a mission the parent resets *can* be counted as a miss again the same day. Reset means "do it again", and a second failure of a second attempt is a second miss. This applies to **`RESET_MISSION_WITH_TIMER`** (long-press), which restarts the clock and so genuinely grants that second attempt. Plain **`RESET_MISSION`** (short-press) resets only the checklist and leaves the timer running, so on an already-expired mission it grants no time at all — it therefore does **not** re-arm the miss, or one press would cost a segment for an attempt zero seconds long. Both are remote-reachable. Pinned by tests so neither half is "fixed" later.
  - **Lock at 6 — the child's whole economy freezes (decided 2026-09-03)**, not just spending. Refused: deposit, vacuum, move, select a new goal, consume a completed reward, starting a quick game, **tapping an activity for a point, and claiming a finished responsibility**. The mood gauge also stops accruing, and because accrual is *skipped* rather than zeroed, unlocking cannot dump the frozen days back as progress. An earlier version froze spending only, on the reasoning that collecting was the way out; the stronger rule is what the owner wants and is simpler for a child to hold — while the shield is broken nothing moves, and a completed mission starts it again.
  - **What never freezes**: completing a mission (the exit), and the parent's tools — granting tokens, granting a game token, handing a shield back, removing a token, refunding a goal. Locking any of those would make the lock inescapable or take the adult's override away.
  - Every frozen control also *looks* refused (greyed, `🔒 Bank locked`), because a refused action deliberately writes no log line — so an enabled-looking button that silently does nothing leaves no trace for the child or the parent. The locked flag is derived from the streak, never persisted.
  - **Shield bar** (`ShieldPanel.tsx`, between the Mood Gauge and Privileges): a six-segment bar sub-card in Column 3 — full at 0 misses, one segment lost per miss; green 0–2, amber 3–4, red 5, empty and locked at 6. The colour carries the state: there is **no** status caption ("shield is strong/cracking"). The card's text is its title (🛡️ **Shield**, 💔 when broken), the count of shields left ("N / 6"), and the 🔒 **Bank locked — finish your next mission** line, shown only when the shield is broken.
  - **Parent-adjustable shields (remote)**: the parent can hand a shield back or take one away from the phone. One remote action, `ADJUST_SHIELD`, carries a delta in *segments* (positive = give a shield back = streak down). It is clamped to the same 0…6 range, is attributed like any other remote action, and goes through the same lock/unlock transition as a completed mission — so a shield given back at 6 unlocks the bank, with its own line ("Shield given back — bank and goals unlocked.", where a completion writes "Shield restored — bank and goals unlocked."). `missedMissionStreak` therefore rides the remote-sync broadcast, so the phone can draw the same bar. **The phone's buttons (mc-remote `ShieldSection.tsx`, shipped 2026-09-28 at 7372b89)**: the Shield card shows the same six segments, "N / 6", and "🔒 Bank locked" at 0 left, with "−1 shield" and "+1 shield" under it. −1 is disabled at 0 left. +1 is never disabled by the phone's snapshot: the phone does not age it and a lost desktop broadcast is not re-sent, so a stale "6 / 6" could grey out +1 for hours, and +1 is the parent's direct remote way out of a locked bank (the other is to drive a mission to completion from the phone, which also pays the mission bonus); a +1 at 6 / 6 is clamped on the desktop, changes nothing and writes no line. While the shield is broken the phone also disables the Responsibilities −1 / +1 point buttons, because the desktop refuses those points. Every press that moves the shield is logged on the desktop and attributed to whoever made it (📱 for the phone): "💥 Shield taken away — N / 6 left" or "🛡️ Shield given back — N / 6 left", plus the lock or unlock line when it crosses 0: "Last shield taken away — bank and goals locked." (it names the parent, not a miss) or "Shield given back — bank and goals unlocked.". A miss or a completion writes its own lines, not these.
- **Quick-Game Availability Window**:
  - Games are playable only *between* the day's missions: from the moment the morning mission has concluded (completed **or** failed) until the moment the evening mission starts.
  - The rule is literal — "concluded", not "the morning window has passed". A morning that never ran at all (machine asleep at 06:00, app opened later) keeps games shut for the whole day; otherwise a child could earn the day's games by keeping the app closed through the routine. The escape hatch is human: the parent starts the mission by hand from Settings.
  - Enforced by a pure selector used by the pedestal UI and by **two** reducer guards — `START_GAME` and `CONSUME_CASE`. They must agree: when only `START_GAME` was gated, redeeming a quick-game goal at the evening boundary destroyed the goal (no refund) for a game that was then refused. It fails **closed** on a time it cannot parse or a range it cannot honour (`25:00`). Deliberately separate from `isWakingHour`, which stays the basis of mood-token accrual.
- **Reward costs and availability (⚙️ → 🎁 Rewards)**:
  - The parent can change any reward's token cost and switch rewards off. The picker and the goal it creates use the **same** cost: `rewardCost()` in `rewardCatalogue.ts` returns the parent's cost, or the catalogue default when none is set. The picker and the settings editor render with it, and the `SELECT_CASE` reducer case charges with it. The action carries no cost, so no caller can choose one.
  - A stored cost is sanitized to a whole number from 1 to 100. That is the range the settings input declares, and the editor clamps to it as the parent types. Settings are persisted unvalidated, and a goal draws one slot per token.
  - A reward the parent switched off cannot be selected, even by a direct dispatch. A quick game cannot be selected without a game token. Both refusals write no log line (`canSelectReward`, shared by the reducer and `activityLog.ts`).
  - **A goal keeps the cost it was chosen at.** Changing a cost affects goals chosen afterwards. An active goal keeps its stored `targetCount`, including across a restart. The Rewards tab says so: an open goal keeps its cost until it is used or refunded.
  - Still enforced by the picker only: the suspended `phone-games` privilege hiding "Game", and the quick game's mood and time-window filters. `SELECT_CASE` is not remote-allowed, so the picker is its only dispatcher.

## UX / UI Enhancements

### Enhanced Loading Indicator

- **Visibility**: When navigating between weeks or refreshing data, a more prominent loading indicator should be visible.
- **Progress Bar**: Implement a Framer Motion-based progress bar (skeleton or linear loader).
- **Status Text**: Display small text indicating the current loading status (e.g., "Fetching Schedule...", "Updating Weather...") next to or under the date range title in the header.
- **Non-Intrusive**: The loader should not block the entire UI (unless it's the initial load), allowing the user to see the previous state while the new one is being fetched. The full-screen "Syncing with Google..." shows only until the first week can be shown, and does not return while the Calendar stays open; after that a month not loaded yet keeps the calendar and its known events on screen with the header indicator (2026-10-04). A new sign-in starts the Calendar over: a successful Settings → Reconnect Account closes Settings and shows the full-screen loading spinner while the new account loads, and nothing of the account before it stays on screen (2026-10-06). A return from Mission Control (the "← Calendar" button, or the auto-return after the "Auto-Return to Calendar" idle timeout, 5 minutes by default) is not a launch: the week the Calendar last showed comes back at once, on the current week (the navigation and the Weekly/Monthly choice reset, as before), with its saved settings, tasks and weather, and everything is read again in the background with "Refreshing..." in the header. The status text ("Refreshing...", "Fetching Events...") sits under the date out of the header's flow, and the refresh icon in the right-hand group keeps its place (hidden and still when idle), so nothing in the header moves and the grid does not move while a read runs. Offline, the events stay with "Calendar not updated since HH:mm" (the time of the last read that worked) and the tasks and weather stay; a month never read (midnight at a month's end while away) follows the coverage rule below. A sign-in or a sign-out, on either view, and a relaunch start the Calendar over (2026-10-06).
- **A refresh that fails** (2026-10-06): a read during which Google could not be reached — no answer
  at all (offline, DNS, a connection reset or refused, TLS, a timeout), HTTP 408, 429 or 5xx, or a 403
  whose reason is a rate limit or a quota — fails, and never replaces or empties what is on screen:
  - The events shown stay, and the status line under the date says "Calendar not updated since
    14:05" in amber: the time of the read the events on screen came from, with the date ("Oct 28,
    12:00") when it was another day. The notice takes the place of "Refreshing..." when no read is
    running, on one line, and adds no width or height to the header (at 1280x720, the owner's
    1920x1080 at 150 %, it fits between the header's two groups at 12 px; 14 px would not). Its text
    is announced to a screen reader. A tooltip adds that the refresh could not reach Google, that
    the events may be out of date, and that the calendar tries again every 5 minutes. No full-screen
    error, no timer, no animation. The next read that works replaces the events and removes it.
  - A month that has never loaded (Next Week or Next Month into it, or midnight moving a "today"
    week into it) shows the events already on screen only if their read covered every day drawn
    (a month's read runs from a week before it to two weeks after it), with that read's time. Past
    what it covered, the grid is empty and says "Couldn't load the calendar" in red: a day is never
    drawn empty when nothing was read for it.
  - One calendar Google cannot answer fails the whole read: a partial answer would drop that
    calendar's events until the next refresh. A calendar Google refuses for good (any other HTTP
    status: not found, deleted, not shared, a bad request) is skipped with a warning in the log, and
    the others show. Signed out answers no events (the Sign in screen covers it); Google refusing the
    sign-in (`invalid_grant`) is skipped the same way while the app signs out.
  - The trade-off of all or nothing: one calendar that keeps answering 5xx, 429 or a 403 limit stops
    every calendar from refreshing while it lasts (the week stays, marked not updated), and at
    launch or in a month not loaded yet the grid says "Couldn't load the calendar" where the other
    calendars used to show.
  - Tasks follow the same rule; the tasks shown stay, without a notice.
  - A new sign-in (Settings → Reconnect Account, maybe as another account) starts the Calendar over:
    Settings closes, the spinner shows while the new account loads, and nothing read for the account
    before it stays on screen, even when the new account's first read fails. Signing in needs
    Google, so a Reconnect while offline ends on the Sign in screen.
  - Statutory holidays: a year, once read, is kept for the session, so the holiday service being down
    never removes holidays already shown. While it is down, a year not read yet shows without its
    holidays and Google's events still refresh: the holiday service is not Google, and its outage must
    not freeze the calendar.

## Technical Context

- **Frameworks**: Electron, React, Vite (Module Federation/HMR supported).
- **Styling**: Tailwind CSS, Framer Motion for animations.
- **State Management**: React `useState` / `useEffect` with IPC calls for data fetching.
- **Testing**: Playwright for E2E tests, Vitest (implied) for unit tests.

## Bug Fixes

- **Monday Highlighting**: Fixed issue where Monday was incorrectly highlighted in future weeks. Highlighting is now strictly reserved for the actual "Today".

## Changelog

### 2026-02-18 Settings Modal Redesign

- **New Layout**: Replaced long scroll list with a sidebar navigation layout.
- **Categorization**: Settings are now grouped into:
  - **Google Account**: Account connection status and actions.
  - **General**: Calendar View, Active Hours, Display & Power, About.
  - **Calendars**: Toggle visibility of specific Google Calendars.
  - **Tasks**: Toggle visibility of specific Task Lists.
- **UI/UX**: Improved navigation and accessibility with clear category icons and structured content.

### 2026-05-13 Mission Control & Remote Hardening

- **UI Unification**: Standardized Responsibility panel layout with action buttons on the right side.
- **Activity Consolidation**: Merged multiple sport buttons into a single 4-icon grid button for cleaner mobile/desktop UX.
- **Remote Stability**: Resolved all build-time TypeScript errors, implemented strict IPC message validation, and optimized Supabase Realtime synchronization logic. Added VITE_SUPABASE keys to Electron main process Vite define block to fix production connectivity.
- **Logging**: Added remote-action identification (📱) to the MC Activity Log.

### 2026-05-14 Remote Control Stability Fixes

- **Auto-Reconnect**: Hardened the `RemoteBridge` to automatically attempt reconnection when the Supabase channel is closed or experiences errors (e.g. rate limits or network drops).
- **IPC Permissions**: Whitelisted the `remote:request-sync` channel in the preload script to allow the remote web app to successfully request state syncs from the desktop upon connection.
- **Error Visibility**: Dispatched connection loss and reconnection events as visible logs in the Mission Control Activity Log, allowing users to see when the remote connection drops.

### 2026-05-14 Mission Control UI Cleanup

- **Subtitles**: Moved card subtitles (Responsibility & Game Tokens) to hoverable `?` help buttons next to titles to reduce visual clutter.
- **Counters**: Removed redundant `x / y completed` counters from Responsibility cards, relying purely on visual token progress.
- **Buttons**: Adjusted action buttons to feature a top-right `+1` indicator. Increased emoji icon sizes for the consolidated Activity button.
- **Bug Fixes**: Fixed an infinite reconnection loop in `RemoteBridge` caused by clearing the Supabase channel. Fixed a bug in `useLongPress` where hovering and leaving the minimize button would accidentally trigger a short-press to minimize the mission overlay.

### 2026-05-22 Log Bounding & Remote Status Isolation

- **Connection Status Indicator**: Replaced chatty, high-frequency connection state log entries in the Activity Log with a dedicated visual live status indicator next to the Logs button (pulsing green for Online, red for Offline).
- **Log Bounding & Cap**: Enforced a hard limit of 200 entries for the `activityLogs` list inside the state reducer to prevent performance degradation over time.
- **Lazy Loading**: Replaced the full rendering of the Activity Log list with an IntersectionObserver-driven paginated list that lazy-loads logs in increments of 30 as the user scrolls.
- **Speculative Reducer Optimization**: Refactored `createLogEntry` to use a lightweight O(1) state snapshot helper instead of redundantly running the full `mcReducer` state updates, reducing reducer calls on log creations by 3x.
- **Reducer Guard Hardening**: Restricted the execution of the `syncCreamTask` invariant synchronization logic inside `mcReducer` to only run on relevant state dispatches, preventing reference checks and task sync recalculations on unrelated events.

### 2026-05-26 Phone Games Privilege & Panel Layout Refactor

- **Phone Games Privilege**: Added `phone-games` privilege (`Smartphone` / `📱` icon) that can be suspended for 1 Day, 3 Days, 1 Week, or 2 Weeks.
- **Goal Pedestal Blocking**: Suspending `phone-games` prevents selecting the "Game" goal in Goal Pedestals and disables/locks the "Use!" button on completed "Game" goals, leaving "Quick Game" (Snake) available.
- **Privilege Panel Relocation**: Moved privilege buttons out of the top header bar and placed them in a new dedicated dashboard card (`PrivilegesPanel`) in Column 3 (below Snake Game/Game Tokens).
- **Mobile Sync**: Fully synchronized the new privilege, duration settings, and suspension state countdowns with the mobile app (`mc-remote`).
- **Parent-Only Settings Refactor**: Made the dashboard privileges card read-only (child-facing), hiding status pills and active suspensions lists, and relocated interactive suspension/reinstatement controls to a new dedicated Privileges tab in the parent-only Settings overlay.
- **Mobile Remote Layout Optimization**: Restored the two-column responsive grid layout on the mobile remote app for larger (`md:`) screen sizes, adding a centered maximum screen width (`max-w-5xl mx-auto`) and restricting column cards from stretching excessively. Pushed updates to trigger a live Vercel deploy.

### 2026-05-29 Noto Emoji Animated Reactions

- **Animated Reactions Overlay**: Added 10 new animated emoji reactions (Clap, Thumbs-up, Slightly-happy, Triumph, Scrunched, Shaking-face, Hear-no-evil, Hourglass, Check-mark, Cross-mark) using center-screen bounce-in Framer Motion overlays. Uses official Google Fonts CDN WebP images with GIF fallback.
- **Remote App Reaction Grid**: Implemented a responsive 5-column grid section under "Reactions" inside the mobile remote controller app. Buttons display animated emojis from the CDN for rich interactive visual feedback.

### 2026-06-05 Mission Control & Remote Integration Improvements

- **Auto-Return Pause on Snake Game**: Pauses the 5-minute calendar auto-switch timer on the desktop app when the kid is active or playing the snake game (`snakeGameActive` state).
- **Auto-Trigger Skip for Run Routines**: Prevents routine scheduling from auto-triggering morning/evening missions if the mission was already completed or timed out for that day (tracked via Sweden YYYY-MM-DD local timezone format). Manual overrides remain fully active.
- **Task Checklist Toggling**: Renders a task list showing the current active routine's goals on both the desktop app and the mobile remote, allowing parent controls (or child) to check/uncheck (toggle) their status.
- **Mobile Whining Indicator**: The Whine button on the mobile remote now dynamically styles itself with a pulsing bright red background when whining is detected on the desktop.
- **Mobile Activity Logs**: Shows the last 20 activity logs at the bottom of the mobile remote, with styling, formatting highlights, and remote indicators.

### 2026-06-05 Version 0.0.33 Release & Deployment

- **Automated Deployment**: Bumps version to `0.0.33` and deploys packaged installers directly to GitHub Releases.
- **Pre-release Validations**: Fully type-checked code and ran the comprehensive suite of 476 unit tests and E2E tests before compilation and building.

### 2026-06-10 Animated Emoji Loading & Sizing Fixes

- **CSP Google Fonts Whitelisting**: Added `https://fonts.gstatic.com` to the `img-src` Content Security Policy directive in both development and production, allowing the desktop app to successfully download and render animated WebP/GIF emojis. Added regression security unit tests to verify the whitelisting.
- **Remote Reactions Layout**: Replaced layout classes on the `<picture>` wrapper with direct sizing (`w-10 h-10` / 40px) on the underlying `<img>` tag in the mobile remote, resolving browser fallback rendering issues and improving visibility.

### 2026-06-12 Remote Control Mission State Reflection

- **Detailed Mission State**: Updated the remote control and host application state synchronization to broadcast and reflect the status of both Morning and Evening missions simultaneously.
- **Pulsing Whining Status**: Reflected the exact whining detection status on individual mission cards, highlighting the button in pulsing red when whining is active.
- **Interactive Checklists**: Rendered expandable task checklists with completion progress bars on both Morning and Evening remote mission cards, allowing parents/children to see what is done/not done and toggle tasks in real-time.
### 2026-06-29 Space Rescue Blocks Game

- **Quick Game Selector**: Added selection overlay allowing children to choose between Snake 🐍 and Space Rescue 🚀.
- **Space Rescue Blocks Game**: Implemented an 8x8 block puzzle game with 10 handcrafted initial layouts, proactive look-ahead shape generation, event-based altitude progression (Asteroid holes, Satellite repair), and a 4th slot Golden Rescue shape locked behind simple numeric math.

### 2026-06-30 Space Rescue Blocks Game UI & Alignment Fixes

- **Enlarged Overlay Popups**: Increased the main game popup dimensions to `95vw` / `95vh` limits (`min(1250px, 95vw)` and `min(900px, 95vh)`) to accommodate larger elements comfortably.
- **Side Panel for Rescue Shape**: Moved the 4th slot (Golden Rescue shape) and its refresh button to a dedicated right-hand side panel, separating it from standard shapes.
- **Fixed-Size Bank Slots**: Stabilized the standard shapes bank slots to a fixed width and height of `240px` to prevent layout movement or shifting when shapes are generated or placed.
- **Framer Motion Key Regeneration Fix**: Applied shape IDs as unique React keys (`shape ? shape.id : 'empty-idx'`) on slot wrappers, ensuring newly generated shapes initialize directly in the bank instead of flying from the mouse drop coordinate.
- **Grid-Aligned Drag Calculations**: Updated the coordinate mapping formula to precisely account for CSS Grid cell sizes, gaps, and board padding: `Math.floor((x - padding) / (cellSize + gap))`, eliminating projection shifts as shapes are dragged across the board. Removed dragElastic constraints and scale modifications during drag for a lag-free visual overlay.
- **Level Difficulty Progression**: Modified the shape generation system to progressive difficulty. Removed small `1x1` and `1x2` shapes from normal pools to introduce them only as fallbacks or special Golden Rescue Shapes. Added staircase (`78523`), U-shape (`14563`), Giant L (`96321`), and Cross (`45862`) shapes appearing dynamically in higher levels.
- **Z-Index & Lock Interactions**: Configured a `draggable` prop on `ShapeItem` to disable pointer events and interaction when shapes are locked, positioning the lock button cleanly on top.
- **Full Canvas Quiz Modal**: Re-rendered the math puzzle quiz modal at the root level of `BlocksCanvas` with a backdrop blur and `zIndex: 1000`, blocking interaction and overlapping shapes completely until solved.
- **Drag Performance Optimization**: Wrapped drag event callbacks in stable `useCallback` hooks and introduced a `lastHoverCoordRef` to skip redundant React renders unless grid cell boundaries are crossed. Wrapped `ShapeItem` in `React.memo` to bypass sub-tree rendering during dragging.

### 2026-07-02 Space Rescue Performance & Animation Polish

- **Performance Architecture (Grid Isolation)**: Extracted the 8x8 game board into a memoized `BlocksGrid` component. This optimization prevents the full grid (64 cells) from re-rendering during drag-and-drop operations, limiting updates to the `ProjectionOverlay` only.
- **Real-Time Performance HUD**: Integrated a diagnostic HUD in development mode that tracks FPS, JS Scripting execution time (in ms), and render counts for both the grid and the canvas.
- **Placement Masking (Jump-Back Fix)**: Resolved the "snap-back" visual flicker bug where shapes would momentarily reappear in the bank after placement. Implemented a `pendingPlacement` state that maintains slot transparency until the state transition is confirmed.
- **Diagonal Clear Animation**: Implemented a staggered block-by-block removal effect. Cells in cleared lines flash white-to-gold and shrink with a diagonal delay based on their coordinate `(r + c)`, creating a wave-like ripple clear.
- **Combo Feedback HUD**: Added a centered floating glassmorphism overlay that provides immediate performance ratings ("GOOD!", "GREAT!", "EXCELLENT!") and animated stars based on the number of lines cleared simultaneously.
- **Milestone Altimeter Path**: Enhanced the vertical progress track with horizontal dashed milestone indicators at 50m, 120m, and 180m. Rotated the rocket to 0-degrees (straight up) and added a pulsing neon glow to the destination 🛸 icon.
- **Adaptive Preview Scaling**: Implemented a `cellSize` property in `ShapeItem` to allow different scales for previews. Standard bank shapes are scaled to `36px` and Rescue shapes to `22px`, ensuring 100% containment within slots and full coverage by the math lock overlay.
- **Enhanced UI Controls**: Enlarged the rescue slot refresh button with high-contrast neon borders and improved padding for better hit-box accessibility.




### 2026-08-19 Data Integrity, Attribution & Token Economy Rebalance

Investigation into four reported symptoms — bank tokens vanishing and reappearing, missions
starting at wrong times, a phantom "remote game" prompt, and the calendar needing re-sign-in
every few days — plus the requested slowdown of game-token generation.

**Single instance enforcement (root cause of several symptoms at once)**
- `electron/main.ts` now claims the single-instance lock before anything else. A second
  launch quits immediately and focuses the running window via the `second-instance` handler.
  (Both details changed later — see 2026-08-24 below: the lock moved to
  `electron/single-instance.ts`, and focus is no longer taken for E2E launches.)
- Two instances shared one userData directory, therefore one `localStorage` blob (`mc-state-v5`)
  and one Supabase remote-control room. Both wrote the entire state on a 500ms debounce, so the
  loser's snapshot silently overwrote the winner's. This is what made token counts flip back and
  forth, ate activity-log history (the log lives inside that same blob), let both schedulers fire
  the same mission, and showed the phone two conflicting states.
- Bootstrap logic was restructured into `bootstrap()` / `registerIpcHandlers()` /
  `registerAutoUpdater()`, and the night-time screen-blanking policy moved to
  `electron/power-policy.ts`, keeping `main.ts` inside the 300-line limit.

**Token economy — generation slowed and re-expressed in tokens/day**
- `MOOD_HOURLY_RATE` (magic per-hour numbers) replaced by `MOOD_TOKENS_PER_DAY`:
  Excellent 1.5/day, Good 1/day, Neutral 1/3 day (one token every three days), Bad −0.4/day,
  Horrible −1.0/day. `moodHourlyRate(mood, settings)` derives the per-hour rate from the
  *configured* active window, so changing the morning/evening times cannot silently change the
  economy.
- Earning a token now resets `moodWind` to 0 (Normal). The next token has to be earned back up
  from Neutral.
- **Removed `useGameTokenScheduler` entirely.** It granted a token on every mount *and* at every
  midnight, and never wrote `gameTokensLastGrantedDate` — so every app launch minted a free token.
  This, not the mood rates, was the source of the token surplus. Manual `GRANT_GAME_TOKEN` is
  retained (the phone remote has a button for it) and is now logged.

**Visibility and attribution**
- `ActivityLogEntry` gained `source` (`local | remote | scheduler | auto | system`) and
  `gameTokens`. `MCAction` gained an `origin` field carrying the same information.
- The mission scheduler now dispatches through the logging interceptor, so scheduler-driven
  mission starts, task locks and expiries appear in the log instead of happening silently.
- Automatic mood-token grants write their own log entry from inside the reducer, with a
  deterministic id — the one token movement no user action triggers is now the one that can
  never go unlogged.
- New log coverage: `LOCK_TASK`, `GRANT_GAME_TOKEN`, `CONSUME_GAME_TOKEN`, `RESET_GAME_TOKENS`,
  `SET_MOOD_WIND`, `ADJUST_BEHAVIOR_PROGRESS`, `END_GAME`.
- **Durable audit trail**: `electron/audit-log.ts` appends sanitised NDJSON to
  `<userData>/audit-log.ndjson` (4 MB, one rotation). Append-only by design — there is no
  `audit:clear` channel, so the in-app CLEAR button cannot erase it. `useAuditTrail` mirrors every
  log entry plus a `SESSION_START` marker; it adds no timer.
- **Activity log redesign**: a "today at a glance" summary strip (balances, earned/spent, event
  counts per source, and a warning row for token movements nobody triggered), a *Who* column with
  attribution badges, filters (Tokens / Missions / Automatic / Phone / All), an EXPORT button that
  downloads the on-disk trail, and a two-step confirm on CLEAR.

**Mission timing**
- `setTimeout` does not survive a machine suspend: a timer armed for 06:00 fires late — or
  instantly — on resume, which is what started missions at visibly wrong times. The scheduler now
  records each timer's intended wall-clock target and skips (with a console warning) any firing
  more than `LATE_FIRE_TOLERANCE_MS` (5 min) late.
- `powerMonitor.on('resume')` in the main process sends `system:resume`; the scheduler tears down
  and re-arms its whole schedule against the real clock.

**Remote control hardening**
- `useRemoteControl` now enforces `REMOTE_ALLOWED_ACTIONS`. The channel previously forwarded any
  action type straight into the reducer; `CLEAR_LOGS`, `RESET_GAME_TOKENS`, `ADD_LOG`,
  `SET_SETTINGS` and `START_GAME` are now rejected.

**Ghost game fix**
- `loadPersistedState` forces `snakeGameActive: false`. The flag was restored verbatim from
  localStorage, so a crash or quit mid-game — or a remote `START_GAME` arriving while the Calendar
  view was showing, where no overlay exists to close it — stranded it at `true` forever, which is
  what made the phone keep offering a game that was not running.

**Google auth session loss**
- `saveTokens` now preserves an existing `refresh_token` when the incoming credential set omits
  one (Google issues it only on first consent; every refresh response omits it, and writing the
  response verbatim destroyed it).
- Added an `oauth2Client.on('tokens')` listener so refreshed credentials are actually persisted.
- `generateAuthUrl` now passes `prompt: 'consent'` so a re-auth reliably returns a refresh token.
- NOTE: if the Google Cloud OAuth consent screen is still in **Testing** publishing status, refresh
  tokens expire after 7 days regardless of these fixes. That is a console setting, not code.

**IPC surface**: `ALLOWED_INVOKE_CHANNELS` 17 → 19 (`audit:append`, `audit:read`);
`ALLOWED_ON_CHANNELS` 10 → 11 (`system:resume`).

### 2026-08-20 Reading Practice in the Game Quizzes

**What shipped**: the revive/unlock quizzes inside snake, blocks and fruit-merge now mix reading
questions with math, driven by an invisible adaptive engine, with a parent-only progress view.

**Reading modes** (tap-to-answer, 4 choices, lowercase decodable words with one canonical emoji each):
- L0–L1 word → picture (distractors share the first letter from L1 — full decoding required)
- L2–L3 picture → word (minimal-pair distractors at L3: dog / dig / dot / dug)
- L4–L5 missing letter (first/last, then the middle vowel — the picture disambiguates c＿t)
- L6 five-to-six-letter words, both directions

**Rules**:
- First-attempt scoring: the revive dot fills only on a clean first tap. A wrong tap greys the
  choice, freezes the grid for 1.5 s (tap-spam is slower than reading), and the eventual find
  celebrates softly, counts nothing, and a fresh question follows. Math keeps its numpad and its
  retry-until-solved dot behavior; its first submit is recorded silently for stats.
- Adaptive level: sliding 20-answer window of at-level first attempts; ≥85% over 15+ promotes,
  <40% demotes, a perfect first 5 fast-tracks through L0–L2. Level changes write ONE neutral
  activity-log entry ("Practice adjusted" — the log is kid-reachable; exact levels are parent-only).
- Sampling: 20% one level down / 60% current / 20% stretch (+2 once the game stage allows);
  reading/math mix leans toward the weaker family within a 40–60% band — math is the always-
  solvable escape valve and never drops below 40%. After two consecutive reading misses the rest
  of that quiz is math (invisible mercy, reset per quiz). A missed word re-serves after exactly
  3 questions, once per game session. Opt-in quizzes (blocks unlock, fruits delete) gained a ✕.

**Parent view**: Settings → 📈 Learning tab. Reading-momentum "stock" chart with ▲ level-up markers
and a level-up log ("→ L3 · date · 9 days at L2 · 18/20 first-try"), weekly at-level accuracy per
skill, daily practice volume, per-game split, hardest-words top-5, and a NEEDS-WORK callout gated
on ≥10 recent at-level answers. Charts and callouts count at-level questions only, so stretch
questions doing their job never read as a reading crisis. Empty and sparse states are designed.

**Storage & perf**: everything lives in a bounded `skillProgress` slice (60-day per-skill day
buckets with at-level/off-level pairs and per-game splits, capped level history with the window
evidence that triggered each change, capped missed-word counts). No new timers; recording is
tap-driven; `createLogEntry` now short-circuits unlogged action types before its speculative
reducer run; `behaviorProgress` left the remote-sync dependency list (backlog item), so answering
a question no longer triggers a Supabase broadcast; `skillProgress` never rides the broadcast
(guarded). `RECORD_QUIZ_ANSWER` is pinned out of the remote allowlist.

**Refactors in the same change**: `mcReducer` shed its behavior-sync block to `behaviorSync.ts`
(1033 → 828 lines); `MissionControl` shed the quick-game session hook and `RemoteIndicator`
(338 → under the limit); `QuizOverlay` split into per-kind panels and traded its raw hex for
`--mc-quiz-*` tokens (its style-ratchet entry is deleted, not raised).

### 2026-08-21 Log Fidelity, the Quiz-Cancel Loophole, and a Lighter Rescue Overlay

**What shipped**: follow-ups to the reading-practice change above. No new feature here — every item
is something that entry got wrong, left unsaid, or shipped with a hole in it.

**Activity log — attribution**
- The 🕹️ "Quick Game started" and 🏁 "Quick Game ended" entries are built by hand in
  `useQuickGameSession` and dispatched straight as `ADD_LOG`, bypassing `createLogEntry`'s
  derivation — so both shipped with `source` undefined, against CLAUDE.md's attribution rule. Both
  are now `'local'`: the child tapped a game on this machine, and the remote path never routes
  through this hook. The guard asserts the exact value rather than presence, because a
  plausible-but-wrong `'system'` would pass a truthiness check while lying to the parent.

**Activity log — one event, one entry**
- Every quick game wrote TWO 🏁 lines: the hand-built one carrying the score and duration, plus a
  derived "Game closed" line from the same `END_GAME` action. The 200-entry ring buffer filled at
  twice the rate, halving how far back a parent can actually see. `END_GAME` now derives nothing and
  joins `START_GAME`, `ADD_LOG` and `RECORD_QUIZ_ANSWER` in `UNLOGGED_ACTIONS` — short-circuited
  *before* the speculative reducer run rather than falling through the switch after paying for it.
- **Accepted loss, recorded so nobody re-engineers it**: the derived entry spread the balance
  snapshot (`totalTokens` / `bankTokens` / `gameTokens`), which renders as chips in the log and is
  mirrored into the append-only NDJSON trail. Game-close lines no longer carry those chips. That is
  the right trade: no tokens move at `END_GAME`, `START_GAME` never had snapshots either, and the
  next balance-changing entry restates all three.

**Cancelling a quiz is not a reroll**
- The ✕ added to the opt-in quizzes (blocks unlock, fruits delete) in the 2026-08-20 entry left a
  hole: backing out of a question left no trace, so reopening sampled a fresh one. Tap ✕ until the
  question is easy and the adaptive engine never learns the hard one was dodged — the exact
  first-attempt contract the reading feature rests on.
- The engine now parks every question it serves in a pending slot and clears it on any answer. A
  question that received zero answers when its quiz closed is still parked, and the next quiz to
  open **on the same surface, within the same game session** is served that exact question — same
  wording, same difficulty level — before anything new is sampled. Parking on serve rather than on
  close is deliberate: the blocks rescue layer is conditionally mounted and never emits a close
  signal at all, and parking also covers quitting a game mid-quiz, which no close-signal design
  would catch.
- The slot is scoped to one game session: a parked question does **not** follow the child into a
  different game. Dodging that way means exiting the game and paying another token to re-enter,
  which costs more than answering the question.

**Rescue quiz backdrop (perf)**
- `RescueQuizLayer` painted its own dim + 8px `backdrop-filter` and then mounted `QuizOverlay`,
  which paints its own dim + 4px blur over the *same* rectangle — two dims compositing to ~0.97
  alpha and two blur passes for one visible result, on a project with a hard idle-CPU budget. The
  wrapper is now a pure positioning shell; `zIndex: 1000` stays, since it layers the quiz above the
  shapes tray and the dev HUD. Snake and fruit-merge already mounted `QuizOverlay` bare — blocks
  was the outlier.

**Dependencies**
- `recharts` dropped from `package.json`. It predated the Learning Progress panel and was imported
  nowhere — those charts are hand-rolled SVG. It was worse than dead weight: the premium-ui skill
  cited it as the project's charting library, so the next person adding a chart would have reached
  for a dependency nobody had ever wired up. Six small charts never justified the bundle; the docs
  now say so in the past tense.

**Guards**
- The structural test pinning `useQuickGameSession` as the only `END_GAME` dispatcher matched a
  literal string. Proven bypassable both ways: a mere *comment* containing that string turned it
  red, and a real dispatch written multi-line — the formatting its own sibling `ADD_LOG` call
  already uses — left it green. It now strips comments before matching and tolerates whitespace,
  with both forms re-proven. An outcome test was added alongside it, running the real `useMCDispatch`
  interceptor over the real reducer and asserting exactly one 🏁 entry lands per close.
- The rule registry now records what the attribution guard structurally *cannot* see — entries
  built by hand and dispatched as `ADD_LOG` never reach `createLogEntry` — and names the per-site
  test that covers the one such site.

### 2026-08-24 — Quiz Lab (dev-only) + game level mappings extracted

**Quiz Lab — `?lab=1`, dev builds only**
- A developer/PO surface for tuning question difficulty by eye. Until now the only way to see a
  level-3 math question was to survive several minutes of snake, so difficulty was tuned blind.
- Two panels, because there are two different questions. **Live sample** plays a real question at
  any family/level through the actual `QuizOverlay` (honest tap targets, wrong-tap freeze, feedback
  dwell) with a Reroll and the metadata the kid never sees — `kind`, `skill`, `level`, `wordId`.
  **Distribution** draws 200 questions at that setting and shows what actually comes out: the
  add/sub/mul split (or the three reading shapes), and an answer histogram (or per-word counts).
  A single sample cannot answer "am I getting enough hard questions?" — 200 can.
- Store-free by construction: it calls the generators directly rather than `useQuizEngine`, and
  returns from `App.tsx` **before** `MCStoreProvider`. No scheduler, no bridges, nothing added to
  the always-mounted tree, and no path by which a lab answer could reach the child's real
  `skillProgress`.
- **The dev gate is the load-bearing part** — a debug surface that shows answers has no business on
  a child's device. Gated twice on the literal `import.meta.env.DEV`: once in `resolveInitialView`
  (`src/appRoutes.ts`), once at the render site, so Vite folds the branch to `false` in a
  production build and the lab tree-shakes out of the bundle entirely. Both gates are pinned by
  `src/appRoutes.test.ts`, which also asserts the mount sits above `<MCStoreProvider>`.

**Each game's quiz-level mapping is now a function, not an inline expression**
- `snakeQuizLevel(elapsedMs)` (`games/snake/types.ts`), `deleteTierLevel(tier)`
  (`games/fruits/types.ts`) and `altitudeLevel(altitude)` (`games/blocks/types.ts`) replace
  expressions that lived inside the overlays. `games/quizLevelMap.ts` walks each domain and emits a
  row wherever the level changes, so the lab's "what does level 2 actually mean" table is
  **computed** from the games rather than restated — it cannot drift. This paid for itself
  immediately: snake's step was retuned from 120s to 45s the same day and the table followed.
- `altitudeLevel` also gave `ALTITUDE_LEVELS` its first consumer. The 50/120/180 thresholds had
  been declared twice — once as that constant, once as a live if-chain in `useBlocksGame.ts` — and
  only the if-chain was doing anything.

### 2026-08-24 E2E userData isolation, and a suite that stops writing to real state

**The problem.** Every Electron instance Playwright launched used the developer's real userData
directory — the Mission Control store (`mc-state-v5`), `config.json` (theme, `weekStartDay`, and the
Supabase remote-control pairing keys), the Google tokens, and the audit trail. A test run therefore
left `activeMission` running for an hour, suspended a privilege for a day, rewrote `morningStartsAt`,
minted tokens into the real bank, flipped the theme, called `localStorage.clear()`, and — because the
pairing keys live in that config — joined the household's real remote-control room and broadcast test
state to the phone. It also explains the suite's apparent non-determinism: `weekStartDay` decides the
dates several calendar specs assert against, so the previous run decided whether they passed.

**Isolation.** Electron honours Chromium's `--user-data-dir`, so this needed no production change:
each launch gets a throwaway profile (`e2e/helpers/userDataDir.ts`) and `remote-bridge` generates its
own pairing keys, putting the instance in a room of its own. Mission Control specs can isolate because
`?mc=1` routes outside the calendar's auth gate, so they never needed Google credentials. Six specs
are isolated; eight still need a signed-in account and are named in `NEEDS_REAL_PROFILE`.

**Shipped behaviour changes.**
- The single-instance lock moved from `electron/main.ts` to `electron/single-instance.ts` and now
  carries a `headless` flag. Refusing to boot a second instance is unchanged and unconditional;
  surfacing the running window is not — an E2E launch no longer steals focus, because Playwright
  starts the app once per test and each one used to restore, show and focus the developer's window.
  A launch with no payload still surfaces the window.
- The Playwright HTML report no longer opens a browser on failure (`open: 'never'`); read it with
  `npx playwright show-report`.

**Guards.** `src/__tests__/e2e-state-isolation.test.ts` checks every `electron.launch` rather than
guessing which specs touch Mission Control state — the earlier keyword version missed that
`MCStoreProvider` is mounted on both views, so calendar specs write MC state without entering it.
`e2e/global-profile-leak-check.ts` fails the run if a throwaway profile is left on disk, because
source text cannot prove cleanup ran. `src/__tests__/docs-integrity.test.ts` keeps this document a
single copy after it was found triplicated with all three copies drifted apart. `e2e/` is now
type-checked, which it never was.

### 2026-08-25 Release-review fixes (PR #152 max-effort review)

Behavior changes shipped by the review's fix pass:

- **Audit trail integrity.** The durable NDJSON trail no longer re-appends the restored activity-log
  ring on every launch (entries present at mount are treated as already mirrored); oversized flushes
  are chunked to the main process's 100-entry append cap instead of silently losing their newest
  entries; and pressing CLEAR now writes a `🧹 Activity log cleared (N entries)` record that survives
  the wipe and reaches the trail.
- **Attribution.** The auto-collected mission bonus (timer expiry with all tasks done) dispatches
  with `origin: 'auto'`, so the Who column, the summary strip's "unattended token changes" counter,
  and the disk trail attribute it to the app rather than to a person. The unattended counter is
  live for the first time as a result.
- **Token economy.** The "earning a token resets mood to 0" rule now also applies to the mission
  no-whining bonus crossing the gauge; conversely, when the gauge fills while game tokens are at
  cap, nothing is earned and the parent-set mood is left alone (previously it was silently zeroed
  with no log entry).
- **Mission scheduler.** A late timer fire or a resume that lands inside the mission's own
  startsAt–endsAt window now starts the mission (waking at 06:10 runs the 06:00–06:30 morning
  mission); an app started inside an open window behaves the same. A genuinely missed window writes
  a `⏭️ mission skipped` log entry instead of only a console warning.
- **Remote hardening.** Allowlisted remote actions now validate their numeric payload fields
  (`amount`, `deltaMinutes`, `level`) before dispatch, and `bankCount` is sanitized at load — a
  malformed phone payload can no longer NaN-poison the persisted bank balance.
- **Quiz engine.** The fruits delete-quiz difficulty is applied at question-generation time, so the
  question always matches the selected fruit's tier (it previously always served level 0); closing a
  quiz by unmount (blocks) now ends the engine's mercy scope like closing by flag does.
- **E2E/dev tooling.** `test:headed`/`test:debug`/`test:ui` show the app window again; the shared MC
  fixture waits for real readiness signals (`.mc-root` + the persisted blob) instead of fixed
  sleeps, and closes the Electron process if a launch fails halfway.

### 2026-08-28 Week navigation: the Monday anchor confirmed, three stale specs rewritten

- **No behaviour change.** `getWeekStartDate` is untouched. This entry records a product decision that
  had only ever been made implicitly, and rewrites the tests that contradicted it to assert the rule.
- **The decision.** With `Week Starts On = today`, only the current week starts on today (returning to
  it lands on today again). Any other week starts on Monday, as this document has said since the
  initial release. The
  owner reviewed the alternative (a rolling today+7 window) and confirmed the Monday anchor, accepting
  that the first "next week" click re-shows the tail of the current view.
- **Why it needed confirming.** The code originally implemented the rolling window;
  `1f3c771` changed it to the Monday anchor and updated the unit test, but the commit message said only
  "fix: calendar start day navigation" and no requirement was written. The intent was recoverable only
  from a diff.
- **The bug this closes.** Three specs in `e2e/week-navigation.spec.ts` still asserted the pre-`1f3c771`
  rolling window. They shipped red in 0.0.41 and again in 0.0.42. Because the two behaviours coincide on
  Mondays, the suite looked green to anyone who ran it on a Monday — the failure was a property of the
  calendar, not of the code. On Tuesday 2026-09-22 the spec failed a full run with `Expected: '29',
  Received: '28'`: today + 7 against the Monday the app actually shows.
- **The guard.** `weekNavigation.test.ts` now pins offsets 0/1/2 from all seven weekdays, so the rule
  can no longer be confirmed by an accident of the run date. Proven to fail: reverting
  `getWeekStartDate` to `addWeeks(referenceDate, weekOffset)` fails 15 of its cases — and passes the
  Monday ones, reproducing the original blind spot exactly.
- **Docs/UI.** The `today` option in Settings > General now reads "Calendar shows today and the next 6
  days. Other weeks start on Monday." instead of describing the first view only (the old "today and
  the next 7 days" also read as eight days).
- **Landed late.** Written and decided on 2026-08-28, then parked on a branch; rebased onto main on
  2026-09-23. It is filed under the decision date.

### 2026-09-02 Mission Streak Shield — bank/goals lockout + the quick-game window

**New — Mission Streak Shield (missed-mission lockout).** A single counter, `missedMissionStreak`,
tracks consecutive *failed* mission occurrences (morning and evening share one streak, so six in a
row ≈ three days of earning nothing).

- **What counts as a miss.** Only a mission that ran and expired with its tasks unfinished
  (`MARK_MISSION_TIMEOUT`) increments the streak. A mission the parent cancelled
  (`CANCEL_MISSION`), and a mission the scheduler *skipped* because the machine was asleep, both
  leave the streak untouched — a weekend with the laptop closed must not freeze the bank.
- **What resets it.** Any completed mission routine (`COMPLETE_MISSION_ROUTINE`) sets the streak
  back to 0 — a single good morning clears the whole debt.
- **Reliability.** The miss is recorded at the mission's real end, not at the overlay's. The
  scheduler's expiry tick marks the timeout before it clears `activeMission`, so a mission that
  expired while minimized (or with Mission Control not on screen) still counts. The reducer holds
  the idempotency guard (`loggedTimeoutAt`), so the two dispatchers can never double-count.
- **The lock.** At 6 consecutive misses the bank and the goal pedestals are **locked**: no
  depositing, no vacuuming, no moving tokens, no selecting a new goal, no consuming a completed
  reward. Earning still works — mission bonuses, responsibility claims and parent/remote token
  grants all land normally, because collecting them is the way out. The locked state is *derived*
  from the streak (`streak >= LOCK_AT`), never stored, so it cannot drift out of sync.
- **Attribution.** Engaging and releasing the lock each write an activity-log entry with a `source`,
  like every other state change — a bank that freezes silently is exactly the failure the
  attribution rule exists to prevent.
- **The Shield bar (Column 3 sub-card).** Six segments, full at zero misses, one segment lost per
  miss: green at 0–2 missed, amber at 3–4, red at 5, empty + locked at 6. Placed as a sub-card in
  the right-hand column alongside the Mood Gauge and Privileges. Visual design gated on an approved
  mockup.

**Changed — quick-game availability window.** Games are available only *between* the day's missions:
from the moment the morning mission has concluded until the moment the evening mission starts.
Previously the gate was `isWakingHour`, which is wider at both ends (it opens at the morning
mission's *start* time and closes at the evening mission's *end* time), so a child could play
before doing the morning routine and during the evening routine. The new window is a separate pure
selector — `isWakingHour` is left alone because the mood-token accrual rate is derived from it — and
it is enforced in the reducer (`START_GAME`), not only in the pedestal UI.

- "Morning concluded" means *any* conclusion — completed or failed. Failing the morning already
  costs behaviour progress and a shield segment; it does not additionally forfeit the day's games.
- It does **not** mean "the morning window has elapsed". A first draft opened the window at 06:30
  whether or not the routine ran, which handed the whole day's games to a child who simply kept the
  app closed until 07:00 — it deleted the rule it was meant to enforce. A morning that genuinely
  never ran therefore keeps games shut all day, and the parent recovers it by starting the mission
  by hand from Settings.
### 2026-09-07 Space Rescue gesture controls (touchscreen)

**Why**: watching the child play, a laggy-feeling drag made him miss the cell he was aiming for.
Most misses returned the shape to the bank, some landed in the wrong place. Six concrete defects
were found and reproduced by tests before any change was made
(`BlocksCanvas.gesture-defects.test.tsx`); the full analysis is in
[docs/tasks/blocks-gesture-controls-review.md](tasks/blocks-gesture-controls-review.md).

**Group A — correctness of the gesture**
- The window `pointermove`/`pointerup` listeners now filter on the `pointerId` that started the
  drag, and a second `pointerdown` during a live drag is refused. A palm or second finger could
  previously drop a shape at its own coordinates, which is the "landed in the wrong place" bug.
- `pointercancel` is handled and ends the drag as a return-to-bank; previously a cancelled touch
  froze the proxy on screen with the tray slot still hidden.
- The drop uses the last projected cells rather than the lift coordinates.
- The grab cell is computed from the slot's rendered cell size instead of the 48px board constant.
- The tray slot un-masks on release either way; a successful placement empties it in the
  same React commit, so a refused drop simply leaves the shape sitting in the bank.
- The drag logic moved out of `BlocksCanvas.tsx` (362 → 176 lines, off the file-size debt list) into
  five units: `useShapeDrag.ts` for the gesture, `dragGeometry.ts` for the pure pointer-to-cell and
  snapping maths, `placement.ts` for the single "may this shape sit here" rule the ghost and the game
  now share, `boardOrigin.ts` for the one DOM measurement the drag depends on, and `dragPerf.ts`
  for the dev HUD's metering.
- The 250ms mask that hid a slot after a successful drop was removed. `useBlocksGame` deals three
  fresh shapes in the same React commit as the placement that emptied the last slot, so on every
  third placement the mask was hiding a shape that was genuinely there and could not be picked up.
- A drag that ends without a `pointerup` or `pointercancel` — the pointer released outside the
  window — no longer blocks every later grab: window `blur`, `visibilitychange`, and a `pointerdown`
  reusing the same `pointerId` each reclaim it.

**Group B — how it feels on a touchscreen**
- The shape is lifted above the fingertip on touch input so the hand no longer covers the shape and
  its landing projection; mouse input is unchanged.
- The projection follows the lifted shape rather than the fingertip, and forgiveness snapping picks
  the nearest valid anchor within less than one cell. The snap is always visible as the green
  projection before release, so it cannot place a shape somewhere the child did not see first.
- **Board geometry is measured, not assumed.** The board's content inset is read from its computed
  style at drag start rather than computed as border + padding constants, and the projection overlay
  reproduces the board's box model instead of insetting by their sum. A fractional CSS border does
  not survive device-pixel snapping: the board's 2.5px border lays out as 2px at 100% scaling and
  differently again at the 125%/150% common on Windows touch devices, which put every projection half
  a pixel out and flipped the rounding for a shape sitting on a cell boundary. It is deliberately
  *not* measured from the first cell's rect — that rect includes CSS transforms, and cell (0,0) is
  the first to explode on a row-0 or column-0 clear, so for ~800ms after every clear it reports an
  inflated box a third of a cell out. That is exactly the moment a child grabs the next piece.
- **The projection is also recomputed when the board changes under a still finger.** The 1.2s
  line-clear timer rewrites the grid and can drop a meteor into a cell a green ghost is already
  sitting on; without a recompute, a child who holds still through a clear and then lifts got a
  silent return-to-bank after being shown green.

**Group C — paint cost around a line clear**
- The invisible full-screen `backdrop-filter` behind the game overlay was removed. The 12px
  `backdrop-filter` on the line-clear feedback card went with it: it sat directly over the exploding
  cells for the full 1.2s and carried no visual weight over an 85%-opaque card with its own border
  and shadow. A backdrop filter does not change opacity, so it was never contributing contrast.
- The line-clear explosion moved from per-cell Framer Motion `boxShadow`/`backgroundColor`
  animation to a compositor-friendly CSS keyframe on `transform`/`opacity`, with the stagger capped
  so it finishes inside the 1.2s grid reset instead of being cut off at ~1.36s.

**Spec drift corrected**: the previous entry claimed "native HTML5 pointer capture" and "0ms
scripting lag". There was no `setPointerCapture` call in the game, and the absence of pointer
ownership is precisely what let a second finger take over a drag.

### 2026-09-18 Space Rescue: a move right after a line clear is judged against the new board

**Why**: a review of the drag test kit found that the drag's window listeners held on to the
`placeShape` and projection function from before a grid change until React's passive flush
re-subscribed them. That gap is narrow. When the 1.2s line-clear timer changes the ghost under
the shape, its synchronous update flushes the passive effects before any input, so a still finger
was never affected. The gap opens only when the clear leaves the ghost as it was and the render
overruns React's ~5ms scheduler slice; a move in it then used the old board, and the ghost it drew
stood until the next move. A move onto a cell the clear had just freed showed red and returned to
the tray, and a move onto a meteor that had just landed showed green for a drop that bounced.
- The listeners now read both callbacks through a ref synced in a layout effect, so a move or a
  lift in that gap uses the board the child is looking at. A side effect: the listeners are no
  longer torn down and re-added on every grid change mid-drag.
- Not reproducible by hand on demand: it needs a slow render and a move within that render's
  frame. Guarded by `useShapeDrag.commit-order.test.tsx`, which dispatches the move and lift in
  that gap with a `placeShape` shaped like production's (rebuilt per grid, re-checking the cell).
  No existing test moved the pointer inside that gap, and the kit's default spy, stable and always
  accepting, would have hidden the `placeShape` half even if one had.

### 2026-09-18 Space Rescue line clears resolve exactly once

**Why**: found in the adversarial review of PR 158. `placeShape` started the 1.2s line-clear
timer inside its React state updater, and React may run an updater more than once: StrictMode
runs it twice in development, and in production a finger lift rendered ahead of a pending
lower-priority update is replayed on top of it. Reproduced before the fix: one line-clearing drop
left two timers under StrictMode and under a replayed drop, against one in the control.

- Each clear is resolved once. The visible symptom of the double resolution was up to two extra
  meteors whenever an electricity cell (level 3) was cleared; the satellite effect and the
  obstacle top-up only act when nothing is there yet, so a second run changed nothing.
- A drop in the same frame as the clear is judged against the cleared board. Previously, if the
  clear dropped a meteor on the target cell, the shape showed placed for one frame and then
  jumped back to the tray.
- A clear React has to render twice — an update already queued when its timer fires, such as the
  rescue quiz resolving — lands its meteors in the same cells both times. Where they land is now
  rolled from a seed chosen once per clear; before, the second render re-rolled them.
- A line completed while another is still exploding joins it, and both empty together 1.2s after
  the later drop. Previously the first line's timer took the second line's feedback card down
  early. Trade-off, chosen deliberately: an earlier line keeps exploding (and blocking its cells)
  until 1.2s after the last line that joined it.
- An electricity cell where a cleared row and a cleared column cross fires once, not once per
  line.
- A drop during the explosion no longer re-scores the exploding line. Pre-existing: a row of
  exploding cells still read as "full", so every drop within 1.2s of a clear added +10 score,
  +10 altitude and a fresh feedback card for a line already cleared. (Found by the review of this
  change, where it had briefly become worse: each such drop also restarted the explosion.)
- Completing a line in the last free cell no longer ends the game. Pre-existing: exploding cells
  block placement, so the game-over check fired before they emptied, and "Mission Failed" stayed
  up over a board with free cells.
- Starting a new game mid-explosion — including reopening Space Rescue within 1.2s of a clear —
  cancels the clear. Previously the old timer fired on the new board. Closing the game only
  hides it; the clear resolves unseen.
- `placeShape` returns nothing. The decision is made inside the updater, against state that can
  be newer than the caller's render, so a boolean could be wrong; no production caller read it.
  Its identity no longer changes with every grid change.

Tests: `useBlocksGame.line-clear.test.tsx`, `lineClear.test.ts`. Line-clear marking and
resolution moved to the pure `lineClear.ts`; `useBlocksGame.ts` came off the file-size backlog.

### 2026-09-21 Space Rescue deals a hand, not three loose shapes

- **The clearing bias was dead code and always had been.** `selectProactiveShape` intended a 30%
  chance of dealing a shape that could complete a line, but its predicate only asked "can this shape
  be placed anywhere at all" — which is exactly what the candidate list had already been filtered by.
  The branch therefore selected from the *same* set either way and has never influenced a deal since
  the game shipped in `12b7cf3` on 2026-07-03.
- **Shapes were verified in one orientation and dealt in another.** Selection checked the shape
  template, then handed the child a randomly rotated and mirrored copy of it (`transformShape`). The
  documented "guaranteed to always have valid grid placements" promise, and the Golden Rescue Shape's
  "guaranteed to fit somewhere", were both only true of an orientation the child never received. The
  dealer now enumerates each shape's distinct orientations and treats every orientation as its own
  candidate, so the guarantee holds for the shape actually dealt. `transformShape` is deleted.
- **The bank is now dealt as a coherent hand** — a line-finisher (chance `X`), a look-ahead to the
  board as it will be once that line drains, and a co-placeable pair for the other two slots (chance
  `Y`), shuffled before they reach the bank. See the "Proactive Shapes Generator" bullet for the
  rules and rates. `Y > X` at every level and both stay generous: the player is eight.
- **After a clearing drop, the next hand is dealt when the clear resolves.** The refill used to be
  dealt the moment the bank emptied, while the line was still exploding — and exploding cells read as
  occupied, so the hand was planned around lines about to vanish. Now a drop that empties the bank
  (or the rescue slot) while a line is exploding leaves those slots empty for the rest of the
  explosion (at most ~1.2s) and deals them when it resolves, against the board with its meteors
  already landed; Refresh is disabled on the empty rescue slot so it cannot deal ahead of that. Planning against a
  forecast of the drained board instead was tried and rejected in review: the new shape could be
  refused at every position until the explosion ended, then lose its space to a meteor. The
  resolution-time deal draws from a seed rolled outside the state updater, like the meteors, so a
  replayed update deals the same hand.
- **Game-over tries every orientation**, for consistency with the deal. This changes no outcome with
  today's pool: every shape but the 2x2 contains a straight run of three and both trominoes are
  templates, so if any turned copy fits, a tromino fits as declared.
- **Structure.** `dealer.ts` (the deal's rules) and `candidates.ts` (the draws, with each template's
  orientations cached) are new, and `placement.ts` grew from the single "may this shape sit here"
  rule the drag ghost and the game share into that rule plus the searches built on it — every search
  goes through the same check, so the ghost, the game and the dealer cannot disagree. The dealer takes
  its randomness as a parameter (defaulting to `Math.random`), which is what makes the balance rules
  testable; the logic previously sat in hook `useCallback`s reachable only through a randomly chosen
  starting layout. The deal made at the drop itself still used `Math.random` here; it was seeded on
  2026-09-23. `useBlocksGame.ts` went from 295 to 214 lines.

### 2026-09-21 `npm run tsc` type-checks the unit tests

**Why**: the Definition of Done's type-check gate skipped every `src/**/*.test.ts(x)` and
`__tests__` file. `tsconfig.json` excludes them, and `tsconfig.test.json` inherited that exclude
through `extends`; vitest pointed at the test config, but only `vitest --typecheck` reads it, and
no script runs that. 22 type errors had piled up in 9 test files.

- `npm run tsc` is now `tsc && tsc -p tsconfig.test.json`: the app config first, which keeps
  test globals such as `vi` out of the app's type space, then every test file. `npm run build`
  and `npm run release` still type-check the app config only; test files don't ship.
- The test config is as strict as the app's. Its relaxed unused-local settings only hid five
  dead `import React` lines.
- All 22 errors from the original probe are fixed with real types: 9 by PR 160, 13 here. Every
  one was a fixture that had drifted from its type or a stale prop; no test was green only
  because of the wrong shape.
- 16 more were fixed here that the probe never counted: 5 dead `import React` lines (hidden by
  the test config's relaxed unused-local settings), and 11 that landed on main *while this was
  in review* — `e2e-mission-clock.test.ts` casting a six-member fake straight to Playwright's
  `Page` (PR 164), and 10 in `dealer.test.ts` / `placement.test.ts`, where `fill = CELL.EMPTY`
  infers the literal type `0` so every `emptyBoard(CELL.BLOCK)` call is an error (the
  coherent-hand dealer). Roughly one new error every two days, which is the rate the gate stops.
- Guards: `src/__tests__/typecheck-coverage.test.ts` reads the configs the script runs and fails
  if any `.ts(x)` file under `src`, `electron` or `e2e` is outside them. PR 160's
  `typescript-strict-config.test.ts` now pins the two-step script, holds `tsconfig.test.json` to
  the same strict flags as the app config, and scans test files for `@ts-nocheck` too.
- Still open: the root config files (`vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`)
  are type-checked by no gate.
- Found along the way: the rule registry claimed the "refuse a locked drag before the coin
  animates" half of the shield rule was covered by the GlobalBank/GoalPedestal tests. Neither
  file drops a coin. The claim is corrected; the tests are still to be written.

### 2026-09-22 An expired privilege suspension lifts by itself; suspend and reinstate are logged

**Why**: found by the 2026-09-22 QA run in the built app. Phone Games was stored as
`status: 'suspended'` with `suspendedUntil` an hour in the past. The card stayed red with hazard
stripes and no countdown, 🎮 Game was missing from "Pick a Goal", and the state survived three
relaunches. A 1-day suspension lasted until the parent pressed "✅ Reinstate". Root cause: four
readers compared the stored `status === 'suspended'` directly, and nothing ever set it back. The
countdown badge was the only thing that read the clock, which is why the badge disappeared while
the card stayed red. A second gap sat in the same area: `createLogEntry` had no
`SET_PRIVILEGE_STATUS` case, so suspending or reinstating left no line in the log, from Settings
or from the phone.

- "Suspended right now" is now derived, not stored: `isPrivilegeSuspended(card)` in
  `store/privileges.ts` requires the stored status and an end time still ahead. The card, the
  dashboard summary, the Goal picker filter and the "Use!" lock all call it. Same pattern as
  `isEconomyLocked`. The suspension ends exactly when the countdown badge disappears.
- A missing or unreadable end time means not in force. The type contract already said
  `null` = not suspended, and no screen writes that pair.
- One timer, not a poll: `useSuspensionExpiry` (mounted inside `MCStoreProvider`) arms a single
  `setTimeout` to the earliest stored end and dispatches `EXPIRE_SUSPENSIONS` (origin `auto`).
  The reducer lifts what has ended at the action's timestamp and returns the same state when
  nothing has. It is armed only while a suspension is stored, clamped to 2^31-1 ms, and re-aimed
  on `system:resume`. First version had no timer and relied on re-renders; review found the
  "Use!" button and an already-connected phone kept the suspension until an unrelated change.
- Hydration restores a suspension verbatim; the timer lifts an ended one at launch and logs it.
  An earlier version rewrote it silently at load, which was an unattributed state change and
  turned a temporary clock change into a permanent lift with no trace.
- The phone payload still sends what is in force at broadcast time (`effectivePrivilege`).
  **Phone-visible change**: the payload fields are unchanged; only their values differ.
- Suspend, reinstate and the automatic end write a log line (🚫 with length and end time, ✅,
  ✅ "suspension ended"), attributed `local`, `remote` or `auto`, with the balance snapshot.
  No-ops are silent. The end time is parsed one way (`parseSuspensionEnd`), and the phone's
  `SET_PRIVILEGE_STATUS` payload is validated in `useRemoteControl`.
- Not changed: phone-games blocking is still enforced only in the UI. The reducer does not
  refuse a `SELECT_CASE game` or a `CONSUME_CASE` sent from the phone while Phone Games is
  suspended. That was already the case before this fix.

Tests: `store/useSuspensionExpiry.test.tsx` (timer at the end exactly, nothing armed when idle,
the setTimeout clamp, re-aim on wake, lift + one `auto` log line through the real store, a lift at
launch), `components/privilege-expiry.test.tsx` (card, picker, "Use!" unlocking with no other
change), `store/persistence-lifecycle.test.ts`, `store/useRemoteSync.privileges.test.ts`,
`store/privileges.test.ts` (one parser for card and badge), `store/activityLog.privileges.test.ts`,
`hooks/useRemoteControl.allowlist.test.ts`, and the structural pin
`__tests__/privilege-suspension-boundary.test.ts`, which fails on any other read of
`status === 'suspended'`.

### 2026-09-22 A stopped mission no longer restarts itself

**Why**: found by the release QA run and reproduced twice in the built app. Holding "— Minimize"
for 2 s (the phone's Stop takes the same path) logged "⏹️ Mission stopped" at 03:47:16.035Z, then
"🌙 evening mission started" by ⏰ the scheduler at .043Z, with the overlay back and a full timer.

**Root cause**: the scheduler had no record of having started today's occurrence. It skipped a
phase only when that phase's outcome date (`lastCompletedOrFailed<Phase>Date`) was today, and a
stop records no outcome, rightly, because a stop is neither a miss nor a conclusion. The stop
changes `missions`, the scheduler effect re-armed, aimed at the still-open window and fired a 0 ms
timeout. The same blind spot made it re-aim at an open window every second for as long as the
window lasted (about 2 timers a second, on the Calendar view too). `timer-registry.test.ts` never
saw it, because it scans for `setInterval` and this was a self-rescheduling `setTimeout`.

- **New field `Mission.lastActiveAt`**: when that mission last started *or* ended. Stamped by
  `stampMissionActivity` (`store/missionActivity.ts`) from the `activeMission` transition, in the
  reducer wrapper, so every way a run starts or ends stamps it, including any added later. From the
  action's timestamp (the reducer stays pure), whoever started or stopped it. Unlike `startedAt`,
  nothing clears it. It persists, and hydration keeps only a real instant. It does not ride the
  phone broadcast.
- **The scheduler leaves an occurrence alone** once it ended today, *or* the mission is running now,
  *or* it last started or ended at or after the window's start: a run covers every occurrence it
  overlapped. Checked when arming (so it no longer re-aims at a handled window, which also ends the
  every-second re-fire) and when firing. It also no longer aims at an open window while *any*
  mission runs (the fire could only do nothing, then re-arm a second later); the run ending
  changes `missions` and re-arms it once.
- **Unchanged, and pinned by tests**: the shield does not move on a stop; a stopped morning keeps
  the quick-game window shut (it reads outcome dates, not triggers); ▶ Start and the phone's Start
  still start a stopped mission; the next day's occurrence starts on its own, whether the app ran
  overnight or was relaunched; a mission rescheduled to a later start is started at the new time.
- **Decided here**: a stop covers the occurrences its run overlapped. Moving that phase later makes
  a new occurrence. A mission started by hand earlier in the day and stopped before the window does
  not cancel the scheduled one (a date-keyed stamp would have). A mission started by hand *before*
  its window, still running when it opens and stopped inside it, stays stopped: the first version
  stamped only the start and restarted it, and polled every second while it ran (closed 2026-09-23,
  before merge, by stamping the end as well).
- **Review round 1 (2026-09-23)**: a stamp in the future is ignored and dropped at load (a clock set
  ahead then corrected would otherwise have skipped every occurrence, silently, until it caught up;
  the old date-keyed check healed the next day). Pinned: a phone Stop with a clock behind, a resume
  from sleep after a stop (`useMissionScheduler.lifecycle.test.tsx`), and the idle guard
  `idle-performance.test.tsx` now asserts no timer is
  armed in 10 s inside a handled window, while another mission runs, and outside every window.
- **E2E helpers** (`e2e/helpers/missionClock.ts`): the "window open now" seed clears the stamp,
  because inside a real window the first document has already started and stamped that mission in
  the same minute. `forgetMissionStartedSince` drops the stamp of the mission the launch started,
  so the real-profile restore does not stop the dev app from starting that window.

Tests: `useMissionScheduler.stop.test.tsx` and `useMissionScheduler.early-start.test.tsx` (the real
reducer through the real dispatch interceptor, shared `schedulerTestKit.ts`: stop in both windows,
from the phone, restart, relaunch, overnight, reschedule, a mission started before its window, the
other mission running across a window start, a late fire while running, and checks that no timer is
armed in 10 s once the occurrence has run or while a mission runs), `mcReducer.mission-stop.test.ts`
(the stamp on every start and end, the shield, the quick-game window, hydration),
`activity-stamp-boundary.test.ts` (structural: only `stampMissionActivity` writes the stamp), and
two cases in `e2e-mission-clock.test.ts`.

### 2026-09-23 Space Rescue: one drop deals one hand

**Why**: the follow-up left open by the coherent-hand dealer (2026-09-21), and the same class of
defect as the line clear's meteors (2026-09-18). `placeShape` dealt the replacement hand with
`Math.random` from inside its React state updater, and React may run an updater more than once —
StrictMode twice in development, and in production an update rendered ahead of a pending
lower-priority one is replayed on top of it, where both runs commit. Each run re-rolled, so two
consecutive committed frames could hold different shapes, and the child would watch the hand they
were just dealt swap for another.

**Honest status: nobody has seen this happen, and today nobody can.** The replay needs a
lower-priority update to be *pending on this hook's state when the finger lifts*. Two such writers
exist — the rescue quiz resolving from a timer, and the game-over check — and neither can be in
flight at that moment: the quiz resolve runs while the quiz overlay covers the board, the tray and
the rescue slot, and the game-over update lands only when no valid drop can follow. StrictMode runs
the updater twice but commits once, so development shows nothing either. This is a guard against a
class of bug, not a repair of a reported one; it is a claim about timing, not about absence, so any
new deferred write on this hook (a `.then`, a timer, a deferred score) makes it live. The
reproduction in `useBlocksGame.deal-replay.test.tsx` has to construct that pending update itself.

- **The hand a drop deals is fixed before the drop is applied.** One seed per call, rolled outside
  the updater next to the feedback id, exactly as the line clear rolls its meteor seed; every draw
  the dealer makes — which shape, which orientation, the React key suffix — comes from it.
- **Starting a game and refreshing the rescue slot deal the same way.** Both rolled unseeded inside
  their updaters too. (The 🔄 Refresh button, note, re-locks the slot: the shape it hands over is
  the one that will cost the *next* maths answer. The reward for answering — `resolveRescueQuiz` —
  only unlocks the shape already in the slot, deals nothing and was never affected.)
- **`refillBank` and `refreshRescue` take a seed, not a generator.** A seeded generator is stateful:
  built outside the updater and captured, the replay would continue its sequence instead of
  repeating it, and the hands would still differ. Taking the number and building the generator
  inside makes that impossible to express. `dealStandardTriple` and `dealRescueShape` lost their
  `= Math.random` default for the same reason — a forgotten argument is now a type error rather
  than a silent re-roll.
- **A small saving on the drop path**, reasoned during review, not profiled — and by the paragraph
  above it never happened in the running app: the tray keys each slot on the shape's id, whose
  suffix comes from the dealer's draw, so two frames disagreeing on every id would have made React
  tear down and rebuild up to three slots and their cells rather than reconcile them in place. What
  *was* measured is the cost of the seeded generator itself: below the noise floor.
- **Structure.** `seededRandom` and the `Rng` type moved out of `lineClear.ts` (a module about line
  clears) into `rng.ts`, since both the clear and the dealer draw from it.

Tests: `useBlocksGame.deal-replay.test.tsx` — five cases (the bank-emptying drop, the
rescue-emptying drop, the opening hand, the rescue refresh, and that consecutive drops roll
different seeds). Each replay case asserts both that the dealer really ran twice and that the
committed frames are identical; the first assertion is what keeps the suite honest if the harness
ever stops forcing a replay, which was proven by mutation to make the older suites pass vacuously.

### 2026-09-23 The locked-drop refusal is guarded by tests that drop a coin

- The 2026-09-21 entry above left this open: the registry claim was corrected, the tests were not
  written. They are now. `GlobalBank.test.tsx` and `GoalPedestal.test.tsx` release a real coin at a
  point inside real layout rects — bank onto a goal, goal onto the bank, goal onto another goal —
  each with the shield broken and with it holding.
- They assert the rendered pile on the release frame AND after the exit window, not the store: the
  reducer refuses `MOVE_TOKEN` while the shield is broken, so a store count stays green over the bug
  that shipped (the coin animated away, the count kept its old total).
- Known limit, recorded in the registry: the gesture itself is mocked, so these prove the decision
  given a drop, not that the coin is draggable. No E2E covers that today.
- No shipped behaviour changed. One dead line left: `GoalPedestal`'s `if (!layoutRects) return false`,
  unreachable because the prop is required and `MissionControl` always passes it.

### 2026-09-23 A custom reward cost is the cost charged

- **Bug.** A parent set Game to 2 tokens in ⚙️ → 🎁 Rewards. The picker showed "🎮 Game 2 ⭐",
  but the goal it created was 0 / 6. The picker read the parent's cost, while
  `handleSelectReward` dispatched the catalogue cost from `REWARD_MAP`, and the reducer stored
  whatever cost it was given. Every custom cost was shown and never charged.
- **Fix.** The reducer now owns the lookup. `SELECT_CASE` no longer carries a `targetCount`: the
  reducer prices the goal with `rewardCost(settings, reward)`, the same function the picker renders
  with, so the two cannot drift apart again.
- **Also refused now.** A reward the parent disabled was only hidden by the picker; a direct
  dispatch still created it. The reducer refuses it now. A refused selection, including the
  existing quick-game-without-a-game-token refusal, no longer logs "Goal selected" for a goal that
  was never set.
- **Existing goals are not repriced.** A goal keeps the `targetCount` it was chosen at. Before this
  fix every goal was stored at the catalogue cost, so goals already open when this ships still need
  the catalogue amount; a goal chosen afterwards gets the parent's cost.
- **Stored costs are sanitized** to a whole number from 1 to 100, and the settings editor clamps
  with the same function. The editor also displays through `rewardCost()`, so a cost stored before
  this fix (say 500) shows as the 100 that is charged, in settings and on the pedestal alike. Before the fix a huge typed cost was shown but never charged; now it would
  be charged, and the goal would draw that many token slots.
- Not a trust issue today: `SELECT_CASE` is not in `REMOTE_ALLOWED_ACTIONS`, so the phone never
  sent a cost.

Tests: `store/__tests__/mcReducer.reward-cost.test.ts` (new), and a UI regression in
`GoalPedestal.test.tsx` (the picker shows 2 ⭐ and the stored goal is 0 / 2).

### 2026-09-23 At the 5-token cap, a full mood gauge holds instead of resetting

- **Bug.** With 5 game tokens (the cap), mood +2 and the gauge at 99.95 %, the next heartbeat
  correctly granted nothing and kept the mood, but dropped the gauge to about 0.1 % with no log
  line. `applyBehaviorSync` wrapped the progress (`% PROGRESS_PER_TOKEN`) before the cap decided
  whether a token was granted, so a full gauge was spent on a token that never arrived. The
  2026-08-25 fix gated the mood reset on a real grant but left the wrap in place.
- **Correct behaviour, checked against the spec.** The 2026-08-25 rule says that when the gauge
  fills at the cap, nothing is earned and the mood is left alone. The gauge still fills, so it
  **holds at full** (it does not stop accruing below full). The earned token waits for room: after
  a game token is spent, the first heartbeat re-anchors and the second grants it, logged, and
  resets the mood.
- **Same bug in two sibling writers, fixed with the same function.** The mission no-whining bonus
  and the parent's `ADJUST_BEHAVIOR_PROGRESS` each had their own copy of the crossing rule: at the
  cap they subtracted a full gauge and zeroed the mood with no grant, which contradicted the
  2026-08-25 rule. All of them, plus whining and the missed-mission penalty, now go through
  `moveGauge()` in `store/moodGauge.ts`: the cap decides the grant first, and only granted tokens
  are subtracted. A structural guard (`gauge-writer-boundary.test.ts`) fails on any other writer.
  A parent adjustment still pays at most one token per adjustment, as before.
- **Review fixes before merge.** Holding the gauge exposed two older gaps. A Quick-Game goal's token
  did not count against the cap, so pick → wait → trash let the held gauge pay into the gap and the
  refund was then clamped away (a coin lost, with a grant log for it); the goal's token now counts.
  And a mission time cleared in Settings made the accrual rate NaN, which the new grant arithmetic
  carried into the token count, which saved as `null` and loaded as 5 free tokens; the rate now
  fails closed, the writer ignores a non-finite amount, and hydration loads a corrupt count as 0.
  The parent's manual grant now counts the Quick-Game goal's token too (pick → grant → trash used
  to lose the coin, on `main` as well), through the same `gameTokenRoom` check; the trash writes
  "Game token returned from Quick Game", and the phone's take-away is logged "Mood token removed"
  instead of "spent on a game". An empty gauge under a negative mood no longer writes a new state
  every minute.
  At load the cap counts a Quick-Game goal too, so an old save of 5 coins plus a goal loads as 4.
- **No idle churn.** A held gauge returns the same state object on every heartbeat, including
  past the 3-minute gap that would otherwise re-anchor, so a child who stops spending does not
  cause a re-render, persist and remote broadcast every few minutes all day.

Tests: `store/__tests__/mcReducer.mood-cap.test.ts` and `mcReducer.mood-cap-lifecycle.test.ts`
(new), `src/__tests__/gauge-writer-boundary.test.ts` (new, structural), and a held-full case in
`__tests__/idle-performance.test.tsx`.

### 2026-09-23 `npm run tsc` type-checks the root config files

**Why**: the type-check gate skipped the three files that configure the build, the unit runner and
the E2E runner. `vite.config.ts` and `vitest.config.ts` live in `tsconfig.node.json`, which
`tsconfig.json` lists under `references`, and plain `tsc` never builds a referenced project;
`playwright.config.ts` was in no tsconfig at all. A type error in any of them passed every
Definition-of-Done gate. The 2026-09-21 change above named all three as knowingly unchecked; this
closes that list.

- `npm run tsc` is now `tsc && tsc -p tsconfig.test.json && tsc -p tsconfig.node.json --composite
  false --noEmit`, and that project includes every root `*.config.ts`. `npm run build` still
  type-checks the app config only.
- Both flags on the third step are load-bearing, each verified by running the mutation. Without
  `--noEmit` the run writes `vite.config.js`, `vitest.config.js` and `playwright.config.js` into the
  repo root, and Vite loads `vite.config.js` in preference to `vite.config.ts`, so a stale emitted
  copy would silently become the build config. Without `--composite false` it leaves
  `tsconfig.node.tsbuildinfo` there, untracked and not gitignored, because `composite` forces
  incremental mode even under `--noEmit`. `composite` itself stays: without it the gate's first step
  fails with TS6306, and it is what gives these files their settings in the editor.
- `tsconfig.node.json` also gained `target`/`lib`/`types` for Node. Without them the new check
  accepted `document.querySelector(...)` inside `playwright.config.ts` — a browser type space for
  files that only ever run in Node.

Tests: `typecheck-coverage.test.ts` owns which files are checked (`UNCHECKED_BY_DESIGN` is now
empty, plus vacuity cases that the script runs the root-config project and the walk really yields
the root configs); `typescript-strict-config.test.ts` owns the command and now pins that no step
emits or leaves a build-info file. The rule-registry entry moved from `manual` to `guarded` and the
unguarded tripwire dropped from 7 to 6. Also fixed on the way: the shared source walk listed
symlinks that point nowhere, which made four guard suites fail for the wrong reason
(`helpers/sourceFiles.test.ts`).

### 2026-09-23 The "+ Add goal" button looks frozen while the shield is broken

- **Bug** (found in the product review of the locked-drop tests). With the shield broken, the empty
  goal slot's `+` did nothing when tapped (correct: `SELECT_CASE` is refused) but still looked live:
  pointer cursor, full opacity, a hover lift and a press squish. The other three frozen spend
  controls (Use!, Quick-Game Use!, vacuum All) are `Button3D`s whose `disabled` already dims them,
  so only this hand-built button broke the rule "every frozen control also looks refused".
- **Now.** While locked the button shows `🔒` instead of `+`, is dimmed to the same 0.45 opacity with
  a not-allowed cursor, has no hover or press animation, carries `aria-disabled` and the siblings'
  label "Bank locked — finish your next mission", and its caption reads "Locked" instead of "Add
  goal". It comes back to life the moment a shield is returned, without a remount.
- **Same gap, one step further.** A goal picker the child had already opened stayed open with
  live-looking reward buttons when the shield broke underneath it; it now closes, leaving the frozen
  button. It stays closed when a shield is handed back — a parent returning a shield remotely, hours
  later, must not pop open a picker nobody tapped for.

Tests: six cases in `GoalPedestal.test.tsx` (locked, unlocked, the lock moved by `ADJUST_SHIELD` in
both directions, and under an open picker both ways); registered in `rule-registry.test.ts`.

### 2026-09-24 An update that removes a game token says so in the log

- **Gap** (release QA review). v0.0.42 could save 5 game tokens beside an open Quick-Game goal.
  The cap counts the goal's token, because the trash refunds it, so that balance must load as 4 or
  the trash refunds to 6. Hydration did clamp it to 4, but silently: a token disappeared at launch
  with no log line and no attribution, which the attribution rule calls a bug.
- **Now.** Hydration no longer applies the cap. Right after load, before the first paint, the store
  dispatches `SETTLE_GAME_TOKEN_CAP` (attributed `system`) when the saved balance is over the cap.
  It removes what is over and logs one line, for example "1 game token removed at load: 5 game
  tokens plus 1 Quick-Game goal is over the 5-token cap", with no bank delta (review fix: a −1 there
  showed as "Spent today" and as a bank `d` in the audit file). The line reaches the
  audit trail like every other entry (a line written inside hydration would not: the audit bridge
  treats the loaded log as already written). Later launches find the balance within the cap and
  dispatch nothing. Same pattern as the suspension expiry of 2026-09-22.
- **Unchanged.** A corrupt count (NaN saved as `null`) still loads as 0 without a line; the trash
  of that goal still brings the balance to 5, never 6; `gameTokenRoom` stays the one cap check for
  every adder.

Tests: `store/useGameTokenCapSettle.test.tsx` (the real provider: happy, within-cap and corrupt
loads, StrictMode, the audit trail, relaunch, trash); `src/__tests__/action-literal-boundary.test.ts`
pins the settle's one dispatcher.

### 2026-09-24 Only the phone can stop a mission

- **Why** (owner decision). Holding "— Minimize" for 2 s dispatched `CANCEL_MISSION`. Since the
  2026-09-22 fix a stop sticks for the rest of the window and does not move the shield, so the child
  could end a mission by holding the button, with no miss recorded.
- **Now.** "— Minimize" only minimizes: a short tap and a long hold both leave the pill, and neither
  stops the mission. It minimizes on the release of a press that began on the button, so a long
  touch hold that fires no click still minimizes, while a press begun beside it, dragged off it or
  cancelled does not (review fix); Enter and Space minimize too. Size and touch behaviour unchanged. The phone's Stop (`CANCEL_MISSION`,
  still on `REMOTE_ALLOWED_ACTIONS`) is the only way to stop a mission; the reducer is unchanged.
- **Not changed.** "↺ Reset" keeps its tap (tasks) and 2 s hold (tasks and timer): not decided yet.
- **Planned, phone side.** The phone is getting +1 / −1 shield buttons that send `ADJUST_SHIELD`,
  which the desktop already accepts. (Shipped: see 2026-09-28 "The phone's shield buttons".)

Tests: `MissionOverlay.test.tsx` (a 5 s hold only minimizes and logs no stop; the button keeps its
size and `touch-action`; a remote `CANCEL_MISSION` still closes the overlay and the pill);
`src/__tests__/action-literal-boundary.test.ts` fails if any production file other than the
reducer, its log, the action type and the remote allowlist names `CANCEL_MISSION`; registered in
`rule-registry.test.ts`.

### 2026-09-24 A cleared mission time no longer logs "mission skipped" every second

- **Bug** (found by reading the code in the pre-release performance review; present since at least
  v0.0.42, not reproduced in the app). Clearing Settings → "Auto-trigger at" and pressing Save stored
  the mission start as `''` and its end as `'NaN:NaN'`. The scheduler turned `''` into an invalid
  date and armed `setTimeout(fn, NaN)`, which fires at once. The invalid time counted as "fired too
  late", so it logged "Morning mission skipped — the  window was missed (machine asleep)" and armed
  itself again 1 s later, with no end. Every second, on both views: a store update, a log line, a
  localStorage write and a phone broadcast. The 200-entry log filled with those lines, and the
  mission never ran again. The unit tests measured 5 "skipped" lines in 5 s and, after a relaunch,
  61 lines in 61 s.
- **Root cause**: no layer checked the time. Save sent the draft as typed, `SET_SETTINGS` stored it,
  and the scheduler did not treat an unparseable date as "nothing to schedule".
- **Now**: Save is disabled while a time is empty, the empty field is outlined, and the footer
  names which time is missing and on which tab. `SET_SETTINGS` keeps the
  stored start time for a value that is not `HH:MM`, and that refused value is not a time change, so
  a running mission keeps running and no "mission ended: its start time was changed" line is written
  (the check lives in `missionReschedule.ts`, which the reducer and the log share). At load, an invalid saved time becomes the default and the
  mission window is rebuilt from it. The scheduler does not arm a timer for a time that is not a
  real `HH:MM` (mission or task lock) and warns in the console each time it re-arms (mount, a settings change, a resume from sleep). It checks the text, not the
  parsed date: `'999:00'` parses, but its delay is over `setTimeout`'s 2^31-1 ms limit and fires at
  once too. The other mission keeps its schedule.
- **Shared helper**: `store/hhmm.ts` (`isValidHhmm`, plus the HH:MM helpers moved out of the reducer).
  `gameWindow.ts` already failed closed on a cleared time. `behaviorSync.ts` did so only for the mood
  rate; its other readers got through a NaN only because every comparison with NaN is false. Both are
  now covered by the upstream checks (Save, reducer, load) and were left alone; moving them onto
  `hhmm.ts` is a separate follow-up.

Tests: `useMissionScheduler.invalid-time.test.tsx`, `store/__tests__/mcReducer.settings-time.test.ts`,
`MCSettingsOverlay.time-validation.test.tsx`, `store/persistence-time.test.ts`, and one case in
`idle-performance.test.tsx` (no timer and no store write in 10 s with a cleared time).

### 2026-09-26 One rule for a mission time, a real length for a mission duration, a visible focus ring

Follow-up to the 2026-09-24 fix; the three open items its review left out.

- **One rule for a time.** Four HH:MM parsers followed three rules: Save wanted two-digit hours, the
  quick-game window accepted one, and the mood gauge and the scheduler split on `:` with no check
  (a cleared time got past them only because every comparison with NaN is false). All of them now call
  `store/hhmm.ts`: `hhmmToMins` (strict `HH:MM`, 00:00–23:59, `null` otherwise) for an entered time,
  and `windowEndToMins` for a mission's derived `endsAt`, which may pass midnight (`24:30`) and carry
  a fraction of a minute (the 10-second test duration), so the strict rule would break both. Visible
  difference: only a hand-edited profile can hold `9:00`, and load already resets it; the mood gauge
  and the quick-game window now treat it as unreadable too instead of reading it.
- **Durations.** A non-finite duration in a saved profile gave `endsAt: 'NaN:NaN'`; the load repair
  rebuilt it from the same bad duration, and a started mission got `durationMins: NaN`, so
  `elapsedMins >= NaN` never ended it and its 15 s expiry check ran on both views. Now `SET_SETTINGS`
  and load both refuse a duration that is not finite, > 0 and < 1440 min; load re-derives the window
  from the settings every time (a 0-minute duration left a readable `06:00`–`06:00` window); and
  `missionDurationMins` falls back to the phase's duration setting instead of returning NaN.
- **Review round 1 (same day).** A mission saved *running* with `durationMins: null` never ended: the
  expiry check skips a null duration, and the +/- buttons ignore it. Load now gives it its window's
  length. The duration slider went down to 0 while Save refused 0 without a word; it starts at 5 min.
  A duration under one second is refused (5e-324 vanished in start + duration and ended the mission at
  once). `SET_SETTINGS` and load derive the window through one function, `deriveMissionWindow`. The
  guard also catches `split(':', 2)` and `[0-9]` regexes. New scheduler tests pin an evening window that
  crosses midnight: a launch at 23:40 and a late timer at 00:00 both start it.
- **Rebase onto main (2026-09-29).** The guard caught a fifth parser that arrived meanwhile: the
  school-bag decision (`schoolDays.ts`) read the morning start with its own one-or-two-digit rule. It
  now uses `hhmmToMins`, so `6:00` there keeps the plain rule (pack for the next day) like every other
  reader. `isValidHhmm` returns a plain boolean: as a type predicate it narrowed a string to `never`.
- **Focus ring.** The Settings time field had `outline: none` with nothing in its place. It now shows
  a 2 px `--mc-focus-ring` outline on `:focus-visible` (the rule lives in `mc.css`; an inline style
  cannot express `:focus-visible`).
- **Guard.** New CLAUDE.md rule "HH:MM times", registered in `rule-registry.test.ts`;
  `hhmm-parse-boundary.test.ts` fails on a `.split(':')` or a digits-colon-digits regex anywhere in
  `src/mission-control/` outside `hhmm.ts`.

Tests: `store/hhmm.test.ts` (the parsers, and a table proving every reader refuses the same values),
`store/persistence-time.test.ts` and `store/__tests__/mcReducer.settings-time.test.ts` (durations),
`components/TimeInput.test.tsx`, `src/__tests__/hhmm-parse-boundary.test.ts`.

### 2026-09-27 A completed mission gives back one shield instead of refilling the bar

- **Changed (owner's decision).** Completing a mission routine used to reset `missedMissionStreak`
  to 0: one good morning wiped any number of misses. It now gives back exactly one shield
  (counter − 1, floored at 0), the mirror of the one shield a miss costs. Whining does not change
  that; it still only withholds the mood-gauge bonus.
- **Still the way out.** At 6 (broken) the next completion is 6 → 5, which unlocks the bank and
  writes "Shield restored — bank and goals unlocked." as before; the bar then shows 1 / 6, not 6 / 6.
  `COMPLETE_MISSION_ROUTINE` stays out of the locked set.
- **Consequence.** The counter is now a net count, not a run of misses in a row. A child who misses
  two missions out of every three now drifts toward the lock (before, every completion wiped the
  drift). The lock line therefore no longer says "6 missions missed in a row"; it reads
  "Shield broken — all 6 shields gone. Bank and goals locked." (it names no cause: a parent may have taken some of the shields)
- Tests: `missionStreak.test.ts` (3 → 2, 1 → 0, 0 stays 0, 6 → 5 unlocks, a whining completion),
  `mcReducer.streak-lock.test.ts` (release logged at 6 → 5; a double dispatch moves it once; the lock
  line does not claim "in a row"), `mcReducer.streak-lifecycle.test.ts` (replayed occurrences). All
  seven new or changed cases fail against the old reset-to-0 rule.

### 2026-09-27 School-bag task on school days

- **Added (owner's request).** A **School Bag** task (🎒) in both routines, on school days only:
  last in the morning when today is a school day, immediately before Bed in the evening when
  tomorrow is one. A school day is Monday to Friday minus the calendar's no-school dates: BC
  statutory holidays, and all-day events titled Pro-D, no school, school closed, a break and the
  like (`NO_SCHOOL_KEYWORDS` in `store/schoolDays.ts`). No calendar connected → Monday to Friday.
- **How.** A new store slice, `schoolCalendar` (`from`, `to`, `noSchool`: date + reason), is filled by
  `useSchoolCalendarSync` (mounted in `MCStoreProvider`) through the existing `auth:check` and
  `data:events` channels — no new IPC channel, no timer. It refreshes on launch, when a mission
  ends, on wake and on calendar connect, and never while a mission runs. `SET_SCHOOL_CALENDAR`
  (origin `system`) writes no log line, returns the same state when nothing changed, is not
  remote-allowed, and the slice does not ride the phone broadcast. The task is decided only in
  `SET_ACTIVE_MISSION`'s fresh start, from the action's own instant, so it never changes mid-run.
- **Fixed on the way.** A restart mid-mission rebuilt the checklist from the defaults and dropped
  any injected task: the Cream task lost its tick (and was charged again when re-ticked), and the
  school bag would have vanished. Hydration now keeps the saved run's Cream and School Bag with
  their tick and position, and never adds one the run did not have.
- **Tests were weekday-dependent.** `MissionOverlay.test.tsx` completed a mission by clicking a
  fixed list of five task ids; with the bag present Monday to Friday that would have passed on
  Saturday and failed on Monday. It now clicks every task card on screen.
- Tests: `schoolDays.test.ts` (coverage rule, keywords and their negatives, fallback, sanitizing),
  `routineTasks.test.ts` (placement, hydration), `mcReducer.school-bag.test.ts` (happy, negative,
  action-instant lifecycle, a structural check that only the fresh start places the bag),
  `useSchoolCalendarSync.test.tsx` (triggers, no fetch on unrelated state, stale and late
  results, errors), `persistence-lifecycle.test.ts` (restart keeps the bag and Cream; a corrupt
  slice loads as no data), plus the remote allowlist and purity samples.
- **Review fixes (same day).** Reading school days is now all or nothing: `data:events` takes an
  optional `{ strict: true }` (only a plain object with its own `strict: true` counts; anything else
  is the Calendar view's forgiving call, unchanged), and in strict mode being signed out, any
  calendar failing, or the holiday feed failing throws instead of shrinking the list — the saved
  days stay put. An empty strict answer is complete and replaces them. The mission-start log line
  now ends with the school-bag decision and its reason (one `schoolBagDecision` shared by the
  reducer and the log, so they cannot disagree), and a refused second start no longer logs
  "mission started". A contract test (`src/__tests__/school-calendar-contract.test.ts`) runs the
  real `ApiService` into the real classifier, so renaming the `holiday-` id or changing the all-day
  end shape in `electron/api.ts` fails it.
- **Final polish (same day).** The mission task row now shrinks its cards from 180 to 120 px to
  fit (7 task cards + "Whining?" visible at 1366 and 1280 px wide, unchanged at 1920) — the
  bag had pushed "Whining?" off-screen at 1366. A strict read no longer stops at a calendar's first
  page (a later page could hold the Pro-D day; see 2026-09-28). Holiday names in the log are stripped
  of control and invisible formatting characters. Known limits: a calendar ticked in Settings is
  read at the next refresh (mission end, restart, wake, sign-in); a ticked calendar that fails for
  good stops Pro-D detection, and once the saved 16 days run out the log shows "(weekday; calendar
  not read)".

### 2026-09-28 Review fixes: stale mission actions refused, a settings save that ends a mission logged

From an independent review of PR 178 at 985592f.

- **A Stop or a full Reset for a mission that is not running is refused.** `CANCEL_MISSION` ends
  whatever runs but resets only the mission it names, so a stale phone Stop for morning while
  evening ran hid evening's overlay and left it active with its timer, never expiring, no miss, and
  a "Mission stopped" line. And "↺ Reset"'s 2 s hold, still in progress when its mission expired or
  was stopped, fired `RESET_MISSION_WITH_TIMER`, which set the ended mission active again, hidden
  and saved. Now `isStaleMissionAction` (store/staleMissionAction.ts) refuses both when the named
  mission is not the running one, in the reducer and the log alike (the shield-lock pattern), and the
  hold is dropped when the mission changes. One exception for the Stop: with nothing running, a Stop
  naming a mission still marked active (a desynced save, which the phone shows as running because it
  reads each mission's own flag) is let through and clears it, logged; a Stop naming an inactive
  mission is refused. The full Reset stays strict. The phone's plain Reset is unchanged.
- **A settings save that ends the running mission is logged.** Saving a new start time for the
  running mission in MC Settings ends it (kept; open decision, PR 170). It used to be silent; it now
  writes "⏹️ Evening mission ended: its start time was changed in Settings", attributed 👤. The rule
  "only the phone stops a mission" now reads "no desktop *gesture* stops a mission" and names this
  path (CLAUDE.md, the guard, this spec, QA 3.5.12).
- **The game-token settle line is visible by default.** It is typed as a token movement, so the
  "💰 Tokens" filter shows it, and the summary strip's Who row has a 💻 System chip.
- **A relaunch with an expired, all-done mission logs one completion.** On the launch that settles
  the cap it wrote "Morning mission completed +2" three times, two of them with the pre-settle 🎮 5
  right after the line removing that token; any such launch wrote two (the base). The bank was
  always paid once. The logging interceptor now builds each line from the state the action applies
  to (the last render's plus every logged dispatch since, `store/pendingState.ts`), not from the
  last render, so a second completion sees the first and writes nothing, and every line shows the
  settled balance.
- **Minimize**: `touch-action: none`, so a finger drifting during a hold no longer cancels it; and a
  press still down when its mission ended no longer minimizes the next one.
- **Smaller**: the settle computes its target directly (a corrupt 1e17 balance settled to 0); the
  settle is mounted only on a launch that is over the cap; the action-literal guard reads string
  literals with the TypeScript parser, since the comment stripper mistook the apostrophe in JSX text
  for a string.

Tests: `store/__tests__/mcReducer.stale-mission-action.test.ts`,
`store/__tests__/settings-ends-mission.test.tsx`, `hooks/useLongPress.test.ts`,
`components/MissionOverlay.settle-launch.test.tsx`, `components/ActivityLogView.settle.test.tsx`,
new cases in `MissionOverlay.test.tsx`, `useGameTokenCapSettle.test.tsx`,
`mcReducer.mood-cap-lifecycle.test.ts` and `action-literal-boundary.test.ts`.

### 2026-09-28 School bag: PR 179 review fixes

- **Pages.** Google may answer a calendar with fewer events than a page holds — even none — plus
  a "more" token. The strict read threw on any such token, so one calendar doing that would stop
  every school-day read for good. It now follows the pages to the end (at most 10, then fails);
  the Calendar view still reads the first page only, as before.
- **Keywords.** "Prod release", "Deploy to prod" and "School prod" no longer read as Pro-D (a dash,
  a space or a following "day" is required), and announcements ("Classes resume after Spring
  Break", "No school bus today", "Christmas Holiday Concert", …) no longer count (`NOT_A_CLOSURE`).
  Newly matched: "Pro–D Day" with an en dash or a non-breaking hyphen, "School Closure", and double
  spaces ("Winter  Break").
- **After midnight.** An evening mission started after midnight but before the morning start
  (Fri 00:20) packs for that day, not the day after: it is still the night before. The reducer and
  the log line share the one decision, which now also reads the morning start time.
- **Order.** Cream first, then the School Bag, in both phases; a bag carried from an earlier run is
  put back in its place at every mission start, and Cream enabled mid-run goes in before the bag.
- **A read in flight when a mission starts is kept** (it serves the next mission); no new read
  starts during a mission, an older read still never overwrites a newer one, and nothing is stored
  after unmount.
- **Lock line.** "Shield broken — all 6 shields gone. Bank and goals locked." It named missed
  missions as the cause even when the parent had taken some of the shields away.
- The structural guard that the bag is placed only at a fresh start now also reads
  `routineTasks.ts` (a call hidden in `syncCreamTask` stayed green before; proven red since).
- **Round 2.** The announcement words briefly vetoed every keyword, so "Pro-D Day camp", "Pro-D Day
  (no bus)" and "Pro-D Day - before and after school care open" became school days. They now veto
  only the break / no school / closed keywords (`vetoable` in `NO_SCHOOL_KEYWORDS`); Pro-D and
  non-instructional days are never vetoed.
- **Rebased onto PR 178.** The calendar reader now dispatches only when its answer changes what
  is stored: "not connected" with nothing stored, or the same days again, sends nothing. Every
  dispatch is stamped and runs the mood-gauge sync, so the old unconditional one handed out a new
  state object on every launch without a calendar (PR 178's settle test caught it). The start line's
  School Bag decision reads the interceptor's pending state like every other log line.

### 2026-09-28 The phone's shield buttons

- **Shipped (mc-remote PR 2, in mc-remote main at 7372b89).** The phone's Shield card has
  "−1 shield" and "+1 shield", which send `ADJUST_SHIELD` with `delta: -1` / `delta: 1`. The desktop
  already accepted it (allowlist, payload validator, reducer clamp, log lines), so nothing changed
  on the desktop side.
- **Phone behaviour.** −1 is disabled at 0 left. +1 is never disabled from the phone's snapshot: a
  stale "6 / 6" (the phone does not age it, and a lost broadcast is not re-sent) must never block
  the parent's way out of a locked bank; a +1 at 6 / 6 is clamped on the desktop and writes no line.
  While the shield is broken the phone shows "🔒 Bank locked" and disables the Responsibilities
  −1 / +1 point buttons.
- **Desktop log.** Every press that moves the shield writes "Shield taken away — N / 6 left" or
  "Shield given back — N / 6 left", attributed 📱, plus the lock or unlock line when it crosses 0.
- **Drift guard** (now `hooks/useRemoteControl.drift.test.ts`, split out of
  `useRemoteControl.allowlist.test.ts` unchanged). `TYPES_SENT_BY_REMOTE_APP` was
  re-captured from mc-remote 7372b89 and now lists `ADJUST_SHIELD`; its exemption from "does not
  allow anything the remote app never sends" is gone. The live comparison against a checkout of
  that commit reported exactly one new type, `ADJUST_SHIELD`, before the change and none after.
  "No longer sent" can also mean the local sibling checkout (`../mc-remote`) is older than the
  capture commit 7372b89: fast-forward it (`git -C ../mc-remote merge --ff-only origin/main`, after
  a fetch) before editing the snapshot. The failure message says the same.
- **Drift guard hardening (review of PR 183).** The live comparison is reported as *skipped* when
  the sibling checkout is absent (it used to count as passed). It reads the phone's production
  sources only (no `*.test.*`, no `.d.ts`: a test fixture is not a button), accepts single, double
  and backtick quotes and digits in a type name, and does not follow links. The remaining exemption
  (`RESET_MISSION_WITH_TIMER`) lives in a named map with its reason, and a test fails when an
  exempt type is also sent by the phone or is no longer allowlisted.

### 2026-09-28 The remote can no longer send ADD_TOKEN or COMPLETE_MISSION_ROUTINE

- **Changed (review of PR 183).** Both were on `REMOTE_ALLOWED_ACTIONS` although no phone build ever
  sent either. `ADD_TOKEN` has no dispatcher at all: the desktop's "⚙️ Bank Admin" and the phone's
  "Bank Tokens" buttons both send `ADD_TOKENS`. `COMPLETE_MISSION_ROUTINE` is dispatched locally by
  the mission overlay, and a local dispatch never passes the allowlist. So the two entries only
  widened what a remote could do. A key holder could send a well-formed
  `COMPLETE_MISSION_ROUTINE` while a mission ran with no task ticked: the mission ended as completed,
  the bonus was paid, a shield came back and the quick-game window opened. Both are now refused
  like any other type not on the list ("[Remote] Rejected disallowed action type: …", no log line),
  and the payload validator for `COMPLETE_MISSION_ROUTINE` went with its entry.
- **Unchanged.** Both stay out of the shield lock set and the reducer is untouched: a completed
  mission is still the way out, and the parent's bank grants (`ADD_TOKENS`) still work while the
  shield is broken.
  `RESET_MISSION_WITH_TIMER` stays remote-reachable, as "Reset re-arms the occurrence" specifies.
- Tests: `useRemoteControl.allowlist.test.ts` refuses a remote `ADD_TOKEN` and a well-formed remote
  `COMPLETE_MISSION_ROUTINE` (both red before the change: dispatched once); the "tagged as remote"
  examples now use `ADJUST_SHIELD`.

### 2026-09-28 A settings file that cannot be read is never written over

- **Bug** (found in the 2026-09-28 security review of the remote protocol v2 change). When
  `config.json` existed but could not be read (held by antivirus or a backup, half-written, or not a
  JSON object), the app read it as the defaults. At startup the remote bridge then saw "no pairing",
  generated one and saved defaults + the new pairing over the file: the selected calendars and task
  lists, the theme and sleep settings and the phone pairing were gone, and the parent's phone stopped
  working until the QR code was scanned again. Reproduced against the built app with a half-written
  file.
- **Now.** Only a missing file means "use the defaults". A file another program holds (antivirus, a
  backup) is never written over:
  - the remote control leaves its room, stays offline and retries after 5 s, doubling, at most every
    5 minutes; once the file reads again it joins the saved room, so the phone keeps working without
    a new scan. A room that was never saved is never joined;
  - Settings does not load the saved settings while the file is held: it says why, naming the file
    ("Settings could not be loaded: <file> is in use by another program…", or "…could not be read
    (<code>)…"), offers Retry and keeps Save disabled. A Save refused at the last moment keeps the
    dialog open and names the file and the reason (in use / could not be read / could not be
    written);
  - Regenerate Keys keeps the current keys and says "Keys not changed: the settings file is busy or
    could not be written. The current QR code still works";
  - the calendar keeps working meanwhile.
- **A file that can never be read is set aside, not kept for ever.** Content that will not parse —
  half-written by a crash, empty, or not a settings object — is moved to
  `config.json.corrupt-<date and time>` next to it (kept for inspection) and the app starts again from
  the defaults; the phone then needs one new scan of the QR code. A file saved with a byte-order mark
  (what PowerShell 5.1 writes) now loads normally.
- **Also.** Saves go to a temporary file that then replaces `config.json` in one step, so a crash
  mid-save can no longer leave a half-written file; if antivirus holds the file the replace is retried
  briefly (under 0.2 s) before the save is reported as refused. Saving Settings merges into the file
  (keys a newer version wrote survive) and copies only the settings fields, never the pairing: a copy
  loaded before Regenerate Keys no longer puts the old pairing back. Settings no longer offers empty
  placeholders for saving when the calendar or task lists fail to load (offline, expired sign-in):
  Save waits for the saved settings and saves those. The remote control checks actions against the
  pairing it joined with, so a settings file that is locked or deleted while the app runs no longer
  cuts the phone off, and an action without that key is refused. A read problem is logged once, by
  error code only.
- **Resetting the settings by hand.** Quit the app, delete `%APPDATA%\gcal-simplified\config.json`,
  start the app, then scan the QR code again on the phone. Deleting the file while the app runs does
  not reset the pairing: the remote keeps the one it joined until the next start.
- **Known limits.** A pairing value that is not a string in a hand-edited file is passed through
  as-is; the key check rejects it, and protocol v2 (PR 180) adds the type check on read. A Regenerate
  Keys that succeeds writes the new keys to the file at once, while the Mission Control panel keeps
  them in its draft until Save (older behaviour, unchanged).

Tests: `electron/store.config-read.test.ts`, `electron/store.config-write.test.ts`,
`electron/remote-bridge.config-read.test.ts`, `electron/remote-bridge.leave-room.test.ts`,
`electron/remote-bridge.memory-pairing.test.ts`, `electron/api.save-settings.test.ts` (real files on
disk; locks simulated as `EBUSY`/`EPERM`/`EACCES`), the Settings modal, Dashboard, Mission Control
settings and `regeneratePairing` cases, and the structural `src/__tests__/config-writer-boundary.test.ts`;
registered in `rule-registry.test.ts`.

### 2026-09-28 The remote pairing key no longer travels on the channel it protects

- **Finding** (security review). `remote-control:{roomId}` is a public Supabase broadcast channel:
  whoever holds the room id can listen and send. The desktop put the pairing key in every
  state-update, and the phone put it in every action, including the sync request it sends on every
  reconnect. The desktop accepted any action that repeated the key, so anyone in the room could read
  the key from the next message and then send any allowlisted action. The room id was also logged in
  full at start-up.
- **Now (remote protocol v2).** Both directions send `{ v: 2, body, sig }`: `body` is a JSON string
  and `sig` an HMAC-SHA256 of `event + "\n" + body` keyed with the pairing key
  (`electron/remote-auth.ts`). The desktop verifies the signature before reading anything, then
  requires `msgId` and `timestamp` (v1 skipped the 60-second window when the timestamp was absent),
  then de-duplicates. It records a message id only after the signature verified, sync requests
  included, so forged traffic cannot use up a genuine id. A v1 payload is refused even with the right
  key. The pairing QR carries room, key and `v=2` in the URL fragment
  (`src/mission-control/utils/pairingUrl.ts`). The room id is logged as an 8-character prefix.
- **The leaked key is retired automatically.** v2 changes how the key is used, not which key, so the
  first v2 start renews a pairing that lacks `remotePairingVersion: 2` once, synchronously in
  `init()`, before the renderer can read it. The renewal is one `store.update`; if it cannot be
  saved the bridge stays offline and retries (5 s, doubling to 5 min), and never joins the pairing it
  was replacing. `settings:save` keeps `remotePairingVersion` beside the room id and key
  (`PairingField` in `settings-dialog.ts`): a settings screen loaded before a renewal cannot write
  the old pairing back or unmark the new one. A non-string room id or key in `config.json` reads as
  absent (it made `createHmac` throw on every message).
- **The renewal is visible** (code review, same day). A main-process log line reaches nobody in a
  packaged build, so `remotePairingRenewedAt` is kept in `config.json` until the phone's first
  verified message: the Remote tab shows a re-scan notice and the activity log gets one line
  (deterministic id, so a restart does not repeat it; CLEAR or 200 newer entries brought it back while
  still pending, fixed 2026-09-29). The notice is written in the same
  `store.update` as the renewed room and key, so it never points at a QR code that was not saved,
  and the bridge clears it with one attempt per join. A renewal that cannot be saved never falls
  back to the pairing being replaced, because that is the leaked v1 key (a second review caught the
  first version doing exactly that); a test pins it across retries. State-update timestamps are strictly
  increasing, and a pruned message id leaves a floor, so a backward clock step can neither drop fresh
  state on the phone nor re-open a captured action.
- **What v2 does not do.** It protects integrity, not confidentiality: anyone with the room id can
  still read the state-updates (last 20 log lines, missions, privileges, token counts).
- **Rollout.** Deploy the `mc-remote` protocol v2 build first (old pairings keep working with the v1 desktop),
  then release the desktop. On its first start the desktop renews the pairing; **re-scan the QR code
  on the phone** (MC settings → Remote tab).

Tests: `electron/remote-auth.test.ts` (the shared test vector, pinned in both repos; tampered body,
wrong event, wrong key, wrong-length and non-string signatures), `electron/remote-bridge.protocol.test.ts`
(what the bridge sends and accepts: v1 rejection, replay, forged message ids, no key in any log line),
`src/mission-control/utils/pairingUrl.test.ts`; the existing `remote-bridge.test.ts` cases now send
signed envelopes. The one-time renewal, `settings:save` and non-string keys:
`remote-bridge.pairing.test.ts`, `api.save-settings.test.ts`, `store.test.ts`; the seen-id TTL (now
`2 × MAX_ACTION_AGE_MS`) and the exact 60-second edges: `remote-bridge.replay.test.ts`; a structural
guard, `src/__tests__/remote-key-boundary.test.ts`, keeps a key out of any other hand-built URL and
every broadcast sealed. The notice, failed writes and clock steps: `remote-bridge.pairing.test.ts`,
`remote-bridge.real-store.test.ts`, `remote-bridge.replay.test.ts`, `pairingRenewal.test.tsx`,
`RemotePairingHeader.test.tsx` (now `RemotePairingPanel.test.tsx`); the phone payload never carries the pairing:
`useRemoteSync.no-key.test.ts`. Registered in `rule-registry.test.ts`. `docs/release-qa-checklist.md` 3.11.6
now sends signed envelopes too.

### 2026-09-29 PR 184 review: a stuck mission from an earlier day ends with no miss

- **Changed.** A mission saved running with no readable duration (JSON writes NaN as `null`) was
  given its window's length at load and ended on the first 15 s tick. For a run from an earlier day,
  that tick charged a miss dated on the launch day (a shield segment for a data bug), stamped today's
  date as concluded, and so that day's mission never started, with no "skipped" line. Now a run whose
  window closed before today is left as saved by hydration and ended just after load by
  `END_STALE_MISSION_RUN` (attributed `system`, dispatched once by `useStaleMissionRunEnd`), with no
  outcome, like a Stop: no miss, no conclusion date, and one log line ("Evening mission from <date>
  ended at startup: its saved record was incomplete") that reaches the audit trail. Written inside
  `loadPersistedState` it did not: the audit bridge treats every loaded entry as already written. The
  end stamps `lastActiveAt` at the launch instant, like any end; one known edge: a launch *inside*
  that phase's window today counts today's occurrence as run, so it is not started (a parent can
  ▶ Start it). The action is not remote-allowed and not refused by a broken shield (it frees the
  store, it moves no token). A run whose window reaches today keeps
  its window's length and ends normally. Only a mission that is `active` gets a duration back: an
  ended mission keeps `startedAt` with no duration and is left alone.
- **Guards.** The duration check in `SET_SETTINGS` is now tested per phase (a filter that checked
  only the morning key passed). The scheduler and the school-bag decision are tested against
  `24:00` and `06:5`, which the lenient end-time parser reads. The parse guard also catches a regex
  with character classes (`[0-5]d`) and a split on a regex containing `:`.
- **Small fixes.** A derived end is rounded to whole seconds first, so it is never written in
  exponent form (`60.0000001` min gave `07:1e-7`). `isValidDurationMins` returns a plain boolean. The
  overnight-window wording is narrowed: a launch or late timer inside such a window starts it only
  before midnight.

Tests: `store/persistence-stuck-run.test.ts` (an earlier day's run detected, not ended, at load; the
end with no outcome; tonight's evening still starting; a run from today; an overnight run launched
at 00:10; yesterday's ended mission), `store/useStaleMissionRunEnd.test.tsx` (one line in the app and
one in the audit trail, StrictMode, no second line on relaunch, not mounted on a normal launch),
plus cases in `mcReducer.settings-time.test.ts`,
`useMissionScheduler.invalid-time.test.tsx`, `schoolDays.test.ts`, `hhmm.test.ts` and
`hhmm-parse-boundary.test.ts`.

### 2026-09-29 The Remote tab draws only the saved v2 pairing

- **Bug** (review of the PR 180 rebase onto the config-writer fix). The Remote tab drew its QR code
  from Mission Control's state, which copies the pairing from `settings:get` once at start-up and
  keeps it in localStorage. When the first v2 start could not save the renewal (a locked settings
  file) and a later retry renewed and joined a new room, the tab still showed the old room and the
  leaked v1 key under "Scan this QR code again". With a read-only settings file there was no v2
  pairing at all, yet a refused "Regenerate Keys" said "The current QR code still works".
- **Now.** `settings:get` hands out a room and key only for a pairing marked
  `remotePairingVersion: 2`. The Remote tab (`RemotePairingPanel`) reads `settings:get` when it is
  shown and draws the QR code from that read only; with no v2 pairing it shows no QR code and says
  "Remote is not paired yet — waiting to save a new pairing.", and a refused "Regenerate Keys" says
  "Keys not changed: the new pairing could not be saved, so remote control stays offline until it
  can. Try again in a moment." The start-up read sets Mission Control's copy of the room and key
  from a v2 pairing and clears it when there is none.
- **The renewal line comes once.** "Already logged" is now a marker in Mission Control state
  (`settings.remotePairingRenewalLogged`, the renewal time it logged), set in the same start-up
  read. It used to be a search of the 200-entry log, so after CLEAR, or 200 newer lines, the line
  came back at every start (and into the audit trail) for as long as the phone had not answered;
  every upgrading profile renews, so a family that never paired a phone would have seen it forever.
  A garbage marker in a saved state reads as "not logged". The marker is never sent to the phone.
- **Smaller fixes.** State-update stamps restart from the clock when the last one is more than
  120 s ahead of it (a clock corrected backwards), because the phone refuses stamps that far ahead.
  The seen-id memory stays at twice the age window, now documented and tested for the reason it
  still matters: two phones whose clocks are off in opposite directions. A signature that is not 43
  characters and a body over 64 KB are refused before any HMAC. The shared test vector is compared
  with the phone repo's copy when a sibling `../mc-remote` checkout exists.

Tests: `electron/api.save-settings.test.ts` (no unmarked pairing from `settings:get`),
`src/mission-control/components/RemotePairingPanel.test.tsx` (fresh read, no stale pairing, waiting
text, both refusal messages), `src/mission-control/store/pairingRenewal.test.tsx` (marker, CLEAR and
restart, a later renewal, the state's pairing cleared and set again, hydration),
`src/mission-control/utils/pairingUrl.test.ts`, `regeneratePairing.test.ts`,
`useRemoteSync.no-key.test.ts`, `electron/remote-bridge.replay.test.ts` (two phones, stamp restart),
`electron/remote-auth.test.ts` (signature length, body cap) and
`electron/remote-auth.vector-drift.test.ts`; registered in `rule-registry.test.ts`. Release QA 3.11.8
checks the notice on an upgrade; 3.12.7 lists the new `mc-state-v5.settings` differences.

### 2026-09-29 Every Mission Control Settings field shows keyboard focus

- **Fixed.** The 2026-09-26 focus ring covered only the "Auto-trigger at" time field. The cream-task
  Schedule select and the reward-cost number fields still carried an inline `outline: none`, so
  keyboard focus on them was invisible (an inline outline beats any stylesheet rule). Both inline
  outlines are gone. The class is renamed `mc-time-input` → `mc-field` and every Settings field
  carries it (time, select, number, the three range sliders, the pairing URL in
  `RemotePairingPanel.tsx`), so one `mc.css` rule draws the 2 px `--mc-focus-ring` outline on `:focus-visible` for all of them.
- **Fixed, found while verifying.** The cream-task section kept `overflow: hidden` after its open
  animation, and the Schedule select sits flush in it, so the ring's left and right sides were cut
  off. The section now clips only while its height animates. `overflow` has to be in Framer's
  `animate` as well as `transitionEnd`: with it only in `initial`, Framer stored the end value but
  never repainted it, and the section stayed `hidden` in most opens (found in review).
- **A click shows the ring too.** Chromium matches `:focus-visible` on a click or tap for typing
  fields and the select, so the time fields, the Schedule select, the reward costs and the pairing
  URL show the ring after a click as well. Acceptable for a parent-only panel. Range sliders show it
  only from the keyboard. A `:focus:not(:focus-visible) { outline: none }` rule was removed: it
  never changed anything in Chromium. The ring falls back to `currentColor` outside the `--mc-*`
  token scope.
- E2E: `mc-settings.spec.ts` Tabs onto the Schedule select and a reward cost in real Chromium and
  checks the computed outline is solid violet (red before the fix: `none`), that no ancestor clips
  the select's ring (red before the `animate` fix: `DIV overflow hidden`), and that a click on a
  reward cost shows the ring.
- Tests: `MCSettingsOverlay.focus-ring.test.tsx` walks every sidebar tab, with the cream task and a v2
  pairing (a fake `settings:get`) so the conditional fields render, and fails on any field without
  `mc-field` or with any inline `outline*` property (red before the fix: 14 fields). It reads the
  ring rule from `mc.css`, since jsdom does not match `:focus-visible`. With the real Framer Motion,
  it checks the cream section is `overflow: visible` 1 s after opening, from the toggle and on
  re-entering the tab (both red before the `animate` fix).
- Open: the invalid-time border uses `--mc-red` (#ff7b7b), about 2.3:1 on the panel, under the 3:1
  WCAG 1.4.11 asks for a non-text indicator. A darker token is proposed, not applied.

### 2026-10-01 A relaunch stays signed in to Google

- **Bug** (found by release QA, 2026-10-01; present since v0.0.6, commit 76c8fb0). After every relaunch the
  calendar showed an empty week with no error: no events, no tasks, no calendar colours, and the
  School Bag task could not read the school calendar. The login screen was skipped, because the
  "signed in?" check found the saved tokens, but the Google connection itself had none: every
  Google call failed in the main process with "No access, refresh token, API key or refresh
  handler callback is set". Signing out and in again worked until the next relaunch. This is
  probably the real cause of the household symptom "the calendar needs a new sign-in every few
  days" (the 2026-08-19 token fixes did not cover it).
- **Cause.** `electron/auth.ts` loaded the saved tokens while `main.js` was being imported, before
  Electron is ready. On Windows the encrypted token store (`safeStorage`) cannot decrypt before
  ready, so that load found nothing. The "signed in?" check read the store again later, after
  ready, and succeeded: two answers from two reads.
- **Now.** The saved tokens are loaded once, on the first Google call or "signed in?" check, which
  always comes after the app is ready. "Signed in?" answers from the same credentials the Google
  calls use, so the two cannot disagree: saved tokens that cannot be decrypted, are not JSON, or
  hold neither a refresh token nor an access token that is still valid for more than 5 minutes
  show "Sign in with Google" instead of an empty week. A check that came before the app is ready
  would fail with an error instead of answering "signed out". A read of the token file that fails
  (held by another program) is tried again by the next call in the main process (the calendar
  screen does not re-check yet: a follow-up). Sign-in, the token refresh (it still keeps the
  refresh token) and sign-out work as before.
- Tests: `electron/auth_app_ready.test.ts` fakes Electron's Windows `safeStorage` (unusable before
  ready) and uses the real Google OAuth client: importing `auth.ts` touches no `safeStorage`
  method, a relaunch with saved tokens (fresh or expired access token) reaches Google, the
  negative and before-ready cases, sign-in, refresh and sign-out. 9 of its first 16 cases were
  red before the fix, with the production error among them. `src/__tests__/auth-ready-boundary.test.ts`
  reads the source: no file under `electron/` may read `authService` or `safeStorage` at module
  scope (red on a module-scope call added to `main.ts`). Registered in `rule-registry.test.ts`.
- Built app, on a copy of the QA profile (signed in with a test account). The pre-fix build
  reproduced it: "signed in", 0 events, the strict read and the calendar list failed, and the
  main process logged the error. The fixed build, relaunched three times: no error logged, the
  calendar list and a strict one-year read (11 events) answered every time, and the expired access
  token was refreshed with the store still encrypted.
- **Saving the tokens** (review of PR 186). The save now runs on every hourly token refresh, so
  its failure paths were fixed too. A write of the token file that fails (antivirus or a backup
  holding it) leaves the file as it was and the tokens in memory until the next save; it used to
  fall back to writing them unencrypted. The tokens are written unencrypted only when `safeStorage`
  reports no encryption (Linux without a keyring) or encrypting itself throws. The kept refresh
  token comes from the Google client, not from re-reading the file. A failed save can no longer
  discard a token Google just granted, or turn a successful sign-in into "Authentication failed".
  Sign-out clears the Google client before the file. Tests: `electron/auth_token_lifecycle.test.ts`.

### 2026-10-02 Mission Control and Space Rescue fit the child's screen (1080p at 150 %)

- **Bug** (found by release QA 3.13.1, 2026-10-01; already in v0.0.42). The child plays fullscreen
  on a 1920x1080 touchscreen at 150 % Windows scaling, which the app sees as 1280x720 CSS px. There:
  - Space Rescue showed only the top 13–41 % of each tray shape. The game panel is one screen tall
    and clips what does not fit, and the board stacked over the tray needs a taller screen. The
    child was grabbing shapes he could barely see. The rescue quiz's bottom key row (⌫ 0 ✓) was
    63 % visible.
  - The main view cut the Privileges card (72 % visible) and Phone Games was below the screen
    edge: the five cards need 335 px and column 3 is 323 px wide at 1280, so Phone Games wrapped
    to a second row, and column 3 needed 107 px more height than it had.
- **Where the thresholds live.** Every short-screen threshold below is measured in the built app
  and stated once, with its measurement, in `src/mission-control/styles/mc-short-screens.css`.
  This entry describes the behaviour; it does not repeat the numbers.
- **Space Rescue now.** On a short, wide screen (1536x864 and 1280x720 are both) the tray moves
  beside the board, in two rows (two shapes on top, one centred below), between the board and the
  rescue slot. The board keeps 48 px cells and the tray 36 px cells; nothing is shrunk. A tall
  screen (1920x1080, 1706x960) keeps the tray under the board, unchanged, and so does a screen
  that is short but too narrow for the row (it was cut before and stays as it was).
- **Rescue quiz now** (and the Snake and Fruit Merge quizzes, same card): on a short screen the
  numpad keys are 72 px instead of 93 px and the card's vertical spacing is tighter, so the whole
  card fits inside Space Rescue at 1280x720. The keys stay finger-sized: 108 device px at 150 %.
- **Main view now.** The five privilege cards stay on one row and narrow slightly when the column
  is narrow (56 → 54 px wide at 1280). Column 3 (Recycling, Activity, Mood Gauge, Shield,
  Privileges) now starts at the top of the screen beside the "🏆 Goals" heading instead of under it,
  and its cards are 6 px apart everywhere (Recycling and Activity were 10 px apart). On a short
  screen the stage padding, the card padding and the gaps in column 3 are smaller, so the column
  fits at 720 px, also in its tallest state: both tasks done and the shield's "🔒 Bank locked" row
  showing.
- All three switches are CSS media queries (`mc-short-screens.css`): no timer, no resize listener.
- **Checked in the built app** at 1920x1080 (100 %), 1536x864 (125 %) and 1280x720 (150 %), with a
  forced device scale factor and a window of that size: every tray shape, the board, every button,
  every rescue-quiz key and both privilege cards fully visible; no page scroll; Settings opens with
  Save on screen.
  Space Rescue drops (the release-QA drop spec, emulated touch: corners, edges, off-centre aims,
  shapes hanging off the board, refused drops, two fingers): 30 of 30 landed on the ghost at each
  of 100, 125 and 150 % (1280x720), ghost = expected cells 30 of 30, lift error 0 px, ghost cell
  offset from the board cell 0 px. Before this fix only 10 of 30 drops could start at 1280x720.
- Tests: `e2e/mc-layout-fit.spec.ts` (isolated profile, one launch per size) measures what the
  browser laid out once nothing is still animating in, checks which Space Rescue layout is active at
  each size, opens the rescue quiz on a math question and checks every key, and drags a shape with
  the mouse to check that the ghost cells sit on the board cells (≤ 0.5 px). It failed at 1280x720
  before the fix and passes at all three sizes after.

### 2026-10-03 Mission Control's saved state no longer keeps a copy of the remote pairing

- **Was.** Up to v0.0.43 Mission Control kept a copy of the phone pairing (room id and key) in its
  own settings, saved in `mc-state-v5`, in plain localStorage, beside `config.json`, which already
  holds it. The start-up `settings:get` read refreshed the copy when the pairing had changed, and
  cleared it when the read handed out no v2 pairing. So it was a second copy of the current key,
  and a v1 key saved before v0.0.43 stayed in it only while that read kept failing (a settings file
  another program held at every start). Since remote protocol v2 nothing read the copy: the Remote
  tab draws its QR code from its own `settings:get` read, and the phone payload carries no settings.
- **Now.** The pairing exists only in `config.json`. Loading the state drops `remoteRoomId` and
  `remoteKey` from a saved settings object (every other setting and the renewal-logged marker are
  kept), so the next save writes a blob without them, whatever `settings:get` answers: a v2 pairing,
  none, an error, or no Electron bridge at all. Nothing puts them back: not the start-up read, not a
  renewal, not "Regenerate Keys", not a Settings save, not a restart. The start-up `settings:get`
  read now saves only the renewal-logged marker of a new renewal. On a steady profile that read
  saves nothing in either version; the old one also saved the pairing once on the first start after
  it changed. (The store's own save, about 500 ms after every start, is unchanged.)
- **Unchanged.** The QR code, the re-pairing notice and the one-time renewal log line behave as
  before. `remotePairingRenewalLogged` stays in Mission Control state: it is this machine's
  bookkeeping (which renewal was logged), not the pairing.
- Tests: `src/mission-control/store/pairingCopy.test.tsx` (a saved v0.0.43 state with both fields:
  loads without them, and after a start, a renewal, "Regenerate Keys" with a Settings save, and a
  restart the saved blob holds neither the field names nor the values; the Remote tab still draws
  the v2 pairing and the notice). Structural: `src/__tests__/remote-key-boundary.test.ts` part (iii),
  read with the TypeScript parser: in renderer code the pairing field names appear only in the three
  files that read `settings:get` / `remote:regenerate` and draw the answer; those name none of the
  store's dispatch, hooks, `SET_SETTINGS` or localStorage; and only `RemotePairingPanel.tsx` imports
  `readPairing` / `regeneratePairing`. It sees names and imports, not data: a copy made without
  naming a field or importing those modules (a spread of the whole `settings:get` answer) passes it,
  which is why the saved blob is also checked by value. Release QA 3.12.7 now expects an upgrade
  from v0.0.43 or earlier to lose the two fields.

### 2026-10-04 Mission Control idles at the Calendar's level: the Remote dot stops looping

- **Bug** (found by release QA for v0.0.44, 2026-10-03; v0.0.43 had it too). Mission Control's main
  view, left alone on the child's screen (1280x720 at 150 %), used 19.5 % of one CPU core, against
  0.2 % for the Calendar. The cause was the Remote dot's pulse: a 2 s scale-and-fade loop that ran
  for as long as the view was open and the remote was connected. A loop makes the app draw a new
  frame 59 times a second, even for an 8 px dot; the dot sits in the top bar, whose background blur
  is redrawn with every frame.
- **Now.** Connected is a filled green dot, offline a hollow red ring (it used to be a red dot: the
  two now differ in shape, not only colour), and the chip says "Remote: connected" / "Remote:
  offline" as a tooltip and to a screen reader. The dot pulses 3 times (6 s) when Mission Control
  opens and when the status changes, then stands still at full brightness. A change less than 30 s
  after the last pulse started changes the colour at once but does not pulse again, so a remote
  that keeps reconnecting pulses at most a fifth of the time. While connected it used to pulse
  forever; while offline it never pulsed.
- **The cheat trap's two animations stop too.** The red dot on Logs (1.5 s pulse) and the wagging
  finger (0.6 s) looped for as long as they were on screen; they now play for 10.5 s and 10.2 s,
  longer than the trap is shown (about 10 s), and stop. Mission Control's stylesheets hold no
  `infinite` any more.
- **Measured** on the built app, 5 minutes idle at 1280x720 / 150 % (method and the full survey of
  every loop in `docs/performance.md`): Mission Control's main view 24.4 % → 0.49 % of one core;
  the Calendar 0.19 % → 0.19 %.
- Tests: `src/mission-control/components/RemoteIndicator.test.tsx` (dot and ring with their labels,
  a finite pulse in `mc.css`, a new dot when the status changes after 30 s, the same dot inside the
  30 s and when the parent re-renders, 4 pulses in 2 minutes of a remote flapping every second).
  Guards: `src/__tests__/infinite-animation-registry.test.ts` registers every looping animation in
  `src/` with when it is on screen, pins its count per file and allows none on an idle view;
  `src/__tests__/idle-calendar-animations.test.tsx` renders the idle Calendar (the real `App`) and
  `src/mission-control/__tests__/idle-animations.test.tsx` renders ten idle Mission Control screens
  (a goal ready, a responsibility DONE, the shield broken, a privilege suspended, a mission running
  or minimized, …) with the remote online, and both fail if anything on screen loops. The unused
  Vite template stylesheet `src/App.css` (a looping logo spin, imported nowhere) is deleted, and
  Tailwind no longer scans test files, so a class named in a test does not ship its CSS.

### 2026-10-04 Packaging refuses an admin Supabase key

- **Why.** The desktop app uses Supabase only for the phone remote's Realtime channel, which needs
  only the project's publishable key (`sb_publishable_…`). `vite.config.ts` writes
  `VITE_SUPABASE_ANON_KEY` into `dist-electron/main.js`, so anyone with the installer can read
  whatever key the build had. An admin key (a `service_role` JWT or an `sb_secret_…` key) bypasses
  every Supabase control.
- **Now.** electron-builder's `beforePack` hook (`scripts/package-key-guard.js`) reads every file it
  is about to pack from `dist/` and `dist-electron/` and refuses an admin key, including one split
  across joined string literals, written with escaped dots, or stored as UTF-16. Its message names
  the file and the key's role, prints at most the key's first 4 characters, and says what to do:
  set `VITE_SUPABASE_ANON_KEY` to the publishable key (Supabase dashboard → Project Settings → API
  Keys) wherever the build reads it (`.env`, `.env.local`, `.env.production`,
  `.env.production.local`, or the environment), delete `dist` and `dist-electron`, rebuild with
  `npx vite build`; and an admin key that was ever packaged into an installer must be revoked or
  rotated in the Supabase dashboard, and any installer holding it withdrawn. A legacy `anon` JWT
  still passes, but is not recommended: it stops working when the legacy JWT secret is rotated. It
  reads the build, not `.env`, so a build left over from an earlier `.env` is refused too.
- **It also refuses** what it cannot vouch for: no build to read; a `files` list, at the config or
  the platform level, that packs anything besides those two folders, has no folder in it (only
  exclusions, which pack the whole project), re-includes with `!!` or climbs out with `..`;
  `extraResources` or `extraFiles`; and a file over 256 MB, which it does not read.
- **Where it runs.** Every package electron-builder makes from this config: `npm run build`,
  `npm run release` and `/release`'s publish command. Anything that tags or pushes checks the build
  first: `npm run release` now builds, checks, bumps and pushes, rebuilds and publishes (it used to
  tag before it built), and `/release` runs `node scripts/package-key-guard.js` as pre-flight step
  5, before the QA pass, and passes only on its success line. `vite build` is unchanged, so local
  E2E and QA builds work whatever `.env` holds.
- Tests: `src/__tests__/package-key-guard.test.ts` (public keys package; an admin key is refused
  with what to do and without the key; the config and platform-level refusals; `appDir`; a stale
  `dist-electron` refused though `.env` is clean; the command, with and without its `.js`) and
  `src/__tests__/package-key-guard-detection.test.ts` (split, escaped, UTF-16, other JWT headers,
  source maps, oversized files, and no false positive on public keys or random data). Guard:
  `src/__tests__/package-key-guard-wiring.test.ts` runs each packaging command's arguments through
  electron-builder's own parser and `Packager` and requires the hook it resolves to be this guard
  and to refuse, pins `files`, pins the order of `npm run release` and of `/release`'s pre-flight,
  and keeps `scripts/package-key-guard.d.ts` in step with the script's exports.

### 2026-10-04 Google ending the sign-in shows Sign in

- **Bug.** When Google refuses the saved sign-in (access revoked at myaccount.google.com, or the
  refresh token's 7-day expiry while the OAuth consent screen is in Testing mode), the calendar
  showed an empty week, or holidays only, with no error. The Google client kept the refused
  credentials, so "signed in?" kept answering yes, and the data reads turn every failure into an
  empty list. The only way out was Settings → Reconnect Account, and every relaunch repeated it.
- **Now.** Google refusing the refresh token (`invalid_grant`) signs the app out as Sign out does:
  the token file is cleared and the calendar shows "Sign in with Google" without a relaunch; a
  relaunch starts there and does not ask Google again. A revoke that also kills the access token
  before it expires is found on the first read that Google answers 401: the client asks for a new
  token once and retries once, never in a loop; a 403 (a quota, a scope left unchecked) asks for no new token. Nothing else signs out:
  offline, a Google outage (5xx) or a misconfigured app do not (the week may show holidays only
  until the connection is back, as before). A sign-out the parent asked for (Reconnect) is not
  reported this way, so Settings stays open while the consent page is.
- **Reconnect or Sign in while a token refresh is in flight.** A refresh still running when
  Reconnect was clicked landed after the sign-out and signed the old account back in for an hour
  (an access token with no way to renew it), or, after the new sign-in, replaced the new account's
  access token; a sign-in started from the Sign in screen while a read refreshed the saved, revoked
  grant could be signed out right after it succeeded. Now one Google client per sign-in: a sign-in
  exchanges the code on a new client, and a sign-out retires the old one, so a refresh in flight
  on it fails instead of landing, and a read still holding it stops instead of reaching Google as
  the old account (a request already sent still completes).
- **A token file held by another program** (antivirus, a backup) is read again by the main process
  after 0.5, 1, 2, 4 and 8 s before "signed in?" answers; any other failure answers at once. The
  calendar asks once and shows Sign in for whatever failure is left. It used to show Sign in at
  once and never ask again (the follow-up named in the 2026-10-01 entry).
- **A corrupt token file no longer stops the app.** `auth-store.json` was opened while the app was
  starting, before the single-instance check and before any window, and an empty, truncated or
  NUL-filled file (power loss, a disk fault) stopped every launch with no window until someone
  deleted it. It now opens on first use; content that can never be read, found by any read or
  write, is moved aside to `auth-store.json.corrupt-<time>` and the app shows Sign in. The
  moved-aside copies are deleted on the next successful save and on every sign-out: a copy of a
  token file has no recovery value and may hold a refresh token (`config.json`'s copies are kept).
  A byte-order mark (a hand repair in PowerShell 5.1) is read, as in `config.json`.
- **No token text in the logs.** gaxios keeps a failed refresh's request body, refresh token
  included, in its error, and a JSON parse message quotes the text it could not parse; the main
  process logged both objects, and Electron itself logs the error a rejected IPC handler throws.
  Every such line is now a fixed phrase with the error's status, code, Google's reason, and its
  name unless it is the plain `Error` (`errorSummary` in `electron/log-safe.ts`), and every
  `data:`/`auth:` handler rejects with a rebuilt error (`ipcSafe`), so the window still learns
  what failed and the log gets no request.
- Tests: `electron/auth_session.test.ts` (sign-in, sign-out, a revoke mid-session and before a
  relaunch, one notice per refresh and none for Reconnect, offline / 503 / `invalid_client` /
  `invalid_request` keep the sign-in, the refresh racing Reconnect and a sign-in, a read still
  holding the old client), `electron/auth_unauthorized.test.ts` (a revoke behind a still-valid
  access token, a 401 retried once and never in a loop, a token-endpoint 401 asked once, a 403
  never refreshing, with or without an expiry),
  `electron/auth_store_corrupt.test.ts` (the real electron-store in a throwaway folder: a damaged
  file at launch and after it was opened, both copy deletions, the exact log line),
  `electron/api_error_logging.test.ts`, `electron/auth_logging.test.ts`, `electron/log-safe.test.ts`,
  `electron/held-file.test.ts`, `electron/main_auth.test.ts` (every `data:`/`auth:` handler),
  `src/components/CalendarApp.test.tsx`. Each new case was red before its fix; the negatives were
  proven by treating every failure as a refusal. `src/__tests__/auth-ready-boundary.test.ts`
  (walker in `src/__tests__/helpers/importTimeReads.ts`) follows renamed and whole imports, IIFEs,
  helpers, class expressions, constructors and what they reach through `this.`, static parts and
  instance fields, aliases, and electron-store however imported, with one probe per shape (28);
  its header lists what it does not follow. The first case of `electron/auth_app_ready.test.ts`
  timed out twice under a loaded suite: it waited for Vite to transform `auth.ts`, which now
  happens at collection (88 ms → 5 ms). `auth.ts` and its suite were split under 300 lines
  (`auth-token-store.ts`, `auth-client.ts`; `auth_session.test.ts`, `authTestKit.ts`).
- Built app, on throwaway profiles, with every `googleapis.com` request answered by a stub inside
  the main process (no real Google traffic): a revoked grant behind an expired token → the
  Dashboard ("Syncing with Google...") gave way to "Sign in with Google", one token request, the
  sign-out logged, the token file without its refresh token; a relaunch showed Sign in with no
  request to Google. A revoke behind a still-valid token (the API answering 401) → Sign in after
  one token request. A 503 outage → 12 token requests (the library retries), the Dashboard and
  the refresh token stayed. No main-process log line held the seeded refresh token. The token
  file held exclusively for 9 s at launch → the Dashboard after 11 s, not Sign in. An empty, a
  truncated and a NUL-filled `auth-store.json` → a window opened on Sign in each time and the file
  was moved aside. Re-run after the third review round: a 503 outage → 14 token requests and 4 of
  Electron's "Error occurred in handler" lines (the school calendar's strict read), none with the
  seeded refresh token, the sign-in kept; a 401 revoke → Sign in after one token request; a 403
  that kept coming back (rate limit) → 12 API requests, no token request, the sign-in kept, and
  the log named the reason (`rateLimitExceeded`).
- Not changed: an access token saved without a refresh token (left by builds before v0.0.41, or by
  the Reconnect race fixed here) that expires mid-session still fails quietly until the next
  launch, which shows Sign in.

### 2026-10-04 The calendar no longer flashes the full-screen spinner, and every day on screen gets its events

- **Bug** (found by the review of PR 186; there since the month cache, hidden until v0.0.43 because
  the Google reads failed quietly). "Syncing with Google..." replaced the whole calendar twice at
  every launch, and again on the first Next Week or Previous Week into a month not loaded yet. The
  events request was shaped by the week start, a display setting: its range and cache key followed
  it. The Dashboard asked before it had read the saved settings, with the hook's Sunday default, so
  the settings then changed the key, the miss emptied the event list, and an empty list while
  loading was what put the spinner up. A week start changed in Settings did the same, and so did any
  Next Week into an empty month.
- **Same cause, bug S1** (`docs/release-qa-plan.md`). The settings were read last, after tasks and
  weather, in one `try`: a weather or tasks failure at launch (offline, for one) showed "Failed to
  load calendar data." although the events had loaded, and left the saved settings unread for the
  session (week start, active hours, theme).
- **Same root, two older gaps** (found by the review of PR 192, bug 19). The request ended at the
  start of its 42nd day (Google's `timeMax` is exclusive), so the 7th column of a "today" week on
  the 30th and 31st, about 5 % of other weeks, and the month view's last cell never showed events;
  and in "today" mode from Next Month on it covered other days than the grid drawn, up to a row.
- **Now.**
  - Events are requested and cached per month, from a week before the month to two weeks after it,
    whatever the week start (`fetchRangeOf` in `useCalendarData.ts`). The week view follows the
    month of its first day, the month view the month shown. Next Week inside a month, a midnight
    in "today" mode and a changed week start do not change the range: only a new month, a Save
    or a reconnect sends a request (a midnight or a week start that moves the week's first day
    into another month is a new month).
  - The week start is resolved once (`config.weekStartDay ?? 'today'`, as `electron/store.ts`
    defaults it), and the week and month helpers take it without a default of their own, so a
    settings file that is busy at launch shows and fetches the same days.
  - The settings are read first (`useDashboardLoad.ts`), then the visible month is asked for. Tasks
    and weather are read side by side, and a failure of either is only logged, as the 5-minute
    refresh already did. The full-screen spinner shows only until the first answer (or failure)
    is in and does not return while the Calendar stays open; a return from Mission Control starts
    the Calendar over.
  - A month not loaded yet keeps the events already known on screen, with "Fetching Events..."; a
    month already seen shows at once, with "Refreshing..." while it is read again. The header's
    bar, text and icon follow one status. An answer for a month the user has left only fills its
    cache: the caller states the visible month.
  - Save applies the config Settings has just written instead of reading the settings file again,
    at the moment antivirus is most likely to hold it. Save and a reconnect start a new events
    generation: the visible month is asked for again even while an older request is in flight,
    and that older answer, built with the old calendar selection, is dropped. When loads overlap
    (launch, Save, reconnect), only the newest applies its tasks and weather and ends the loading
    state, and a read that throws before it returns a promise still ends it.
  - No new timer. A launch makes one events request instead of two.
- **Not changed.** Offline, the main process answers the events read with an empty list, so events
  kept on screen while a new month loads disappear when that answer lands; that needs a read that
  reports failure.
- Tests: `src/components/__tests__/Dashboard.loading.test.tsx` (clock fixed on Wednesday 2026-10-28,
  saved week start Monday, every screen recorded: settings before events, one request for the month,
  the spinner never back; an empty calendar; offline; a weather failure; a busy settings file with
  Next Week; the 7th day of a "today" week on the 30th; "today" Next Month; Next Week into a month
  with the answer held; Previous Week from the cache), `Dashboard.reload.test.tsx` (Save through the
  real Settings dialog without a settings read after it; Save and reconnect while a request is in
  flight, the older answer landing last; overlapping loads; a tasks or settings read that throws
  before it returns), `src/hooks/useCalendarData.test.ts` and `useCalendarData.range.test.ts` (both
  views, every week start, week offsets 0-5 and month offsets 0-2, every day from 2026-01-01 to
  2028-12-31: no day on screen outside its request). Red before their fix: every Dashboard case
  except the idle reconnect (a guard) and Previous Week (a tighter assertion); offline and the
  weather failure were red on `main`, the rest on this change's first version. The hook and sweep
  tests were written with the new API and were proven by mutation (no margins, a 7-day end margin,
  no generation check, de-dup by month only, no newest-load check: each turns its tests red).
  `src/components/calendarTestKit.ts` is the shared IPC fake (`data:events` answers a list, so
  `Dashboard.test.tsx` no longer runs the failure path). Guards: `Dashboard.test.tsx` (a busy
  settings file), `SettingsModal.test.tsx` (Save hands over what it saved),
  `idle-calendar-animations`, `infinite-animation-registry`, `timer-registry`.
- Built app (`dist-electron` rebuilt from empty, throwaway profile seeded with `weekStartDay:
  'monday'`, the mocked Dashboard with a 700 ms events answer, the DOM sampled every 50 ms and every
  change recorded). On `main` (Sunday 2026-10-04, 20:53): launch spinner → week → spinner → week
  (29 of 76 samples), two events requests; Next Week (September into October) week → spinner →
  week (13 of 83). This change (23:21): launch spinner → week (14 of 78, one stretch), one request;
  five Next Weeks: the two into a new month each sent one request and showed week → week with the
  header indicator → week, the three inside October sent none, 0 spinner samples in 401.
  `e2e/week-display-customization.spec.ts` (the Save path) passed on both builds.

### 2026-10-05 An evening that ends after midnight no longer cancels the next evening

- **The bug (older, listed as an open follow-up).** The day an occurrence counts as done
  (`lastCompletedOrFailedEveningDate`, and the morning's twin) was the date of the outcome. An
  evening at 23:30 for 60 min that timed out at 00:30, or was finished at 00:15, therefore marked the
  *next* day's evening done, and that evening never started: no start, no miss, no log line. Any
  outcome after midnight did the same (an evening started by hand at 23:50, or stretched past
  midnight with the phone's +).
- **Now** an outcome is dated by the day its occurrence started, and that day is decided when the
  run **starts** and stored on it (`occurrenceDate`, `store/occurrenceDay.ts`; the outcome writes it).
  The scheduler names the occurrence it starts, so a late timer at 00:10 for a 23:30 evening is that
  night's. **A start by hand or from the phone never belongs to a future day's occurrence**
  (decided for Nathan by the review of PR 193, reversible): at or after today's window start it is
  today's (a morning made up at 19:30, an evening started late at 21:00); before it, it is whichever
  is nearer in real time, today's start ahead (an early start) or the previous occurrence's END
  behind (a late make-up), a tie going to today; inside the previous occurrence's window (an
  overnight tail) it is that one. So the 06:00 morning started at 05:50 is today's, the default
  19:00–20:00 evening started at 00:20 is the evening before (4 h 20 since its end vs 18 h 40
  ahead, as the school bag already treats it) and at 14:00 today's, and a start at 00:10 inside a
  23:30–00:30 window is last night's. A first version took the nearest occurrence of either day,
  so a morning made up in the evening counted for the next morning, which then did not start and
  whose games opened at midnight. A full Reset is a second attempt at the same occurrence and keeps
  the day. Deciding at
  the start (the first version re-derived the day at the outcome) keeps the day right when Settings
  saves a new duration during the run, when the scheduler starts a run up to 5 min late (the 10 s
  test evening at 23:58 started at 00:02), and on a DST night. The scheduler compares an occurrence
  with its own start day, so a 23:30 timer that fires after midnight (the machine slept) is judged
  against the evening that began before midnight: one already finished is not started a second time
  and gets no "skipped" line. The miss still costs one shield, and the next night's miss costs
  another.
- **A run that ended unnoticed is stamped at its due end** (`store/missionActivity.ts`). A morning
  left running on Monday (the app quit at 06:10) and expired by the tick on Tuesday at 06:15 had its
  end stamped then, so Tuesday's morning read as run: no morning, no "skipped" line, games shut all
  day. Its end is now Monday 06:34, and Tuesday's morning starts. The same holds for an earlier day's
  stuck run ended at load.
- **A timeout after a stop charges nothing.** The overlay's timer stays mounted for its ~575 ms exit
  animation, so a phone Stop just before "Time's up" let it record a miss for the stopped mission
  (shield −1, no line). Only a running mission times out now (older bug).
- **Visible on the phone**: "Done Today" compares the same date with the phone's today, so after an
  evening that ended at 00:15 the card reads "Inactive" until that night's evening runs (before, it
  read "Done Today" and that evening never came).
- **Quick games**: a morning run left from an earlier day now concludes that day, not today, so
  today's games stay shut until today's morning concludes, as the quick-game rule says (before, the
  late expiry opened them).
- **The day of the update** (also for the release notes): a date the previous version saved for an
  outcome recorded after midnight, or for an evening left running and recorded missed at the next
  morning's launch, still names that later day. If the update is installed on that day, that
  evening is skipped once, with nothing logged; from the next night on it works.
- **Not changed** (the first half closed on 2026-10-06, "A relaunch or a wake after midnight starts
  last night's open window" below): a relaunch or the resume re-arm *after* midnight inside an
  overnight window still aims at the next occurrence and does not start the open one (an older
  limit; a late timer does start it). An evening started by hand before its window and finished
  before it opens still counts as that day's evening.
- Tests: `store/__tests__/mcReducer.occurrence-day.test.ts` (completion, timeout, a run started after
  midnight in the window, a full Reset at 00:40, two nights in a row, the morning, a daytime evening
  finished after midnight, the hand-start rule (a morning made up at 19:30, an evening at 00:20 and at 14:00, the tie at 07:30, the 10 s duration), its DST nights in `mcReducer.occurrence-dst.test.ts`, the scheduler's named day, a phone
  that names a day, a Settings save mid-run, a run saved before the field existed, a clock set back),
  new cases in `hooks/useMissionScheduler.overnight.test.tsx` (a timeout at 00:40 then the next 23:30
  evening with both misses counted, a relaunch inside the next evening's window, a relaunch at 00:10
  mid-run, a late timer after midnight for an evening finished early or not started, the 10 s evening
  started 4 min late), `hooks/useMissionScheduler.next-window.test.tsx` (Monday's morning ended
  during Tuesday's at 05:50, 06:15 and 07:00; yesterday's stuck evening ended at a 19:10 launch),
  `persistence-time.test.ts` (the stored day and base length survive a restart, garbage does not),
  `mcReducer.mission-stop.test.ts` (a timeout after the stop) and the structural
  `__tests__/outcome-date-boundary.test.ts` (one writer of the outcome dates, two comparing readers).
  Red before the fix: 8 reducer and 5 scheduler cases; in review round 1, 10 reducer, 1 scheduler,
  2 next-window and 1 stop case before the fix, the 3 hydration cases by mutation (dropping the check).

### 2026-10-05 Phone mission buttons: a stale Reset or +/- is refused, and +/- has a ceiling

- **Plain Reset.** The phone's "Reset" (tasks only, `RESET_MISSION`) was left out of the 2026-09-28
  refusal on the reasoning that the phone sends it only for the running mission. But the phone picks
  the mission from its last broadcast, so a tap just after the mission expired, or right behind the
  phone's own Stop, named a mission that had ended, and the desktop set it active again with nothing
  running: hidden on the desktop, never expiring (the expiry check follows the running mission),
  shown as running on the phone, and saved across a restart. It is now refused like the full Reset:
  nothing changes. A plain Reset still writes no log line, accepted or refused (unchanged).
- **+/- for a mission that is not running** is refused too. The desktop already ignored it, but the
  log wrote "⏱️ Mission time adjusted (+5m)" for nothing; now neither moves.
- The same stale card's whining toggle and task taps were left out here; they are refused since
  2026-10-06 ("Phone mission buttons: a stale whining toggle or task tap is refused").
- **A ceiling for +/-.** A run may last at most its length when it started (or was last fully reset;
  `baseDurationMins`, stored on the run, so a Settings save during it does not move the ceiling) +
  60 min (`MAX_MISSION_EXTENSION_MINS`, `store/missionEndAdjust.ts`), compared in whole seconds (the
  10 s test window's float tail stopped a 10 s evening at 00:00 one press short). A press past it is
  refused whole, not clamped; the phone's countdown just does not move. Shortening is always allowed
  (a run saved longer before this change can still be shortened). Refused too, with no line: a press
  that changes nothing (−5 at the 1-minute floor) and a minus press that would lengthen a run
  shorter than the floor (−1 on the 10 s test run used to make it a minute). The line names the move
  that really happened: −10 on a 5-min run is "(-4m)", a move of less than a whole minute is named in
  seconds ("(-10s)"). Why "own length + 60": it is measured from the run, so the reducer stays pure
  (no clock) and a run started by hand outside its window gets the same room as one the scheduler
  started; it gives the 10-second test duration a sane ceiling where a multiple of the length would
  not; and an hour is six presses of the phone's +10. A full Reset restarts at the window's length,
  so the hour is available again. The phone's +1e9 (finite, so the payload validator lets it through)
  used to make a mission that never ended. The same rule covers the overlay's +5 bar hold.
- One predicate for each refusal, asked by the reducer and the log alike: `isStaleMissionAction`
  (which mission) and `adjustedMissionEnd` (how far, and the line). The phone app needs no change.
- Tests: new cases in `store/__tests__/mcReducer.stale-mission-action.test.ts` (plain Reset and +/-
  with nothing running, for the other mission, for a mission stuck active; the predicate per action
  type), `hooks/useMissionScheduler.stale-phone.test.tsx` (over the real remote channel: a Reset after
  the evening expired, then a relaunch; a Reset right behind the phone's Stop; a +10 after it
  expired) and `store/__tests__/mcReducer.mission-end-cap.test.ts` (inside the cap, exactly at it,
  past it, refused whole, +1e9 by reducer and over the remote channel, the 1-minute floor, a run saved
  over the cap, the 10-second duration, a full Reset, a relaunch at the cap, and both files asking the
  one decision), plus in review round 1: the 10 s evening at 00:00 (+5 ×12) and 00:05 (+10 ×6), the
  refused lengthening minus, the real move in the line (−4m, −9m, −10s), a Settings save mid-run in
  both directions, a run saved before the base length existed, and a burst (the expiry tick and a
  phone +10 before one render) that writes no line. The old case "does not cover the plain
  RESET_MISSION" pinned the bug and was turned round. Red before the fix: 8 stale-action, 3 phone and
  10 cap cases; in review round 1, 10 cap cases.

### 2026-10-05 A mission time or run length repaired at startup says so in the log

- **The bug.** A profile saved by v0.0.42 with a cleared "Auto-trigger at" field holds `''`, and a
  NaN duration saves as `null`. Load resets either to the default (06:00 / 19:00, 30 / 60 min) so
  the mission runs at all, and gives a mission saved running with no readable duration its window's
  length, which decides when the child's run ends. Both silently: the child's evening could move to
  19:00 with no line and no attribution (CLAUDE.md → Attribution).
- **Now** the repairs still happen in hydration (the first screen must already have a real time,
  window and length), and just after load the log gets one line, source `system` (💻), naming
  everything they changed and why: "🔧 Mission settings repaired at startup: the evening start time
  was empty, reset to 19:00" (or "could not be read" for any other unreadable time, "was not a real
  length" for a duration of 0, a negative one or a day or more, "could not be read" for a `null`
  duration, "the running evening mission had no length, set to its window's 60 min"). What changed
  is read from the repairs' own before and after, not from a second copy of their rules. The line
  reaches the audit trail, like the game-token settle's. A field absent from an older blob is a
  plain default, not a repair, and gets no line; a relaunch after the repair was saved writes no
  second line. It is written while the shield is broken too: it records a repair, not an action the
  lock refuses.
- Tests: `store/missionTimeRepair.test.tsx` (the line in the app and in the audit trail, several
  fields in one line, a running mission with no length, StrictMode with the once-only guard proven
  by a spy, three profiles with nothing to repair, a relaunch, a broken shield, which saved values
  count as empty, unreadable or unreal, and garbage in every settings key reporting exactly what the
  sanitizer changed). Red before the fix: the 6 launch cases with something to repair; in review
  round 1, the running-mission case and the once-only guard by mutation (dropping each).

### 2026-10-06 A refresh that cannot reach Google keeps the calendar on screen

- **Bug** (found by the review of PR 192; not reported from use). The Calendar re-reads the visible
  month every 5 minutes with the forgiving `data:events` read, which turned every calendar that
  failed into an empty list. Offline, or with Google answering 5xx or a rate limit, the answer was
  the statutory holidays alone, as a success: the window cached that month and the family's events
  disappeared, with no error, until a later refresh worked. `getTasks` emptied the task list the
  same way. The 2026-10-04 entry listed this under "Not changed".
- **Now.**
  - `electron/google-unreachable.ts` (`isGoogleUnreachable`) tells "Google could not answer now"
    from "Google refused": no HTTP answer (a gaxios error without a response: DNS, a reset or
    refused connection, TLS, a timeout or an abort, which carries no code), HTTP 408, 429 or 5xx,
    and a 403 whose reason is `rateLimitExceeded`, `userRateLimitExceeded`, `dailyLimitExceeded` or
    `quotaExceeded` are unreachable; any other status is a refusal; an error that is not a request
    (signed out under the read: "No refresh token is set.", a retired client) is handled as before.
  - The forgiving events read fails when any one calendar is unreachable and still skips a
    calendar Google refuses, with a warning. Signed out still answers []; `invalid_grant` (a 400 from
    the token endpoint) is skipped as before while `auth-client.ts` signs out. The strict read (the
    School Bag) is unchanged: every failure throws. The calendar colours failing alone does not fail
    the read. `getTasks` follows the same rule; the Dashboard already kept its tasks on a failed read.
  - `useCalendarData` already kept a month's events when its read failed; it now records when each
    month last loaded and returns `failure` (`stale` with that time, or `unloaded`) instead of an
    error string. The header's red "Failed to load calendar events." is replaced by
    `CalendarReadNotice` on the status line under the date: "Calendar not updated since 14:05" in
    amber (amber-700, dark amber-400) over events from an earlier read, with the date when it was
    another day, and "Couldn't load the calendar" in red (red-600, dark red-400) when nothing read
    covers the days on screen, each with a tooltip. No new timer, interval or animation.
  - A month never loaded, whose read failed, shows the events already on screen only if their read
    covered every day drawn (`covers` in `useCalendarData.ts`), with that read's time; otherwise an
    empty grid and the red notice. A new sign-in remounts the Dashboard (`CalendarApp` keys it).
- **Review round 1 (PR 194).** The notice sat in the header's right-hand group: at 1280x720 (the
  owner's 1920x1080 at 150 %) the header grew from 77 to 109 px and the date, "Current Week" and
  "Command Center" wrapped. It now sits under the date, absolutely positioned: no width or height
  added. Red "Couldn't load events" sat over the previous month's events (offline at midnight into
  a new month, or Next Week / Next Month into one): now the coverage rule above. A reconnect as
  another account while offline kept the previous account's events and tasks under "not updated
  since": now the remount. Light-mode contrast was 3.2:1 (amber-600) and 3.8:1 (red-500) on white,
  now 5.0:1 and 4.8:1; the text names its subject, since a finger cannot open the tooltip; the
  `role="status"` element is always mounted, so the text is announced. The rule is in CLAUDE.md
  (Architecture → Google unreachable is a failure, not nothing), with a structural guard on every
  catch in `ApiService` and a rule-registry entry. The holiday log line goes through
  `errorSummary`.
- **Review round 2 (PR 194).** A reconnect read the settings three times and the tasks and weather
  twice: the Dashboard's own `auth:success` reload ran beside the remount, and is removed (one read
  each, `CalendarApp.reconnect.test.tsx`; the Dashboard-level reload tests use Save). The real-chain
  test no longer depends on `NO_PROXY` / `no_proxy` (with Google listed there, its dummy refresh
  would have reached Google). The coverage rule's lower bound is pinned by a test. QA 3.12.5 no
  longer asks for a Reconnect while offline, which cannot succeed.
  - Holidays are deliberately not part of the failure. A year once read is kept for the session, so
    holidays already shown cannot vanish; failing the whole read while the holiday service is down
    would freeze the family's Google events, or blank the calendar at launch, for a third-party
    outage. While it is down, a year not read yet shows without its holidays.
- **Known gaps.**
  - The tasks keep what they show but have no notice.
  - All or nothing: one calendar that keeps answering 5xx, 429 or a 403 limit stops every calendar
    from refreshing while it lasts, and at launch or in a month not loaded yet the grid says
    "Couldn't load the calendar" where the other calendars used to show.
  - A plain captive portal fails TLS for Google's address and counts as unreachable (shown by a
    review probe). Only a TLS-intercepting proxy the machine trusts, answering with a 200 page that
    is not JSON, would read as no events: gaxios hands back the text and the read finds no `items`.
  - Older than this change: when Google refuses every calendar (a scope left unticked, the API
    disabled, `invalid_client`), each is skipped and the week is blank with no notice.
- Tests: `electron/google-unreachable.test.ts` (real gaxios errors from google-auth-library's
  transport: six errno codes, a timeout with no code, 408, 429, 5xx and four 403 rate-limit reasons
  unreachable; 400, 401, 403 forbidden or without a reason, 404, 410, `invalid_grant`, signed out
  under the read, a held file and non-errors refused), `electron/api_unreachable.test.ts` (offline,
  one calendar at 503, 429 and a 403 rate limit fail the read; the next read answers in full; the
  colours alone do not fail it; 404, 403 and 410 calendars skipped with the warning; signed out [];
  `invalid_grant` skipped; holidays kept through a holiday-service outage; strict unchanged; tasks:
  offline and the default list offline fail, a 404 list skipped, signed out []),
  `src/components/__tests__/Dashboard.offline.test.tsx` (the 5-minute refresh: events kept with
  "Calendar not updated since 12:00" under the date through two offline refreshes, then replaced;
  the status element there before any failure; a month first opened offline, then loaded; offline
  overnight names the day; tasks kept; midnight rolling a "today" week into November and Next Week
  into it keep October's events with its time; Next Month past October's read is empty and red),
  `useCalendarData.test.ts` (the two failure shapes, the time of the last read that worked kept
  through a second failure, a new generation offline, back to a month already read, the coverage
  boundary), `CalendarApp.reconnect.test.tsx` (account A's events and tasks gone after a reconnect
  while offline; A's read in flight cannot land), `electron/api_offline_chain.test.ts` (the real
  googleapis, GoogleOAuthClient and gaxios chain through a closed local port: an expired token's
  refresh meets ECONNREFUSED, both reads fail, no sign-out, the refresh token kept) and
  `src/__tests__/google-unreachable-boundary.test.ts` (every catch in `ApiService`). Red before the
  fix: the 7 unreachable cases in `api_unreachable` ("promise resolved instead of rejecting") and 8
  renderer cases on revert of the renderer change (the count measured in review round 2); the
  guards in those files were green. The mutations, each caught, are
  recorded in the rule registry. Existing tests that asserted "no calendar error" by its old text
  now look for the notice; the "offline" launch case in `Dashboard.loading.test.tsx` fails the
  events read, as the main process now does.

### 2026-10-06 A responsibility ➖ is logged as a ➖, and a press that changes nothing writes no line

- **The bug (QA 2026-10-01; the same in v0.0.42).** The phone's Responsibilities card sends ➕ / ➖ as
  `ADD_RESPONSIBILITY_POINT` with amount `1` / `-1`. The log ignored the amount: a ➖ wrote "Point
  earned for Recycling" while the count went down. It also wrote that line when nothing changed: a ➖
  at 0 points and a ➕ on a completed task (ignored until Claim). A parent reads the log to see who
  moved what (CLAUDE.md → Attribution).
- **Now** the line names the move that happened and the new count: "+1 point for Recycling (2/3)",
  "-1 point for Recycling (1/3)" (the task's icon and colour as before, no token delta). A press that
  changes nothing writes no line and leaves the responsibilities list as it was, so the press alone
  no longer triggers the phone broadcast that watches that list (before, every such press made a new
  list). The whole state object stays the same only for an action with no timestamp: every real
  dispatch carries one, and the mood catch-up that runs first may make a new state during active
  hours. One decision, `responsibilityPointChange` (`store/responsibilityPoint.ts`), is asked by the
  reducer and the log alike, so they cannot disagree (the `adjustedMissionEnd` pattern).
- **The phone's amount is checked.** The remote validator accepted any finite amount: `1e9` completed
  a task in one press, `0.5` left a fractional count, `0` counted as +1. Now only `1`, `-1` or no
  amount passes; anything else is dropped before the store like any malformed payload, and the
  reducer refuses it too. The desktop card sends no amount and is unchanged; the phone app needs no
  change. `ADD_RESPONSIBILITY_POINT`'s `amount` is typed `1 | -1`.
- **A ➖ on a completed task** (behaviour unchanged, written down): it takes it back below its goal,
  so Claim goes away until the point is earned again. No token moves: only Claim pays. After a Claim
  the count is 0, so a ➖ then changes nothing and the paid tokens stay.
- **Found here, fixed in review (next entry)**: Claim paid whatever the count, so a Claim tap racing a
  phone ➖ still paid. The shield lock keeps refusing a parent's ➖ too (decided, next entry).
- **Code.** `activityLog.ts` was over the 300-line limit (322). The bank and goal log cases moved,
  unchanged, to `store/bankLog.ts`; `activityLog.ts` is at 250 lines and off the file-size ratchet.
- Tests: `store/__tests__/mcReducer.responsibility-point.test.ts` (+1 and -1 lines with their counts
  and attribution, from the phone and the desktop; no line and the same state for a ➖ at 0, a ➕ on a
  completed task, an unknown task, eight amounts the phone never sends, and a broken shield; complete,
  take one back, earn it again; no token moved by a ➖; over the real remote channel (the remote
  listener and the test kit's store), eight refused amounts and the phone's ➕ and ➖; both files
  asking the one decision) and a validator case in `hooks/useRemoteControl.allowlist.test.ts`. Red
  before the fix: 26 of the new cases and the validator case; seven were green before (guards).
  Mutations, each red: the old log case (20 cases), the old reducer case (13), the old validator
  (5), and dropping each of the decision's three refusals (7, 3, 3).

### 2026-10-06 PR 195 review: a Claim pays once, only for a completed task, and its own reward

- **The bug (on `main` before this PR, two reviewers reproduced it).** The Claim button keeps its
  click handler while it fades out (about 0.3 s), and `RESET_RESPONSIBILITY` paid the action's
  `claimTokens` whatever the count. A double tap on Activity's Claim paid twice: bank 3 → 6 → 9 and
  two "Activity completed +3" lines. A Claim racing the phone's ➖ paid for a task at 2/3, and a Claim
  naming an unknown task added the tokens with no line.
- **Now (decided for the owner, reversible)** one decision, `responsibilityClaim`
  (`store/responsibilityClaim.ts`), asked by the reducer and the log: only a completed task can be
  claimed, and it pays the task's own `tokenReward` (Activity 3, Recycling none). `claimTokens` is
  gone from the action (journal 2026-09-23: a value the reducer can derive must not ride on the
  action). A refused Claim changes nothing and writes no line. In the UI, the fading Claim button
  takes no pointer (`pointerEvents: 'none'` in its exit). The phone still cannot send a Claim.
- **Decided: the shield lock keeps refusing a parent's ➖** (a point ➖ moves no token and is no way
  out of the lock); the reason is beside `LOCKED_WHILE_SHIELD_BROKEN` in `store/missionStreak.ts`.
- **Wording**: the point that meets the goal adds " — ready to claim"; a ➖ that takes a completed
  task below its goal adds " — no longer complete". `amount: null` is refused by the reducer too
  (it was read as +1 there; the validator already dropped it).
- **Guards**: the four "one decision, asked by the reducer and by the log" checks
  (`adjustedMissionEnd`, `isStaleMissionAction`, `responsibilityPointChange`, `responsibilityClaim`)
  read the files with the TypeScript parser (`store/__tests__/decisionCalls.ts`): a text match was
  satisfied by the call left in a comment. `bankLog.ts` keeps one list of its action types
  (`BANK_ACTIONS`, `isBankAction`); `LogEnvelope` moved to `store/logEnvelope.ts`.
- Tests: `store/__tests__/mcReducer.responsibility-claim.test.ts` (Activity pays 3, Recycling 0; the
  task's reward, not a stale build's `claimTokens: 99`; a second Claim, a task below its goal, an
  unknown task and a broken shield refused with no line; a ➖ then a Claim; a Claim then a ➖; two full
  cycles pay twice) and `components/ResponsibilityPanel.claim.test.tsx` with the real framer-motion
  (a tap on the fading button, two taps before a re-render, the fading button's pointer-events).
  Existing Claim fixtures now complete the task first (the streak-lock, purity and attribution
  fixtures complete Activity, the only state that shows Claim). Red before the fix: the double tap
  paid 9, a Claim on an incomplete or unknown task was not refused, the reward came from the action
  (and the panel's fading button had no pointer-events rule). Mutations, each red:
  drop the completion check (7 cases, both panel taps included), pay 0 (7), drop the exit's
  pointer-events (1), read `null` as +1 (1), drop the wording (4); each structural check goes red with
  the call removed and with the call only in a comment (8 of 8 both ways; the old text match stayed
  green on the comment).

### 2026-10-06 Back from Mission Control, the Calendar shows the week it left

- **The bug** (found by the review of PR 194; older than it). `App.tsx` swaps the two views, so
  every switch to Mission Control unmounted the Calendar and threw away the events it had read,
  their load time, the tasks and the weather. Every return (by hand, or the auto-return after its idle
  timeout, 5 minutes by default, many times a day on the family screen) showed "Loading..." and then the full-screen
  "Syncing with Google..." until the first answer. Offline, the week came back empty under red
  "Couldn't load the calendar" (since PR 194; before it, silently empty), and the weather pill and
  the tasks count were gone until a read worked.
- **Now** the return draws the last week at once, on the current week, with its tasks and weather,
  and the same load as a launch reads the settings, the month, the tasks and the weather again in
  the background: "Refreshing..." in the header, one events request. Offline the events stay with
  "Calendar not updated since HH:mm", the time of the last read that worked, and the tasks and
  weather stay. A month never read (midnight at a month's end while away) shows the events kept
  only where their read covers every day drawn, as in the 2026-10-06 refresh entry above.
- **Design.** A small owner above the view switch, `CalendarSessionProvider`
  (`src/features/calendar-session/`), keeps what the last Dashboard showed: the settings, tasks and
  weather (`useDashboardLoad`) and the per-month events with their load times and the events on
  screen (`useCalendarData`). The Calendar still unmounts on the Mission Control view, so none of
  its listeners or timers run there. A Dashboard takes a ticket when it mounts: it starts from what
  is kept and writes back when its own state changes. While the session holds a week, CalendarApp
  shows it while `auth:check` confirms the sign-in, instead of the "Loading..." screen. Generation 0
  (the settings not read yet) now reads no events but shows the visible month's kept ones.
- **One sign-in.** A sign-in or a sign-out empties the session and stops every Dashboard mounted
  before it from writing to it, so nothing read for one account reaches the next. The provider
  hears `auth:success` and `auth:signed-out` itself (on the Mission Control view no Calendar is
  mounted to hear them: a Reconnect finished in the browser lands there); CalendarApp empties it on
  every sign-out it finds (`auth:check`, Google's sign-out, Settings) and before the sign-in
  remount. Memory only: a relaunch starts with the spinner.
- **Performance.** No timer, no interval, no animation, no read while Mission Control is shown; the
  writes are object assignments from effects (no re-render, no store write). The timer registry is
  unchanged. `CalendarSessionProvider` joins the always-mounted list in CLAUDE.md.
- Tests: `src/App.returnToCalendar.test.tsx` (the real App with Mission Control's screen stubbed:
  the week, its tasks and the header's "Background Refreshing..." at once and one events request,
  nothing read for the Calendar while away; the current week with its own month's events after
  leaving on December's month view; offline, the events with "not updated since 12:00" and the
  tasks; midnight into November while away, November asked for and offline October's coverage; a
  relaunch shows the spinner; a sign-in and a sign-out on the Mission Control view, and an answer
  for the account before a sign-in, leave nothing of it), `calendarSession.test.tsx` (keep, the
  stale ticket refused, the provider's two listeners and their removal),
  `CalendarApp.session.test.tsx` (the kept week at once with one `auth:check`; four sign-outs and
  the sign-in remount empty it) and a generation-0 case in `useCalendarData.test.ts`. Red before the
  fix: 4 App cases ("Unable to find event-card-standup" and the grid) and the generation-0 case; the
  sign-in cases were green guards. Mutations, each reverted and each red: listed in the rule
  registry, plus the warm load shown in the foreground, the visible month left null before the
  settings, and either part of the session not kept. No existing test changed.
- **Known gaps.** A sign-out that comes without an event and is found only by `auth:check` on the
  return shows the kept week (same account) until the check answers, then Sign in. An events answer
  still in flight when the Calendar unmounts is dropped; the return asks again.
- **Review round 1 (PR 196).**
  - The hooks are pinned to write only through the ticket they took at mount (an answer landing
    after a sign-in or sign-out is not kept, through the real hooks), and a launch loads once.
  - The kept settings are tested: the return draws with the saved week start from its first frame,
    also right after a Save.
  - A sign-in that lands after the return's first render and before CalendarApp subscribes (the
    auto-return renders from a timer) was missed by CalendarApp: its Dashboard kept the emptied
    week. CalendarApp now compares the session's count of sign-ins and sign-outs at its first render
    with the count when it subscribes, and starts over if they differ.
  - Settings → Reconnect's `auth:logout` sends no event: a browser sign-in that then failed while
    Mission Control was on screen left the week kept, drawn on a signed-out app until `auth:check`
    answered. Reconnect now empties the session when it signs out.
  - The status text ("Refreshing...", "Fetching Events...", "Loading Settings...") was in the
    header's flow: on every return and every 5-minute refresh the header grew by 15 px and the grid
    moved down, then back up. It is now absolutely positioned under the date, just under the progress
    bar (the notice's slot overlaps the bar, which is hidden whenever the notice shows; the status
    text and the notice never show together). Older than this PR for the
    5-minute refresh.
  - The session keeps only the settings fields the Calendar draws with (`calendarSettings`): the
    `settings:get` answer also carries the phone pairing, which no long-lived copy may hold.
  - The account boundary has its own rule in CLAUDE.md and the rule registry. The shared types moved
    into the session module (a type-only import cycle). CalendarApp's own forget on `auth:success`
    is gone: the provider hears it, and before any render.
  - Tests: the sign-in cases moved to `App.returnToCalendar.signIn.test.tsx`, with a new Reconnect
    case; the App suites share `src/viewSwitchTestKit.ts` (registered in `test-kit-boundary`).
    `sessionHooks.test.tsx` (an answer or tasks landing after a forget, through the real hooks; a
    launch reads the settings, the month, the tasks and the weather once each, with the tasks and
    weather answering after the month). New cases: the saved week start on the return's first frame
    and after a Save, the status text out of the header's flow, StrictMode, the sign-in landing
    before CalendarApp subscribes, the pairing kept by value. Each fix red without it (the mutations
    are in the rule registry: "The Calendar's session belongs to one sign-in").
- **Review round 2 (PR 196).**
  - The kept settings are a typed per-field map (`KEPT_SETTINGS`, `satisfies Record<keyof
    UserConfig, boolean>`, as `SETTINGS_FIELDS` in `electron/settings-dialog.ts`): a new UserConfig
    field is a tsc error until someone decides keep or drop. The by-value test pins all 8 kept fields.
  - The refresh icon was added to the header's right-hand group while a read ran and removed after:
    the date slid 16 px and the weather and tasks pills about 32 px, then back, on every return and
    every 5-minute refresh (older than this PR; the old return spinner hid it). The icon is now always
    rendered, `invisible` with no title and no animation class when idle (a `div`, no click target).
    Test: `Dashboard.loading.test.tsx`, the icon in both states (red with the icon removed when idle,
    spinning when idle, or visible when idle; spinning when idle also turns the idle-Calendar
    animation guard red).

### 2026-10-06 Phone mission buttons: a stale whining toggle or task tap is refused

- **The bug** (the known gap left by PR 193). The phone shows "Whining?" and the task checklist on
  the card its last broadcast called active, so a tap can name a mission that has just been stopped
  or has expired. `TOGGLE_WHINING` flips the flag of the mission it names and moves the mood gauge by
  `nowDetected ? -10 : 2`. The phone's Stop clears the flag, so an un-mark tapped right behind it
  read the flag as off and marked it: −10 on the gauge where the un-mark gives +2, and the ended
  evening saved as "Whining". `COMPLETE_TASK` ticked or unticked a task of the ended mission; a Cream
  tick right behind the Stop counted a second application (the Stop clears the tick, not the day
  count), an untick after an expiry handed a day back.
- **Now** both are refused like the Stop, the Resets and +/-: through `isStaleMissionAction`, by the
  reducer and the log alike, for the phone and the desktop. Nothing changes and no line is written
  (neither action has ever written one). The decision (taken for the owner, reversible) rests on a
  sender audit: the desktop shows the task cards and "Whining?" only in the running mission's
  overlay, the scheduler sends neither, and the phone draws both only on an active card; so no
  legitimate tap names a mission that is not running. The one desktop window was a card still on
  screen while the overlay slides away: `TaskCard` now asks the same predicate first, so a refused
  tap shows no "done" flash. It asks with the last rendered state: a tap landing after a Stop but
  before the next render (a few ms) can still flash, while the reducer refuses the tick either way.
  The global whining flag (phase none) names no mission and is untouched.
- Tests: `store/__tests__/mcReducer.stale-whining-task.test.ts` (the running mission still takes
  both, by the overlay and the phone; refused with nothing running, for the other mission and for a
  mission stuck active, both origins; an un-mark and a Cream tap right behind the Stop, a tap after an
  expiry, a tap naming the previous mission while the next runs; the global flag still toggles), two
  predicate cases in `mcReducer.stale-mission-action.test.ts`, two cases over the real remote channel
  in `hooks/useMissionScheduler.stale-phone.test.tsx`, and `components/TaskCard/TaskCard.test.tsx`
  (no flash for a tap after its mission ended and the card re-rendered). Fixtures that ticked tasks with nothing running
  (`mcReducer.mission-tasks.test.ts`, the Cream cases in `mcReducer.settings.test.ts`) now start the
  mission first. Red before the fix: 15 cases; the mutations are in the rule registry ("Only the
  phone stops a mission").

### 2026-10-06 A relaunch or a wake after midnight starts last night's open window, and a window missed unseen is logged once

- **The bug** (the known limit PR 193 wrote; found by its review). An evening at 23:30 for 60 min is
  open until 00:30. A late timer at 00:10 started it, but a relaunch at 00:10, or the re-arm after the
  machine woke at 00:10, aimed at the next 23:30: last night's evening never started and nothing was
  logged. The scheduler placed the start time on today's date itself, and "today's" 23:30 was still
  ahead. Second half: the scheduler's rule is that its actions are never silent ("A skipped mission
  must be visible to a parent, not only in the dev console — scheduler actions are never silent",
  `useMissionScheduler.ts`; the 2026-08-25 entry: "A genuinely missed window writes a `⏭️ mission
  skipped` log entry"). But the line came only from a timer that fired late. A relaunch after a window
  passed with the app closed, or a wake whose re-arm ran before the stale timer (it clears that timer),
  passed over the window in silence: the parent never learned the morning was missed (open question
  Q5 in the release QA plan).
- **Now** one decision answers "which occurrence is open now", `openOccurrence` in the new
  `store/missionOccurrence.ts`, built on the same occurrences as its siblings: the scheduler's arm
  (launch, wake, a mission ending, a Settings save) asks `lastClosedOccurrence`, `openOccurrence` and
  `nextOccurrence`, its fire `hasClosed` (on time while the target's window is open, else skipped),
  the hand-start rule `occurrenceOn`, and the dating of a run saved before the stored day existed
  `openOccurrence` (both in `occurrenceDay.ts`). Examples, an evening at 23:30 for 60 min that ran the
  night before: relaunch or wake at 00:10 → it starts, dated the evening before; at 00:40 → it does
  not start, one "⏭️ Evening mission skipped — the 23:30 window was missed (app closed or machine
  asleep)"; relaunched again at 01:30 or 09:00 → no second line. The morning at 06:00–06:30, which
  ran on an earlier day, with the app closed until 07:00 → one line at 07:00, none at 09:00. A late
  start runs its full duration from the start, as before (open product question, follow-up item 39).
- **The window** lasts as long as a run started then, in real time, as the run's expiry and its due
  end measure it: the night the clocks spring forward (America/Vancouver, 2026-03-08), an evening at
  23:30 for 4 h is open until 04:30, not 03:30 as the wall clock ('27:30') said; the night they fall
  back, 23:30 for 3 h ends at the second 01:30, not 02:30. A window shorter than 5 min (the 10-second
  test step) stays open 5 min, the late-start tolerance a timer already had: the 10 s evening at
  23:58 relaunched at 00:02 starts, dated the evening before; at 00:05 it gets the line.
- **The line** (hand-built as before, `source: scheduler`; it logs no action the shield lock
  refuses, so it needs no lock re-check; its words now end "(app closed or machine asleep)") is
  written once per occurrence, by a launch, the re-arm after a wake or the late timer, never by a
  re-arm for a change to the missions: its id names the occurrence (`mission-skipped-<phase>-<day>`),
  a launch skips one already in the log, and the scheduler remembers each line it wrote or found
  while it runs, so a line that has not reached the state yet (or never does), or one the parent
  CLEARed, is not reported again. Only the most recent window per mission, and only with evidence
  the app was there to run it: the mission ran before that window, or the window began while the app
  was open. A profile on which the mission never ran gets no line at launch (a fresh install, every
  throwaway E2E profile). When a window was missed and the next one is open (closed a whole day,
  relaunched at 19:10), the line comes first and the evening starts a second later. A window another
  mission ran through gets its line at the next launch or wake, not when that run ends.
- **The shield** is not charged for a skip, as before (only a run that expired with tasks unfinished
  is a miss, 2026-09-27), and a skip records no outcome date, so a skipped morning keeps the
  quick-game window shut until the parent starts it with ▶ Start. Unchanged: a stop, a completion or a
  timeout still makes its occurrence handled; a cleared start time arms nothing and logs nothing.
- **Performance.** No new timer: the scheduler keeps its one setTimeout per mission. A window to
  report is armed at 0 ms and goes through the same fire as a late timer; then the 1 s re-arm aims at
  the open or next occurrence. `idle-performance.test.tsx` now also checks that after the line
  nothing is armed for 10 s, even when the line never reaches the state.
- **Known limits.** "Once" is checked against the activity log at a launch: after a CLEAR, or 200
  newer lines, a relaunch before that mission's next window closes writes it once more (a wake in the
  same session does not). Kept on purpose: the exposure is under a day and needs a CLEAR, while a
  persisted marker is a new saved field, hydrated, kept off the phone broadcast and written by a new
  action. A Settings save that moves a start time to a time already passed today writes nothing; if
  today's mission has not concluded, the next launch or wake that day reports that window. One line
  per mission per day (the id names the day, not the window): a second missed window of the same
  mission that day gets no line of its own. A weekend away gives one line per mission, not one per
  missed day. The first two are pinned as KNOWN LIMIT cases.
- **Review round 2 (PR 198).**
  - A launch's look-back belonged to one effect run, so a change to the missions before its 0 ms
    report fired cancelled the report for good. Real trigger: the stuck-run cleanup at load
    (`useStaleMissionRunEnd`, a layout effect) ended an earlier day's run and the launch wrote no line
    for a window missed while closed (round 1 had written it). The same shape: a sleep with no wake
    event (Modern Standby) and then a Settings save or a phone action before the stale timer fired.
    The scheduler now keeps, per mission, the wake token of its last arm and what that arm's timer
    aims at (cleared when it fires); an arm looks back at a launch, a new wake token, or when that
    timer was cancelled after its window closed. No new timer. Tests in
    `useMissionScheduler.skipped-once.test.tsx`: the stuck run at launch (through the real
    `useStaleMissionRunEnd`), a Settings save right after a launch, a sleep with no wake event then a
    save, and a window another mission ran through (no line at the run's end, one at the next wake);
    the first three red against the round-1 scheduler. Each clause of the look-back is red on its own
    when removed (the cancelled-timer clause 4 cases, the wake clause 1, looking back at every re-arm 2).
  - QA 3.12.12 offered "run it on an earlier day", which can show today's regular window's line
    instead of the window under test (one line per mission per day). It now asks the tester to check
    the log first and seeds the history after the regular window; 3.12.3 the same check.
  - The structural guard pins the exact moves of each allowed file, so a mission-time sum inside one
    of them fails, and it now also sees hours in milliseconds added to a midnight.
- Tests: `hooks/useMissionScheduler.open-occurrence.test.tsx` (relaunch and wake at 00:10 start last
  night's evening and date it so; finished at 23:55 or at 00:05, or stopped at 23:50, it is not
  restarted; a cleared start time does nothing), `hooks/useMissionScheduler.skipped-window.test.tsx`
  (one line at 00:40 with no shield and no outcome, none on two more relaunches, the morning at
  07:00 and 09:00, a whole day closed, a run that finished, a fresh profile, a slept-through window
  with the wake before the stale timer, the stale timer before the wake, a wake then a relaunch, the
  10 s evening at 00:02 and 00:05), `hooks/useMissionScheduler.skipped-once.test.tsx` (review
  round 1, below), `hooks/useMissionScheduler.dst.test.tsx` (both DST nights, its own TZ),
  `store/__tests__/missionOccurrence.test.ts` (the decision, and the hand-start rule agreeing with it
  inside every open window), the structural `src/__tests__/occurrence-arithmetic-boundary.test.ts`
  (only `missionOccurrence.ts` puts a mission's time on a date; against the code before this change
  it names 7 sites, the scheduler's 2 and `occurrenceDay.ts`'s 5), a case in
  `idle-performance.test.tsx` and two in `src/__tests__/e2e-mission-clock.test.ts`. Red against the
  scheduler before the fix: 20 behavioural cases and the boundary case; the mutations, each red and
  reverted, are in the rule registry ("Mission occurrences"). No existing assertion changed (one
  stale comment in `useMissionScheduler.overnight.test.tsx`).
- **Review round 1 (PR 198).**
  - The E2E launch helper (`e2e/helpers/missionClock.ts`) quieted a launch by marking today's
    missions as concluded. After midnight the open window is last night's, which today's dates do not
    cover: `mc-layout-fit.spec.ts` sets the evening to 23:59, so run between 00:00 and 00:59 the
    evening started, "Use!" was disabled and the spec failed for an hour every night; the
    real-profile specs the same on a dev profile whose evening runs past midnight. The quiet blob now
    also stamps every mission's `lastActiveAt` with the launch instant; the real-profile restore puts
    each mission's own stamp back. Two unit cases in `e2e-mission-clock.test.ts` (no E2E run).
  - The line came back too easily: after a CLEAR, any re-arm in a later session (a Settings save, a
    task tap, a mission starting) wrote it again, and a Settings save that moved a start time into
    the past wrote it at once. Now only a launch, the re-arm after a wake or the late timer reports a
    missed window, and the scheduler remembers each line it wrote or found in the log. Which re-arm
    looks back is decided by what changed since the last arm: none yet (a launch), a new wake token,
    or the same missions (StrictMode's second mount run); a change to the missions alone does not.
  - The words are now "(app closed or machine asleep)" (decided by the coordinator, reversible).
  - The structural guard reads the syntax tree (comments and strings no longer match or hide code)
    and sees more shapes; the date sums of the School Bag, the mood gauge, skill progress and the
    quiz look-back are allowed by name with the reason, and the claim is now "a mission's time".
  - QA 3.12.3 and 3.12.12 told the tester to expect a line where none is written by design (a run
    finished or expired today makes today's windows of that mission count as done); they now say
    to stop that run from the phone first, and when not to expect a line.
  - The behaviour of a late start (it runs its full duration) is now stated plainly, with the open
    product question.

### 2026-10-07 A mission finished after its timeout was logged pays nothing

- **The bug** (found by the PR 197 review). When a mission's timer runs out with a task left, the
  overlay's own timer logs the timeout at once (`MARK_MISSION_TIMEOUT`: a miss, one shield segment,
  −20 on the mood gauge), but the run stays on screen until the scheduler's next 15 s tick ends it. A
  task finished in that gap, on the desktop or from the phone's checklist, made every task done, and
  the overlay's auto-collect sent `COMPLETE_MISSION_ROUTINE`: the run already charged a miss was also
  paid as completed, bank +2 (+1 with whining), +25 on the gauge (none with whining) and the shield
  segment given back,
  with "🎉 Morning mission completed" in the log. The paths: the overlay's auto-collect effect
  (`MissionOverlay.tsx`, the run's end is already past, so it collects at once), the expiry callback
  of its timer (`MissionTimerDisplay` → `autoCollect`, when every task is done at the end) and the
  "Collect N Bonus Stars!" button under "Mission Complete!". The phone cannot send a completion
  (`COMPLETE_MISSION_ROUTINE` is not on `REMOTE_ALLOWED_ACTIONS`); its task ticks reach the same
  auto-collect. The same happened on a relaunch with such a run saved.
- **Now** (decided by the owner, 2026-10-07: "Refuse the payout once the timeout is logged") a
  completion of a run whose timeout is logged is refused, by the reducer and the log alike, through
  one decision, `completableRun` in `store/missionCompletion.ts` (the `adjustedMissionEnd` pattern):
  no bonus, no shield back, no gauge move, no completion line. The overlay asks the same decision
  before it counts the mission as done, so it shows no "Mission Complete!", no bonus stars and no
  Collect button for it, and its auto-collect never fires. The run then ends at the scheduler's tick
  as "🕐 Morning mission expired", with the miss kept.
- **Task taps after the timeout are still accepted** (decided for the owner, reversible): a tick is
  a record, not a payment, and pays nothing now. Each tick lands with its card's "done" flash, and a
  Cream tick still counts the application (`creamTaskDaysLeft`), which the treatment count needs. The
  run simply ends as expired.
- **Unchanged.** A run finished before its timeout pays and gives one shield back as before, so a
  completed mission is still the way out of a broken shield (`COMPLETE_MISSION_ROUTINE` stays off
  the locked set; this refusal is not a lock). At the sixth miss, a late finish does not unlock it.
  A plain "↺ Reset" grants no time and keeps the stamp, so a run reset after its timeout is still not
  paid. A full Reset (2 s hold, or the phone's) is a fresh attempt (decided 2026-09-03) and clears the
  stamp, so its finish pays and gives back the segment the miss took. The next occurrence starts
  fresh and pays normally.
- Tests: `store/__tests__/mcReducer.completion-after-timeout.test.ts` (in time: paid, and the way
  out of a broken shield; after the logged timeout: refused by the reducer and the log for the
  auto-collect, the Collect button and a remote-shaped dispatch, ended as expired, at the sixth miss,
  after a plain Reset, after the phone's ticks with a Cream tick counted; a relaunch, the next
  occurrence and a full Reset; both structural cases) and `components/MissionOverlay.late-finish.test.tsx`
  (finished in time: auto-collected at the end; ticked after the logged timeout on the desktop and
  from the phone: no payout, no line, no "Mission Complete!", no Collect button; a relaunch on such a
  saved run). 17 cases red before the fix; the mutations are in the rule registry.
