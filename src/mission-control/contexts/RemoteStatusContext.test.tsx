import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RemoteStatusProvider, useRemoteStatus } from './RemoteStatusContext';

function TestComponent() {
  const status = useRemoteStatus();
  return <div data-testid="status">{status}</div>;
}

describe('RemoteStatusContext', () => {
  const mockInvoke = vi.fn();
  const mockOn = vi.fn();
  let statusChangedCallback: ((online: boolean) => void) | null = null;
  const mockUnsubscribe = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    statusChangedCallback = null;

    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'remote:get-status') {
        return Promise.resolve(true); // default to online for initial pull
      }
      return Promise.resolve(null);
    });

    mockOn.mockImplementation((channel: string, cb: (online: boolean) => void) => {
      if (channel === 'remote:status-changed') {
        statusChangedCallback = cb;
      }
      return mockUnsubscribe;
    });

    (window as unknown as { ipcRenderer: unknown }).ipcRenderer = {
      invoke: mockInvoke,
      on: mockOn,
    };
  });

  it('initially displays offline and pulls status from main process', async () => {
    render(
      <RemoteStatusProvider>
        <TestComponent />
      </RemoteStatusProvider>
    );

    // Context defaults to offline before invoke resolves
    expect(screen.getByTestId('status')).toHaveTextContent('offline');

    // Wait for the get-status promise to resolve and update status
    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('online');
    });

    expect(mockInvoke).toHaveBeenCalledWith('remote:get-status');
    expect(mockOn).toHaveBeenCalledWith('remote:status-changed', expect.any(Function));
  });

  it('updates state dynamically when status-changed push event is received', async () => {
    mockInvoke.mockResolvedValue(false); // start offline

    render(
      <RemoteStatusProvider>
        <TestComponent />
      </RemoteStatusProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('offline');
    });

    // Simulate status change to online via push
    act(() => {
      if (statusChangedCallback) {
        statusChangedCallback(true);
      }
    });

    expect(screen.getByTestId('status')).toHaveTextContent('online');

    // Simulate status change back to offline
    act(() => {
      if (statusChangedCallback) {
        statusChangedCallback(false);
      }
    });

    expect(screen.getByTestId('status')).toHaveTextContent('offline');
  });

  it('cleans up ipcRenderer listener on unmount', async () => {
    const { unmount } = render(
      <RemoteStatusProvider>
        <TestComponent />
      </RemoteStatusProvider>
    );

    unmount();

    expect(mockUnsubscribe).toHaveBeenCalled();
  });
});
