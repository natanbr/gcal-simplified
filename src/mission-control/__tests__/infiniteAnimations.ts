// ============================================================
// Test-only helper: finds the CSS rules, Tailwind classes and inline styles
// that loop forever, and the elements on screen that carry them. Shared by
// the repo-wide registry (src/__tests__/infinite-animation-registry.test.ts)
// and the idle-view render guards (idle-animations.test.tsx here,
// src/__tests__/idle-calendar-animations.test.tsx for the Calendar).
//
// Why a loop matters even when it is "compositor-driven": the Remote dot's
// 8 px pulse cost 20-25 % of one CPU core on the child's screen for as long
// as Mission Control was open (2026-10-04, docs/performance.md). The
// compositor spares the main thread, not the frame.
//
// A shape this file cannot prove finite counts as a loop: an iteration count
// held in a CSS variable, `@apply` of a looping utility.
// ============================================================

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Tailwind's looping utilities, and an arbitrary `animate-[…]` value that loops. `animate-pulse-once` is neither. */
export const INFINITE_TAILWIND_CLASS = /\banimate-(?:spin|ping|pulse|bounce)(?![\w-])|\banimate-\[[^\]\s]*infinite[^\]\s]*\]/g;

const ANIMATION_PROPERTY = /^(?:-webkit-)?animation(?:-iteration-count)?$/i;
const KEYFRAMES = /^@(?:-webkit-)?keyframes\b/i;

export interface InfiniteCssRule {
    /** The rule's selector list, whitespace-collapsed. */
    selector: string;
    /** The declaration that loops or cannot be proven finite. */
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

function loopingStatement(statement: string): boolean {
    const text = statement.trim();
    if (text.startsWith('@apply')) return new RegExp(INFINITE_TAILWIND_CLASS.source).test(text);
    const colon = text.indexOf(':');
    if (colon < 0 || !ANIMATION_PROPERTY.test(text.slice(0, colon).trim())) return false;
    const value = text.slice(colon + 1);
    return /\binfinite\b/i.test(value) || /\bvar\(/i.test(value);
}

/** Every style rule (outside `@keyframes`, inside `@media` too) whose animation loops or cannot be proven finite. */
export function infiniteCssRules(css: string): InfiniteCssRule[] {
    const found: InfiniteCssRule[] = [];
    const visit = (blocks: Block[]) => {
        for (const block of blocks) {
            if (KEYFRAMES.test(block.prelude)) continue;
            if (!block.prelude.startsWith('@')) {
                for (const statement of block.body.split(';')) {
                    if (loopingStatement(statement)) {
                        found.push({ selector: block.prelude.replace(/\s+/g, ' '), declaration: statement.trim().replace(/\s+/g, ' ') });
                    }
                }
            }
            visit(block.children);
        }
    };
    visit(parseBlocks(css));
    return found;
}

/**
 * The `animation` shorthand of a top-level style rule, or null. Rules inside
 * `@media` (a reduced-motion override, say) are not this rule.
 */
export function animationDeclarationOf(css: string, selector: string): string | null {
    for (const block of parseBlocks(css)) {
        if (block.prelude.replace(/\s+/g, ' ') !== selector) continue;
        for (const raw of block.body.split(';')) {
            const colon = raw.indexOf(':');
            if (colon >= 0 && raw.slice(0, colon).trim() === 'animation') return raw.slice(colon + 1).trim();
        }
    }
    return null;
}

/** The text of every stylesheet under a directory, recursively. */
export function stylesheetsUnder(dir: string): string {
    const parts: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) parts.push(stylesheetsUnder(full));
        else if (entry.name.endsWith('.css')) parts.push(readFileSync(full, 'utf8'));
    }
    return parts.join('\n');
}

/** Top-level comma split: `:is(a, b)` stays whole. */
function selectorList(selector: string): string[] {
    const out: string[] = [];
    let depth = 0; let current = '';
    for (const ch of selector) {
        if (ch === '(') depth++;
        if (ch === ')') depth--;
        if (ch === ',' && depth === 0) { out.push(current.trim()); current = ''; continue; }
        current += ch;
    }
    if (current.trim()) out.push(current.trim());
    return out;
}

/**
 * The element a selector styles, for querySelectorAll: drop pseudo-elements
 * (`::after` draws on its host) and the user-action pseudo-classes (on a
 * touchscreen `:hover` sticks after a tap, so a loop behind it counts).
 */
function hostSelector(selector: string): string {
    const host = selector
        .replace(/::?(?:before|after|marker|placeholder|selection|first-line|first-letter|backdrop)\b/g, '')
        .replace(/:(?:hover|focus-visible|focus-within|focus|active|visited)\b/g, '')
        .trim();
    return host === '' || /[>+~]$/.test(host) ? `${host} *`.trim() : host;
}

/**
 * Pseudo-classes jsdom evaluates. Anything else (an unknown or newer one) can
 * match nothing without throwing, which would pass a loop silently, so it is
 * refused instead.
 */
const EVALUABLE_PSEUDO = new Set([
    'not', 'is', 'where', 'root', 'empty', 'checked', 'disabled', 'enabled',
    'first-child', 'last-child', 'only-child', 'nth-child', 'nth-last-child',
    'first-of-type', 'last-of-type', 'only-of-type', 'nth-of-type', 'nth-last-of-type',
]);

function evaluable(selector: string): boolean {
    const outsideAttributes = selector.replace(/\[[^\]]*\]/g, '[]');
    return [...outsideAttributes.matchAll(/:([\w-]+)/g)].every(m => EVALUABLE_PSEUDO.has(m[1]));
}

const describeElement = (el: Element) => `<${el.tagName.toLowerCase()} class="${el.getAttribute('class') ?? ''}">`;

/** Every element under `root` that a looping rule, class or inline style animates. Empty = nothing loops. */
export function loopingOnScreen(root: ParentNode, css: string): string[] {
    const found: string[] = [];
    for (const rule of infiniteCssRules(css)) {
        for (const selector of selectorList(rule.selector)) {
            const host = hostSelector(selector);
            let matches: Element[] = [];
            try {
                if (evaluable(host)) matches = [...root.querySelectorAll(host)];
                else throw new Error('unknown pseudo-class');
            } catch {
                found.push(`cannot evaluate the selector "${selector}" of a looping rule: simplify it or make the loop finite`);
                continue;
            }
            for (const el of matches) found.push(`${rule.declaration} (${selector}) on ${describeElement(el)}`);
        }
    }
    const tailwindLoop = new RegExp(INFINITE_TAILWIND_CLASS.source);
    for (const el of root.querySelectorAll('[class]')) {
        if (tailwindLoop.test(el.getAttribute('class') ?? '')) found.push(`Tailwind loop on ${describeElement(el)}`);
    }
    for (const el of root.querySelectorAll('[style]')) {
        const style = el.getAttribute('style') ?? '';
        if (/\binfinite\b/.test(style) || /animation[^;]*var\(/.test(style)) found.push(`inline loop on ${describeElement(el)}`);
    }
    return found;
}
