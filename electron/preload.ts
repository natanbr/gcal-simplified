import { ipcRenderer, contextBridge } from 'electron'

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
]

const ALLOWED_ON_CHANNELS = [
  'auth:success',
  'main-process-message'
]

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(channel: string, listener: (...args: unknown[]) => void) {
    if (!ALLOWED_ON_CHANNELS.includes(channel)) {
      throw new Error(`Unauthorized IPC channel: ${channel}`)
    }
    const subscription = (_event: unknown, ...args: unknown[]) => listener(...args)
    ipcRenderer.on(channel, subscription)
    return () => {
      ipcRenderer.removeListener(channel, subscription)
    }
  },
  // off and send are removed for security
  invoke(channel: string, ...args: unknown[]) {
    if (!ALLOWED_INVOKE_CHANNELS.includes(channel)) {
      throw new Error(`Unauthorized IPC channel: ${channel}`)
    }
    return ipcRenderer.invoke(channel, ...args)
  },

  // You can expose other APTs you need here.
  // ...
})
