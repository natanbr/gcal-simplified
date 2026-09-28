import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RemoteBridge } from './remote-bridge';
import { sealRemoteMessage } from './remote-auth';
import type { store } from './store';

/** The store mocks take its real signatures, so a config that drifts from
 *  UserConfig fails to compile. The client is typed only as far as `channel`;
 *  the channel object it returns is unchecked, and a re-run of init() would also
 *  call removeChannel, which no test does. */
interface ClientSlice { channel: (name: string) => unknown }
interface WindowSlice { webContents: { send: (channel: string, ...args: unknown[]) => void } }
type BroadcastHandler = (message: { payload?: unknown }) => void;

/** A protocol v2 action as the phone sends it: signed with the pairing key,
 *  never carrying it (remote-auth.ts). Fresh and unique unless overridden. */
let msgSeq = 0;
const signed = (content: Record<string, unknown>, key = 'secret-key') => ({
    payload: sealRemoteMessage(key, 'action', { msgId: `m-${++msgSeq}`, timestamp: Date.now(), ...content }),
});

const mocks = vi.hoisted(() => ({
    createClient: vi.fn<(url: string, key: string) => ClientSlice>().mockReturnValue({
        channel: vi.fn().mockReturnValue({
            on: vi.fn().mockReturnThis(),
            subscribe: vi.fn().mockReturnThis(),
        }),
    }),
    getAllWindows: vi.fn<() => WindowSlice[]>().mockReturnValue([{ webContents: { send: vi.fn() } }]),
    storeGet: vi.fn<typeof store.get>(),
    storeRead: vi.fn<typeof store.read>(),
    storeUpdate: vi.fn<typeof store.update>().mockReturnValue({ ok: true }),
}));

// Mock Supabase
vi.mock('@supabase/supabase-js', () => ({
    createClient: mocks.createClient,
}));

// Mock Electron components
vi.mock('electron', () => ({
    app: { getPath: vi.fn().mockReturnValue('mock-path') },
    BrowserWindow: {
        getAllWindows: mocks.getAllWindows,
    },
    ipcMain: { handle: vi.fn() },
}));

