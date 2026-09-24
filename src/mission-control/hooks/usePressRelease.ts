// ============================================================
// usePressRelease — fire on the release of a press that began here
// For a plain button on the touchscreen: a tap and a long finger hold both
// count (a long touch hold may fire contextmenu and no click, so this reads
// pointerup, not click). A press that began elsewhere and was released here
// does not count, nor does one dragged off or cancelled by the browser.
// Enter / Space fire it too. No timer.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { useMemo, useRef } from 'react';
import type { KeyboardEvent } from 'react';

export function usePressRelease(onRelease: () => void) {
    const pressed = useRef(false);
    return useMemo(() => ({
        onPointerDown: () => { pressed.current = true; },
        onPointerUp: () => {
            if (pressed.current) onRelease();
            pressed.current = false;
        },
        onPointerLeave: () => { pressed.current = false; },
        onPointerCancel: () => { pressed.current = false; },
        onKeyUp: (e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') onRelease();
        },
    }), [onRelease]);
}
