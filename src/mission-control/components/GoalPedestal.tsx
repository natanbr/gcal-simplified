// ============================================================
// Mission Control — Goal Pedestal (Display Case)
// States: empty → selecting → active → complete
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMCDispatch, useMCState } from '../store/useMCStore';
import { Button3D } from './Button3D';
import { Token } from './Token';
import type { DisplayCase, RewardIcon } from '../types';
import { REWARDS, REWARD_MAP } from '../rewardCatalogue';

let _caseTokenIdCounter = 0;
const newCaseTokenId = (caseId: number) => `ct-${caseId}-${_caseTokenIdCounter++}`;

// ── Confetti particle ─────────────────────────────────────────────────────────
const CONFETTI_COLORS = ['#f7c948', '#ff8fcc', '#89c4ff', '#a8f0df', '#c5a8ff', '#ffb347'];

interface ConfettiParticle {
  id: number;
  color: string;
  x: number;   // starting x % within card
  angle: number;
  dist: number;
  size: number;
  duration: number;
}

function Confetti({ active }: { active: boolean }) {
  const [particles, setParticles] = useState<ConfettiParticle[]>([]);

  useEffect(() => {
    if (!active) { setParticles([]); return; }
    const burst = Array.from({ length: 26 }, (_, i) => ({
      id: i,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      x: 10 + Math.random() * 80,
      angle: Math.random() * 360,
      dist: 40 + Math.random() * 80,
      size: 5 + Math.random() * 6,
      duration: 0.7 + Math.random() * 0.5,
    }));
    setParticles(burst);
  }, [active]);

  if (!active || particles.length === 0) return null;

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 10, borderRadius: 'inherit' }}>
      {particles.map(p => (
        <motion.div
          key={p.id}
          initial={{ opacity: 1, x: `${p.x}%`, y: '50%', scale: 1 }}
          animate={{
            opacity: 0,
            x: `calc(${p.x}% + ${Math.cos((p.angle * Math.PI) / 180) * p.dist}px)`,
            y: `calc(50% + ${Math.sin((p.angle * Math.PI) / 180) * p.dist}px)`,
            scale: 0.3,
            rotate: p.angle * 2,
          }}
          transition={{ duration: p.duration, ease: 'easeOut' }}
          style={{
            position: 'absolute',
            width: p.size,
            height: p.size,
            borderRadius: Math.random() > 0.5 ? '50%' : 2,
            background: p.color,
          }}
        />
      ))}
    </div>
  );
}

