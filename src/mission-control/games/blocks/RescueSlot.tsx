import { memo } from 'react';
import { motion } from 'framer-motion';
import { GameShape } from './types';
import { ShapeItem } from './ShapeItem';
import type { DragSlot, StartDragHandler } from './useShapeDrag';

/** Passed to ShapeItem *and* to onStartDrag: the grabbed cell is derived from
 *  the size this slot really renders, which is smaller than the tray's. */
const RESCUE_CELL_SIZE = 22;

interface RescueSlotProps {
    rescueShape: GameShape | null;
    rescueShapeLocked: boolean;
    triggerRescueQuiz: () => void;
    refreshRescueShape: () => void;
    activeDragSlot: DragSlot | null;
    onStartDrag: StartDragHandler;
}

export const RescueSlot = memo(function RescueSlot({
    rescueShape,
    rescueShapeLocked,
    triggerRescueQuiz,
    refreshRescueShape,
    activeDragSlot,
    onStartDrag,
}: RescueSlotProps) {
    const dragInFlight = activeDragSlot?.slotType === 'rescue';
    const refreshBlocked = dragInFlight || !rescueShape;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', width: 150, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 24, padding: '20px 16px', justifyContent: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 900, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center' }}>Rescue Slot</span>
            
            <div style={{ 
                width: 120, height: 120, borderRadius: 20, 
                border: rescueShapeLocked ? '2px solid rgba(234, 179, 8, 0.2)' : '2.5px solid rgba(234, 179, 8, 0.6)', 
                background: rescueShapeLocked ? 'rgba(234, 179, 8, 0.02)' : 'rgba(234, 179, 8, 0.08)',
                boxShadow: rescueShapeLocked ? 'none' : '0 0 12px rgba(234, 179, 8, 0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
                overflow: rescueShapeLocked ? 'hidden' : 'visible'
            }}>
                {rescueShape ? (
                    <>
                        {rescueShapeLocked ? (
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={triggerRescueQuiz}
                                style={{
                                    position: 'absolute', inset: 0, zIndex: 10, borderRadius: 18,
                                    background: 'rgba(15, 23, 42, 0.35)', border: 'none', cursor: 'pointer',
                                }}
                            >
                                <span style={{
                                    position: 'absolute', top: 4, right: 4, fontSize: 16, lineHeight: 1,
                                    background: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(245, 158, 11, 0.5)',
                                    borderRadius: 8, padding: '3px 5px',
                                }}>🔒</span>
                                <span style={{
                                    position: 'absolute', bottom: 4, left: 0, right: 0,
                                    fontSize: 9, fontWeight: 900, color: '#f59e0b', textTransform: 'uppercase',
                                    letterSpacing: '0.04em', textAlign: 'center', padding: '0 4px',
                                    textShadow: '0 1px 3px rgba(0,0,0,0.9)',
                                }}>Solve Math</span>
                            </motion.button>
                        ) : null}

                        <ShapeItem
                            shape={rescueShape}
                            cellSize={RESCUE_CELL_SIZE}
                            isTransparent={dragInFlight && !rescueShapeLocked}
                            onPointerDown={!rescueShapeLocked ? (e) => onStartDrag(e, rescueShape, 'rescue', 0, RESCUE_CELL_SIZE) : undefined}
                        />
                    </>
                ) : null}
            </div>

            {/* Refusing the tap while this slot's shape is in flight is load-bearing,
                not cosmetic: refreshRescueShape re-locks the slot, and a locked slot
                makes placeShape refuse a drop the child was already shown in green.
                A second finger can reach this button mid-drag — the drag itself
                ignores that pointer, but a click is not a pointer the drag owns.
                An EMPTY slot is refused too: it only happens while a clear the rescue
                shape finished is still exploding, and that clear deals the slot when
                it resolves, meteors landed. Refreshing first would deal against the
                board before they land, and the clear would then leave that shape be. */}
            <motion.button
                whileHover={refreshBlocked ? undefined : { scale: 1.05, background: 'rgba(255,255,255,0.1)', boxShadow: '0 0 15px rgba(255,255,255,0.1)' }}
                whileTap={refreshBlocked ? undefined : { scale: 0.95 }}
                onClick={refreshBlocked ? undefined : refreshRescueShape}
                disabled={refreshBlocked}
                title={dragInFlight ? 'Finish placing the shape first'
                    : !rescueShape ? 'A new shape arrives when the explosion ends'
                    : 'Refresh shape (will lock)'}
                style={{
                    background: 'rgba(255,255,255,0.08)',
                    border: '1.5px solid rgba(255,255,255,0.2)',
                    borderRadius: 14,
                    padding: '12px 20px',
                    fontSize: 14,
                    fontWeight: 900,
                    color: '#f8fafc',
                    cursor: refreshBlocked ? 'default' : 'pointer',
                    opacity: refreshBlocked ? 0.45 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                    marginTop: 12,
                    width: '100%',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.02em'
                }}
            >
                <span style={{ fontSize: 18 }}>🔄</span> Refresh
            </motion.button>
        </div>
    );
});
