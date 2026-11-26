import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MissionStartingCard, MISSION_STARTING_CARD_MS } from './MissionStartingCard';

describe('MissionStartingCard', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('says a mission is starting', () => {
    render(<MissionStartingCard onDismiss={() => {}} />);
    expect(screen.getByText('A mission is starting!')).toBeTruthy();
  });

  it('dismisses itself once, after its time', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<MissionStartingCard onDismiss={onDismiss} />);
    act(() => { vi.advanceTimersByTime(MISSION_STARTING_CARD_MS - 1); });
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('can be tapped away', () => {
    const onDismiss = vi.fn();
    render(<MissionStartingCard onDismiss={onDismiss} />);
    fireEvent.click(screen.getByTestId('mc-mission-starting-card'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('clears its timer when it unmounts', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const { unmount } = render(<MissionStartingCard onDismiss={onDismiss} />);
    unmount();
    act(() => { vi.advanceTimersByTime(MISSION_STARTING_CARD_MS * 2); });
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
