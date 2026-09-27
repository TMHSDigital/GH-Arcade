/**
 * Couch-friendly hub navigation: arrow keys or a gamepad move between cabinet cards.
 *
 * Gamepad: d-pad / left stick move, A opens the game, B closes an open panel,
 * LB / RB switch tag filters, Y opens Trophies, Start opens Settings.
 */

const REPEAT_DELAY_MS = 380;
const REPEAT_RATE_MS = 140;

function cards(): HTMLAnchorElement[] {
  return [...document.querySelectorAll<HTMLAnchorElement>('#game-grid .card-link')];
}

function columns(grid: HTMLElement): number {
  return Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length);
}

function openDialog(): HTMLDialogElement | null {
  return document.querySelector<HTMLDialogElement>('dialog[open]');
}

/** Moves focus between cards like a grid; returns false if there was nothing to move. */
function moveFocus(dx: number, dy: number): boolean {
  const list = cards();
  if (!list.length) return false;
  const grid = document.querySelector<HTMLElement>('#game-grid')!;
  const current = list.indexOf(document.activeElement as HTMLAnchorElement);
  let next: number;
  if (current < 0) next = 0;
  else {
    next = current + dx + dy * columns(grid);
    next = Math.max(0, Math.min(list.length - 1, next));
  }
  focusCard(list[next]);
  return true;
}

function focusCard(card: HTMLAnchorElement): void {
  cards().forEach((c) => c.classList.remove('nav-focus'));
  // A class as well as :focus-visible, because focus moved by a gamepad isn't always "visible" to the browser.
  card.classList.add('nav-focus');
  card.focus({ preventScroll: true });
  card.scrollIntoView({ block: 'nearest', behavior: document.documentElement.classList.contains('reduced-motion') ? 'auto' : 'smooth' });
}

function cycleFilter(dir: number): void {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('#filters button')];
  if (!buttons.length) return;
  const current = buttons.findIndex((b) => b.getAttribute('aria-pressed') === 'true');
  buttons[(current + dir + buttons.length) % buttons.length].click();
}

export function initHubNavigation(): void {
  document.addEventListener('keydown', (e) => {
    if (openDialog() || e.altKey || e.ctrlKey || e.metaKey) return;
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, select')) return;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const move = moves[e.key];
    if (move && moveFocus(...move)) e.preventDefault();
  });
  // Mouse or touch use drops the gamepad highlight so it doesn't linger.
  document.addEventListener('pointerdown', () => cards().forEach((c) => c.classList.remove('nav-focus')));

  // Gamepad polling. Buttons fire once per press; directions repeat while held, like a menu.
  const prev = new Set<string>();
  let heldDir = '';
  let heldSince = 0;
  let lastRepeat = 0;

  const poll = (now: number) => {
    const pad = navigator.getGamepads?.().find((p) => p && p.connected);
    if (pad) {
      const down = new Set<string>();
      const b = (i: number) => !!pad.buttons[i]?.pressed;
      const [ax, ay] = [pad.axes[0] ?? 0, pad.axes[1] ?? 0];
      if (b(14) || ax < -0.5) down.add('left');
      if (b(15) || ax > 0.5) down.add('right');
      if (b(12) || ay < -0.5) down.add('up');
      if (b(13) || ay > 0.5) down.add('down');
      if (b(0)) down.add('a');
      if (b(1)) down.add('b');
      if (b(3)) down.add('y');
      if (b(4)) down.add('lb');
      if (b(5)) down.add('rb');
      if (b(9)) down.add('start');
      const pressed = (k: string) => down.has(k) && !prev.has(k);

      const dialog = openDialog();
      if (pressed('b') && dialog) dialog.close();
      if (!dialog) {
        if (pressed('a')) {
          const active = document.activeElement as HTMLElement | null;
          if (active?.classList.contains('card-link')) active.click();
          else moveFocus(0, 0);
        }
        if (pressed('lb')) cycleFilter(-1);
        if (pressed('rb')) cycleFilter(1);
        if (pressed('y')) document.querySelector<HTMLButtonElement>('#open-trophies')?.click();
        if (pressed('start')) document.querySelector<HTMLButtonElement>('#open-settings')?.click();

        const dir = ['left', 'right', 'up', 'down'].find((d) => down.has(d)) ?? '';
        if (dir && dir !== heldDir) {
          heldDir = dir;
          heldSince = now;
          lastRepeat = now;
          step(dir);
        } else if (dir && now - heldSince > REPEAT_DELAY_MS && now - lastRepeat > REPEAT_RATE_MS) {
          lastRepeat = now;
          step(dir);
        } else if (!dir) {
          heldDir = '';
        }
      }
      prev.clear();
      down.forEach((k) => prev.add(k));
    }
    requestAnimationFrame(poll);
  };
  const step = (dir: string) => {
    const d: Record<string, [number, number]> = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
    moveFocus(...d[dir]);
  };
  requestAnimationFrame(poll);
}
