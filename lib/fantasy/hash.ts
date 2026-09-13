/** djb2 over a string, with its length: enough to tell two snapshots apart, cheap enough for every render. */
export function hashOf(text: string): string {
    let h = 5381;
    for (let i = 0; i < text.length; i += 1) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
    return `${text.length}:${h >>> 0}`;
}
