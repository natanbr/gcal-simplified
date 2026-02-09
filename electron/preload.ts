import { ipcRenderer, contextBridge } from 'electron'

// Whitelist of allowed channels
const ALLOWED_INVOKE_CHANNELS = [
  'auth:login',
  'auth:logout',
  'auth:check',
  'data:events',
  'data:tasks',
  'data:calendars',
  'data:tasklists',
  'settings:get',
  'settings:save',
  'weather:get',
  'tides:get'
];

const ALLOWED_ON_CHANNELS = [
  'auth:success',
  'main-process-message'
];

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(channel: string, listener: (...args: unknown[]) => void) {
    if (!ALLOWED_ON_CHANNELS.includes(channel)) {
      console.warn(`Blocked unauthorized IPC listener: ${channel}`);
      return () => {};
    }
    const subscription = (_event: unknown, ...args: unknown[]) => listener(...args)
    ipcRenderer.on(channel, subscription)
    return () => {
      ipcRenderer.removeListener(channel, subscription)
    }
  },
  // 'off' is removed as it's redundant with the cleanup function from 'on' and unused directly
  // 'send' is removed as it is unused
  invoke(channel: string, ...args: unknown[]) {
    if (!ALLOWED_INVOKE_CHANNELS.includes(channel)) {
      console.error(`Blocked unauthorized IPC invoke: ${channel}`);
      return Promise.reject(new Error(`Unauthorized IPC channel: ${channel}`));
    }
    return ipcRenderer.invoke(channel, ...args)
  },
})
