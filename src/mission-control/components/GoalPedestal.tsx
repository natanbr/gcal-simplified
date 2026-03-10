// ============================================================
// Mission Control — Goal Pedestal (Display Case)
// States: empty → selecting → active → complete
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMCDispatch } from '../store/useMCStore.tsx';
import { Button3D } from './Button3D';
import type { DisplayCase, RewardIcon } from '../types';
import { REWARDS, REWARD_MAP } from '../rewardCatalogue';

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
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 10 }}>
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
function TokenSlots({ filled, total }: { filled: number; total: number }) {
  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: 6,
      justifyContent: 'center',
      padding: '6px 4px',
    }}>
      {Array.from({ length: total }, (_, i) => {
        const isFilled = i < filled;
        return (
          <motion.div
            key={i}
            initial={false}
            animate={isFilled
              ? { scale: [1.3, 1], opacity: 1 }
              : { scale: 0.88, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 420, damping: 18 }}
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: isFilled
                ? 'radial-gradient(circle at 35% 32%, #ffe880, #f7c948 38%, #c99b10 82%)'
                : 'transparent',
              border: isFilled
                ? '2px solid rgba(200,154,16,0.5)'
                : '2.5px dashed rgba(160,150,230,0.3)',
              boxShadow: isFilled
                ? '0 2px 0 #c99b10 inset, 0 4px 10px rgba(200,155,16,0.35)'
                : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
            }}
          >
            {isFilled ? '⭐' : null}
          </motion.div>
        );
      })}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
interface GoalPedestalProps {
  case_: DisplayCase;
  innerRef?: (el: HTMLDivElement | null) => void;
  bankCount: number;
}

export function GoalPedestal({ case_, innerRef, bankCount }: GoalPedestalProps) {
  const dispatch = useMCDispatch();
  const [isSelecting, setIsSelecting] = useState(false);
  const [leverTilted, setLeverTilted] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

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
        overflow: 'hidden',
        borderRadius: 20,
        // Empty idle: dashed border, no background
        background: isEmptyIdle
          ? 'transparent'
          : isComplete
            ? '#fffbeb'
            : isEmptySelecting
              ? '#fafafe'
              : accent.bg,
        border: isEmptyIdle
          ? '2px dashed rgba(160,150,230,0.35)'
          : undefined,
        borderColor: isComplete ? 'rgba(247,201,72,0.7)' : undefined,
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
              {REWARDS.map(r => (
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
                    {r.targetCount} ⭐
                  </span>
                </motion.button>
              ))}
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
            <motion.span
              animate={isComplete
                ? {
                    scale: [1, 1.2, 1],
                    rotate: [0, -6, 6, 0],
                    // ⚡ Bolt Performance: Place infinite transitions inside the animate object
                    // to prevent Framer Motion from running a constant 60fps loop at the root level.
                    transition: { repeat: Infinity, duration: 1.4, ease: 'easeInOut' }
                  }
                : {
                    scale: [1, 1.05, 1],
                    transition: { repeat: Infinity, duration: 3, ease: 'easeInOut' }
                  }
              }
              style={{ fontSize: 32, lineHeight: 1, marginTop: 2 }}
            >
              {reward.emoji}
            </motion.span>

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

            <TokenSlots filled={case_.tokenCount} total={case_.targetCount} />

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
