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
