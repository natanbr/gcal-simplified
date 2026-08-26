// ============================================================
// Single instance enforcement
// ------------------------------------------------------------
// Two instances share one userData directory, which means they share the
// renderer's localStorage (the Mission Control store, key `mc-state-v5`) AND the
// same Supabase remote-control room. Both write the whole state blob on a 500ms
// debounce, so the loser's snapshot silently overwrites the winner's: token
// counts flip back and forth, activity-log history is eaten, both schedulers
// fire the same mission, and the phone remote sees two conflicting states.
// Refusing to boot a second instance is the fix for all of those at once.
//
// This is load-bearing, not hygiene. Extracted from main.ts to keep that file
// inside the 300-line limit — the lock still runs before anything else, because
// main.ts calls acquireSingleInstanceLock() at module scope.
// ============================================================

import { app, BrowserWindow } from 'electron'

/** What a launching instance tells the one already running about itself. */
export interface InstanceIdentity {
    /** True for a Playwright/E2E launch (E2E_HEADLESS=1). */
    headless?: boolean
}

/**
 * A second launch attempt surfaces the window that is already running — unless
 * the newcomer is an E2E launch. Playwright starts the app once per test, 44
 * times a suite, and every one of those would otherwise restore, show and focus
 * whatever window the developer is actually looking at.
 *
 * The lock refusal is unconditional and stays that way; only the focus grab is
 * conditional. Absence of a payload is not evidence of a test run — an older
 * build or a desktop shortcut sends nothing — so the useful behaviour remains
 * the default.
 */
export function focusExistingWindow(from?: InstanceIdentity): void {
    if (from?.headless) {
        console.warn('[Main] Refused a headless (E2E) second instance - not stealing focus.')
        return
    }
    const [existing] = BrowserWindow.getAllWindows()
    if (!existing) return
    if (existing.isMinimized()) existing.restore()
    existing.show()
    existing.focus()
}

/**
 * Claims the lock and wires the handler. Returns false when another instance
 * already holds it, in which case the caller must quit without creating a
 * window.
 */
export function acquireSingleInstanceLock(identity: InstanceIdentity): boolean {
    if (!app.requestSingleInstanceLock(identity)) {
        console.warn('[Main] Another instance is already running - exiting.')
        app.quit()
        return false
    }

    app.on('second-instance', (_event, _argv, _cwd, additionalData) => {
        focusExistingWindow(additionalData as InstanceIdentity | undefined)
    })
    return true
}
