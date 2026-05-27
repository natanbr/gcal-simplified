// ============================================================
// Mission Control — Root Layout
// The master entry component for "The Big Kid Command Center".
//
// ⚠️  ISOLATION CONTRACT:
//   - Does NOT import from parent app (../components, ../hooks, etc.)
//   - CSS: imports ./styles/mc.css (isolated to this module)
//   - State: uses MCStoreProvider (provided by App.tsx — do not re-wrap here)
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ActivityLogView } from './components/ActivityLogView';
import { CelebrationOverlay } from './components/CelebrationOverlay';
import { CheatTrapOverlay } from './components/CheatTrapOverlay';
import { GameTokenPanel } from './components/GameTokenPanel';
import { GlobalBank } from './components/GlobalBank';
import { GoalPedestal } from './components/GoalPedestal';
import { LiveClockDisplay } from './components/LiveClockDisplay';
import { MCSettingsOverlay } from './components/MCSettingsOverlay';
import { PrivilegesPanel } from './components/PrivilegesPanel';
import { ResponsibilityPanel } from './components/ResponsibilityPanel';
import { SnakeGameOverlay } from './games/snake/SnakeGameOverlay';
import { useMCDispatch, useMCState } from './store/useMCStore.tsx';
import { RemoteStatusProvider, useRemoteStatus } from './contexts/RemoteStatusContext';
import './styles/mc.css';

// ── Inner layout (needs access to store) ──────────────────────────────────────
interface MCLayoutProps {
  readonly onBackToCalendar?: () => void;
}

function RemoteIndicator() {
  const status = useRemoteStatus();
  const isOnline = status === 'online';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 12,
        padding: '6px 12px',
        fontSize: 13,
        fontWeight: 800,
        color: 'var(--mc-text-muted)',
      }}
    >
      <motion.span
        animate={isOnline ? { scale: [1, 1.3, 1], opacity: [0.6, 1, 0.6] } : {}}
        transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          backgroundColor: isOnline ? '#10B981' : '#EF4444',
          boxShadow: isOnline ? '0 0 8px rgba(16, 185, 129, 0.8)' : 'none',
        }}
      />
      <span style={{ color: 'var(--mc-text)' }}>Remote</span>
    </div>
  );
}

