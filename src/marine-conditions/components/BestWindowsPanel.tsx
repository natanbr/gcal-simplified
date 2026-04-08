import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { DiveWindow } from '../types';
import { DiveWindowCard } from './DiveWindowCard';

interface Props {
    windows: DiveWindow[];
    isLoading: boolean;
    onSelect?: (w: DiveWindow) => void;
}

export const BestWindowsPanel: React.FC<Props> = ({ windows, isLoading, onSelect }) => {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            <div className="marine-section-label">Best Times to Dive</div>

            <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
                {isLoading && (
                    <div style={{ paddingTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {[1, 2, 3].map(i => (
                            <SkeletonCard key={i} />
                        ))}
                    </div>
                )}

                <AnimatePresence>
                    {!isLoading && windows.length === 0 && (
                        <motion.div
                            key="empty"
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.3 }}
                            style={{
                                paddingTop: 40,
                                textAlign: 'center',
                                color: 'var(--mc-text-dim)',
                                fontSize: 13,
                            }}
                        >
                            <div style={{ fontSize: 28, marginBottom: 8 }}>🌊</div>
                            <div>No dive windows in the next 7 days.</div>
                            <div style={{ fontSize: 11, marginTop: 6, color: 'var(--mc-text-muted)' }}>
                                Try a different location.
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <AnimatePresence mode="wait">
                    {!isLoading && windows.length > 0 && (
                        <motion.div
                            key="list"
                            initial="hidden"
                            animate="visible"
                            variants={{
                                hidden: {},
                                visible: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
                            }}
                        >
                            {windows.map(w => (
                                <motion.div
                                    key={w.slackTime}
                                    variants={{
                                        hidden:  { opacity: 0, y: 14, scale: 0.97 },
                                        visible: { opacity: 1, y: 0,  scale: 1,
                                            transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } },
                                    }}
                                >
                                    <DiveWindowCard window={w} onSelect={onSelect} />
                                </motion.div>
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

const SkeletonCard: React.FC = () => (
    <div
        className="marine-card"
        style={{ height: 110, borderRadius: 12, opacity: 0.4 }}
    />
);
