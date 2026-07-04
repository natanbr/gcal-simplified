import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { RemoteBridge } from './remote-bridge';
import { createClient } from '@supabase/supabase-js';
import { BrowserWindow } from 'electron';
import { store } from './store';

// Mock Supabase
vi.mock('@supabase/supabase-js', () => ({
    createClient: vi.fn().mockReturnValue({
        channel: vi.fn().mockReturnValue({
            on: vi.fn().mockReturnThis(),
            subscribe: vi.fn().mockReturnThis(),
        }),
    }),
}));

// Mock Electron components
vi.mock('electron', () => ({
    app: { getPath: vi.fn().mockReturnValue('mock-path') },
    BrowserWindow: {
        getAllWindows: vi.fn().mockReturnValue([{ webContents: { send: vi.fn() } }]),
    },
    ipcMain: { handle: vi.fn() },
}));

// Mock Store
vi.mock('./store', () => ({
    store: {
        get: vi.fn(),
        set: vi.fn(),
    },
}));

describe('RemoteBridge (Main Process)', () => {
    let bridge: RemoteBridge;
    const mockSupabaseUrl = 'https://mock.supabase.co';
    const mockSupabaseKey = 'mock-key';

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.VITE_SUPABASE_URL = mockSupabaseUrl;
        process.env.VITE_SUPABASE_ANON_KEY = mockSupabaseKey;
        
        (store.get as unknown as Mock).mockReturnValue({
            remoteRoomId: 'room-123',
            remoteKey: 'secret-key',
        });

        bridge = new RemoteBridge();
    });

    afterEach(() => {
        bridge.destroy();
        delete process.env.VITE_SUPABASE_URL;
        delete process.env.VITE_SUPABASE_ANON_KEY;
    });

    it('initializes Supabase client with env vars', () => {
        bridge.init();
        expect(createClient).toHaveBeenCalledWith(mockSupabaseUrl, mockSupabaseKey);
    });

    it('subscribes to the correct channel based on roomId', () => {
        const mockChannel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn() };
        (createClient as unknown as Mock).mockReturnValue({ channel: vi.fn().mockReturnValue(mockChannel) });
        
        bridge.init();
        
        const client = (createClient as unknown as Mock).mock.results[0].value;
        expect(client.channel).toHaveBeenCalledWith('remote-control:room-123');
        expect(mockChannel.on).toHaveBeenCalledWith('broadcast', { event: 'action' }, expect.any(Function));
        expect(mockChannel.subscribe).toHaveBeenCalled();
    });

    it('validates key and sends to renderer via IPC on message', () => {
        const mockWin = { webContents: { send: vi.fn() } };
        (BrowserWindow.getAllWindows as unknown as Mock).mockReturnValue([mockWin]);

        const mockChannel = { 
            on: vi.fn().mockImplementation((_type, _config, callback) => {
                // Simulate message
                callback({
                    payload: {
                        key: 'secret-key',
                        action: { type: 'ADD_TOKEN' }
                    }
                });
                return mockChannel;
            }), 
            subscribe: vi.fn() 
        };
        (createClient as unknown as Mock).mockReturnValue({ channel: vi.fn().mockReturnValue(mockChannel) });

        bridge.init();

        expect(mockWin.webContents.send).toHaveBeenCalledWith('remote-control:action', { type: 'ADD_TOKEN' });
    });

    it('ignores message if key is invalid', () => {
        const mockWin = { webContents: { send: vi.fn() } };
        (BrowserWindow.getAllWindows as unknown as Mock).mockReturnValue([mockWin]);

        const mockChannel = { 
            on: vi.fn().mockImplementation((_type, _config, callback) => {
                // Simulate invalid message
                callback({
                    payload: {
                        key: 'wrong-key',
                        action: { type: 'ADD_TOKEN' }
                    }
                });
                return mockChannel;
            }), 
            subscribe: vi.fn() 
        };
        (createClient as unknown as Mock).mockReturnValue({ channel: vi.fn().mockReturnValue(mockChannel) });

        bridge.init();

        expect(mockWin.webContents.send).not.toHaveBeenCalled();
    });



    it('ignores duplicate messages with same msgId', () => {
        const mockWin = { webContents: { send: vi.fn() } };
        (BrowserWindow.getAllWindows as unknown as Mock).mockReturnValue([mockWin]);

        let callback!: (payload: { payload: { key: string; action: Record<string, unknown>; msgId?: string; timestamp?: number } }) => void;
        const mockChannel = { 
            on: vi.fn().mockImplementation((_type, _config, cb) => {
                callback = cb;
                return mockChannel;
            }), 
            subscribe: vi.fn() 
        };
        (createClient as unknown as Mock).mockReturnValue({ channel: vi.fn().mockReturnValue(mockChannel) });

        bridge.init();

        // Send first message
        callback({
            payload: {
                key: 'secret-key',
                action: { type: 'ADD_TOKEN' },
                msgId: 'unique-123'
            }
        });
        expect(mockWin.webContents.send).toHaveBeenCalledTimes(1);

        // Send same message again
        callback({
            payload: {
                key: 'secret-key',
                action: { type: 'ADD_TOKEN' },
                msgId: 'unique-123'
            }
        });
        expect(mockWin.webContents.send).toHaveBeenCalledTimes(1); // Still 1
    });

    it('ignores stale messages older than 60 seconds', () => {
        const mockWin = { webContents: { send: vi.fn() } };
        (BrowserWindow.getAllWindows as unknown as Mock).mockReturnValue([mockWin]);

        let callback!: (payload: { payload: { key: string; action: Record<string, unknown>; msgId?: string; timestamp?: number } }) => void;
        const mockChannel = { 
            on: vi.fn().mockImplementation((_type, _config, cb) => {
                callback = cb;
                return mockChannel;
            }), 
            subscribe: vi.fn() 
        };
        (createClient as unknown as Mock).mockReturnValue({ channel: vi.fn().mockReturnValue(mockChannel) });

        bridge.init();

        // Simulate message from 70 seconds ago
        callback({
            payload: {
                key: 'secret-key',
                action: { type: 'ADD_TOKEN' },
                timestamp: Date.now() - 70000 
            }
        });
        expect(mockWin.webContents.send).not.toHaveBeenCalled();
    });

    it('forwards SYNC_REQUEST as remote:request-sync event', () => {
        const mockWin = { webContents: { send: vi.fn() } };
        (BrowserWindow.getAllWindows as unknown as Mock).mockReturnValue([mockWin]);

        let callback!: (payload: { payload: { key: string; action: Record<string, unknown>; msgId?: string; timestamp?: number } }) => void;
        const mockChannel = { 
            on: vi.fn().mockImplementation((_type, _config, cb) => {
                callback = cb;
                return mockChannel;
            }), 
            subscribe: vi.fn() 
        };
        (createClient as unknown as Mock).mockReturnValue({ channel: vi.fn().mockReturnValue(mockChannel) });

        bridge.init();

        callback({
            payload: {
                key: 'secret-key',
                action: { type: 'SYNC_REQUEST' }
            }
        });
        
        expect(mockWin.webContents.send).toHaveBeenCalledWith('remote:request-sync', null);
    });

    describe('status tracking and notification', () => {
        it('initially reports offline', () => {
            expect(bridge.getStatus()).toBe(false);
        });

        it('notifies status changes and updates getStatus on subscribe callback', () => {
            const mockWin = { webContents: { send: vi.fn() } };
            (BrowserWindow.getAllWindows as unknown as Mock).mockReturnValue([mockWin]);

            let subscribeCallback!: (status: 'SUBSCRIBED' | 'CLOSED' | 'CHANNEL_ERROR', err?: string) => void;
            const mockChannel = {
                on: vi.fn().mockReturnThis(),
                subscribe: vi.fn().mockImplementation((cb) => {
                    subscribeCallback = cb;
                    return mockChannel;
                })
            };
            (createClient as unknown as Mock).mockReturnValue({ channel: vi.fn().mockReturnValue(mockChannel) });

            bridge.init();

            // Simulate SUBSCRIBED
            subscribeCallback('SUBSCRIBED');
            expect(bridge.getStatus()).toBe(true);
            expect(mockWin.webContents.send).toHaveBeenCalledWith('remote:status-changed', true);

            // Simulate CLOSED
            subscribeCallback('CLOSED');
            expect(bridge.getStatus()).toBe(false);
            expect(mockWin.webContents.send).toHaveBeenCalledWith('remote:status-changed', false);

            // Ensure NO action or ADD_LOG dispatch is sent to renderer (logs suppression)
            const sendCalls = mockWin.webContents.send.mock.calls;
            const hasAddLogOrAction = sendCalls.some((call) => {
                const [channel, arg2] = call as [string, unknown];
                if (channel === 'remote-control:action') {
                    return (arg2 as { type?: string })?.type === 'ADD_LOG';
                }
                return false;
            });
            expect(hasAddLogOrAction).toBe(false);
        });
    });
});

