import './hub.css';
import registry from '../../games/registry.json';
import { getHighScore } from '../../shared/storage';

interface GameEntry {
  slug: string;
  title: string;
  description: string;
  tags: string[];
  accent: string;
  controls?: string;
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
      <div class="card-art" aria-hidden="true"><span>${escapeHtml(game.title.charAt(0))}</span></div>
      <div class="card-body">
        <h3>${escapeHtml(game.title)}</h3>
        <p>${escapeHtml(game.description)}</p>
        <div class="meta">
          ${game.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
          ${best > 0 ? `<span class="best">Best ${best.toLocaleString()}</span>` : ''}
        </div>
        ${game.controls ? `<p class="controls">${escapeHtml(game.controls)}</p>` : ''}
      </div>
      <span class="play">Play ▶</span>
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
