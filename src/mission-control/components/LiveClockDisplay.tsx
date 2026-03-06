import { useLiveClock } from '../hooks/useLiveClock';

export function LiveClockDisplay() {
  const now = useLiveClock();
  return (
    <span
      data-testid="mc-clock"
      style={{
        color: 'var(--mc-text)',
        fontSize: 22,
        fontVariantNumeric: 'tabular-nums',
        fontWeight: 900,
        letterSpacing: '-0.02em',
      }}
    >
      {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
    </span>
  );
}
