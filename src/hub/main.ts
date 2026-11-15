import './hub.css';
import { GAMES, type GameEntry } from '../../games/registry';
import { registerOffline } from '../../shared/pwa';
import { getHighScore, getStats, trophyProgress } from '../../shared/achievements';
import { DAILY_TAG, getDailyBest, playedDaily } from '../../shared/rng';
import { loadJSON, saveJSON } from '../../shared/storage';
import { initStorageNotice } from '../../shared/storage-notice';
import { cardHref, lastPlayedSlug, type Sort, sorted, validSort, validTag } from './cards';
import { initDailyBanner } from './daily-banner';
import { initDataPanel } from './data-panel';
import { escapeHtml } from './html';
import { initInstallPrompt } from './install';
import { initHubNavigation } from './navigation';
import { initPadPanel } from './pad-bindings';
import { initSettingsPanel } from './settings-panel';
import { initTrophiesPanel } from './trophies-panel';

registerOffline('hub');
initStorageNotice();

const games = GAMES;
const grid = document.querySelector<HTMLUListElement>('#game-grid')!;
const filters = document.querySelector<HTMLDivElement>('#filters')!;
const count = document.querySelector<HTMLSpanElement>('#game-count')!;
const sortSelect = document.querySelector<HTMLSelectElement>('#sort')!;

// The chosen tag and order are remembered, so they are still on after a game (src/hub/cards.ts
// decides what to do with anything unexpected in storage).
let activeTag = validTag(loadJSON<unknown>('hub:tag', null), games);
let sort: Sort = validSort(loadJSON<unknown>('hub:sort', 'featured'));

function card(game: GameEntry, isLastPlayed: boolean): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'card';
  li.style.setProperty('--accent', game.accent);

  const best = getHighScore(game.slug);
  const trophies = trophyProgress(game.slug);
  // Games with a daily challenge say whether today's has been played (the day is the UTC date, as in the games).
  // A day counts as played from its first finished run, even one that scored nothing.
  const hasDaily = game.tags.includes(DAILY_TAG);
  const dailyDone = hasDaily && playedDaily(game.slug);
  const dailyWaiting = hasDaily && !dailyDone;
  li.innerHTML = `
    <a class="card-link" href="${cardHref(game.slug, dailyWaiting)}">
      <div class="card-art" aria-hidden="true">${
        game.thumbnail
          ? `<img src="${escapeHtml(game.thumbnail)}" alt="" loading="lazy" decoding="async" />`
          : `<span>${escapeHtml(game.title.charAt(0))}</span>`
      }</div>
      <div class="card-body">
        <h3>${escapeHtml(game.title)}</h3>
        <p>${escapeHtml(game.description)}</p>
        <div class="meta">
          ${game.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
          ${best > 0 ? `<span class="best">Best ${best.toLocaleString()}</span>` : ''}
          ${trophies.total ? `<span class="trophies" title="Trophies unlocked">Trophies ${trophies.unlocked}/${trophies.total}</span>` : ''}
          ${dailyDone ? `<span class="daily done" title="Your best in today's daily challenge">Daily ${getDailyBest(game.slug).toLocaleString()}</span>` : ''}
          ${dailyWaiting ? '<span class="daily" title="Today\'s daily challenge is waiting: this card opens on it">Daily: not played</span>' : ''}
          ${isLastPlayed ? '<span class="recent">Last played</span>' : ''}
        </div>
        ${game.controls ? `<p class="controls">${escapeHtml(game.controls)}</p>` : ''}
      </div>
      <span class="play">Play</span>
    </a>`;
  return li;
}

function render(): void {
  const visible = sorted(activeTag ? games.filter((g) => g.tags.includes(activeTag!)) : games, sort, getStats);
  const last = lastPlayedSlug(games, getStats);
  grid.replaceChildren(...visible.map((g) => card(g, g.slug === last)));
  count.textContent = `(${visible.length})`;
}

function renderFilters(): void {
  const tags = [...new Set(games.flatMap((g) => g.tags))].sort();
  if (tags.length < 2) return; // Not worth a filter bar yet.
  const make = (label: string, tag: string | null) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.setAttribute('aria-pressed', String(activeTag === tag));
    b.addEventListener('click', () => {
      activeTag = tag;
      saveJSON('hub:tag', tag);
      filters.querySelectorAll('button').forEach((el) => el.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true');
      render();
    });
    return b;
  };
  filters.replaceChildren(make('All', null), ...tags.map((t) => make(t, t)));
}

sortSelect.value = sort;
sortSelect.addEventListener('change', () => {
  sort = validSort(sortSelect.value);
  saveJSON('hub:sort', sort);
  render();
});

renderFilters();
render();
// Trophies can be reset in their dialog, which changes the chips on the cards.
document.querySelector('#trophies')?.addEventListener('close', render);

// The daily countdown is only worth showing when some game has a daily challenge.
const initDaily = () => {
  if (games.some((g) => g.tags.includes(DAILY_TAG))) initDailyBanner(render);
};
// Everything else is wired up after the grid is on screen, and a part that fails must never hide the games.
for (const init of [initInstallPrompt, initDaily, initSettingsPanel, initPadPanel, initDataPanel, initTrophiesPanel, initHubNavigation]) {
  try {
    init();
  } catch (err) {
    console.error('A part of the hub failed to start', err);
  }
}
// A hub restored from the back/forward cache still shows the bests from before the last game.
window.addEventListener('pageshow', (e) => {
  if (e.persisted) render();
});
