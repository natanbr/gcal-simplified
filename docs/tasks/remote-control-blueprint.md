# 🛠️ Mission Control: Remote Control Blueprint (v1.0)

This document serves as the **Master Implementation Plan** for the Remote Control feature. It is designed to be followed sequentially by an AI agent or a developer.

---

## 1. Project Overview
**Goal**: Enable a mobile web-app to control the Electron application's "Mission Control" state (tokens, missions, animations) using Supabase Realtime as a secure bridge.
**Security**: One-time QR code setup. Auth via Shared Secret + Room ID stored in `localStorage`.

---

## 2. Infrastructure Setup (User Actions Required)

### Step 2.1: Supabase Setup
1. **Create Project**: Go to [supabase.com](https://supabase.com/), create a new project named `mc-remote`.
2. **Enable Realtime**:
   - Go to **Database** -> **Replication**.
   - Ensure the "Realtime" source is enabled. (Note: Since we use **Broadcast**, we don't actually need a table, but Realtime must be active).
3. **Get API Keys**:
   - Go to **Project Settings** -> **API**.
   - Copy the `Project URL` and `anon public` key.
4. **Environment Variables**: Add these to your local `.env` (Electron) and Vercel:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

### Step 2.2: Vercel Setup
1. **Repository**: Create a new GitHub repo for the remote web-app (or a subfolder in this repo).
2. **Deploy**: Connect the repo to Vercel.
3. **Env Vars**: Add the Supabase keys from Step 2.1 to Vercel's environment variables.

---

## 3. Architecture & Data Flow

### The "Shared Secret" Protocol
- **Room ID**: A random UUID identifying the Electron instance.
- **Key**: A random 16-character string.
- **Verification**:
  - Phone sends: `{ action: MCAction, key: string }`
  - Electron Main Process: `if (msg.key !== localKey) return;` -> Forward to Renderer.

### Communication Layers
1. **Phone (Vercel)** --(Broadcast)--> **Supabase**
2. **Supabase** --(Broadcast)--> **Electron Main Process**
3. **Electron Main Process** --(IPC)--> **Electron Renderer**
4. **Electron Renderer** --(Dispatch)--> **MCStore**

---

## 4. Technical Changes: Electron App

### 4.1. Main Process (`electron/main.ts` or new `electron/remote.ts`)
- **Library**: Install `@supabase/supabase-js`.
- **Logic**:
  - Initialize Supabase client.
  - Listen to channel `remote-control:${room_id}`.
  - On message: Validate `key`. If valid, send to Renderer via `webContents.send('remote-action', action)`.

### 4.2. Preload Script (`electron/preload.ts`)
- **Bridge**: Add `onRemoteAction: (callback) => ipcRenderer.on('remote-action', ...)` to the context bridge.

### 4.3. Mission Control Hook (`src/mission-control/hooks/useRemoteControl.ts`)
- **Logic**:
  - Use the bridge to listen for actions.
  - Use `useMCStore`'s `dispatch` to apply the action directly.

### 4.4. Settings UI (`src/mission-control/components/MCSettingsOverlay.tsx`)
- **Tab**: Add "Remote Control" tab.
- **Features**:
  - Show QR Code (URL with Room ID and Key).
  - "Regenerate Keys" button.
  - Connection status indicator (Green/Red).

---

## 5. Technical Changes: Remote Web-App (Vercel)

### 5.1. Requirements
- **URL Parsing**: Extract `room` and `key` from URL params. Store in `localStorage`.
- **State**: No local state needed other than the Room/Key.
- **UI Components**:
  - **Points**: `[+1]`, `[-1]`, `[+5]`.
  - **Missions**: `[+10m to active]`, `[Cancel Mission]`.
  - **Hidden Actions**: `[Trigger Fireworks]`, `[Trigger Confetti]`, `[Force Morning Mission]`.
- **Feedback**: Vibrate phone on successful tap (using Haptic Feedback API).

---

## 6. Edge Cases & Error Handling

- **Double Dispatch**: Use a unique `message_id` to prevent the Electron app from processing the same remote tap twice if the network glitches.
- **Expired Keys**: If the user regenerates keys in Electron, the phone app should detect the "Unauthorized" (key mismatch) and show a "Please re-scan QR" message.
- **Network Latency**: Show a loading spinner on the button until Supabase acknowledges the broadcast.

---

## 7. Handover Checklist for "Developer" Agent

- [ ] Install `supabase-js` and `qrcode.react`.
- [ ] Create `electron/remote-bridge.ts` for Main process logic.
- [ ] Implement `useRemoteControl` hook in Renderer.
- [ ] Add the "Remote" tab to Mission Control settings.
- [ ] Build the standalone React app for Vercel.

---

## 8. Migration of "Hidden" Actions
The following "Cheat" or "Admin" actions currently hidden in the code will be exposed as buttons on the Remote:
1. `FORCE_GRANT_GAME_TOKEN`
2. `ADJUST_MISSION_END` (Positive/Negative)
3. `RESET_GAME_TOKENS`
4. `CHEAT_ATTEMPT` (Trigger as a joke/test)
