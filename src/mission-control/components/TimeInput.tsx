// ============================================================
// Mission Control — TimeInput
// Labelled HH:MM field for the Settings panel. Clearing it yields '', which
// MCSettingsOverlay refuses to save (see store/hhmm.ts). Keyboard focus ring:
// .mc-field in styles/mc.css — never add an inline outline here.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { isValidHhmm } from '../store/hhmm';

export function TimeInput({
    label,
    value,
    onChange,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
}) {
    const invalid = !isValidHhmm(value);
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--mc-text-muted)' }}>
                {label}
            </span>
            <input
                type="time"
                className="mc-field"
                value={value}
                aria-invalid={invalid}
                onChange={e => onChange(e.target.value)}
                style={{
                    fontFamily: "'Nunito', sans-serif",
                    fontSize: 18,
                    fontWeight: 800,
                    background: 'rgba(255,255,255,0.8)',
                    border: invalid ? '1.5px solid var(--mc-red)' : '1.5px solid rgba(130,120,200,0.25)',
                    borderRadius: 10,
                    padding: '6px 10px',
                    color: 'var(--mc-text)',
                    width: '100%',
                }}
            />
        </div>
    );
}
