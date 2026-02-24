// ============================================================
// Mission Control — DragLayer
// Provides a full-screen bounding ref that Token components
// use as their dragConstraints boundary.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import React, { createContext, useContext, useRef } from 'react';

interface DragLayerContextValue {
  boundsRef: React.RefObject<HTMLDivElement | null>;
}

const DragLayerContext = createContext<DragLayerContextValue | null>(null);

export function DragLayer({ children }: { children: React.ReactNode }) {
  const boundsRef = useRef<HTMLDivElement>(null);

  return (
    <DragLayerContext.Provider value={{ boundsRef }}>
      {/* This div is the drag boundary for all coins */}
      <div
        ref={boundsRef}
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          pointerEvents: 'none', // the div itself doesn't block clicks
        }}
      />
      {/* Actual content rendered on top */}
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        {children}
      </div>
    </DragLayerContext.Provider>
  );
}

export function useDragBounds(): React.RefObject<HTMLDivElement | null> {
  const ctx = useContext(DragLayerContext);
  if (!ctx) throw new Error('useDragBounds must be used within <DragLayer>');
  return ctx.boundsRef;
}
