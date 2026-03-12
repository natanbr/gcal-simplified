# Architecture File (AI Index)

## High-level System Architecture
* This is an Electron application with a React/Vite frontend.
* The application is named "gcal-simplified" and focuses on Google Calendar integration, tasks, weather, and marine conditions.
* It uses `framer-motion` for animations, `tailwindcss` for styling, and `electron-store` for settings.
* Tests are managed via `vitest` and `playwright`.

## Key Domain Boundaries & Folders
* `src/`: The frontend application.
  * `src/components/`: Reusable UI components.
    * `WeatherDashboard.tsx`: Dashboard displaying weather, tasks, and marine data.
  * `src/hooks/`: React hooks for data fetching and state management.
  * `src/mission-control/`: A specialized "mission control" module, tightly isolated.
  * `src/utils/`: Generic utility functions (math, layout, etc.). Co-located tests.
* `electron/`: The Electron main process code (security, window management, auto-updater).

## Important Files
* `package.json`: Contains project dependencies and npm scripts (`npm run build`, `npm run lint`, `npm run test:unit`, `npm run test`).
* `src/App.tsx`: The main React component.
* `src/types.ts`: Core type definitions for the application.
