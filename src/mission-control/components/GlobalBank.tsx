// ============================================================
// Mission Control — Global Bank (Vault)
// Source of truth for the economy. Shows stacked coins,
// a manual (+) button, and handles drag-from-bank.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMCState, useMCDispatch } from '../store/useMCStore.tsx';
import { Token } from './Token';
import type { DisplayCase } from '../types';

// Each rendered coin has a stable unique ID so React / framer-motion
// can remove the *correct* coin when one is deposited.
interface BankToken {
  id: string;
}

let _idCounter = 0;
const newId = () => `bt-${_idCounter++}`;

interface GlobalBankProps {
  /** The current list of display cases — used for drop validation */
  cases: DisplayCase[];
  /** Bounding rects of each case element, keyed by caseId */
  caseRects: Record<number, DOMRect | null>;
}

export function GlobalBank({ cases, caseRects }: GlobalBankProps) {
  const state = useMCState();
  const dispatch = useMCDispatch();

  // ------------------------------------------------------------------
  // Stable token list — keeps identity across re-renders so framer-motion
  // exits the *correct* coin (the dragged one) not a random last one.
  // ------------------------------------------------------------------
  const [bankTokens, setBankTokens] = useState<BankToken[]>(() =>
    Array.from({ length: state.bankCount }, () => ({ id: newId() })),
  );

  // Track which token IDs are mid-exit (fade/shrink before state dispatch)
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set());

  // Sync bankTokens length when the store count changes via external actions
  // (e.g. VACUUM empties the bank, REFUND adds back tokens)
  const prevBankCount = useRef(state.bankCount);
  useEffect(() => {
    const diff = state.bankCount - prevBankCount.current;
    prevBankCount.current = state.bankCount;
    if (diff === 0) return;

    if (diff > 0) {
      // Tokens added externally — append
      setBankTokens(prev => [
        ...prev,
        ...Array.from({ length: diff }, () => ({ id: newId() })),
      ]);
    } else {
      // Tokens removed externally (vacuum, etc.) — trim from the end
      setBankTokens(prev => prev.slice(0, Math.max(0, prev.length + diff)));
    }
  }, [state.bankCount]);

  // ------------------------------------------------------------------
  // Drop handler — called by Token via onDrop(id, x, y)
  // ------------------------------------------------------------------
  const handleTokenDrop = useCallback(
    (tokenId: string, x: number, y: number): boolean => {
      // Find the first ACTIVE case whose rect contains the drop point
      const hit = Object.entries(caseRects).find(([id, rect]) => {
        if (!rect) return false;
        const caseId = Number.parseInt(id);
        const targetCase = cases.find(c => c.id === caseId);
        // Only deposit into active cases
        if (!targetCase || targetCase.status !== 'active') return false;
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
      });

      if (!hit) {
        // Dropped on bank, empty pedestal, or anywhere else → spring back
        return false;
      }

      const caseId = Number.parseInt(hit[0]);

      // Animate THIS token out before updating state
      setExitingIds(prev => new Set(prev).add(tokenId));

      setTimeout(() => {
        dispatch({ type: 'DEPOSIT_TO_CASE', caseId, amount: 1 });
        setBankTokens(prev => prev.filter(t => t.id !== tokenId));
        prevBankCount.current = Math.max(0, prevBankCount.current - 1);
        setExitingIds(prev => {
          const next = new Set(prev);
          next.delete(tokenId);
          return next;
        });
      }, 280);

      return true; // consumed — Token will NOT spring back
    },
    [cases, caseRects, dispatch],
  );



  // ------------------------------------------------------------------
  // Add / Remove coin handlers
  // ------------------------------------------------------------------
  const handleAddCoin = useCallback((amount = 1) => {
    for (let i = 0; i < amount; i++) {
      dispatch({ type: 'ADD_TOKEN' });
      setBankTokens(prev => [...prev, { id: newId() }]);
      prevBankCount.current += 1;
    }
  }, [dispatch]);

  const handleRemoveCoin = useCallback(() => {
    if (state.bankCount <= 0) return;
    dispatch({ type: 'REMOVE_TOKEN' });
    setBankTokens(prev => prev.slice(0, prev.length - 1));
    prevBankCount.current = Math.max(0, prevBankCount.current - 1);
  }, [dispatch, state.bankCount]);

  // Admin popup state
  const [popupOpen, setPopupOpen] = useState(false);

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <div
      className="mc-panel"
      style={{
        flex: '0 0 240px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 16,
        background: '#f8f6ff',
      }}
    >
      {/* ── Header (tap to open admin popup) ── */}
      <button
        onClick={() => setPopupOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'none', border: 'none', cursor: 'pointer', padding: 0, width: '100%',
        }}
        aria-label="Bank admin"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 20 }}>🏦</span>
          <span style={{
            fontSize: 11, fontWeight: 800, letterSpacing: '0.08em',
            color: 'var(--mc-text-muted)', textTransform: 'uppercase',
          }}>
            The Bank
          </span>
        </div>
        <div style={{
          background: 'linear-gradient(180deg, #f7c948 0%, #f0b820 100%)',
          color: '#5a3e00',
          borderRadius: 20,
          padding: '2px 12px',
          fontWeight: 900,
          fontSize: 15,
          boxShadow: '0 2px 6px rgba(200,155,16,0.3)',
          minWidth: 32,
          textAlign: 'center',
          border: '1.5px solid rgba(247,201,72,0.6)',
        }}>
          {state.bankCount}
        </div>
      </button>

      {/* ── Admin Popup ── */}
      <AnimatePresence>
        {popupOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPopupOpen(false)}
              style={{
                position: 'fixed', inset: 0, zIndex: 150,
                background: 'rgba(0,0,0,0.15)',
              }}
            />
            {/* Panel */}
            <motion.div
              key="panel"
              initial={{ opacity: 0, y: -12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 380, damping: 28 }}
              style={{
                position: 'relative', zIndex: 160,
                background: 'linear-gradient(160deg,#fff9f0,#fff4e0)',
                border: '1.5px solid rgba(247,201,72,0.5)',
                borderRadius: 16,
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                boxShadow: '0 8px 24px rgba(200,155,16,0.18)',
              }}
              data-testid="mc-bank-admin-popup"
            >
              <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#b08a00' }}>
                ⚙️ Bank Admin
              </span>
              {/* Coin control row */}
              <div style={{ display: 'flex', gap: 8 }}>
                {[
                  { label: '+1', amount: 1,  bg: 'linear-gradient(180deg,#c8fcd8,#a0f0b8)', border: '#6de89e', color: '#1a6a35' },
                  { label: '+2', amount: 2,  bg: 'linear-gradient(180deg,#d4f7e0,#b0f0cc)', border: '#6de89e', color: '#1a6a35' },
                  { label: '−1', amount: -1, bg: 'linear-gradient(180deg,#ffd6d6,#ffaaaa)', border: '#ff8888', color: '#c0392b' },
                ].map(({ label, amount, bg, border, color }) => (
                  <motion.button
                    key={label}
                    whileTap={{ scale: 0.9, y: 2 }}
                    whileHover={{ scale: 1.06 }}
                    onClick={() => amount > 0 ? handleAddCoin(amount) : handleRemoveCoin()}
                    disabled={amount < 0 && state.bankCount === 0}
                    style={{
                      flex: 1,
                      background: bg,
                      border: `1.5px solid ${border}`,
                      borderRadius: 12,
                      padding: '10px 4px',
                      fontSize: 16,
                      fontWeight: 900,
                      color,
                      cursor: amount < 0 && state.bankCount === 0 ? 'not-allowed' : 'pointer',
                      opacity: amount < 0 && state.bankCount === 0 ? 0.4 : 1,
                      fontFamily: "'Nunito', sans-serif",
                      boxShadow: `0 3px 0 ${border}88`,
                    }}
                  >
                    {label}
                  </motion.button>
                ))}
              </div>
              <button
                onClick={() => setPopupOpen(false)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 10, fontWeight: 800, color: '#b08a00',
                  textAlign: 'center', padding: '2px 0', fontFamily: "'Nunito', sans-serif",
                }}
              >
                close ✕
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Coin Tray ── */}
      <div
        className="mc-tray"
        style={{
          flex: 1,
          padding: '12px 8px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 7,
          alignContent: 'flex-start',
          minHeight: 120,
          position: 'relative',
        }}
      >
        <AnimatePresence>
          {bankTokens.map((token, i) => {
            const isExiting = exitingIds.has(token.id);
            return (
              <motion.div
                key={token.id}
                initial={{ y: -60, opacity: 0, scale: 0.6 }}
                animate={
                  isExiting
                    ? { scale: 0, opacity: 0, y: 10 }
                    : { y: 0, opacity: 1, scale: 1 }
                }
                exit={{ y: 20, opacity: 0, scale: 0.5 }}
                transition={{
                  type: 'spring',
                  stiffness: 400,
                  damping: 22,
                  delay: isExiting ? 0 : i * 0.02,
                }}
              >
                <Token
                  id={token.id}
                  onDrop={handleTokenDrop}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>

        {state.bankCount === 0 && bankTokens.length === 0 && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{
              color: 'var(--mc-text-dim)',
              fontSize: 12,
              width: '100%',
              textAlign: 'center',
              paddingTop: 20,
              display: 'block',
              fontWeight: 700,
            }}
          >
            Empty — earn some coins! 🪙
          </motion.span>
        )}
      </div>
    </div>
  );
}
