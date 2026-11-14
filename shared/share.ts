/**
 * Sharing a result as a line of text, through the browser's own share sheet or the clipboard.
 * The arcade sends nothing anywhere itself. No Phaser here.
 */

export interface SharedResult {
  /** The game's display name, e.g. "Neon Stack". */
  title: string;
  score: number;
  /** The UTC date of the daily challenge the score was made in, if it was one. */
  daily?: string;
}

/** The line to share: "Neon Stack daily 2026-11-13: 48,200", or "Neon Stack: 48,200" for a normal run. */
export function resultText({ title, score, daily }: SharedResult): string {
  return `${title}${daily ? ` daily ${daily}` : ''}: ${score.toLocaleString()}`;
}

/** True where the browser can share or copy text, so a SHARE option is worth showing. */
export function canShare(): boolean {
  return typeof navigator !== 'undefined' && (typeof navigator.share === 'function' || typeof navigator.clipboard?.writeText === 'function');
}

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

/**
 * Offers `text` and `url` to the browser's share sheet, or copies them to the clipboard where there
 * is none (or it refuses). Browsers only allow either shortly after a key press, click or tap, so
 * call this from the player's own action; a gamepad press does not count and ends in 'failed'.
 */
export async function shareResult(text: string, url: string): Promise<ShareOutcome> {
  if (typeof navigator === 'undefined') return 'failed';
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ text, url });
      return 'shared';
    } catch (err) {
      // The player closed the share sheet: that is an answer, not a failure.
      if (err instanceof Error && err.name === 'AbortError') return 'cancelled';
      /* otherwise fall back to the clipboard */
    }
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    return 'copied';
  } catch {
    return 'failed';
  }
}
