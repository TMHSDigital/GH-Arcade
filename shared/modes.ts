/**
 * Links that open a game on one of its menu modes, e.g. games/stack/?mode=daily. The hub uses them
 * for a daily challenge that is still waiting, and a shared daily result carries one. No Phaser here.
 */

/** The query parameter that names the mode, as in "?mode=daily". */
export const MODE_PARAM = 'mode';

/** A mode's name in a link: its menu label in lower case with dashes, so "2 PLAYERS" is "2-players". */
export function modeSlug(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** The query string that opens a game's menu on the mode with this label, e.g. "?mode=daily". */
export function modeQuery(label: string): string {
  return `?${MODE_PARAM}=${modeSlug(label)}`;
}

/**
 * Which of a menu's modes a page address asks for: the index of the label that `search` (the page's
 * `location.search`) names, or 0 (the first mode) when it names none of them.
 */
export function modeIndex(labels: readonly string[], search: string): number {
  let wanted: string | null = null;
  try {
    wanted = new URLSearchParams(search).get(MODE_PARAM);
  } catch {
    /* an address that cannot be parsed asks for nothing */
  }
  if (!wanted) return 0;
  const index = labels.findIndex((label) => modeSlug(label) === modeSlug(wanted));
  return index < 0 ? 0 : index;
}
