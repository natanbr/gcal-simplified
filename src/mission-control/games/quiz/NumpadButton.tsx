import { motion } from 'framer-motion';

interface NumpadButtonProps {
    label: string;
    onClick: () => void;
    variant?: 'digit' | 'action' | 'submit';
}

const BG_MAP = {
    digit: 'rgba(255,255,255,0.12)',
    action: 'rgba(239,68,68,0.25)',
    submit: 'rgba(74,222,128,0.35)',
};

export function NumpadButton({ label, onClick, variant = 'digit' }: NumpadButtonProps) {
    return (
        <motion.button
            whileTap={{ scale: 0.9 }}
            whileHover={{ scale: 1.05 }}
            onClick={onClick}
            style={{
                width: '100%',
                aspectRatio: '1',
                borderRadius: 16,
                border: '2px solid rgba(255,255,255,0.15)',
                background: BG_MAP[variant],
                color: '#f8fafc',
                fontSize: variant === 'submit' ? 28 : 26,
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: "'Nunito', sans-serif",
            }}
        >
            {label}
        </motion.button>
    );
}
