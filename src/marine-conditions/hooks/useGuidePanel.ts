import { useState, useCallback } from 'react';

/**
 * Controls the visibility of the Guide / Help panel.
 *
 * Handles keyboard ESC dismiss and provides a stable toggle reference.
 *
 * @example
 * const { isGuideOpen, openGuide, closeGuide } = useGuidePanel();
 */
export function useGuidePanel() {
    const [isGuideOpen, setGuideOpen] = useState(false);

    const openGuide = useCallback(() => setGuideOpen(true), []);
    const closeGuide = useCallback(() => setGuideOpen(false), []);
    const toggleGuide = useCallback(() => setGuideOpen(v => !v), []);

    return { isGuideOpen, openGuide, closeGuide, toggleGuide } as const;
}