function MCLayout({ onBackToCalendar }: MCLayoutProps) {
  const state    = useMCState();
  const dispatch  = useMCDispatch();
  
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [snakeGameOpen, setSnakeGameOpen] = useState(false);
  const snakeGameStartRef = useRef<string | null>(null);

  // Refs to each pedestal DOM element for drop-zone hit testing
  const bankRef = useRef<HTMLDivElement | null>(null);
  const pedestalRefs = useRef<Record<number, HTMLDivElement | null>>({});
  
  // Single ref holding both bank and case rects so they can be passed without restickying
  const layoutRects = useRef<{ bank: DOMRect | null; cases: Record<number, DOMRect | null> }>({
    bank: null,
    cases: {},
  });

  // Refresh DOMRect measurements whenever a token drag starts or ends
  const refreshRects = useCallback(() => {
    layoutRects.current.bank = bankRef.current ? bankRef.current.getBoundingClientRect() : null;
    for (const [id, el] of Object.entries(pedestalRefs.current)) {
      layoutRects.current.cases[Number.parseInt(id)] = el ? el.getBoundingClientRect() : null;
    }
  }, []);

  const [showCheatTrap, setShowCheatTrap] = useState(false);
  const cheatTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (state.hasUnreviewedCheatAttempt && !showCheatTrap) {
      setShowCheatTrap(true);
      if (cheatTimerRef.current) clearTimeout(cheatTimerRef.current);
      cheatTimerRef.current = setTimeout(() => {
        setShowCheatTrap(false);
        dispatch({ type: 'CLEAR_CHEAT_FLAG' });
      }, 5000);
    }
  }, [state.hasUnreviewedCheatAttempt, dispatch, showCheatTrap]);

  const handleCheatDetected = useCallback(() => {
    dispatch({ type: 'CHEAT_ATTEMPT' });
    setShowCheatTrap(true);
    if (cheatTimerRef.current) clearTimeout(cheatTimerRef.current);
    cheatTimerRef.current = setTimeout(() => {
      setShowCheatTrap(false);
    }, 5000);
  }, [dispatch]);

  const handleQuickGameOpen = useCallback(() => {
    snakeGameStartRef.current = new Date().toISOString();
    dispatch({
      type: 'ADD_LOG',
      log: {
        id: `game-start-${Date.now()}`,
        timestamp: new Date().toISOString(),
        icon: '🕹️',
        message: 'Quick Game started',
        type: 'reward',
        colorKey: 'system',
      },
    });
    setSnakeGameOpen(true);
  }, [dispatch]);

  const handleQuickGameClose = useCallback((score: number) => {
    const startedAt = snakeGameStartRef.current;
    const endedAt = new Date().toISOString();
    let durationLabel = '';
    if (startedAt) {
      const durationMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();
      const mins = Math.floor(durationMs / 60000);
      const secs = Math.floor((durationMs % 60000) / 1000);
      durationLabel = mins > 0 ? ` (${mins}m ${secs}s)` : ` (${secs}s)`;
    }
    dispatch({
      type: 'ADD_LOG',
      log: {
        id: `game-end-${Date.now()}`,
        timestamp: endedAt,
        icon: '🏁',
        message: `Quick Game ended — Score: ${score}${durationLabel}`,
        type: 'reward',
        colorKey: 'system',
      },
    });
    snakeGameStartRef.current = null;
    setSnakeGameOpen(false);
  }, [dispatch]);

  return (
    <div
      className="mc-root"
      style={{ display: 'flex', flexDirection: 'column' }}
      onPointerDown={refreshRects}  // refresh rects when user starts any drag
    >
      {/* ===== STATUS BROW (Top Bar) ===== */}
      <div
        className="mc-brow"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 20px',
          height: 72,
          flexShrink: 0,
        }}
      >
        {/* Title + Back to Calendar + Settings */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {onBackToCalendar && (
            <button
              data-testid="mc-back-to-calendar-btn"
              title="Back to Calendar"
              onClick={onBackToCalendar}
              style={{
                background: 'rgba(100,180,255,0.15)',
                border: '1.5px solid rgba(100,180,255,0.35)',
                borderRadius: 14,
                padding: '7px 16px',
                fontSize: 15,
                fontWeight: 900,
                cursor: 'pointer',
                color: 'var(--mc-text)',
                fontFamily: "'Nunito',sans-serif",
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
              }}
            >
              ← Calendar
            </button>
          )}
          <span style={{
            fontSize: 15, fontWeight: 900, letterSpacing: '0.08em',
            color: 'var(--mc-text)', textTransform: 'uppercase',
          }}>
            ⭐ Command Center
          </span>
          <RemoteIndicator />
          <ActivityLogView />
          <button
            data-testid="mc-settings-btn"
            title="Settings"
            onClick={() => setSettingsOpen(true)}
            style={{
              background: 'rgba(160,150,230,0.15)',
              border: '1.5px solid rgba(160,150,230,0.3)',
              borderRadius: 14,
              padding: '7px 16px',
              fontSize: 15,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ⚙️
          </button>
        </div>

        {/* Clock + Manual mission triggers */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Manual triggers */}
          <button
            data-testid="mc-trigger-morning"
            title="Trigger Morning Routine"
            onClick={() => dispatch({ type: 'SET_ACTIVE_MISSION', phase: 'morning' })}
            style={{
              background: 'linear-gradient(135deg,#fff7d6,#ffe085)',
              border: '2px solid #f7c948',
              borderRadius: 14,
              padding: '7px 16px',
              fontSize: 15,
              fontWeight: 900,
              color: '#7a5800',
              cursor: 'pointer',
              fontFamily: "'Nunito',sans-serif",
              boxShadow: '0 3px 0 #d4a800',
            }}
          >
            ☀️ AM
          </button>
          <button
            data-testid="mc-trigger-evening"
            title="Trigger Evening Routine"
            onClick={() => dispatch({ type: 'SET_ACTIVE_MISSION', phase: 'evening' })}
            style={{
              background: 'linear-gradient(135deg,#ece8ff,#c8b8ff)',
              border: '2px solid #a98dff',
              borderRadius: 14,
              padding: '7px 16px',
              fontSize: 15,
              fontWeight: 900,
              color: '#3d2a80',
              cursor: 'pointer',
              fontFamily: "'Nunito',sans-serif",
              boxShadow: '0 3px 0 #8060cc',
            }}
          >
            🌙 PM
          </button>
          <LiveClockDisplay />
        </div>
      </div>

      {/* ===== MAIN STAGE ===== */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          gap: 14,
          padding: '14px 18px',
          overflow: 'hidden',
          alignItems: 'stretch',
        }}
      >
        {/* ── LEFT: Global Bank ── */}
        <GlobalBank
          cases={state.cases}
          layoutRects={layoutRects.current}
          innerRef={el => { bankRef.current = el; }}
          onCheatDetected={handleCheatDetected}
        />

        {/* ── CENTER: Goal Pedestals + Responsibilities ── */}
        <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <span style={{
            fontSize: 11, fontWeight: 900, letterSpacing: '0.08em',
            color: 'var(--mc-text)', textTransform: 'uppercase',
          }}>
            🏆 Goals
          </span>
          <div style={{ display: 'flex', gap: 10, flex: 1, minHeight: 0 }}>
            {/* Column 1: cases 0 & 1 */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
              {state.cases.slice(0, 2).map(c => (
                <GoalPedestal
                  key={c.id}
                  case_={c}
                  cases={state.cases}
                  bankCount={state.bankCount}
                  innerRef={el => { pedestalRefs.current[c.id] = el; }}
                  layoutRects={layoutRects.current}
                  onQuickGameOpen={handleQuickGameOpen}
                />
              ))}
            </div>
            {/* Column 2: cases 2 & 3 */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
              {state.cases.slice(2, 4).map(c => (
                <GoalPedestal
                  key={c.id}
                  case_={c}
                  cases={state.cases}
                  bankCount={state.bankCount}
                  innerRef={el => { pedestalRefs.current[c.id] = el; }}
                  layoutRects={layoutRects.current}
                  onQuickGameOpen={handleQuickGameOpen}
                />
              ))}
            </div>
            {/* Column 3: Responsibilities */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
              <ResponsibilityPanel />
              <GameTokenPanel />
              <PrivilegesPanel interactive={false} />
            </div>
          </div>
        </div>
      </div>

      {/* ===== SETTINGS ===== */}
      <MCSettingsOverlay open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* ===== CHEAT TRAP ===== */}
      <CheatTrapOverlay show={showCheatTrap} />

      {/* ===== QUICK GAME (SNAKE) ===== */}
      <SnakeGameOverlay open={snakeGameOpen} onClose={handleQuickGameClose} />

      {/* ===== REMOTE ANIMATIONS ===== */}
      <CelebrationOverlay />
    </div>
  );
}

// ── Public export — MCStoreProvider + DragLayer now live in App.tsx ───────────
// MissionOverlay is also rendered at App level so it overlays any view.
export interface MissionControlProps {
  readonly onBackToCalendar?: () => void;
}

export function MissionControl({ onBackToCalendar }: MissionControlProps) {
  return (
    <RemoteStatusProvider>
      <MCLayout onBackToCalendar={onBackToCalendar} />
    </RemoteStatusProvider>
  );
}
