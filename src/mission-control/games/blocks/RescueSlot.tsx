import { memo } from 'react';
import { motion } from 'framer-motion';
import { GameShape } from './types';
import { ShapeItem } from './ShapeItem';

interface RescueSlotProps {
    rescueShape: GameShape | null;
    rescueShapeLocked: boolean;
    triggerRescueQuiz: () => void;
    refreshRescueShape: () => void;
    activeDragSlot: { slotType: 'standard' | 'rescue'; slotIndex: number } | null;
    onStartDrag: (event: React.PointerEvent<HTMLDivElement>, shape: GameShape, slotType: 'standard' | 'rescue', slotIndex: number) => void;
}

export const RescueSlot = memo(function RescueSlot({
    rescueShape,
    rescueShapeLocked,
    triggerRescueQuiz,
    refreshRescueShape,
    activeDragSlot,
    onStartDrag,
}: RescueSlotProps) {
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
                                    background: 'rgba(15, 23, 42, 0.85)', border: 'none', cursor: 'pointer',
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4
                                }}
                            >
                                <span style={{ fontSize: 24 }}>🔒</span>
                                <span style={{ fontSize: 9, fontWeight: 900, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center', padding: '0 4px' }}>Solve Math</span>
                            </motion.button>
                        ) : null}

                        <ShapeItem
                            shape={rescueShape}
                            cellSize={22}
                            isTransparent={activeDragSlot?.slotType === 'rescue' && !rescueShapeLocked}
                            onPointerDown={!rescueShapeLocked ? (e) => onStartDrag(e, rescueShape, 'rescue', 0) : undefined}
                        />
                    </>
                ) : null}
            </div>

            <motion.button
                whileHover={{ scale: 1.05, background: 'rgba(255,255,255,0.1)', boxShadow: '0 0 15px rgba(255,255,255,0.1)' }}
                whileTap={{ scale: 0.95 }}
                onClick={refreshRescueShape}
                title="Refresh shape (will lock)"
                style={{
                    background: 'rgba(255,255,255,0.08)',
                    border: '1.5px solid rgba(255,255,255,0.2)',
                    borderRadius: 14,
                    padding: '12px 20px',
                    fontSize: 14,
                    fontWeight: 900,
                    color: '#f8fafc',
                    cursor: 'pointer',
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
