// ============================================================
// Quiz Lab — game → level map (dev only)
// Answers "what does level 2 actually mean?" — every row is
// computed by the game's own mapping function (games/quizLevelMap.ts),
// never restated here.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { GAME_LEVEL_MAPS } from '../../games/quizLevelMap';
import { codeText, MONO, mutedNote, panel, panelTitle } from './labStyles';

interface LabLevelMapPanelProps {
    /** Highlights the rung matching the level currently being previewed. */
    highlightLevel: number;
    /** Reading levels have no game mapping — the engine samples them. */
    dimmed: boolean;
}

export function LabLevelMapPanel({ highlightLevel, dimmed }: LabLevelMapPanelProps) {
    return (
        <section style={{ ...panel, opacity: dimmed ? 0.7 : 1 }}>
            <span style={panelTitle}>What each game asks for</span>
            <div style={mutedNote}>
                Math difficulty (and the stretch stage) is driven by the game, so this is
                the "what does level 2 actually cost the kid" table — every rung below is
                computed by the game's own mapping function. Reading level is <em>not</em>{' '}
                here: it is the invisible per-child level the engine tracks, and the game
                only shifts how far it is allowed to stretch.
            </div>

            <div style={{ display: 'grid', gap: 14 }}>
                {GAME_LEVEL_MAPS.map(map => (
                    <div key={map.gameId} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--mc-text)' }}>{map.title}</div>
                        <div style={{ ...mutedNote, fontFamily: MONO }}>{map.rule}</div>
                        <div style={mutedNote}>driven by {map.input} — {map.source}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
                            {map.rows.map(row => {
                                const active = !dimmed && row.level === highlightLevel;
                                return (
                                    <span
                                        key={`${row.level}-${row.trigger}`}
                                        style={{
                                            ...codeText,
                                            padding: '5px 10px',
                                            borderRadius: 10,
                                            border: `2px solid ${active ? 'var(--mc-purple)' : 'var(--mc-border)'}`,
                                            background: active ? 'var(--mc-bg)' : 'var(--mc-surface-raised)',
                                            fontWeight: active ? 800 : 500,
                                        }}
                                    >
                                        L{row.level} · {row.trigger}
                                    </span>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}
