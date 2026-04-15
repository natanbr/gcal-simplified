import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

interface CheatTrapOverlayProps {
  show: boolean;
}

export function CheatTrapOverlay({ show }: CheatTrapOverlayProps) {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {show && (
        <motion.div
          key="cheat-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <motion.div
            initial={{ scale: 0.5, y: 50 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: 'spring', bounce: 0.6 }}
            style={{
              position: 'relative',
              fontSize: '140px',
              lineHeight: 1,
              filter: 'drop-shadow(0 10px 25px rgba(0,0,0,0.3))',
            }}
          >
            🥺
            <motion.div
              className="mc-anim-finger-wag"
              style={{
                position: 'absolute',
                bottom: '-20px',
                left: '-40px',
                fontSize: '90px',
              }}
            >
              ☝️
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
