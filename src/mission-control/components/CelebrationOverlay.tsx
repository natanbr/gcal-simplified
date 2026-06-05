import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMCState } from '../store/useMCStore';
import { MCAnimationType } from '../types';

export function CelebrationOverlay() {
    const state = useMCState();
    const [active, setActive] = useState<MCAnimationType | null>(null);
    const [triggerId, setTriggerId] = useState<number>(0);

    useEffect(() => {
        if (state.lastAnimationTrigger) {
            // Ignore animations triggered more than 5 seconds ago (prevents replay on mount)
            const age = Date.now() - state.lastAnimationTrigger.timestamp;
            if (age > 5000) return;

            setActive(state.lastAnimationTrigger.type);
            setTriggerId(state.lastAnimationTrigger.timestamp);
            
            const timer = setTimeout(() => {
                setActive(null);
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [state.lastAnimationTrigger]);

    if (!active) return null;

    return (
        <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 1000, overflow: 'hidden' }}>
            {active === 'confetti' && <ConfettiEffect key={triggerId} />}
            {active === 'fireworks' && <FireworksEffect key={triggerId} />}
            {active === 'confetti-fireworks' && (
                <React.Fragment key={triggerId}>
                    <ConfettiEffect />
                    <FireworksEffect />
                </React.Fragment>
            )}
            {active === 'good-job' && <GoodJobEffect key={triggerId} />}
            {active === 'too-loud' && <TooLoudEffect key={triggerId} />}
            {active && active in NOTO_EMOJI_MAP && <NotoEmojiEffect key={triggerId} type={active} />}
        </div>
    );
}

function ConfettiEffect() {
    const colors = ['#a57dff', '#6de89e', '#f7c948', '#ff9a3c', '#ff6b6b'];
    const particles = Array.from({ length: 50 });

    return (
        <>
            {particles.map((_, i) => (
                <motion.div
                    key={i}
                    initial={{ 
                        x: '50vw', 
                        y: '50vh', 
                        opacity: 1, 
                        scale: Math.random() * 0.5 + 0.5,
                        rotate: 0 
                    }}
                    animate={{ 
                        x: `${Math.random() * 100}vw`, 
                        y: `${Math.random() * 100}vh`,
                        opacity: 0,
                        rotate: Math.random() * 720 - 360
                    }}
                    transition={{ 
                        duration: 2, 
                        ease: "easeOut" 
                    }}
                    style={{
                        position: 'absolute',
                        width: 10,
                        height: 10,
                        backgroundColor: colors[i % colors.length],
                        borderRadius: i % 3 === 0 ? '50%' : '2px',
                    }}
                />
            ))}
        </>
    );
}

function FireworksEffect() {
    const bursts = Array.from({ length: 5 });
    return (
        <>
            {bursts.map((_, i) => (
                <Burst key={i} delay={i * 0.4} />
            ))}
        </>
    );
}

function Burst({ delay }: { delay: number }) {
    const particles = Array.from({ length: 20 });
    const x = `${Math.random() * 80 + 10}vw`;
    const y = `${Math.random() * 60 + 10}vh`;
    const color = ['#ff6b6b', '#f7c948', '#a57dff', '#6de89e'][Math.floor(Math.random() * 4)];

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay }}
            style={{ position: 'absolute', left: x, top: y }}
        >
            {particles.map((_, i) => {
                const angle = (i / particles.length) * Math.PI * 2;
                const distance = 100;
                return (
                    <motion.div
                        key={i}
                        initial={{ x: 0, y: 0, scale: 1 }}
                        animate={{ 
                            x: Math.cos(angle) * distance, 
                            y: Math.sin(angle) * distance,
                            scale: 0,
                            opacity: 0
                        }}
                        transition={{ 
                            delay,
                            duration: 1, 
                            ease: "circOut" 
                        }}
                        style={{
                            position: 'absolute',
                            width: 6,
                            height: 6,
                            backgroundColor: color,
                            borderRadius: '50%',
                            boxShadow: `0 0 10px ${color}`
                        }}
                    />
                );
            })}
        </motion.div>
    );
}

function GoodJobEffect() {
    return (
        <motion.div
            initial={{ scale: 0, y: 100, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15 }}
            style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                fontSize: '120px',
                textAlign: 'center',
                filter: 'drop-shadow(0 10px 25px rgba(0,0,0,0.3))'
            }}
        >
            <motion.div 
                animate={{ y: [0, -20, 0] }} 
                transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
            >
                😊👍
            </motion.div>
        </motion.div>
    );
}

function TooLoudEffect() {
    const [phase, setPhase] = useState<'scream' | 'shh'>('scream');

    useEffect(() => {
        const timer = setTimeout(() => {
            setPhase('shh');
        }, 1500); // 1.5s scream, then shh
        return () => clearTimeout(timer);
    }, []);

    return (
        <div style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: phase === 'scream' ? 'rgba(255, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.5)',
            transition: 'background-color 0.5s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(4px)'
        }}>
            <AnimatePresence mode="wait">
                {phase === 'scream' ? (
                    <motion.div
                        key="scream"
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ 
                            scale: [1, 1.2, 1, 1.3, 1], 
                            rotate: [0, -10, 10, -10, 0],
                            opacity: 1 
                        }}
                        exit={{ scale: 0, opacity: 0 }}
                        transition={{ duration: 0.5 }}
                        style={{ fontSize: '150px', filter: 'drop-shadow(0 10px 25px rgba(0,0,0,0.5))' }}
                    >
                        😱
                    </motion.div>
                ) : (
                    <motion.div
                        key="shh"
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ type: 'spring', bounce: 0.5 }}
                        style={{ fontSize: '150px', filter: 'drop-shadow(0 10px 25px rgba(0,0,0,0.5))' }}
                    >
                        🤫
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

const NOTO_EMOJI_MAP: Record<string, { codepoint: string; fallback: string }> = {
    'clap': { codepoint: '1f44f', fallback: '👏' },
    'thumbs-up': { codepoint: '1f44d', fallback: '👍' },
    'slightly-happy': { codepoint: '1f642', fallback: '🙂' },
    'triumph': { codepoint: '1f624', fallback: '😤' },
    'scrunched': { codepoint: '1f616', fallback: '😖' },
    'shaking-face': { codepoint: '1fae8', fallback: '🫨' },
    'hear-no-evil': { codepoint: '1f649', fallback: '🙉' },
    'hourglass': { codepoint: '23f3', fallback: '⏳' },
    'check-mark': { codepoint: '2705', fallback: '✅' },
    'cross-mark': { codepoint: '274c', fallback: '❌' },
};

function NotoEmojiEffect({ type }: { type: string }) {
    const emojiInfo = NOTO_EMOJI_MAP[type];
    if (!emojiInfo) return null;

    const webpUrl = `https://fonts.gstatic.com/s/e/notoemoji/latest/${emojiInfo.codepoint}/512.webp`;
    const gifUrl = `https://fonts.gstatic.com/s/e/notoemoji/latest/${emojiInfo.codepoint}/512.gif`;

    return (
        <motion.div
            initial={{ scale: 0, y: 100, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15 }}
            style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                filter: 'drop-shadow(0 15px 30px rgba(0,0,0,0.4))'
            }}
        >
            <motion.div 
                animate={{ y: [0, -15, 0] }} 
                transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
                style={{ width: 160, height: 160 }}
            >
                <picture>
                    <source srcSet={webpUrl} type="image/webp" />
                    <img src={gifUrl} alt={emojiInfo.fallback} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </picture>
            </motion.div>
        </motion.div>
    );
}
