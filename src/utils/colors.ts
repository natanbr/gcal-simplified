/**
 * Calculates the contrast color ('black' or 'white') for a given hex background color.
 * Uses YIQ formula for better accessibility.
 * @param hexcolor - Hex color string (e.g., "#ffffff" or "ffffff")
 * @returns 'black' or 'white'
 */
export function getContrastColor(hexcolor: string): string {
    if (!hexcolor) return 'black';

    let hex = hexcolor.replace('#', '');

    // Convert 3-digit hex to 6-digit
    if (hex.length === 3) {
        hex = hex.split('').map(c => c + c).join('');
    }

    if (hex.length !== 6) return 'black';

    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;

    return (yiq >= 128) ? 'black' : 'white';
}

/**
 * Adjusts the brightness of a hex color.
 * @param hex - Hex color string
 * @param amount - Amount to adjust (-255 to 255). Negative for darker.
 * @returns Adjusted hex color string
 */
export function adjustColorBrightness(hex: string, amount: number): string {
    if (!hex) return '#000000';

    let color = hex.replace('#', '');

    if (color.length === 3) {
        color = color.split('').map(c => c + c).join('');
    }

    if (color.length !== 6) return hex;

    const num = parseInt(color, 16);

    let r = (num >> 16) + amount;
    if (r > 255) r = 255;
    else if (r < 0) r = 0;

    let g = ((num >> 8) & 0x00FF) + amount;
    if (g > 255) g = 255;
    else if (g < 0) g = 0;

    let b = (num & 0x0000FF) + amount;
    if (b > 255) b = 255;
    else if (b < 0) b = 0;

    return '#' + (b | (g << 8) | (r << 16)).toString(16).padStart(6, '0');
}
