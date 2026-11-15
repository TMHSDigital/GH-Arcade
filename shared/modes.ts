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

/** The query parameter that names a daily challenge's day, as in "?mode=daily&day=2026-11-13". */
export const DAY_PARAM = 'day';

/**
 * The query string that opens a game's menu on the mode with this label, e.g. "?mode=daily". Give
 * the `day` of a daily challenge to link to that day's board: "?mode=daily&day=2026-11-13".
 */
export function modeQuery(label: string, day?: string): string {
  return `?${MODE_PARAM}=${modeSlug(label)}${day ? `&${DAY_PARAM}=${day}` : ''}`;
}

const DAY_MS = 86_400_000;

/**
 * The daily challenge day a page address asks for (`search` is the page's `location.search`), or
 * null when it names none that can be played: the day must be a real yyyy-mm-dd date, not after
 * `today`, and one of the last `keepDays` days counting today.
 */
export function linkedDay(search: string, today: string, keepDays: number): string | null {
  let wanted: string | null = null;
  try {
    wanted = new URLSearchParams(search).get(DAY_PARAM);
  } catch {
    /* an address that cannot be parsed asks for nothing */
  }
  if (!wanted || !/^\d{4}-\d{2}-\d{2}$/.test(wanted)) return null;
  const then = Date.parse(`${wanted}T00:00:00Z`);
  const now = Date.parse(`${today}T00:00:00Z`);
  // Date.parse accepts 2026-02-31 as early March; a real day reads back as itself.
  if (Number.isNaN(then) || Number.isNaN(now) || new Date(then).toISOString().slice(0, 10) !== wanted) return null;
  const age = Math.round((now - then) / DAY_MS);
  return age >= 0 && age < keepDays ? wanted : null;
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
