import registry from '../../games/registry.json';
import { escapeHtml } from './html';
import { getCounter, getStats, isUnlocked, resetTrophies, TROPHIES, unlockedAt } from '../../shared/achievements';

const gameTitles: Record<string, string> = Object.fromEntries(
  (registry as { slug: string; title: string }[]).map((g) => [g.slug, g.title]),
);

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
        if (!trophies.length) return '';
        const stats = getStats(game);
        const statLine =
          game === 'arcade'
            ? `${getCounter('arcade.plays')} ${getCounter('arcade.plays') === 1 ? 'game' : 'games'} played`
            : stats.plays
              ? `Played ${stats.plays} · Best ${stats.best.toLocaleString()}${
                  // Two-player matches count as plays but carry no score, so only show an average when there is one.
                  stats.totalScore > 0 ? ` · Average ${Math.round(stats.totalScore / stats.plays).toLocaleString()}` : ''
                }`
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
        return `<section><h3>${escapeHtml(game === 'arcade' ? 'Arcade' : gameTitles[game])} <small>${statLine}</small></h3><ul class="trophy-grid">${tiles}</ul></section>`;
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
