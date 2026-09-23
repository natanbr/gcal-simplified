// ============================================================
// Which tsconfigs the `tsc` npm script compiles.
// Not a test file — vitest only collects *.test.*
// ------------------------------------------------------------
// Two guards need this answer and used to hold it twice: typecheck-coverage
// parsed the script, typescript-strict-config listed the configs by hand. Two
// constants that must agree, only one of them asserted, is a latent lie — the
// hand-written one goes stale the day a third step is added. One parser, two
// callers, so a new step reaches both guards at once.
// ============================================================

/** One `tsc` invocation in a script: which config, and the arguments it is given. */
export interface TscStep {
    config: string;
    /** Everything after `tsc`, verbatim — for a caller that reads the flags. */
    args: string[];
}

/**
 * Each `tsc` in a script, with the tsconfig it runs: `-p`/`--project`, else
 * tsconfig.json. The parse stays deliberately literal — it answers "which
 * configs", not "is this command equivalent to that one", which is why
 * typescript-strict-config also pins the command verbatim.
 */
export function stepsRunBy(script: string): TscStep[] {
    return script
        .split(/&&|\|\||;/)
        .map(command => command.trim().split(/\s+/))
        .filter(([bin]) => bin === 'tsc')
        .map(([, ...args]) => {
            if (args.includes('-b') || args.includes('--build')) {
                throw new Error(`build mode is not modelled by this guard: "tsc ${args.join(' ')}"`);
            }
            const flag = args.findIndex(arg => arg === '-p' || arg === '--project');
            return { config: flag === -1 ? 'tsconfig.json' : args[flag + 1], args };
        });
}

/** The tsconfig each `tsc` in a script runs. */
export function configsRunBy(script: string): string[] {
    return stepsRunBy(script).map(step => step.config);
}
