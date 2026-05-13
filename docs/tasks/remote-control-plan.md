# Remote Control Implementation Plan

## Overview
Add a "Remote Control" feature allowing a phone (via a web-app) to control the Mission Control state in the Electron app.

## Goals
- Add/Remove points (Tokens).
- Add/Remove time to active missions.
- Trigger animations (e.g., Fireworks, Confetti).
- Minimal login/setup (QR code based).

## Architecture
- **Backend**: Supabase Realtime (Broadcast).
- **Remote Web-App**: 
  - React/Vite/Tailwind.
  - Hosted on Vercel.
  - URL format: `https://mc-remote.vercel.app/?room=XYZ&key=SECRET`.
- **Electron App**:
  - `supabase-js` client in the renderer.
  - New hook `useRemoteControl` to listen for broadcasted actions.
  - QR Code generation in a new "Remote Control" settings tab.

## Data Flow
1. **Electron App** generates a random `room` ID and `key` (stored locally).
2. **User** scans QR code on phone.
3. **Phone App** connects to Supabase Realtime channel `remote_control:XYZ`.
4. **Phone App** sends a broadcast message: `{ type: 'ACTION', payload: MCAction, key: 'SECRET' }`.
5. **Electron App** receives message, verifies `key`, and dispatches `payload` to `mcStore`.

## Implementation Steps

### Phase 1: Supabase Setup
- Create Supabase project.
- Enable Realtime for a "remote_control" channel (broadcast only).
- Define Action types in a shared schema (if possible).

### Phase 2: Remote Web-App (Vercel)
- Simple UI with buttons:
  - `[ +1 Token ]` `[ -1 Token ]`
  - `[ +10m Mission ]` `[ -10m Mission ]`
  - `[ 🎆 Fireworks ]` `[ 🎉 Confetti ]`
- Handlers to send Supabase Broadcast messages.

### Phase 3: Electron Integration
- Install `@supabase/supabase-js`.
- Create `useRemoteControl.ts` hook:
  - Initialize Supabase client.
  - Subscribe to channel.
  - Filter messages by `key`.
  - Dispatch to `mcReducer`.
- UI:
  - "Remote Control" tab in `MCSettingsOverlay.tsx`.
  - Show QR Code using `qrcode.react`.
  - Display connection status.

## Security Considerations
- `key` is a shared secret between phone and desktop.
- No PII or sensitive data sent over broadcast.
- Supabase RLS is not strictly needed for Broadcast, but we can use a "private" room ID.

## Testing Strategy
- **Unit**: Mock Supabase client and verify `useRemoteControl` dispatches correctly on message.
- **E2E**: Use Playwright to simulate a broadcast message and check if Electron UI updates.
- **Manual**: Scan with real phone.
