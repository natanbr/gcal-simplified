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
 * Get complete color class string for an event
 * Priority: Google Calendar colorId > Name-based > Default
 * 
 * @param title - Event title
 * @param description - Event description (optional)
 * @param colorId - Google Calendar colorId (optional)
 * @returns Complete CSS class string with background, text, and border
 */
export function getEventColorClass(
    title: string,
    description?: string,
    colorId?: string
): string {
    // Priority 1: Google Calendar color
    const googleColor = getColorFromGoogleCalendar(colorId);
    if (googleColor) {
        return `${googleColor.bg} ${googleColor.text} border-l-4 ${googleColor.border}`;
    }

    // Priority 2: Name-based color
    const nameColor = getColorFromName(title, description);
    if (nameColor) {
        return `${nameColor.bg} ${nameColor.text} border-l-4 ${nameColor.border}`;
    }

    // Priority 3: Default color
    return `${DEFAULT_COLOR.bg} ${DEFAULT_COLOR.text} border-l-4 ${DEFAULT_COLOR.border}`;
}
