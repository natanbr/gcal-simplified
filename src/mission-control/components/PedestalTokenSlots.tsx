// ============================================================
// Mission Control — Goal Pedestal token slots
// One slot per token a goal costs, the filled ones holding a draggable Token.
// Split out of GoalPedestal.tsx (file-size ratchet).
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { motion, AnimatePresence } from 'framer-motion';
import { Token } from './Token';

// ── Token slot row — matches bank coin size ────────────────────────────────────
export function TokenSlots({ filled, total, tokens, exitingIds, onDrop, onDragStateChange }: { filled: number; total: number; tokens: {id: string}[], exitingIds: Set<string>, onDrop: (id: string, x: number, y: number) => boolean, onDragStateChange: (isDragging: boolean) => void }) {
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
