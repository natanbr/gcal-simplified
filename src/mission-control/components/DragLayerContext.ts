import { createContext, useContext } from 'react';

export interface DragLayerContextValue {
  boundsRef: React.RefObject<HTMLDivElement | null>;
}

export const DragLayerContext = createContext<DragLayerContextValue | null>(null);

export function useDragBounds(): React.RefObject<HTMLDivElement | null> {
  const ctx = useContext(DragLayerContext);
  if (!ctx) throw new Error('useDragBounds must be used within <DragLayer>');
  return ctx.boundsRef;
}
