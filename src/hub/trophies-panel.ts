import registry from '../../games/registry.json';
import { escapeHtml } from './html';
import { getCounter, getStats, getTopScores, isUnlocked, resetTrophies, TROPHIES, unlockedAt } from '../../shared/achievements';
import { DAILY_TAG, dailyStreak, getDailyHistory } from '../../shared/rng';

const gameTitles: Record<string, string> = Object.fromEntries(
  (registry as { slug: string; title: string }[]).map((g) => [g.slug, g.title]),
);
const dailyGames = new Set((registry as { slug: string; tags: string[] }[]).filter((g) => g.tags.includes(DAILY_TAG)).map((g) => g.slug));

/** How many past daily results the panel lists per game. */
const DAILY_SHOWN = 7;

/** "Nov 12" for a yyyy-mm-dd day, read as the UTC date it names. */
const shortDay = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** A game's daily challenge line: the current streak and its most recent results, or nothing if it was never played. */
function dailyLine(game: string): string {
  if (!dailyGames.has(game)) return '';
  const history = getDailyHistory(game);
  const days = Object.keys(history).sort().reverse().slice(0, DAILY_SHOWN);
  if (!days.length) return '';
  const streak = dailyStreak(game);
  const results = days.map((day) => `${escapeHtml(shortDay(day))} <strong>${history[day].toLocaleString()}</strong>`).join(' · ');
  return `<p class="daily-history">Daily${streak > 1 ? `, ${streak} days in a row` : ''}: ${results}</p>`;
}

/** Wires up the Trophies dialog: every trophy grouped by game, with plays and best scores. */
export function initTrophiesPanel(): void {
  const dialog = document.querySelector<HTMLDialogElement>('#trophies')!;
  const open = document.querySelector<HTMLButtonElement>('#open-trophies')!;
  const list = dialog.querySelector<HTMLDivElement>('#trophy-list')!;
  const summary = dialog.querySelector<HTMLParagraphElement>('#trophy-summary')!;

  const render = () => {
    const unlocked = TROPHIES.filter((t) => isUnlocked(t.id)).length;
    open.textContent = `Trophies ${unlocked}/${TROPHIES.length}`;
    summary.textContent = `${unlocked} of ${TROPHIES.length} unlocked`;
    const groups = ['arcade', ...Object.keys(gameTitles)];
    list.innerHTML = groups
      .map((game) => {
        const trophies = TROPHIES.filter((t) => t.game === game);
        const stats = getStats(game);
        const statLine =
          game === 'arcade'
            ? `${getCounter('arcade.plays')} ${getCounter('arcade.plays') === 1 ? 'game' : 'games'} played`
            : stats.plays
              ? `Played ${stats.plays} · Best ${stats.best.toLocaleString()}${
                  // Two-player matches count as plays but carry no score, so only show an average when there is one.
                  stats.totalScore > 0 ? ` · Average ${Math.round(stats.totalScore / stats.plays).toLocaleString()}` : ''
                }`
              : stats.best
                ? `Best ${stats.best.toLocaleString()}`
                : 'Not played yet';
        const tiles = trophies
          .map((t) => {
            const done = isUnlocked(t.id);
            // Running totals stay visible after their trophy unlocks, as a lifetime stat.
            let progress = '';
            if (t.counter && t.target) {
              const count = getCounter(t.counter);
              progress = done ? ` (${count.toLocaleString()} so far)` : ` (${Math.min(count, t.target)}/${t.target})`;
            }
            const when = done ? new Date(unlockedAt(t.id)!).toLocaleDateString() : 'Locked';
            return `<li class="trophy ${done ? 'done' : ''}">
              <strong>${escapeHtml(t.title)}</strong>
              <span>${escapeHtml(t.description)}${progress}</span>
              <em>${when}</em>
            </li>`;
          })
          .join('');
        // A game with no trophies yet (e.g. freshly scaffolded) still gets its stats line.
        const grid = trophies.length ? `<ul class="trophy-grid">${tiles}</ul>` : '';
        // The score table only says more than "Best" once it has a second entry.
        const top = game === 'arcade' ? [] : getTopScores(game);
        const table =
          top.length > 1
            ? `<ol class="top-scores" aria-label="Top scores">${top
                .map((e) => `<li><strong>${e.score.toLocaleString()}</strong>${e.at ? ` <span>${new Date(e.at).toLocaleDateString()}</span>` : ''}</li>`)
                .join('')}</ol>`
            : '';
        return `<section><h3>${escapeHtml(game === 'arcade' ? 'Arcade' : gameTitles[game])} <small>${statLine}</small></h3>${dailyLine(game)}${table}${grid}</section>`;
      })
      .join('');
  };

  open.addEventListener('click', () => {
    render();
    dialog.showModal();
  });
  dialog.querySelector('#close-trophies')!.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  dialog.querySelector('#reset-trophies')!.addEventListener('click', () => {
    if (window.confirm('Reset all trophies and stats on this device? High scores are kept.')) {
      resetTrophies();
      render();
    }
  });
  render();
}
