// ============================================================
// Mission Control — activity-log message formatting
// Split out of LogItemRow so that file only exports components
// (react-refresh/only-export-components).
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

/** Parses **text** markers in log messages and renders them as highlighted pills */
export function renderHighlightedMessage(message: string) {
    const parts = message.split(/\*\*(.+?)\*\*/g);
    if (parts.length === 1) return message; // no markers
    return parts.map((part, i) =>
        i % 2 === 1 ? (
            <span
                key={i}
                style={{
                    background: 'rgba(99,102,241,0.10)',
                    color: '#4338ca',
                    padding: '1px 6px',
                    borderRadius: 6,
                    fontWeight: 900,
                    letterSpacing: '0.01em',
                }}
            >
                {part}
            </span>
        ) : (
            <span key={i}>{part}</span>
        )
    );
}

