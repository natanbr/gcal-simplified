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
      - **Proactive Shapes Generator**: Under the board, 3 active shapes are generated, guaranteed by a solver look-ahead algorithm to always have valid grid placements.
      - **4th Slot (Golden Rescue Shape)**: Holds a shape that is guaranteed to fit somewhere (ensuring players can always avoid game-over by solving math). Locked behind a math quiz (single-digit addition under 10). Tapping "Refresh" regenerates a new shape but locks the slot. Placing the 4th shape immediately replenishes the slot with a new locked shape.
      - **Game-Over Condition**: The game is over when none of the 3 standard shapes have any valid placements on the grid, the current Golden Rescue Shape does not fit, AND no other shape in the pool fits (meaning the grid is fully blocked and refreshing the Golden Rescue Shape cannot generate a placement).
      - **Rocket Path Progression**: As the rocket ascends (score clears), it triggers altitude levels:
        - *Level 1: Asteroid Impact*: Spawns unfillable locked "asteroid holes" on the grid.
        - *Level 2: Satellite Orbit*: Spawns a satellite block. Clearing the row/column containing it unlocks the 4th shape slot for free.
        - *Level 3: Space Storm*: Increases shape sizes (e.g. 3x3 blocks, crosses `+`).
        - **High-Performance Drag-and-Drop Overlay**: Dragging is executed via native HTML5 pointer capture and direct, uncontrolled DOM style updates (`transform: translate3d`). This completely bypasses React virtual DOM diffing during pointermove, maintaining 1:1 hardware responsiveness with 0ms scripting lag. A `<ProjectionOverlay>` isolates grid projections, and a development-only Performance HUD tracks frame rates and scripting times in real time.
        - **Unique Shape Instances & Jump-Back Prevention**: All generated shape instances are assigned unique IDs upon selection in `useBlocksGame.ts`, avoiding React key collisions. The slots in the tray are rendered transparent during dragging and unmounted upon successful placement, resolving the used shape "jump-back" visual glitch and ensuring proper state resets.
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

### 2026-06-12 Remote Control Mission State Reflection

- **Detailed Mission State**: Updated the remote control and host application state synchronization to broadcast and reflect the status of both Morning and Evening missions simultaneously.
- **Pulsing Whining Status**: Reflected the exact whining detection status on individual mission cards, highlighting the button in pulsing red when whining is active.
- **Interactive Checklists**: Rendered expandable task checklists with completion progress bars on both Morning and Evening remote mission cards, allowing parents/children to see what is done/not done and toggle tasks in real-time.

### 2026-05-22 Log Bounding & Remote Status Isolation

- **Connection Status Indicator**: Replaced chatty, high-frequency connection state log entries in the Activity Log with a dedicated visual live status indicator next to the Logs button (pulsing green for Online, red for Offline).
- **Log Bounding & Cap**: Enforced a hard limit of 200 entries for the `activityLogs` list inside the state reducer to prevent performance degradation over time.
- **Lazy Loading**: Replaced the full rendering of the Activity Log list with an IntersectionObserver-driven paginated list that lazy-loads logs in increments of 30 as the user scrolls.
- **Speculative Reducer Optimization**: Refactored `createLogEntry` to use a lightweight O(1) state snapshot helper instead of redundantly running the full `mcReducer` state updates, reducing reducer calls on log creations by 3x.
- **Reducer Guard Hardening**: Restricted the execution of the `syncCreamTask` invariant synchronization logic inside `mcReducer` to only run on relevant state dispatches, preventing reference checks and task sync recalculations on unrelated events.
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
- **Lazy Loading**: Replaced the full rendering of the Activity Log list with an IntersectionObserver-driven paginated list that lazy-loads logs in increments of 30 as the user scrolls.
- **Speculative Reducer Optimization**: Refactored `createLogEntry` to use a lightweight O(1) state snapshot helper instead of redundantly running the full `mcReducer` state updates, reducing reducer calls on log creations by 3x.
- **Reducer Guard Hardening**: Restricted the execution of the `syncCreamTask` invariant synchronization logic inside `mcReducer` to only run on relevant state dispatches, preventing reference checks and task sync recalculations on unrelated events.
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



