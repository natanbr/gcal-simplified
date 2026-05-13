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

    beforeEach(() => {
        vi.clearAllMocks();
        (useMCDispatch as unknown as { mockReturnValue: (v: any) => void }).mockReturnValue(mockDispatch);
        
        // Mock window.ipcRenderer
        (window as unknown as { ipcRenderer: unknown }).ipcRenderer = {
            on: vi.fn().mockReturnValue(unsubscribeMock),
        };
    });

    afterEach(() => {
        delete (window as unknown as { ipcRenderer: unknown }).ipcRenderer;
    });

    it('subscribes to remote-control:action on mount', () => {
        renderHook(() => useRemoteControl());

        expect(window.ipcRenderer.on).toHaveBeenCalledWith(
            'remote-control:action',
            expect.any(Function)
        );
    });

    it('dispatches the action received from IPC', () => {
        renderHook(() => useRemoteControl());

        // Get the listener passed to ipcRenderer.on
        const listener = (window.ipcRenderer.on as unknown as vi.Mock).mock.calls[0][1];
        
        const mockAction = { type: 'ADD_TOKEN' };
        listener(mockAction);

        expect(mockDispatch).toHaveBeenCalledWith({ ...mockAction, isRemote: true });
    });

    it('unsubscribes on unmount', () => {
        const { unmount } = renderHook(() => useRemoteControl());
        
        unmount();
        expect(unsubscribeMock).toHaveBeenCalled();
    });
});
