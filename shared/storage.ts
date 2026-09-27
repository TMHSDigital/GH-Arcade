// localStorage can throw (private mode, blocked storage) — never let that break a game.
const PREFIX = 'gh-arcade:';

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function saveJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable — ignore */
  }
}

export function getHighScore(game: string): number {
  return loadJSON<number>(`${game}:highscore`, 0);
}

/** Saves the score if it beats the stored best. Returns true when a new record was set. */
export function submitHighScore(game: string, score: number): boolean {
  if (score <= getHighScore(game)) return false;
  saveJSON(`${game}:highscore`, score);
  return true;
}