// Mock Store
vi.mock('./store', () => ({
    store: {
        get: mocks.storeGet,
        // A readable file: the unreadable paths are covered on real disk in remote-bridge.config-read.test.ts.
        read: mocks.storeRead,
        update: mocks.storeUpdate,
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
        
        mocks.storeGet.mockReturnValue({
            calendarIds: [],
            taskListIds: [],
            remoteRoomId: 'room-123',
            remoteKey: 'secret-key',
        });
        mocks.storeRead.mockImplementation(() => ({ kind: 'loaded', config: mocks.storeGet(), raw: {} }));

        bridge = new RemoteBridge();
    });

    afterEach(() => {
        bridge.destroy();
        delete process.env.VITE_SUPABASE_URL;
        delete process.env.VITE_SUPABASE_ANON_KEY;
    });

    it('initializes Supabase client with env vars', () => {
        bridge.init();
        expect(mocks.createClient).toHaveBeenCalledWith(mockSupabaseUrl, mockSupabaseKey);
    });

    it('subscribes to the correct channel based on roomId', () => {
        const mockChannel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn() };
        // Held in a local: mock.results[n].value is typed `any` by vitest.
        const client = { channel: vi.fn().mockReturnValue(mockChannel) };
        mocks.createClient.mockReturnValue(client);

        bridge.init();

        expect(client.channel).toHaveBeenCalledWith('remote-control:room-123');
        expect(mockChannel.on).toHaveBeenCalledWith('broadcast', { event: 'action' }, expect.any(Function));
        expect(mockChannel.subscribe).toHaveBeenCalled();
    });

    it('verifies the signature and sends the action to the renderer via IPC', () => {
        const mockWin = { webContents: { send: vi.fn() } };
        mocks.getAllWindows.mockReturnValue([mockWin]);

        const mockChannel = { 
            on: vi.fn().mockImplementation((_type, _config, callback) => {
                callback(signed({ action: { type: 'ADD_TOKEN' } }));
                return mockChannel;
            }), 
            subscribe: vi.fn() 
        };
        mocks.createClient.mockReturnValue({ channel: vi.fn().mockReturnValue(mockChannel) });

        bridge.init();

        expect(mockWin.webContents.send).toHaveBeenCalledWith('remote-control:action', { type: 'ADD_TOKEN' });
    });

    it('ignores an action signed with the wrong key', () => {
        const mockWin = { webContents: { send: vi.fn() } };
        mocks.getAllWindows.mockReturnValue([mockWin]);

        const mockChannel = { 
            on: vi.fn().mockImplementation((_type, _config, callback) => {
                callback(signed({ action: { type: 'ADD_TOKEN' } }, 'wrong-key'));
                return mockChannel;
            }), 
            subscribe: vi.fn() 
        };
        mocks.createClient.mockReturnValue({ channel: vi.fn().mockReturnValue(mockChannel) });

        bridge.init();

        expect(mockWin.webContents.send).not.toHaveBeenCalled();
    });

    it('ignores duplicate messages with same msgId', () => {
        const mockWin = { webContents: { send: vi.fn() } };
        mocks.getAllWindows.mockReturnValue([mockWin]);

        let callback!: BroadcastHandler;
        const mockChannel = { 
            on: vi.fn().mockImplementation((_type, _config, cb) => {
                callback = cb;
                return mockChannel;
            }), 
            subscribe: vi.fn() 
        };
        mocks.createClient.mockReturnValue({ channel: vi.fn().mockReturnValue(mockChannel) });

        bridge.init();

        callback(signed({ action: { type: 'ADD_TOKEN' }, msgId: 'unique-123' }));
        expect(mockWin.webContents.send).toHaveBeenCalledTimes(1);

        // Same msgId again
        callback(signed({ action: { type: 'ADD_TOKEN' }, msgId: 'unique-123' }));
        expect(mockWin.webContents.send).toHaveBeenCalledTimes(1); // Still 1
    });

    it('ignores stale messages older than 60 seconds', () => {
        const mockWin = { webContents: { send: vi.fn() } };
        mocks.getAllWindows.mockReturnValue([mockWin]);

        let callback!: BroadcastHandler;
        const mockChannel = { 
            on: vi.fn().mockImplementation((_type, _config, cb) => {
                callback = cb;
                return mockChannel;
            }), 
            subscribe: vi.fn() 
        };
        mocks.createClient.mockReturnValue({ channel: vi.fn().mockReturnValue(mockChannel) });

        bridge.init();

        // Signed 70 seconds ago
        callback(signed({ action: { type: 'ADD_TOKEN' }, timestamp: Date.now() - 70000 }));
        expect(mockWin.webContents.send).not.toHaveBeenCalled();
    });

    it('forwards SYNC_REQUEST as remote:request-sync event', () => {
        const mockWin = { webContents: { send: vi.fn() } };
        mocks.getAllWindows.mockReturnValue([mockWin]);

        let callback!: BroadcastHandler;
        const mockChannel = { 
            on: vi.fn().mockImplementation((_type, _config, cb) => {
                callback = cb;
                return mockChannel;
            }), 
            subscribe: vi.fn() 
        };
        mocks.createClient.mockReturnValue({ channel: vi.fn().mockReturnValue(mockChannel) });

        bridge.init();

        callback(signed({ action: { type: 'SYNC_REQUEST' } }));
        
        expect(mockWin.webContents.send).toHaveBeenCalledWith('remote:request-sync', null);
    });

    describe('status tracking and notification', () => {
        it('initially reports offline', () => {
            expect(bridge.getStatus()).toBe(false);
        });

        it('notifies status changes and updates getStatus on subscribe callback', () => {
            const mockWin = { webContents: { send: vi.fn() } };
            mocks.getAllWindows.mockReturnValue([mockWin]);

            let subscribeCallback!: (status: 'SUBSCRIBED' | 'CLOSED' | 'CHANNEL_ERROR', err?: string) => void;
            const mockChannel = {
                on: vi.fn().mockReturnThis(),
                subscribe: vi.fn().mockImplementation((cb) => {
                    subscribeCallback = cb;
                    return mockChannel;
                })
            };
            mocks.createClient.mockReturnValue({ channel: vi.fn().mockReturnValue(mockChannel) });

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

