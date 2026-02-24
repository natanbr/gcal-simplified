// ============================================================
// Mission Control — Button3D
// A skeuomorphic button that physically "sinks" on press.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { motion } from 'framer-motion';
import React from 'react';

type ButtonVariant = 'default' | 'primary' | 'danger' | 'ghost';

interface Button3DProps {
  onClick?: () => void;
  onLongPress?: () => void;
  children: React.ReactNode;
  variant?: ButtonVariant;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  /** Accessible label when children is an icon */
  'aria-label'?: string;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  default: 'mc-btn',
  primary: 'mc-btn mc-btn-primary',
  danger:  'mc-btn mc-btn-danger',
  ghost:   'mc-btn',
};

const PRESSED_SHADOW = '0 0 0 rgba(255,255,255,0.05) inset, 0 1px 2px rgba(0,0,0,0.5)';
const RESTING_SHADOW = 'var(--mc-btn-shadow)';

export function Button3D({
  onClick,
  onLongPress,
  children,
  variant = 'default',
  disabled = false,
  className = '',
  style,
  'aria-label': ariaLabel,
}: Button3DProps) {
  // ---- Long press logic ----
  const longPressTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePointerDown = () => {
    if (!onLongPress) return;
    longPressTimer.current = setTimeout(() => {
      onLongPress();
    }, 600);
  };

  const handlePointerUp = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  return (
    <motion.button
      className={`${VARIANT_CLASSES[variant]} ${className} select-none`}
      style={{
        padding: '10px 18px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        ...style,
      }}
      onClick={disabled ? undefined : onClick}
      onPointerDown={disabled ? undefined : handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      aria-label={ariaLabel}
      // Framer motion press animation
      whileTap={
        disabled
          ? {}
          : {
              y: 2,
              boxShadow: PRESSED_SHADOW,
              transition: { duration: 0.08 },
            }
      }
      animate={{
        boxShadow: RESTING_SHADOW,
      }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
    >
      {children}
    </motion.button>
  );
}
