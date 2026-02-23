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

- **Marine/Tides Panel (Spearfishing Focus)**:
  - **Diver's Guide**: Educational for beginners (Slack Water, Flood/Ebb, Visibility, Swell).
  - **Marine Events Table (Chronological)**:
    - **Columns**: Event Name | Time | Value (kn) | Visibility (est) | Swell (m) | Wind (kn) | Height (m) | Period (s).
    - **Rows**:
      - **High Tide**: Local maxima of tide height.
      - **Low Tide**: Local minima of tide height.
      - **Slack Water**: Local minima of current speed (< 1.0kn).
      - **Max Flood / Max Ebb**: Peak current speed.
    - **Data Visuals**:
      - **Safety Coloring**: Current speed values colored by safety (e.g., Green < 1.0kn, Yellow/Red > 1.5kn).
      - **Date Headers**: Explicit date separators (e.g., "Wednesday, Feb 5").
  - **Best Times for Spearfishing**:
    - **Slack Tide Windows**: Calculate and display time windows around slack tides when current speed is < 0.5kn.
      - **High Tide Slack (Preferred)**: Slack periods that occur near high tide are highlighted as optimal due to better water clarity from fresh ocean water flooding in.
      - **Safety Filter**: Exclude slack windows that occur during dark hours (before sunrise or after sunset) as diving in darkness is too dangerous.
      - **Window Calculation**: For each slack event, determine the time range where current speed remains below 0.5kn (typically ±30-60 minutes around the slack minimum).
      - **Display**: Show these windows prominently with:
        - Start and end times of the window
        - Duration of the window
        - Tide height at slack time (to identify high vs low tide slack)
        - Visual indicator for "High Tide Slack" (best conditions)
        - Associated conditions: visibility estimate, swell height, wind speed
  - **Data Sources (Dual-Station Strategy)**:
    - **Currents**:
      - **Source**: Canadian Hydrographic Service (CHS) API.
      - **Station**: Nearest Current Station (e.g., **07040 Race Passage**). Distinct from Tide Station.
      - **Codes**: Dynamics resolution of time-series codes (e.g., `wcp` vs `wcsp1`) required.
      - **Guardrails**:
        - **Speed Check**: If max current speed < 2.0kn for a major pass, mark as **Suspect Data**.
        - **Fallback**: Automatically revert to Open-Meteo with "Warning: Modeled open-ocean data" if data is missing or suspect.
      - **Labeling**: Use official `qualifier` field (`SLACK`, `EXTREMA_FLOOD`, `EXTREMA_EBB`) for event labels.
    - **Tide Height**:
      - **Source**: CHS API (Endpoint: `wlp`).
      - **Station**: Nearest Tide Station (e.g., **07020 Sooke**).
    - **Swell/Waves/Temp**:
      - **Source**: Open-Meteo.
  - **Metadata Display**:
    - The UI must list the specific data sources and locations used (e.g., "Tides: Sooke", "Currents: Race Passage") to allow for user verification.
  - **Timezone Verification**:
    - Data must be displayed in the user's local timezone (PST/PDT for Sooke, BC).
    - Verification: Compare UI times with official tide tables for Sooke (Station 07020) and Race Passage (Station 07040). Times should match exactly.

### Multi-Location Support (Spearfishing Hotspots)

- **Constraint**: The app must support selecting from a predefined list of spearfishing locations, each mapping to specific CHS Tide and Current stations.
- **Data Model**:
  - **Locations**: Sooke, Oak Bay, Gordon Head, Point No Point, Sombrio, Port Renfrew, Salt Spring, Gulf Islands.
  - **Mapping**: Each location defines:
    - `id`: Unique identifier (e.g., "sooke").
    - `name`: Display name.
    - `tideStation`: CHS Station Code (e.g., "07020").
    - `currentStation`: CHS Station Code (e.g., "07090").
    - `coords`: Lat/Lng for Open-Meteo weather fetch.
- **UI Selector**:
  - **Location**: The location selector must be located **inside** the "Marine Conditions" popup/drawer, not in the global header.
  - **Lazy Loading**: Marine data (tides/currents) must **only** be fetched when the user opens the "Marine Conditions" panel. It should not load on initial app load.
  - **Loading State**: When opening the panel or changing location, display a loading indicator (consistent with the main app's loader) until data is ready.
  - **Behavior**: Changing the location in the dropdown immediately triggers a re-fetch of marine data for that location.
- **Conflicting Station Handling**:
  - If `tideStation` == `currentStation` (e.g., Active Pass), the API fetcher must request both `wlp` and `wcp` data types from the same station ID without locking or erroring.

## Authentication & Systems

- **Google Login**:
  - Custom Login Screen with "Sign in with Google" button.
  - Uses Electron IPC (`auth:login`) to handle OAuth flow.
- **Settings**:
  - **Active Hours**: Configurable Start and End times (0-23h).
  - **Calendars**: Toggle visibility of specific Google Calendars.
  - **Task Lists**: Toggle visibility of specific Task Lists.
  - **Auto-Refresh**: Data refreshes every 5 minutes.

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
