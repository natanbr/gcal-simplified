import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useRemoteControl } from './useRemoteControl';
import { useMCDispatch } from '../store/useMCStore';

// Mock the store hook
vi.mock('../store/useMCStore', () => ({
    useMCDispatch: vi.fn(),
    useMCStore: vi.fn(),
}));

describe('useRemoteControl', () => {
    const mockDispatch = vi.fn();
    const unsubscribeMock = vi.fn();
    const on = vi.fn<NonNullable<Window['ipcRenderer']>['on']>();

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(useMCDispatch).mockReturnValue(mockDispatch);

        // Mock window.ipcRenderer
        on.mockReturnValue(unsubscribeMock);
        window.ipcRenderer = {
            on,
            invoke: vi.fn(),
        };
    });

    afterEach(() => {
        delete window.ipcRenderer;
    });

    it('subscribes to remote-control:action on mount', () => {
        renderHook(() => useRemoteControl());

        expect(on).toHaveBeenCalledWith(
            'remote-control:action',
            expect.any(Function)
        );
    });

    it('dispatches the action received from IPC', () => {
        renderHook(() => useRemoteControl());

        // Get the listener passed to ipcRenderer.on
        const listener = on.mock.calls[0][1];
        
        const mockAction = { type: 'ADD_TOKEN' };
        listener(mockAction);

        expect(mockDispatch).toHaveBeenCalledWith({ ...mockAction, isRemote: true, origin: 'remote' });
    });

    it('unsubscribes on unmount', () => {
        const { unmount } = renderHook(() => useRemoteControl());
        
        unmount();
        expect(unsubscribeMock).toHaveBeenCalled();
    });

    it('dispatches keyboard events for SNAKE_DIR action', () => {
        const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');
        renderHook(() => useRemoteControl());

        const listener = on.mock.calls[0][1];
        
        listener({ type: 'SNAKE_DIR', dir: 'up' });

        expect(dispatchEventSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'keydown',
                key: 'ArrowUp'
            })
        );
        
        // Should NOT dispatch to MC store
        expect(mockDispatch).not.toHaveBeenCalled();

        dispatchEventSpy.mockRestore();
    });
});
