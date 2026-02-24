// ============================================================
// Mission Control — Root Layout
// The master entry component for "The Big Kid Command Center".
//
// ⚠️  ISOLATION CONTRACT:
//   - Does NOT import from parent app (../components, ../hooks, etc.)
//   - CSS: imports ./styles/mc.css (isolated to this module)
//   - State: uses MCStoreProvider (self-contained)
// ============================================================

import './styles/mc.css';
import { useRef, useCallback, useState } from 'react';
import { MCStoreProvider, useMCState, useMCDispatch } from './store/useMCStore.tsx';
import { DragLayer } from './components/DragLayer';
import { GlobalBank } from './components/GlobalBank';
import { GoalPedestal } from './components/GoalPedestal';
import { MissionOverlay } from './components/MissionOverlay';
import { MCSettingsOverlay } from './components/MCSettingsOverlay';
import { PrivilegeCardButton } from './components/PrivilegeCardButton';
import { ResponsibilityPanel } from './components/ResponsibilityPanel';
import { useLiveClock } from './hooks/useLiveClock';
import { useMissionScheduler } from './hooks/useMissionScheduler';

// ── Inner layout (needs access to store) ──────────────────────────────────────
function MCLayout() {
  const state    = useMCState();
  const dispatch  = useMCDispatch();
  const now = useLiveClock();
  useMissionScheduler();
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Refs to each pedestal DOM element for drop-zone hit testing
  const pedestalRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const caseRects = useRef<Record<number, DOMRect | null>>({});

  // Refresh DOMRect measurements whenever a token drag starts or ends
  const refreshRects = useCallback(() => {
    for (const [id, el] of Object.entries(pedestalRefs.current)) {
      caseRects.current[Number.parseInt(id)] = el ? el.getBoundingClientRect() : null;
    }
  }, []);

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
        {/* Title + Settings */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontSize: 15, fontWeight: 900, letterSpacing: '0.08em',
            color: 'var(--mc-text)', textTransform: 'uppercase',
          }}>
            ⭐ Command Center
          </span>
          <button
            data-testid="mc-settings-btn"
            title="Settings"
            onClick={() => setSettingsOpen(true)}
            style={{
              background: 'rgba(160,150,230,0.15)',
              border: '1.5px solid rgba(160,150,230,0.3)',
              borderRadius: 10,
              padding: '4px 8px',
              fontSize: 15,
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            ⚙️
          </button>
        </div>

        {/* Privilege Cards */}
        <div style={{ display: 'flex', gap: 8 }}>
          {state.privileges.map(p => (
            <PrivilegeCardButton key={p.id} p={p} />
          ))}
        </div>

        {/* Clock + Settings + Manual mission triggers */}
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
          caseRects={caseRects.current}
        />

        {/* ── CENTER: Goal Pedestals (2 columns × 2 rows) ── */}
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
                  bankCount={state.bankCount}
                  innerRef={el => { pedestalRefs.current[c.id] = el; }}
                />
              ))}
            </div>
            {/* Column 2: cases 2 & 3 */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
              {state.cases.slice(2, 4).map(c => (
                <GoalPedestal
                  key={c.id}
                  case_={c}
                  bankCount={state.bankCount}
                  innerRef={el => { pedestalRefs.current[c.id] = el; }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* ── RIGHT: Responsibilities ── */}
        <ResponsibilityPanel />
      </div>

      {/* ===== MISSION OVERLAY ===== */}
      <MissionOverlay />

      {/* ===== SETTINGS ===== */}
      <MCSettingsOverlay open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

// ── Public export — wraps everything in providers ─────────────────────────────
export function MissionControl() {
  return (
    <MCStoreProvider>
      <DragLayer>
        <MCLayout />
      </DragLayer>
    </MCStoreProvider>
  );
}
