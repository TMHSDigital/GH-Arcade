import './hub.css';
import registry from '../../games/registry.json';
import { registerOffline } from '../../shared/pwa';
import { getHighScore, getStats, trophyProgress } from '../../shared/achievements';
import { modeQuery } from '../../shared/modes';
import { DAILY_MODE_LABEL, DAILY_TAG, getDailyBest } from '../../shared/rng';
import { loadJSON, saveJSON } from '../../shared/storage';
import { initStorageNotice } from '../../shared/storage-notice';
import { initDataPanel } from './data-panel';
import { escapeHtml } from './html';
import { initHubNavigation } from './navigation';
import { initPadPanel } from './pad-bindings';
import { initSettingsPanel } from './settings-panel';
import { initTrophiesPanel } from './trophies-panel';

registerOffline('hub');
initStorageNotice();

// Chromium browsers fire this when the arcade can be installed as an app; show our own button for it.
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
const installButton = document.querySelector<HTMLButtonElement>('#install')!;
let installPrompt: InstallPromptEvent | null = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e as InstallPromptEvent;
  installButton.hidden = false;
});
installButton.addEventListener('click', async () => {
  if (!installPrompt) return;
  await installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  installButton.hidden = true;
});
window.addEventListener('appinstalled', () => (installButton.hidden = true));

// iOS Safari never fires beforeinstallprompt, so explain the manual route there, once.
const iosHint = document.querySelector<HTMLParagraphElement>('#ios-install')!;
const IOS_HINT_KEY = 'hub:ios-install-hint';
function isIosBrowserTab(): boolean {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; the touch points give it away.
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  return ios && !standalone;
}
if (isIosBrowserTab() && !loadJSON<boolean>(IOS_HINT_KEY, false)) {
  iosHint.hidden = false;
  iosHint.querySelector('button')!.addEventListener('click', () => {
    iosHint.hidden = true;
    saveJSON(IOS_HINT_KEY, true);
  });
}

interface GameEntry {
  slug: string;
  title: string;
  description: string;
  tags: string[];
  accent: string;
  controls?: string;
  /** Optional 16:9 screenshot in public/, e.g. thumbs/snake.jpg. Without one the card shows the title's first letter. */
  thumbnail?: string;
}

const games = registry as GameEntry[];
const grid = document.querySelector<HTMLUListElement>('#game-grid')!;
const filters = document.querySelector<HTMLDivElement>('#filters')!;
const count = document.querySelector<HTMLSpanElement>('#game-count')!;
const sortSelect = document.querySelector<HTMLSelectElement>('#sort')!;

const SORTS = ['featured', 'recent', 'plays', 'title'] as const;
type Sort = (typeof SORTS)[number];

// The chosen tag is remembered too, so the filter is still on after a game. A tag that no game has
// any more (or anything unexpected in storage) falls back to "All".
const savedTag = loadJSON<unknown>('hub:tag', null);
let activeTag: string | null = typeof savedTag === 'string' && games.some((g) => g.tags.includes(savedTag)) ? savedTag : null;
// The chosen order is remembered; anything unexpected in storage falls back to registry order.
const savedSort = loadJSON<unknown>('hub:sort', 'featured');
let sort: Sort = SORTS.find((s) => s === savedSort) ?? 'featured';

/** Orders the cards. Ties (and games never played) keep their registry order, so the grid stays stable. */
function sorted(list: GameEntry[]): GameEntry[] {
  if (sort === 'featured') return list;
  const key: Record<Exclude<Sort, 'featured'>, (a: GameEntry, b: GameEntry) => number> = {
    recent: (a, b) => (getStats(b.slug).lastPlayed ?? 0) - (getStats(a.slug).lastPlayed ?? 0),
    plays: (a, b) => getStats(b.slug).plays - getStats(a.slug).plays,
    title: (a, b) => a.title.localeCompare(b.title),
  };
  return [...list].sort(key[sort]);
}

/** The game with the most recent finished run, if any, so its card can say so. */
function lastPlayedSlug(): string | null {
  let best: GameEntry | null = null;
  for (const g of games) {
    const at = getStats(g.slug).lastPlayed ?? 0;
    if (at > 0 && (!best || at > (getStats(best.slug).lastPlayed ?? 0))) best = g;
  }
  return best?.slug ?? null;
}

function card(game: GameEntry, isLastPlayed: boolean): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'card';
  li.style.setProperty('--accent', game.accent);

  const best = getHighScore(game.slug);
  const trophies = trophyProgress(game.slug);
  // Games with a daily challenge say whether today's has been played (the day is the UTC date, as in the games).
  const daily = game.tags.includes(DAILY_TAG) ? getDailyBest(game.slug) : -1;
  // Relative link so it works under any base path (dev server and GitHub Pages). While today's daily
  // challenge is waiting, the card opens the game's menu on DAILY.
  li.innerHTML = `
    <a class="card-link" href="games/${encodeURIComponent(game.slug)}/${daily === 0 ? modeQuery(DAILY_MODE_LABEL) : ''}">
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
          ${daily > 0 ? `<span class="daily done" title="Your best in today's daily challenge">Daily ${daily.toLocaleString()}</span>` : ''}
          ${daily === 0 ? '<span class="daily" title="Today\'s daily challenge is waiting: this card opens on it">Daily: not played</span>' : ''}
          ${isLastPlayed ? '<span class="recent">Last played</span>' : ''}
        </div>
        ${game.controls ? `<p class="controls">${escapeHtml(game.controls)}</p>` : ''}
      </div>
      <span class="play">Play</span>
    </a>`;
  return li;
}

function render(): void {
  const visible = sorted(activeTag ? games.filter((g) => g.tags.includes(activeTag!)) : games);
  const last = lastPlayedSlug();
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
  sort = SORTS.find((s) => s === sortSelect.value) ?? 'featured';
  saveJSON('hub:sort', sort);
  render();
});

renderFilters();
render();
// Trophies can be reset in their dialog, which changes the chips on the cards.
document.querySelector('#trophies')?.addEventListener('close', render);

// Panels are wired up after the grid is on screen, and one that fails must never hide the games.
for (const init of [initSettingsPanel, initPadPanel, initDataPanel, initTrophiesPanel, initHubNavigation]) {
  try {
    init();
  } catch (err) {
    console.error('Hub panel failed to start', err);
  }
}
// A hub restored from the back/forward cache still shows the bests from before the last game.
window.addEventListener('pageshow', (e) => {
  if (e.persisted) render();
});
