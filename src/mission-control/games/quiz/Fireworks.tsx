// ============================================================
// Quiz Module — Fireworks/Confetti Animation
// Canvas-based particle burst triggered on correct answers.
// ⚠️  Internal to src/mission-control/games/quiz/ only.
// ============================================================

import { useEffect, useRef } from 'react';

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
    color: string;
    alpha: number;
    decay: number;
}

const COLORS = [
    '#4ade80', '#facc15', '#f97316', '#38bdf8',
    '#a78bfa', '#fb7185', '#34d399', '#fbbf24',
    '#818cf8', '#f472b6',
];

function createBurst(cx: number, cy: number, count: number): Particle[] {
    const particles: Particle[] = [];
    for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() * 0.4 - 0.2);
        const speed = 3 + Math.random() * 5;
        particles.push({
            x: cx,
            y: cy,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 2,
            radius: 2 + Math.random() * 3,
            color: COLORS[Math.floor(Math.random() * COLORS.length)],
            alpha: 1,
            decay: 0.015 + Math.random() * 0.015,
        });
    }
    return particles;
}

interface FireworksProps {
    /** Set to true to trigger a burst. Resets on false. */
    trigger: boolean;
}

export function Fireworks({ trigger }: FireworksProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const particlesRef = useRef<Particle[]>([]);
    const animRef = useRef<number>(0);
    const hasFired = useRef(false);
    const isAnimating = useRef(false);

    // Start the rAF loop only when there are particles to render.
    // Stops automatically when all particles have faded out.
    const startLoop = () => {
        if (isAnimating.current) return; // already running
        isAnimating.current = true;

        const canvas = canvasRef.current;
        if (!canvas) { isAnimating.current = false; return; }
        const ctx = canvas.getContext('2d');
        if (!ctx) { isAnimating.current = false; return; }

        const loop = () => {
            const particles = particlesRef.current;

            // Nothing to draw — stop the loop
            if (particles.length === 0) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                isAnimating.current = false;
                return;
            }

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            for (let i = particles.length - 1; i >= 0; i--) {
                const p = particles[i];
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.12; // gravity
                p.alpha -= p.decay;

                if (p.alpha <= 0) {
                    particles.splice(i, 1);
                    continue;
                }

                ctx.globalAlpha = p.alpha;
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.fill();

                // Sparkle trail
                ctx.globalAlpha = p.alpha * 0.4;
                ctx.beginPath();
                ctx.arc(p.x - p.vx * 0.5, p.y - p.vy * 0.5, p.radius * 0.6, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.globalAlpha = 1;
            animRef.current = requestAnimationFrame(loop);
        };

        animRef.current = requestAnimationFrame(loop);
    };

    useEffect(() => {
        if (trigger && !hasFired.current) {
            hasFired.current = true;
            const canvas = canvasRef.current;
            if (!canvas) return;
            const w = canvas.width;
            const h = canvas.height;

            const burst1 = createBurst(w * 0.5, h * 0.35, 40);
            const burst2 = createBurst(w * 0.3, h * 0.45, 25);
            const burst3 = createBurst(w * 0.7, h * 0.45, 25);
            particlesRef.current = [...burst1, ...burst2, ...burst3];

            // Kick off the render loop (no-op if already running)
            startLoop();
        }
        if (!trigger) {
            hasFired.current = false;
        }
    }, [trigger]);

    // Cleanup on unmount
    useEffect(() => {
        return () => cancelAnimationFrame(animRef.current);
    }, []);

    return (
        <canvas
            ref={canvasRef}
            width={440}
            height={500}
            style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                width: '100%',
                height: '100%',
                zIndex: 10,
            }}
        />
    );
}
