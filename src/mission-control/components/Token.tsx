// ============================================================
// Mission Control — Token (Draggable Coin)
// A framer-motion draggable coin with spring-back on invalid drops.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { useDragBounds } from './DragLayer';

interface TokenProps {
  id: string;
  /**
   * Called when the token is released anywhere.
   * Return `true` to consume the drop (deposit animation plays, token exits).
   * Return `false` / undefined to reject — token springs back to origin.
   */
  onDrop?: (id: string, x: number, y: number) => boolean;
}

const SPRING = { type: 'spring' as const, stiffness: 320, damping: 26 };

export function Token({ id, onDrop }: TokenProps) {
  const boundsRef = useDragBounds();
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // Subtle rotation while dragging for a "lifting" feel
  const rotate = useTransform(x, [-100, 0, 100], [-10, 0, 10]);

  const springBack = () => {
    animate(x, 0, SPRING);
    animate(y, 0, SPRING);
  };

  return (
    <motion.div
      className="mc-coin"
      style={{ x, y, rotate, position: 'relative', zIndex: 10 }}
      drag
      dragConstraints={boundsRef}
      dragElastic={0.12}
      dragMomentum={false}
      whileDrag={{
        scale: 1.18,
        zIndex: 50,
        boxShadow: '0 16px 32px rgba(0,0,0,0.6), 0 2px 0 #8a6800 inset',
        cursor: 'grabbing',
      }}
      whileTap={{ scale: 0.94 }}
      transition={SPRING}
      onDragEnd={(_event, info) => {
        const consumed = onDrop?.(id, info.point.x, info.point.y);
        if (!consumed) {
          // Not deposited — spring coin back to its slot in the tray
          springBack();
        }
        // If consumed, the parent sets isExiting on the wrapper div,
        // which plays scale:0/opacity:0 at the current position.
      }}
      aria-label="Gold coin — drag to a goal"
    >
      {/* Inner shine highlight */}
      <div
        style={{
          position: 'absolute',
          top: '18%',
          left: '22%',
          width: '30%',
          height: '22%',
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.45)',
          filter: 'blur(2px)',
          pointerEvents: 'none',
        }}
      />
      ⭐
    </motion.div>
  );
}
