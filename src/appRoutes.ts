// ============================================================
// Top-level view routing from the query string.
//
// Pure on purpose: the dev gate on the Quiz Lab is the one thing
// here that MUST NOT silently break (a debug surface shipped to a
// child's device is the failure mode), and `isDev` as a parameter
// makes that gate directly testable without stubbing
// `import.meta.env`. App.tsx supplies `import.meta.env.DEV`, which
// Vite folds to a literal `false` in a production build.
// ============================================================

export type View = 'calendar' | 'mission-control' | 'quiz-lab';

export function resolveInitialView(search: string, isDev: boolean): View {
    const params = new URLSearchParams(search);
    if (isDev && params.get('lab') === '1') return 'quiz-lab';
    return params.get('mc') === '1' ? 'mission-control' : 'calendar';
}
