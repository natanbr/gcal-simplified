// ============================================================
// Mission Control — "A mission is starting!" card
// Shown after a quick game was closed because a mission started under it
// (useQuickGameSession). The game is already gone when this appears, so the
// card only explains why; it never holds a game open. One single-shot timer,
// cleared on unmount, and no animation loop (idle budget: docs/performance.md).
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { useEffect } from 'react';

/** How long the card stays if the child does not tap it away. */
export const MISSION_STARTING_CARD_MS = 4000;

interface MissionStartingCardProps {
  readonly onDismiss: () => void;
}

export function MissionStartingCard({ onDismiss }: MissionStartingCardProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, MISSION_STARTING_CARD_MS);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      data-testid="mc-mission-starting-card"
      role="status"
      onClick={onDismiss}
      style={{
        position: 'fixed',
        inset: 0,
        // Above the game overlays (z-[1000]) it replaces and below the cheat trap.
        zIndex: 1200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--mc-bg)',
        cursor: 'pointer',
      }}
    >
      <div
        style={{
          background: 'var(--mc-surface)',
          border: '2px solid var(--mc-border-bright)',
          borderRadius: 28,
          boxShadow: 'var(--mc-depth-shadow)',
          padding: '32px 48px',
          textAlign: 'center',
          fontFamily: "'Nunito', sans-serif",
          color: 'var(--mc-text)',
        }}
      >
        <div style={{ fontSize: 64, lineHeight: 1 }}>🚀</div>
        <div style={{ fontSize: 28, fontWeight: 900, marginTop: 12 }}>A mission is starting!</div>
        <div style={{ fontSize: 16, fontWeight: 700, marginTop: 6, color: 'var(--mc-text-muted)' }}>
          Your game is over for now.
        </div>
      </div>
    </div>
  );
}
