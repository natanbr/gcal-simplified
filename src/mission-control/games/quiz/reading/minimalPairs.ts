// ============================================================
// Quiz Module — Reading Minimal Pairs & Long-Word Distractors
// (curated data, no logic)
// ⚠️  Internal to src/mission-control/games/quiz/ only.
// ============================================================

/** target word → 3+ REAL English words, same length, exactly ONE letter
 *  different (minimal pairs). Distractors need no emoji — they render as text.
 *  Vowel-varying pairs listed first where they exist (hardest discrimination). */
export const MINIMAL_PAIRS: Readonly<Record<string, readonly string[]>> = {
    cat: ['cot', 'cut', 'can', 'cap', 'bat', 'hat', 'rat'],
    dog: ['dig', 'dug', 'dot', 'log', 'fog', 'jog'],
    sun: ['son', 'sin', 'run', 'fun', 'bun'],
    bus: ['but', 'bun', 'bud'],
    bee: ['see', 'bed', 'bet'],
    bug: ['bag', 'big', 'bud', 'hug', 'rug'],
    box: ['fox', 'bow', 'boy'],
    bed: ['bad', 'bud', 'bid', 'bet', 'beg', 'red', 'fed'],
    cow: ['how', 'now', 'bow', 'low'],
    car: ['can', 'cap', 'cab', 'bar', 'far', 'jar'],
    cup: ['cap', 'cop', 'cut', 'cub', 'pup'],
    pig: ['peg', 'pit', 'pin', 'big', 'dig', 'wig'],
    pen: ['pin', 'pan', 'pun', 'pet', 'peg', 'ten', 'hen'],
    hat: ['hit', 'hot', 'hut', 'ham', 'bat', 'mat', 'sat'],
    hen: ['hem', 'her', 'pen', 'ten', 'den', 'men'],
    rat: ['rot', 'rut', 'ran', 'rag', 'bat', 'mat'],
    ten: ['tan', 'tin', 'ton', 'pen', 'men'],
    six: ['fix', 'mix', 'sit'],
    man: ['men', 'mat', 'map', 'mad', 'can', 'fan', 'pan', 'van'],
    web: ['wet', 'wed', 'wee'],
    ant: ['and', 'art', 'apt'],
};

/** 5-6 letter target word → 3+ real-word distractors that look similar
 *  (share the first letter and/or length ±1). */
export const LONG_WORD_DISTRACTORS: Readonly<Record<string, readonly string[]>> = {
    snake: ['shake', 'snack', 'smoke', 'spoke'],
    tiger: ['timer', 'tight', 'tiles'],
    robot: ['robin', 'roost', 'roast'],
    rocket: ['rocker', 'racket', 'pocket', 'socket'],
    turtle: ['turkey', 'tunnel', 'little'],
    apple: ['ample', 'apply', 'angle'],
    house: ['hours', 'hose', 'those'],
    horse: ['hose', 'horns', 'nurse'],
    heart: ['heard', 'heat', 'earth'],
    clock: ['click', 'cloak', 'block'],
    whale: ['while', 'wheel', 'whole'],
    watch: ['witch', 'match', 'water'],
    mouse: ['moose', 'mouth', 'mount'],
    plane: ['plant', 'plate', 'place'],
    train: ['trail', 'brain', 'grain'],
    truck: ['track', 'trick', 'trunk'],
    monkey: ['money', 'donkey', 'honey'],
    dragon: ['wagon', 'dozen', 'garden'],
    donut: ['donor', 'doubt', 'dust'],
    ghost: ['guest', 'gust', 'giant'],
};
