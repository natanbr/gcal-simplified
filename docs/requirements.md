# Project Requirements: Google Calendar Simplified

## Overview

A simplified desktop calendar application inspired by Google Calendar, built with Electron, React, TypeScript, and Tailwind CSS. The application provides a focused, single-screen view of the scheduling week with integrated weather and outdoor activity information.

## Core Features

### Calendar View

- **7-Day View**: The calendar displays 7 days in a week view.
  - **Data Fetching and Caching**: Events are always fetched and loaded a full month at a time and cached locally. Navigating between weeks within a cached month is instantaneous, while a background process verifies the data is up-to-date.
  - **Default View**: Shows the current week (7 days starting from today).
  - **Week Navigation**:
    - **Next Week Button**: Navigates forward to the next week, always starting from Monday.
    - **Previous Week Button**: Navigates backward to the previous week, always starting from Monday.
    - **Navigation Limit**: Cannot navigate to weeks before the current week (today).
    - **"Today" Button**: Quick navigation to return to the current week view.
  - **Week Start**: When navigating, weeks always start from Monday regardless of the current day.
    - Example: If today is Wednesday and user clicks "Next Week", the view shows Monday-Sunday of the following week.
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
  - **Shared Secret Pairing**: Uses a 20-character secret key and unique Room ID for secure mobile pairing.
  - **QR Code Pairing**: Displayed in Settings for easy mobile connection.
  - **Remote Actions**: Supports triggering game tokens, adjusting mission timers, and firing special animations (Fireworks, Confetti).
  - **Sync & Identification**: Immediate state synchronization upon remote connection; remote-initiated actions are visually identified in the Activity Log with a 📱 emoji.
  - **Global Listener**: The remote action listener is registered globally in the application shell. This guarantees that remote commands are processed continuously, even when viewing the calendar or when the mission overlay is active.
  - **Detailed Mission State Reflection**: The remote control displays individual card views for both Morning and Evening missions simultaneously. Each card reflects its current state (Active/Inactive), live countdown timers, adjustment buttons, task checklist progress (percentage bar and expandable/collapsible checkbox list), and whining status (highlighted pulsing indicator).
- **Mission Control Responsibilities & Privileges**:
  - **Responsibility Progress**: Point-based tracking using visual point dots (no text counters). Shows Done status and a "Claim" button once the target point goal is met.
  - **Privilege Suspension System**:
    - Privileges can be suspended for a duration (1 Day, 3 Days, 1 Week, or 2 Weeks).
    - Shows remaining time with a countdown badge on the button and in an active suspensions summary below the buttons.
    - Located inside a dedicated card (`PrivilegesPanel`) in Column 3, underneath the Snake Game/Game Token panel.
    - Synchronized with the mobile remote web application (`mc-remote`) in real-time.
  - **Phone Games Privilege**:
    - Adding a new privilege for "Phone Games" (`phone-games` ID, `Smartphone` / `📱` icon).
    - When suspended, it blocks the selection of the "Game" reward (cost 6 tokens) from the Goal Pedestals list of choices, and disables/locks the "Use!" button on any active completed "Game" goals.
    - The "Quick Game" (Snake, cost 1 token) goal remains active and unaffected.
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

- **Mission Streak Shield (missed-mission lockout)**:
  - **One shared streak**: `missedMissionStreak` counts consecutive *failed* mission occurrences across morning and evening. Six in a row is roughly three days of earning nothing.
  - **Miss / reset**: only an expired mission with unfinished tasks counts as a miss. A parent-cancelled mission and a mission skipped because the machine was asleep leave the streak alone. Any completed mission routine resets it to 0.
  - **Reset re-arms the occurrence (decided 2026-09-03)**: a mission the parent resets *can* be counted as a miss again the same day. Reset means "do it again", and a second failure of a second attempt is a second miss. This applies to **`RESET_MISSION_WITH_TIMER`** (long-press), which restarts the clock and so genuinely grants that second attempt. Plain **`RESET_MISSION`** (short-press) resets only the checklist and leaves the timer running, so on an already-expired mission it grants no time at all — it therefore does **not** re-arm the miss, or one press would cost a segment for an attempt zero seconds long. Both are remote-reachable. Pinned by tests so neither half is "fixed" later.
  - **Lock at 6 — the child's whole economy freezes (decided 2026-09-03)**, not just spending. Refused: deposit, vacuum, move, select a new goal, consume a completed reward, starting a quick game, **tapping an activity for a point, and claiming a finished responsibility**. The mood gauge also stops accruing, and because accrual is *skipped* rather than zeroed, unlocking cannot dump the frozen days back as progress. An earlier version froze spending only, on the reasoning that collecting was the way out; the stronger rule is what the owner wants and is simpler for a child to hold — while the shield is broken nothing moves, and a completed mission starts it again.
  - **What never freezes**: completing a mission (the exit), and the parent's tools — granting tokens, granting a game token, handing a shield back, removing a token, refunding a goal. Locking any of those would make the lock inescapable or take the adult's override away.
  - Every frozen control also *looks* refused (greyed, `🔒 Bank locked`), because a refused action deliberately writes no log line — so an enabled-looking button that silently does nothing leaves no trace for the child or the parent. Earning is never blocked — mission bonuses, responsibility claims and parent/remote grants still land, because collecting them is the way out. The locked flag is derived from the streak, never persisted.
  - **Shield bar** (`ShieldPanel.tsx`, between the Mood Gauge and Privileges): a six-segment bar sub-card in Column 3 — full at 0 misses, one segment lost per miss; green 0–2, amber 3–4, red 5, empty and locked at 6. The colour is the whole message: there is **no** status caption ("shield is strong/cracking"). The only text on the card is the 🔒 **Bank locked** line, shown when the shield is broken.
  - **Parent-adjustable shields (remote)**: the parent can hand a shield back or take one away from the phone. One remote action, `ADJUST_SHIELD`, carries a delta in *segments* (positive = give a shield back = streak down). It is clamped to the same 0…6 range, is attributed like any other remote action, and drives the same lock/unlock log lines — so a shield given back at 6 unlocks the bank exactly as a completed mission does. `missedMissionStreak` therefore rides the remote-sync broadcast, so the phone can draw the same bar. **Host-side only so far**: the action, its allowlist entry and its payload validator are live here, but the `mc-remote` app has not shipped the +/- buttons yet, so there is nothing to press today. Every shield move is logged and attributed to whoever made it — a parent taking the last shield reads "Last shield taken away", never "6 missions missed in a row".
- **Quick-Game Availability Window**:
  - Games are playable only *between* the day's missions: from the moment the morning mission has concluded (completed **or** failed) until the moment the evening mission starts.
  - The rule is literal — "concluded", not "the morning window has passed". A morning that never ran at all (machine asleep at 06:00, app opened later) keeps games shut for the whole day; otherwise a child could earn the day's games by keeping the app closed through the routine. The escape hatch is human: the parent starts the mission by hand from Settings.
  - Enforced by a pure selector used by the pedestal UI and by **two** reducer guards — `START_GAME` and `CONSUME_CASE`. They must agree: when only `START_GAME` was gated, redeeming a quick-game goal at the evening boundary destroyed the goal (no refund) for a game that was then refused. It fails **closed** on a time it cannot parse or a range it cannot honour (`25:00`). Deliberately separate from `isWakingHour`, which stays the basis of mood-token accrual.

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
