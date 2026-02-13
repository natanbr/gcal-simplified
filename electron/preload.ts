import { ipcRenderer, contextBridge } from 'electron'

// Allowed channels for communication
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
  'tides:get',
  'update:check',
  'update:download',
  'update:install',
];

const ALLOWED_ON_CHANNELS = [
  'auth:success',
  'main-process-message',
  'update:available',
  'update:not-available',
  'update:download-progress',
  'update:downloaded',
  'update:error',
];

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(channel: string, listener: (...args: unknown[]) => void) {
    if (!ALLOWED_ON_CHANNELS.includes(channel)) {
      console.warn(`Blocked attempt to listen on unauthorized channel: ${channel}`);
      throw new Error(`Unauthorized channel: ${channel}`);
    }
    const subscription = (_event: unknown, ...args: unknown[]) => listener(...args)
    ipcRenderer.on(channel, subscription)
    return () => {
      ipcRenderer.removeListener(channel, subscription)
    }
  },
  invoke(channel: string, ...args: unknown[]) {
    if (!ALLOWED_INVOKE_CHANNELS.includes(channel)) {
      console.warn(`Blocked attempt to invoke unauthorized channel: ${channel}`);
      throw new Error(`Unauthorized channel: ${channel}`);
    }
    return ipcRenderer.invoke(channel, ...args)
  },
})
