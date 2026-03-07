/**
 * Returns the icon name (string key) for a calendar event based on its
 * title and description keywords.
 *
 * This is the pure logic extracted from EventCard.tsx `getEventIcon`.
 * Returns null if no keyword matches.
 */
export type EventIconName = 'trash' | 'recycle' | 'waves' | 'users' | 'swords';

export function getEventIconName(title: string, description?: string): EventIconName | null {
    const text = `${title} ${description ?? ''}`.toLowerCase();

    if (text.includes('garbage') || text.includes('trash')) return 'trash';
    if (text.includes('recycle') || text.includes('recycling')) return 'recycle';
    if (text.includes('pool') || text.includes('swim')) return 'waves';
    if (text.includes('scout') || text.includes('scouting')) return 'users';
    if (text.includes('karate') || text.includes('martial')) return 'swords';

    return null;
}
