/** Lower case without accents: "Gonçalves" and "goncalves" are the same word. */
export function foldText(text: string): string {
    return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Whether a player answers to what was typed: the short name the
 * provider uses ("Pote", "L. Pellegrini"), his full name ("Pedro
 * Gonçalves"), or his club.
 */
export function playerMatches(player: {name: string; fullName: string | null; team: {name: string}}, query: string): boolean {
    const needle = foldText(query.trim());
    if (!needle) return true;
    return foldText(player.name).includes(needle) || (player.fullName !== null && foldText(player.fullName).includes(needle)) || foldText(player.team.name).includes(needle);
}
