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

/**
 * The tsconfig each `tsc` in a script runs: `-p`/`--project`, else tsconfig.json.
 * Flag-blind by design — it answers "which configs", not "with which options",
 * which is why typescript-strict-config also pins the command verbatim.
 */
export function configsRunBy(script: string): string[] {
    return script
        .split(/&&|\|\||;/)
        .map(command => command.trim().split(/\s+/))
        .filter(([bin]) => bin === 'tsc')
        .map(args => {
            if (args.includes('-b') || args.includes('--build')) {
                throw new Error(`build mode is not modelled by this guard: "${args.join(' ')}"`);
            }
            const flag = args.findIndex(arg => arg === '-p' || arg === '--project');
            return flag === -1 ? 'tsconfig.json' : args[flag + 1];
        });
}
