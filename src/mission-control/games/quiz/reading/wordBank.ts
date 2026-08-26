// ============================================================
// Quiz Module — Reading Word Bank (curated data, no logic)
// ⚠️  Internal to src/mission-control/games/quiz/ only.
// ============================================================

export interface WordEntry {
    /** lowercase display word; doubles as its id */
    word: string;
    /** one canonical emoji; the ONLY emoji ever used for this word */
    emoji: string;
}

export const WORDS: readonly WordEntry[] = [
    // --- 3-letter decodable (CVC-pattern core) ---
    { word: 'cat', emoji: '🐱' },
    { word: 'dog', emoji: '🐶' },
    { word: 'sun', emoji: '☀️' },
    { word: 'bus', emoji: '🚌' },
    { word: 'bee', emoji: '🐝' },
    { word: 'bug', emoji: '🐛' },
    { word: 'box', emoji: '📦' },
    { word: 'bed', emoji: '🛏️' },
    { word: 'cow', emoji: '🐮' },
    { word: 'car', emoji: '🚗' },
    { word: 'cup', emoji: '☕' },
    { word: 'pig', emoji: '🐷' },
    { word: 'pen', emoji: '🖊️' },
    { word: 'hat', emoji: '🎩' },
    { word: 'hen', emoji: '🐔' },
    { word: 'rat', emoji: '🐀' },
    { word: 'ten', emoji: '🔟' },
    { word: 'six', emoji: '6️⃣' },
    { word: 'man', emoji: '👨' },
    { word: 'web', emoji: '🕸️' },
    { word: 'ant', emoji: '🐜' },
    { word: 'key', emoji: '🔑' },
    // --- 4-letter simple words ---
    { word: 'fish', emoji: '🐟' },
    { word: 'frog', emoji: '🐸' },
    { word: 'star', emoji: '⭐' },
    { word: 'ship', emoji: '🚢' },
    { word: 'bear', emoji: '🐻' },
    { word: 'boat', emoji: '⛵' },
    { word: 'ball', emoji: '⚽' },
    { word: 'bell', emoji: '🔔' },
    { word: 'book', emoji: '📖' },
    { word: 'bird', emoji: '🐦' },
    { word: 'corn', emoji: '🌽' },
    { word: 'crab', emoji: '🦀' },
    { word: 'dice', emoji: '🎲' },
    { word: 'door', emoji: '🚪' },
    { word: 'tree', emoji: '🌳' },
    { word: 'tent', emoji: '⛺' },
    { word: 'goat', emoji: '🐐' },
    { word: 'gift', emoji: '🎁' },
    { word: 'girl', emoji: '👧' },
    { word: 'lion', emoji: '🦁' },
    { word: 'leaf', emoji: '🍃' },
    { word: 'lock', emoji: '🔒' },
    { word: 'lips', emoji: '👄' },
    { word: 'moon', emoji: '🌙' },
    { word: 'pear', emoji: '🍐' },
    { word: 'rose', emoji: '🌹' },
    { word: 'ring', emoji: '💍' },
    { word: 'rain', emoji: '🌧️' },
    { word: 'hand', emoji: '✋' },
    { word: 'fire', emoji: '🔥' },
    { word: 'flag', emoji: '🚩' },
    { word: 'wolf', emoji: '🐺' },
    // --- 5-6 letter stretch words ---
    { word: 'snake', emoji: '🐍' },
    { word: 'tiger', emoji: '🐯' },
    { word: 'robot', emoji: '🤖' },
    { word: 'rocket', emoji: '🚀' },
    { word: 'turtle', emoji: '🐢' },
    { word: 'apple', emoji: '🍎' },
    { word: 'house', emoji: '🏠' },
    { word: 'horse', emoji: '🐴' },
    { word: 'heart', emoji: '❤️' },
    { word: 'clock', emoji: '⏰' },
    { word: 'whale', emoji: '🐳' },
    { word: 'watch', emoji: '⌚' },
    { word: 'mouse', emoji: '🐭' },
    { word: 'plane', emoji: '✈️' },
    { word: 'train', emoji: '🚂' },
    { word: 'truck', emoji: '🚚' },
    { word: 'monkey', emoji: '🐵' },
    { word: 'dragon', emoji: '🐉' },
    { word: 'donut', emoji: '🍩' },
    { word: 'ghost', emoji: '👻' },
];

/** Groups of words whose emoji are glance-confusable at ~64px in Segoe UI
 *  Emoji (e.g. mouse/rat, whale/dolphin/shark, dog/wolf). The question
 *  generator never puts two members of one group in the same choice set. */
export const CONFUSABLE_EMOJI_GROUPS: readonly (readonly string[])[] = [
    ['mouse', 'rat'],
    ['cat', 'tiger', 'lion'],
    ['dog', 'wolf', 'bear'],
    ['whale', 'fish'],
    ['cow', 'horse', 'goat'],
    ['frog', 'turtle'],
    ['snake', 'bug', 'dragon'],
    ['bee', 'bug', 'ant'],
    ['bird', 'hen'],
    ['ship', 'boat'],
    ['bus', 'car', 'truck'],
    ['plane', 'rocket'],
    ['clock', 'watch'],
    ['sun', 'star', 'moon'],
    ['ten', 'six'],
    ['box', 'gift'],
    ['man', 'girl'],
    ['heart', 'lips'],
    ['house', 'tent'],
    ['tree', 'leaf'],
    ['apple', 'pear'],
];
