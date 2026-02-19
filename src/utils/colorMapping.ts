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
    titleText: string;
}

/**
 * Google Calendar Event Color Mapping
 * Maps colorId to Tailwind classes with good contrast
 */
const GOOGLE_CALENDAR_COLORS: Record<string, ColorClasses> = {
    '1': { bg: 'bg-blue-500', text: 'text-white', border: 'border-blue-700', titleText: 'text-blue-600 dark:text-blue-400' },      // Lavender
    '2': { bg: 'bg-green-500', text: 'text-white', border: 'border-green-700', titleText: 'text-green-600 dark:text-green-400' },    // Sage
    '3': { bg: 'bg-purple-500', text: 'text-white', border: 'border-purple-700', titleText: 'text-purple-600 dark:text-purple-400' },  // Grape
    '4': { bg: 'bg-pink-500', text: 'text-white', border: 'border-pink-700', titleText: 'text-pink-600 dark:text-pink-400' },      // Flamingo
    '5': { bg: 'bg-yellow-400', text: 'text-black', border: 'border-yellow-600', titleText: 'text-yellow-600 dark:text-yellow-400' },  // Banana
    '6': { bg: 'bg-orange-500', text: 'text-white', border: 'border-orange-700', titleText: 'text-orange-600 dark:text-orange-400' },  // Tangerine
    '7': { bg: 'bg-cyan-500', text: 'text-white', border: 'border-cyan-700', titleText: 'text-cyan-600 dark:text-cyan-400' },      // Peacock
    '8': { bg: 'bg-gray-400', text: 'text-black', border: 'border-gray-600', titleText: 'text-gray-600 dark:text-gray-400' },      // Graphite
    '9': { bg: 'bg-blue-500', text: 'text-white', border: 'border-blue-700', titleText: 'text-blue-600 dark:text-blue-400' },      // Blueberry
    '10': { bg: 'bg-green-500', text: 'text-white', border: 'border-green-700', titleText: 'text-green-600 dark:text-green-400' },   // Basil
    '11': { bg: 'bg-red-600', text: 'text-white', border: 'border-red-800', titleText: 'text-red-600 dark:text-red-400' },       // Tomato
};

/**
 * Default color for events with no colorId or name match
 */
const DEFAULT_COLOR: ColorClasses = {
    bg: 'bg-zinc-100 dark:bg-zinc-800',
    text: 'text-zinc-900 dark:text-white',
    border: 'border-zinc-300 dark:border-zinc-600',
    titleText: 'text-zinc-900 dark:text-white',
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
 * Get complete color styles for an event.
 * Priority:
 * 1. Google Calendar colorId (1-11)
 * 2. Custom Hex Color (Calendar Color)
 * 3. Default color
 *
 * @param title - Event title (unused for color mapping now)
 * @param description - Event description (unused for color mapping now)
 * @param colorId - Google Calendar colorId (optional)
 * @param hexColor - Custom hex color (optional)
 * @returns Object containing className and optional inline style
 */
export function getEventColorStyles(
    _title: string,
    _description?: string,
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

    // Priority 3: Default color
    return {
        className: `${DEFAULT_COLOR.bg} ${DEFAULT_COLOR.text} border-l-4 ${DEFAULT_COLOR.border}`
    };
}

/**
 * Get color styles for the event title.
 * Used in the Event Details modal.
 */
export function getEventTitleStyle(
    colorId?: string,
    hexColor?: string
): { className?: string; style?: React.CSSProperties } {
    // Priority 1: Google Calendar color ID
    const googleColor = getColorFromGoogleCalendar(colorId);
    if (googleColor) {
        return {
            className: googleColor.titleText
        };
    }

    // Priority 2: Custom Hex Color
    if (hexColor) {
        return {
            style: { color: hexColor }
        };
    }

    // Priority 3: Default
    return {
        className: DEFAULT_COLOR.titleText
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
