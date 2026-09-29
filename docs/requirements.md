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
- **Settings**:
  - **Active Hours**: Configurable Start and End times (0-23h).
  - **Calendars**: Toggle visibility of specific Google Calendars.
  - **Task Lists**: Toggle visibility of specific Task Lists.
  - **Auto-Refresh**: Data refreshes every 5 minutes.
- **Remote Control (Mission Control)**:
  - **Secure Bridge**: Established via Supabase Realtime (Broadcast) and Electron IPC.
  - **Main Process Isolation**: All Supabase connections and key validations are restricted to the Main process.
  - **Shared Secret Pairing**: Uses a 20-character secret key and unique Room ID for secure mobile pairing. The key never travels on the channel, because anyone who knows the room id can join it; it is only used to sign.
  - **Signed messages (remote protocol v2, 2026-09-28)**: every message in both directions (the phone's actions and its sync request, the desktop's state updates) is `{ v: 2, body, sig }`: `body` is a JSON string and `sig` an HMAC-SHA256 of the event name and the body, keyed with the pairing key (`electron/remote-auth.ts`). The desktop checks the signature before anything else, then requires a message id and a timestamp within 60 seconds of its own clock, then drops a message id it has already seen. A v1 message (the key in plain text) is refused even when the key is right, with the log line "Rejected unsigned action (protocol v1). A phone still in legacy mode sends one per connect; if its buttons do nothing, reload the phone app." (during the rollout an updated phone in legacy mode sends one such sync request per connect, by design). The room id is logged as an 8-character prefix only.
  - **Integrity, not confidentiality**: v2 stops anyone without the key from sending actions; it does not hide the state. Anyone who knows the room id can still read every state-update: the last 20 activity-log lines, the missions and their tasks, privileges and token counts.
  - **The main process owns the pairing**: `settings:save` keeps the stored room id, key and `remotePairingVersion` and ignores whatever the renderer sends for them, so a settings screen opened before a renewal cannot write the old key back. A room id or key in `config.json` that is not a non-empty string reads as absent, and a fresh pairing is generated.
  - **QR Code Pairing**: Displayed in Settings for easy mobile connection. The URL is `https://mc-remote.vercel.app/#room=<roomId>&key=<key>&v=2`: the pairing data rides in the URL fragment, which a browser never sends to the server, so the key stays out of the host's request logs. `v=2` tells the phone to speak only the signed protocol.
  - **Rollout of v2**: the v2 desktop works only with an `mc-remote` build that speaks protocol v2. The phone app deploys first (it works with a v1 or a v2 desktop), then the desktop release. **The first start of the v2 desktop renews the pairing by itself, once** (a pairing without `remotePairingVersion: 2` gets a new room id and key before the renderer can read it, and the log says "Pairing renewed for signed messages (protocol v2): scan the QR code again on the phone."), because the old key was sent in plain text for months and a signature keyed with it proves nothing. **The phone must re-scan the QR code after the update**; until then it is in the old room and does nothing.
  - **Remote Actions**: Supports triggering game tokens, adjusting mission timers, and firing special animations (Fireworks, Confetti).
  - **Only the phone can stop a mission (decided 2026-09-24)**: the phone's Stop sends `CANCEL_MISSION`, which stays on `REMOTE_ALLOWED_ACTIONS`. The desktop has no stop gesture: "— Minimize" only minimizes, a short tap and a long hold alike, because a stop sticks for the rest of the window without moving the shield, so a hold let the child end a mission. "↺ Reset" and its 2 s hold are unchanged (not decided yet). One desktop path still ends a mission: saving a new start time for the **running** mission in MC Settings ends it (no miss, the shield does not move). That is kept, and logged as "⏹️ Morning/Evening mission ended: its start time was changed in Settings", attributed 👤 (open decision for Nathan, PR 170; it used to be silent).
  - **A Stop or a full Reset for a mission that is not running is refused (2026-09-28)**: a phone Stop naming the other phase (a stale second tap) or a Reset hold that fires after its mission ended changes nothing and writes no log line. The phone's plain Reset (tasks only) is unchanged.
  - **Shield −1 / +1 buttons (shipped in mc-remote 2026-09-28)**: the phone's Shield card has "−1 shield" and "+1 shield". They send `ADJUST_SHIELD` with `delta: -1` / `delta: 1`, which the desktop accepts (allowlist, validator, reducer). Details under Mission Streak Shield → Parent-adjustable shields.
  - **Sync & Identification**: Immediate state synchronization upon remote connection; remote-initiated actions are visually identified in the Activity Log with a 📱 emoji.
  - **Global Listener**: The remote action listener is registered globally in the application shell. This guarantees that remote commands are processed continuously, even when viewing the calendar or when the mission overlay is active.
  - **Detailed Mission State Reflection**: The remote control displays individual card views for both Morning and Evening missions simultaneously. Each card reflects its current state (Active/Inactive), live countdown timers, adjustment buttons, task checklist progress (percentage bar and expandable/collapsible checkbox list), and whining status (highlighted pulsing indicator).
