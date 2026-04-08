import React, { useState, useRef, useEffect } from 'react';
import { MARINE_LOCATIONS } from '../utils/marineLocations';
import type { MarineLocation } from '../types';

interface Props {
    locationId: string;
    onSelect: (id: string) => void;
}

export const LocationSelector: React.FC<Props> = ({ locationId, onSelect }) => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const current = MARINE_LOCATIONS.find(l => l.id === locationId) ?? MARINE_LOCATIONS[0];

    const filtered = query.trim()
        ? MARINE_LOCATIONS.filter(l => l.name.toLowerCase().includes(query.toLowerCase()))
        : MARINE_LOCATIONS;

    useEffect(() => {
        if (open) {
            setTimeout(() => inputRef.current?.focus(), 50);
        } else {
            setQuery('');
        }
    }, [open]);

    return (
        <div style={{ position: 'relative' }} data-testid="location-selector">
            {/* Trigger */}
            <button
                data-testid="location-selector-trigger"
                onClick={() => setOpen(o => !o)}
                style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 14px',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid var(--mc-border)',
                    borderRadius: 10,
                    cursor: 'pointer',
                    color: 'var(--mc-text)',
                    fontFamily: 'Inter, system-ui, sans-serif',
                    transition: 'border-color 150ms',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--mc-border-bright)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--mc-border)')}
            >
                <span style={{ fontSize: 16 }}>📍</span>
                <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ fontSize: 10, color: 'var(--mc-text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700 }}>
                        Location
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--mc-text)', marginTop: 1 }}>
                        {current.name}
                    </div>
                </div>
                <svg
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    style={{ transform: open ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 200ms', color: 'var(--mc-text-muted)', flexShrink: 0 }}
                >
                    <path d="M2.5 4.5L7 9L11.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </button>

            {/* Dropdown */}
            {open && (
                <>
                    <div
                        style={{ position: 'fixed', inset: 0, zIndex: 99 }}
                        onClick={() => setOpen(false)}
                    />
                    <div
                        data-testid="location-dropdown"
                        style={{
                            position: 'absolute',
                            top: 'calc(100% + 6px)',
                            left: 0,
                            right: 0,
                            background: '#161d2b',
                            border: '1px solid var(--mc-border-bright)',
                            borderRadius: 12,
                            zIndex: 100,
                            overflow: 'hidden',
                            boxShadow: '0 16px 40px rgba(0,0,0,0.6)',
                        }}
                    >
                        {/* Search */}
                        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--mc-border)' }}>
                            <input
                                ref={inputRef}
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                placeholder="Search locations..."
                                style={{
                                    width: '100%',
                                    background: 'rgba(255,255,255,0.05)',
                                    border: '1px solid var(--mc-border)',
                                    borderRadius: 7,
                                    padding: '6px 10px',
                                    color: 'var(--mc-text)',
                                    fontSize: 13,
                                    fontFamily: 'Inter, system-ui, sans-serif',
                                    outline: 'none',
                                }}
                            />
                        </div>

                        {/* List */}
                        <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                            {filtered.length === 0 && (
                                <div style={{ padding: '12px 16px', color: 'var(--mc-text-dim)', fontSize: 13 }}>
                                    No locations found
                                </div>
                            )}
                            {filtered.map(loc => (
                                <LocationRow
                                    key={loc.id}
                                    location={loc}
                                    isSelected={loc.id === locationId}
                                    onSelect={() => { onSelect(loc.id); setOpen(false); }}
                                />
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

const LocationRow: React.FC<{
    location: MarineLocation;
    isSelected: boolean;
    onSelect: () => void;
}> = ({ location, isSelected, onSelect }) => (
    <button
        data-testid={`location-row-${location.id}`}
        onClick={onSelect}
        style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 16px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 13,
            fontWeight: isSelected ? 700 : 400,
            color: isSelected ? 'var(--mc-cyan)' : 'var(--mc-text)',
            transition: 'background 100ms',
            textAlign: 'left',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(68,216,241,0.06)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
        <span>{location.name}</span>
        {isSelected && (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 7L5.5 10.5L12 3.5" stroke="var(--mc-cyan)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        )}
    </button>
);
