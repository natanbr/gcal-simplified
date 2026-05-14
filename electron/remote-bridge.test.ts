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

    it('schedules a reconnect when channel status is CLOSED', () => {
        vi.useFakeTimers();
        const initSpy = vi.spyOn(bridge, 'init');
        
        let subscribeCallback: any;
        const mockChannel = {
            on: vi.fn().mockReturnThis(),
            subscribe: vi.fn().mockImplementation((cb) => {
                subscribeCallback = cb;
            }),
            removeChannel: vi.fn()
        };
        const mockSupabase = { 
            channel: vi.fn().mockReturnValue(mockChannel),
            removeChannel: vi.fn()
        };
        (createClient as unknown as Mock).mockReturnValue(mockSupabase);

        bridge.init();

        // Simulate channel close
        expect(subscribeCallback).toBeDefined();
        subscribeCallback('CLOSED');

        // Fast-forward timers
        vi.advanceTimersByTime(5000);

        // Expect init to have been called again (once initially, once after timeout)
        expect(initSpy).toHaveBeenCalledTimes(2);
        
        vi.useRealTimers();
    });
});