// ── Token slot row — matches bank coin size ────────────────────────────────────
function TokenSlots({ filled, total, tokens, exitingIds, onDrop, onDragStateChange }: { filled: number; total: number; tokens: {id: string}[], exitingIds: Set<string>, onDrop: (id: string, x: number, y: number) => boolean, onDragStateChange: (isDragging: boolean) => void }) {
  // Only overlap the placeholder tokens if there are more than 30 total.
  // We'll stack them horizontally with negative margin to fit 16 per row.
  const isLarge = total > 30;
  const maxPerRow = isLarge ? 16 : 8;

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: isLarge ? '6px 0' : 6,
      justifyContent: 'center',
      padding: '6px 4px',
      maxWidth: '100%',
    }}>
      {Array.from({ length: total }, (_, i) => {
        const token = i < tokens.length ? tokens[i] : null;
        const isFilled = i < filled;
        const isExiting = token ? exitingIds.has(token.id) : false;

        return (
          <motion.div
            key={i}
            initial={false}
            animate={{ scale: isFilled ? 1 : 0.88, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 420, damping: 18 }}
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: isLarge ? 'rgba(255,255,255,0.85)' : 'transparent',
              border: '2.5px dashed rgba(160,150,230,0.5)',
              boxShadow: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
              marginLeft: isLarge && i % maxPerRow !== 0 ? -18 : 0,
            }}
          >
            <AnimatePresence>
              {isFilled && token && !isExiting && (
                <motion.div
                  key={token.id}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 18 }}
                >
                  <Token id={token.id} onDrop={onDrop} onDragStateChange={onDragStateChange} />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
interface GoalPedestalProps {
  case_: DisplayCase;
  cases: DisplayCase[];
  innerRef?: (el: HTMLDivElement | null) => void;
  bankCount: number;
  layoutRects: { bank: DOMRect | null; cases: Record<number, DOMRect | null> };
}

export function GoalPedestal({ case_, cases, innerRef, bankCount, layoutRects }: GoalPedestalProps) {
  const dispatch = useMCDispatch();
  const state = useMCState();
  const [isSelecting, setIsSelecting] = useState(false);
  const [leverTilted, setLeverTilted] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  
  // Track dragging so we can elevate the z-index (delayed lower so spring-back isn't clipped)
  const [isDragging, setIsDragging] = useState(false);
  const dragTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleDragStateChange = useCallback((dragging: boolean) => {
    if (dragging) {
      if (dragTimeoutRef.current) clearTimeout(dragTimeoutRef.current);
      setIsDragging(true);
    } else {
      dragTimeoutRef.current = setTimeout(() => setIsDragging(false), 500);
    }
  }, []);

  const [caseTokens, setCaseTokens] = useState<{id: string}[]>(() => 
    Array.from({ length: case_.tokenCount }, () => ({ id: newCaseTokenId(case_.id) }))
  );
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set());

  // Sync token length
  const prevCount = useRef(case_.tokenCount);
  useEffect(() => {
    const diff = case_.tokenCount - prevCount.current;
    prevCount.current = case_.tokenCount;
    if (diff === 0) return;
    if (diff > 0) {
      setCaseTokens(prev => [...prev, ...Array.from({ length: diff }, () => ({ id: newCaseTokenId(case_.id) }))]);
    } else {
      setCaseTokens(prev => prev.slice(0, Math.max(0, prev.length + diff)));
    }
  }, [case_.tokenCount, case_.id]);

  const handleTokenDrop = useCallback((tokenId: string, x: number, y: number): boolean => {
    if (!layoutRects) return false;
    
    // Check if dropped on Bank
    if (layoutRects.bank && x >= layoutRects.bank.left && x <= layoutRects.bank.right && y >= layoutRects.bank.top && y <= layoutRects.bank.bottom) {
      setExitingIds(prev => new Set(prev).add(tokenId));
      setTimeout(() => {
        dispatch({ type: 'MOVE_TOKEN', from: case_.id, to: 'bank' });
        setCaseTokens(prev => prev.filter(t => t.id !== tokenId));
        prevCount.current = Math.max(0, prevCount.current - 1);
        setExitingIds(prev => {
          const next = new Set(prev);
          next.delete(tokenId);
          return next;
        });
      }, 280);
      return true;
    }

    // Check if dropped on another active Case
    const hit = Object.entries(layoutRects.cases).find(([id, rect]) => {
      if (!rect) return false;
      const targetCaseId = Number.parseInt(id);
      if (targetCaseId === case_.id) return false;
      
      const targetCase = cases.find(c => c.id === targetCaseId);
      if (!targetCase || targetCase.status !== 'active') return false;

      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    });

    if (hit) {
      const targetCaseId = Number.parseInt(hit[0]);
      setExitingIds(prev => new Set(prev).add(tokenId));
      setTimeout(() => {
        dispatch({ type: 'MOVE_TOKEN', from: case_.id, to: targetCaseId });
        setCaseTokens(prev => prev.filter(t => t.id !== tokenId));
        prevCount.current = Math.max(0, prevCount.current - 1);
        setExitingIds(prev => {
          const next = new Set(prev);
          next.delete(tokenId);
          return next;
        });
      }, 280);
      return true;
    }

    return false;
  }, [case_.id, cases, layoutRects, dispatch]);

  const reward = case_.reward ? REWARD_MAP[case_.reward] : null;
  const isComplete = case_.status === 'active' && case_.tokenCount >= case_.targetCount;

  // Fire confetti once when goal becomes complete
  useEffect(() => {
    if (isComplete) {
      setShowConfetti(true);
      const t = setTimeout(() => setShowConfetti(false), 1800);
      return () => clearTimeout(t);
    }
  }, [isComplete]);

  const handleSelectReward = (rewardId: RewardIcon) => {
    const meta = REWARD_MAP[rewardId];
    dispatch({ type: 'SELECT_CASE', caseId: case_.id, reward: rewardId, targetCount: meta.targetCount });
    setIsSelecting(false);
  };

  const handleRefund = () => {
    setLeverTilted(true);
    setTimeout(() => {
      dispatch({ type: 'REFUND_CASE', caseId: case_.id });
      setIsSelecting(false);
      setLeverTilted(false);
    }, 450);
  };

  const handleUse = () => {
    // Permanently consume the tokens — reward has been redeemed, no refund
    dispatch({ type: 'CONSUME_CASE', caseId: case_.id });
  };

  // Pastel accent per pedestal — only used when ACTIVE
  const pastelAccents = [
    { bg: '#fff0fa', border: 'rgba(255,173,213,0.5)' },
    { bg: '#f0f4ff', border: 'rgba(137,196,255,0.5)' },
    { bg: '#f3f0ff', border: 'rgba(197,168,255,0.5)' },
  ];
  const accent = pastelAccents[case_.id % pastelAccents.length];

  const isEmptyIdle = case_.status === 'empty' && !isSelecting;
  const isEmptySelecting = case_.status === 'empty' && isSelecting;

  return (
    <div
      ref={innerRef}
      className={isEmptyIdle ? '' : 'mc-panel'}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        padding: isEmptyIdle ? '10px 8px' : '10px 8px',
        minHeight: 180,
        position: 'relative',
        zIndex: isDragging ? 50 : 1, // Elevate when dragging
        overflow: 'visible', // Must be visible so dragged token isn't clipped
        borderRadius: 20,
        // Empty idle: dashed border, no background
        background: isEmptyIdle
          ? 'transparent'
          : isComplete
            ? '#fffbeb'
            : isEmptySelecting
              ? '#fafafe'
              : accent.bg,
        borderWidth: isEmptyIdle ? 2 : 1.5,
        borderStyle: isEmptyIdle ? 'dashed' : 'solid',
        borderColor: isEmptyIdle
          ? 'rgba(160,150,230,0.35)'
          : isComplete
            ? 'rgba(247,201,72,0.7)'
            : isEmptySelecting
              ? 'rgba(160,150,230,0.25)'
              : accent.border,
        outline: isComplete ? '2px solid var(--mc-gold)' : 'none',
        boxShadow: isComplete
          ? 'var(--mc-depth-shadow), 0 0 22px rgba(247,201,72,0.35)'
          : isEmptyIdle
            ? 'none'
            : undefined,
      }}
    >
      <Confetti active={showConfetti} />

      {/* ── EMPTY IDLE — just the + button ── */}
      {isEmptyIdle && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%',
          }}
        >
          <motion.button
            whileHover={{ scale: 1.1, y: -2 }}
            whileTap={{ scale: 0.92 }}
            onClick={() => setIsSelecting(true)}
            aria-label="Add a new goal"
            style={{
              width: 54, height: 54, borderRadius: '50%',
              background: 'rgba(255,255,255,0.7)',
              border: '2px dashed rgba(160,150,230,0.5)',
              fontSize: 28, cursor: 'pointer', color: 'var(--mc-text-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(130,120,200,0.1)',
              fontFamily: "'Nunito', sans-serif",
            }}
          >
            +
          </motion.button>
          <span style={{ fontSize: 10, color: 'var(--mc-text-dim)', fontWeight: 700 }}>Add goal</span>
        </motion.div>
      )}

      {/* ── SELECTING — reward picker ── */}
      <AnimatePresence>
        {isEmptySelecting && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              gap: 6, width: '100%',
            }}
          >
            <span style={{
              fontSize: 10, color: 'var(--mc-text-muted)', textAlign: 'center',
              letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 800,
            }}>
              🌟 Pick a Goal
            </span>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7 }}>
              {REWARDS.filter(() => {
                  return true; // we will check rewards using the state accessed before the return
                }).map(r => {
                const config = state.settings.rewardConfigs?.[r.id];
                const isEnabled = config ? config.enabled : true;
                if (!isEnabled) return null;

                const displayTargetCount = config ? config.targetCount : r.targetCount;
                return (
                <motion.button
                  key={r.id}
                  whileTap={{ scale: 0.88 }}
                  whileHover={{ scale: 1.06, y: -2 }}
                  onClick={() => handleSelectReward(r.id)}
                  style={{
                    background: 'rgba(255,255,255,0.9)',
                    border: '1.5px solid rgba(160,150,230,0.25)',
                    borderRadius: 14,
                    padding: '10px 4px 8px',
                    cursor: 'pointer',
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', gap: 4,
                    color: 'var(--mc-text)',
                    boxShadow: '0 2px 8px rgba(130,120,200,0.12)',
                    fontFamily: "'Nunito', sans-serif",
                  }}
                >
                  <span style={{ fontSize: 34, lineHeight: 1 }}>{r.emoji}</span>
                  <span style={{ fontSize: 9, color: 'var(--mc-text-muted)', fontWeight: 700, textAlign: 'center', lineHeight: 1.2 }}>{r.label}</span>
                  <span style={{
                    fontSize: 11, color: '#a87c00', fontWeight: 900,
                    background: 'rgba(247,201,72,0.22)', borderRadius: 6,
                    padding: '2px 6px', border: '1px solid rgba(247,201,72,0.4)',
                  }}>
                    {displayTargetCount} ⭐
                  </span>
                </motion.button>
              );})}
            </div>

            <button
              onClick={() => setIsSelecting(false)}
              style={{
                background: 'none', border: 'none', color: 'var(--mc-text-dim)',
                cursor: 'pointer', fontSize: 10, fontWeight: 700,
                fontFamily: "'Nunito', sans-serif",
              }}
            >
              Cancel
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── ACTIVE ── */}
      <AnimatePresence>
        {case_.status === 'active' && reward && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 5, width: '100%',
            }}
          >
            <span
              className={isComplete ? "mc-anim-pedestal-complete" : "mc-anim-pedestal-idle"}
              style={{ fontSize: 32, lineHeight: 1, marginTop: 2, display: 'inline-block' }}
            >
              {reward.emoji}
            </span>

            <span style={{
              fontSize: 11,
              color: isComplete ? '#a87c00' : 'var(--mc-text-muted)',
              fontWeight: 800,
              textAlign: 'center',
            }}>
              {isComplete ? '🎉 Done!' : reward.label}
            </span>

            <span style={{ fontSize: 10, color: 'var(--mc-text-dim)', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
              {case_.tokenCount} / {case_.targetCount}
            </span>

            <TokenSlots filled={case_.tokenCount} total={case_.targetCount} tokens={caseTokens} exitingIds={exitingIds} onDrop={handleTokenDrop} onDragStateChange={handleDragStateChange} />

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 5, marginTop: 'auto', width: '100%' }}>
              {isComplete ? (
                // "Use" button replaces "All" when goal is complete
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  style={{ flex: 1 }}
                >
                  <Button3D
                    variant="primary"
                    onClick={handleUse}
                    aria-label="Use this reward"
                    style={{
                      flex: 1, width: '100%', justifyContent: 'center', display: 'flex',
                      alignItems: 'center', gap: 4, fontSize: 11,
                      background: 'linear-gradient(180deg, #6de89e 0%, #3dce76 100%)',
                      borderColor: 'rgba(61,206,118,0.5)',
                      color: '#0b4a20',
                    }}
                  >
                    🎁 Use!
                  </Button3D>
                </motion.div>
              ) : (
                <Button3D
                  variant="primary"
                  onClick={() => dispatch({ type: 'VACUUM_TO_CASE', caseId: case_.id })}
                  aria-label="Move needed coins to this goal"
                  disabled={bankCount === 0}
                  style={{ flex: 1, justifyContent: 'center', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}
                >
                  💨 All
                </Button3D>
              )}

              {!isComplete && (
                <motion.div
                  animate={{ rotate: leverTilted ? 45 : 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                  style={{ transformOrigin: 'bottom center' }}
                >
                  <Button3D
                    variant="danger"
                    onClick={handleRefund}
                    aria-label="Refund all coins back to bank"
                    style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}
                  >
                    🗑️
                  </Button3D>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
