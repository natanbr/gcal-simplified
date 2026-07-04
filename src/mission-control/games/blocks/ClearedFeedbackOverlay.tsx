import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ClearedFeedbackOverlayProps {
    feedback: { text: string; stars: number; id: string } | null;
}

export const ClearedFeedbackOverlay = memo(function ClearedFeedbackOverlay({ feedback }: ClearedFeedbackOverlayProps) {
    return (
        <AnimatePresence>
            {feedback && (
                <motion.div
                    key={feedback.id}
                    initial={{ opacity: 0, y: 20, scale: 0.8 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.2, transition: { duration: 0.3 } }}
                    style={{
                        position: 'absolute',
                        top: '40%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        zIndex: 200,
                        pointerEvents: 'none',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 8,
                        background: 'rgba(15, 23, 42, 0.85)',
                        backdropFilter: 'blur(12px)',
                        padding: '24px 48px',
                        borderRadius: 32,
                        border: '2px solid rgba(255, 255, 255, 0.2)',
                        boxShadow: '0 20px 50px rgba(0,0,0,0.5), 0 0 30px rgba(56, 189, 248, 0.2)',
                    }}
                >
                    <motion.div
                        initial={{ scale: 0.5 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                        style={{
                            fontSize: 32,
                            fontWeight: 900,
                            color: '#fff',
                            textShadow: '0 0 20px rgba(56, 189, 248, 0.8)',
                            letterSpacing: '0.1em',
                        }}
                    >
                        {feedback.text}
                    </motion.div>
                    
                    <div style={{ display: 'flex', gap: 6 }}>
                        {Array.from({ length: feedback.stars }).map((_, i) => (
                            <motion.span
                                key={i}
                                initial={{ scale: 0, rotate: -45 }}
                                animate={{ scale: 1, rotate: 0 }}
                                transition={{ delay: 0.1 + i * 0.1, type: 'spring' }}
                                style={{ fontSize: 28 }}
                            >
                                ⭐
                            </motion.span>
                        ))}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
});
