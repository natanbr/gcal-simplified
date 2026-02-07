import { getContrastColor, adjustColorBrightness } from './colors';

/**
 * Color mapping utility for Google Calendar events
 * Maps Google Calendar colorId (1-11) to Tailwind CSS classes
 * with proper text contrast for accessibility (WCAG AA compliance)
 */

export interface ColorClasses {
    bg: string;
    text: string;
    border: string;
}

/**
 * Google Calendar Event Color Mapping
 * Maps colorId to Tailwind classes with good contrast
 */
const GOOGLE_CALENDAR_COLORS: Record<string, ColorClasses> = {
    '1': { bg: 'bg-blue-500', text: 'text-white', border: 'border-blue-700' },      // Lavender
    '2': { bg: 'bg-green-500', text: 'text-white', border: 'border-green-700' },    // Sage
    '3': { bg: 'bg-purple-500', text: 'text-white', border: 'border-purple-700' },  // Grape
    '4': { bg: 'bg-pink-500', text: 'text-white', border: 'border-pink-700' },      // Flamingo
    '5': { bg: 'bg-yellow-400', text: 'text-black', border: 'border-yellow-600' },  // Banana (light, needs dark text)
    '6': { bg: 'bg-orange-500', text: 'text-white', border: 'border-orange-700' },  // Tangerine
    '7': { bg: 'bg-cyan-500', text: 'text-white', border: 'border-cyan-700' },      // Peacock
    '8': { bg: 'bg-gray-400', text: 'text-black', border: 'border-gray-600' },      // Graphite (light, needs dark text)
    '9': { bg: 'bg-blue-500', text: 'text-white', border: 'border-blue-700' },      // Blueberry
    '10': { bg: 'bg-green-500', text: 'text-white', border: 'border-green-700' },   // Basil
    '11': { bg: 'bg-red-600', text: 'text-white', border: 'border-red-800' },       // Tomato
};

/**
 * Name-based color mapping (fallback when no colorId)
 */
const NAME_COLORS: Record<string, ColorClasses> = {
    natan: { bg: 'bg-blue-500', text: 'text-white', border: 'border-blue-700' },
    alon: { bg: 'bg-green-500', text: 'text-white', border: 'border-green-700' },
    uval: { bg: 'bg-purple-500', text: 'text-white', border: 'border-purple-700' },
    marta: { bg: 'bg-pink-500', text: 'text-white', border: 'border-pink-700' },
};

/**
 * Default color for events with no colorId or name match
 */
const DEFAULT_COLOR: ColorClasses = {
    bg: 'bg-zinc-800',
    text: 'text-white',
    border: 'border-zinc-600',
};

/**
 * Get color classes from Google Calendar colorId
 * @param colorId - Google Calendar colorId (1-11)
 * @returns ColorClasses object or null if invalid/undefined
 */
export function getColorFromGoogleCalendar(colorId: string | undefined): ColorClasses | null {
    if (!colorId) return null;
    return GOOGLE_CALENDAR_COLORS[colorId] || null;
}

/**
 * Get color classes based on event name (fallback)
 * @param title - Event title
 * @param description - Event description (optional)
 * @returns ColorClasses object or null if no match
 */
function getColorFromName(title: string, description?: string): ColorClasses | null {
    const text = `${title} ${description || ''}`.toLowerCase();

    for (const [name, colors] of Object.entries(NAME_COLORS)) {
        if (text.includes(name)) {
            return colors;
        }
    }

    return null;
}

/**
 * Get complete color styles for an event.
 * Priority:
 * 1. Google Calendar colorId (1-11)
 * 2. Custom Hex Color (Calendar Color)
 * 3. Name-based color
 * 4. Default color
 * 
 * @param title - Event title
 * @param description - Event description (optional)
 * @param colorId - Google Calendar colorId (optional)
 * @param hexColor - Custom hex color (optional)
 * @returns Object containing className and optional inline style
 */
export function getEventColorStyles(
    title: string,
    description?: string,
    colorId?: string,
    hexColor?: string
): { className: string; style?: React.CSSProperties } {
    // Priority 1: Google Calendar color ID (Maps to Tailwind classes)
    const googleColor = getColorFromGoogleCalendar(colorId);
    if (googleColor) {
        return {
            className: `${googleColor.bg} ${googleColor.text} border-l-4 ${googleColor.border}`
        };
    }

    // Priority 2: Custom Hex Color (from Calendar)
    if (hexColor) {
        // We rely on inline styles for arbitrary colors, but keep border-l-4 from Tailwind
        // We also need to compute a darker border color and appropriate text color

        // Remove hash to ensure consistency for helpers if needed (helpers handle it)
        const contrastText = getContrastColor(hexColor) === 'black' ? 'text-black' : 'text-white';
        const darkerBorder = adjustColorBrightness(hexColor, -40); // Darken by roughly 15-20%

        return {
            className: `border-l-4 ${contrastText}`,
            style: {
                backgroundColor: hexColor,
                borderLeftColor: darkerBorder
            }
        };
    }

    // Priority 3: Name-based color
    const nameColor = getColorFromName(title, description);
    if (nameColor) {
        return {
            className: `${nameColor.bg} ${nameColor.text} border-l-4 ${nameColor.border}`
        };
    }

    // Priority 4: Default color
    return {
        className: `${DEFAULT_COLOR.bg} ${DEFAULT_COLOR.text} border-l-4 ${DEFAULT_COLOR.border}`
    };
}

/**
 * Deprecated: Use getEventColorStyles instead.
 * Kept for backward compatibility if needed, but updated to use new logic fundamentally where possible.
 * Note: Does not support hexColor return as string class names don't support arbitrary values easily.
 */
export function getEventColorClass(
    title: string,
    description?: string,
    colorId?: string
): string {
    const result = getEventColorStyles(title, description, colorId);
    return result.className;
}
