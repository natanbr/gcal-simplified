## 2025-02-14 - Enforce Default-Deny Permission Model in Electron
**Vulnerability:** Electron apps by default may inherit OS/Chromium defaults for permission handling (camera, mic, geolocation, etc.) if not explicitly denied.
**Learning:** The application lacked explicit handlers for `setPermissionRequestHandler` and `setPermissionCheckHandler` in `session.defaultSession`, leaving potential openings for unauthorized access to device resources if the renderer process was somehow compromised.
**Prevention:** Implement a strict, explicit default-deny policy in `electron/main.ts` by returning `false` for all permission requests and checks, following defense-in-depth principles. This pattern should be standard for all secure Electron applications.
