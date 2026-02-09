/// <reference types="vite/client" />


interface Window {
    ipcRenderer: {
        invoke(channel: string, ...args: unknown[]): Promise<unknown>;
        on(channel: string, listener: (...args: unknown[]) => void): () => void;
        // 'off' and 'send' are removed for security
    }
}