- **Mission Control Responsibilities & Privileges**:
  - **Responsibility Progress**: Point-based tracking using visual point dots (no text counters). Shows Done status and a "Claim" button once the target point goal is met.
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
      - **Proactive Shapes Generator**: Under the board, 3 active shapes are dealt as one coherent hand rather than three independent draws, so the child is given a set that can actually be played out. Every dealt shape is guaranteed to have a valid placement **in the exact orientation it is dealt, at the moment it is dealt**. When the bank (or the rescue slot) is emptied while a line is exploding — by the drop that completed it, or by a later drop during the explosion — the emptied slots stay empty and are dealt when the clear resolves, after its obstacles have landed, so the new hand fits the board the child is actually left with. The rescue slot's Refresh is unavailable while the slot waits, so it cannot deal ahead of that. What the promise does not cover: shapes already in the bank before a clear resolves can still lose their space to the obstacles it adds (the level's asteroids and satellite, and the two asteroids a cleared electricity cell throws). The deal runs in four steps:
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
  - The scheduler starts each window's mission **once per occurrence**. It leaves an occurrence alone once it ended today (completed or failed), or once the mission **ran at any point since the window's start time**: it is running now, or it started or ended at or after that time, whoever started it (the scheduler, ▶ Start, or the phone).
  - **A stopped mission stays stopped for the rest of its window (fixed 2026-09-22)**. A stop (the phone's Stop, the only stop control since 2026-09-24; a settings save that moves the running mission's start time also ends it, logged) is not a miss (the shield does not move) and not a conclusion (a stopped morning does not open the quick-game window). It still counts as the occurrence having run, so the scheduler does not start it again, including after a relaunch inside the same window. This holds for a mission started by hand *before* its window, still running when the window opens, and stopped inside it (closed 2026-09-23). ▶ Start and the phone's Start still start it by hand. The next day's occurrence starts as normal.
  - A stop covers only the occurrences its run overlapped. Moving that phase's start time to later makes a new occurrence, and it starts at the new time. A mission started by hand *before* its window and stopped before the window opens does not cancel the scheduled one (completing or failing it early still does: that is today's outcome). Moving it to a start at or before the run's stop (or, for a running mission, before now) makes an occurrence that run already covers: it is not started again (open decision for Nathan, PR 170; before this fix a running mission moved earlier restarted at once).
  - The stamp uses this computer's clock, never the phone's: a phone Stop's own timestamp is dropped on arrival (`useRemoteControl`), so a phone that runs behind cannot stamp the stop before the window. A stamp later than now (written while the clock was set ahead) is ignored by the scheduler and dropped at load.
  - While any mission is running, the scheduler does not aim at an open window (it waits for tomorrow's): when that mission ends it re-arms once and starts the open window's mission if that occurrence has not run. A window timer that fires late (the machine slept) while its own mission is still running logs no "skipped" line.
  - **A mission start time must be a real time (fixed 2026-09-24).** Settings → "Auto-trigger at" cannot be saved empty: Save is disabled, the empty field is outlined, and the footer names the empty time and its tab ("Set the Morning auto-trigger time (🕒 Missions Time tab) to save.") until both times are filled in. `SET_SETTINGS` also ignores a start time that is not `HH:MM` (it keeps the stored one and does not stop a running mission), a profile saved empty by an older version loads with the default time (06:00 / 19:00) and a window re-derived from its duration, and the scheduler arms nothing for a time that is not a real `HH:MM`.
  - **A mission duration must be a real length (2026-09-26).** At least one second and less than 24 h (the 10-second test step counts; the duration slider starts at 5 min, so it cannot offer 0). `SET_SETTINGS` keeps the stored duration for anything else, and a profile holding one (JSON saves NaN as `null`) loads with the default (30 / 60 min). At load the mission window is always re-derived from the settings, never trusted from the saved copy, and a mission saved running with no readable duration gets its window's length, so it can end. If that run's window closed before today, it is ended just after load instead (a logged system action, so it reaches the audit trail), with no outcome (no miss, no conclusion date, like a Stop) and one system log line ("Evening mission from <date> ended at startup: its saved record was incomplete"); ending it on the first tick would charge a miss on the launch day and stop that day's mission from starting. Every reader of an entered time (scheduler, mood gauge, quick-game window) uses the same strict `HH:MM` rule and does nothing with a time it cannot read; a mission end past midnight (`24:30`) is read as 00:30 the next day, so a launch or a late timer inside such a window *before midnight* still starts it; after midnight the scheduler aims at that evening's next occurrence and does not start it (an older limit, unchanged). Overnight windows are only partly supported: an evening that ends after midnight stamps the next day's date as done, so that day's evening does not start (older, open follow-up).

- **School Bag task — school days only (added 2026-09-27)**:
  - Owner's rule: organizing the bag for school is a task in both routines, only on school days — not on holidays or Pro-D days. Read from the calendar when one is connected; otherwise Monday to Friday.
  - **Morning**: the last task, when *today* is a school day. **Evening**: immediately before Bed, when *tomorrow* is a school day — the bag is packed the night before (Sunday evening yes, Friday evening no, the evening before a Pro-D day no). An evening mission started after midnight but before the morning mission's start time (by ▶ Start or the phone, e.g. Fri 00:20) is still that night, so it packs for the same day (Friday); a start time that cannot be read keeps the plain next-day rule.
  - **Order with Cream (one rule, both phases)**: Cream first, then the School Bag — morning: …, Cream, School Bag; evening: …, Cream, School Bag, Bed. A bag carried over from an earlier run is put back in that place at every mission start, and Cream enabled mid-run goes in before the bag.
  - **School day** = Monday to Friday and not a no-school date. A date has no school when the calendar has a BC statutory holiday on it (the holiday feed the calendar view already shows), or an **all-day** event whose title matches `NO_SCHOOL_KEYWORDS` in `store/schoolDays.ts` (Pro-D with a dash of any kind or a space, or "ProD Day" — "prod" on its own is not; professional development; no school; school closed or closure; non-instructional; spring/winter/summer/Christmas/mid-winter break, vacation or holiday(s); case-insensitive, editable). A title that announces something about a break or a closure never counts — one containing before, after, reopen(s), resume(s), start(s), begin(s), camp, concert, registration, bus, fair, dismissal or report card(s) (`NOT_A_CLOSURE`), e.g. "Classes resume after Spring Break" or "No school bus today". Timed events never count; a birthday or an observance such as Halloween does not count either (the calendar's own "holiday" flag is ignored — it is set on birthdays too).
  - **Which calendars**: only the calendars ticked in Settings — the same selection the Calendar view shows. Unticking the school's calendar there also stops Pro-D detection. Known risk: an all-day event from anyone, in a calendar that is read (an invite, a shared calendar), titled with one of the keywords removes the bag that day.
  - **Fallback**: no calendar connected, or a date outside the 16 days last read → plain Monday to Friday.
  - **Decided once, when the mission starts** — by the scheduler, ▶ Start or the phone alike — and never changed mid-run. A restart mid-mission keeps the task and its tick.
  - **Refreshed** on launch, when a mission ends, when the computer wakes, and when a calendar is connected; no timer, and no new read starts while a mission runs (a read already under way when a mission starts is still saved; it serves the next mission). The last answer is saved, so a morning with no network still knows a Pro-D day.
  - **All or nothing (changed 2026-09-27, review)**: the school days are read in the calendar feed's *strict* mode. Offline, a sign-in that has expired, any one ticked calendar failing, or the holiday feed failing makes the whole read fail, and the saved days are kept unchanged until a later read succeeds. A read that succeeds replaces them — even when it finds no closures at all. (The first version kept an empty answer as "no news", but offline the feed answered holidays only, which is not empty, and overwrote the saved Pro-D days.) The Calendar view keeps its forgiving read: it still shows whatever did load.
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
  - **Miss / give back (changed 2026-09-27)**: only an expired mission with unfinished tasks counts as a miss. A parent-cancelled mission and a mission skipped because the machine was asleep leave the counter alone. Each completed mission routine gives back **one** shield (counter − 1, never below 0), with or without whining. Until 2026-09-27 a completion reset the counter to 0, so one good morning wiped any number of misses.
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
- **Non-Intrusive**: The loader should not block the entire UI (unless it's the initial load), allowing the user to see the previous state while the new one is being fetched.

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
- **What v2 does not do.** It protects integrity, not confidentiality: anyone with the room id can
  still read the state-updates (last 20 log lines, missions, privileges, token counts).
- **Rollout.** Deploy the `mc-remote` protocol v2 build first (it works with both desktop versions),
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
every broadcast sealed. Registered in `rule-registry.test.ts`. `docs/release-qa-checklist.md` 3.11.6
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
