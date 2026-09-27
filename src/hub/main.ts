import './hub.css';
import registry from '../../games/registry.json';
import { registerOffline } from '../../shared/pwa';
import { getHighScore } from '../../shared/storage';
import { initSettingsPanel } from './settings-panel';
import { initTrophiesPanel } from './trophies-panel';

registerOffline();
initSettingsPanel();
initTrophiesPanel();

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

let activeTag: string | null = null;

function card(game: GameEntry): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'card';
  li.style.setProperty('--accent', game.accent);

  const best = getHighScore(game.slug);
  // Relative link so it works under any base path (dev server and GitHub Pages).
  li.innerHTML = `
    <a class="card-link" href="games/${encodeURIComponent(game.slug)}/">
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
        </div>
        ${game.controls ? `<p class="controls">${escapeHtml(game.controls)}</p>` : ''}
      </div>
      <span class="play">Play</span>
    </a>`;
  return li;
}

function render(): void {
  const visible = activeTag ? games.filter((g) => g.tags.includes(activeTag!)) : games;
  grid.replaceChildren(...visible.map(card));
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
      filters.querySelectorAll('button').forEach((el) => el.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true');
      render();
    });
    return b;
  };
  filters.replaceChildren(make('All', null), ...tags.map((t) => make(t, t)));
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

renderFilters();
render();
