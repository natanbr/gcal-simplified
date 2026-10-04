// ============================================================
// Test-only helper: finds the CSS rules and Tailwind classes that loop
// forever. Shared by the repo-wide infinite-animation registry
// (src/__tests__/infinite-animation-registry.test.ts) and the idle
// Mission Control render guard (idle-performance.test.tsx).
//
// Why a loop matters even when it is "compositor-driven": measured on the
// child's screen (2026-10-04, 1280x720 at scale 1.5), an 8 px dot pulsing
// forever cost 20-25 % of one CPU core for as long as Mission Control was open.
// The compositor spares the main thread, not the frame: every vsync the
// renderer's compositor draws, viz aggregates and the GPU process presents.
// ============================================================

/** Tailwind's built-in looping utilities. `animate-pulse-once` is not one. */
export const INFINITE_TAILWIND_CLASS = /\banimate-(?:spin|ping|pulse|bounce)(?![\w-])/g;

const ANIMATION_PROPERTY = /^(?:-webkit-)?animation(?:-iteration-count)?$/i;

export interface InfiniteCssRule {
    /** The rule's selector list, whitespace-collapsed. */
    selector: string;
    /** The declaration that loops, e.g. `animation: mc-dot-pulse 1.5s ease-in-out infinite`. */
    declaration: string;
}

interface Block { prelude: string; body: string; children: Block[] }

/** Splits a stylesheet into nested blocks. Enough CSS for this repo's own files, not a general parser. */
function parseBlocks(css: string): Block[] {
    const root: Block = { prelude: '', body: '', children: [] };
    const stack: Block[] = [root];
    let pending = '';
    for (const ch of css.replace(/\/\*[\s\S]*?\*\//g, '')) {
        const current = stack[stack.length - 1];
        if (ch === '{') {
            const block: Block = { prelude: pending.trim(), body: '', children: [] };
            current.children.push(block);
            stack.push(block);
            pending = '';
        } else if (ch === '}') {
            current.body += pending;
            pending = '';
            if (stack.length > 1) stack.pop();
        } else if (ch === ';') {
            current.body += pending + ';';
            pending = '';
        } else {
            pending += ch;
        }
    }
    return root.children;
}

/** Every style rule (outside `@keyframes`) that declares an animation looping forever. */
export function infiniteCssRules(css: string): InfiniteCssRule[] {
    const found: InfiniteCssRule[] = [];
    const visit = (blocks: Block[]) => {
        for (const block of blocks) {
            if (/^@(?:-webkit-)?keyframes\b/i.test(block.prelude)) continue;
            if (block.prelude.startsWith('@')) { visit(block.children); continue; }
            for (const raw of block.body.split(';')) {
                const colon = raw.indexOf(':');
                if (colon < 0) continue;
                const property = raw.slice(0, colon).trim();
                const value = raw.slice(colon + 1).trim();
                if (ANIMATION_PROPERTY.test(property) && /\binfinite\b/i.test(value)) {
                    found.push({ selector: block.prelude.replace(/\s+/g, ' '), declaration: `${property}: ${value}` });
                }
            }
            visit(block.children);
        }
    };
    visit(parseBlocks(css));
    return found;
}

/** The `animation` declaration a style rule gives, or null. Used to prove a pulse is finite. */
export function animationDeclarationOf(css: string, selector: string): string | null {
    let hit: string | null = null;
    const visit = (blocks: Block[]) => {
        for (const block of blocks) {
            if (/^@(?:-webkit-)?keyframes\b/i.test(block.prelude)) continue;
            if (block.prelude.startsWith('@')) { visit(block.children); continue; }
            if (block.prelude.replace(/\s+/g, ' ') === selector) {
                for (const raw of block.body.split(';')) {
                    const colon = raw.indexOf(':');
                    if (colon >= 0 && raw.slice(0, colon).trim() === 'animation') hit = raw.slice(colon + 1).trim();
                }
            }
            visit(block.children);
        }
    };
    visit(parseBlocks(css));
    return hit;
}
