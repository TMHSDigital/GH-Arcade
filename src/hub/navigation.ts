/**
 * Couch-friendly hub navigation: arrow keys or a gamepad move between cabinet cards.
 *
 * Gamepad: d-pad / left stick move, A opens the game, B closes an open panel,
 * LB / RB switch tag filters, Y opens Trophies, Start opens Settings.
 *
 * Inside an open panel the gamepad works its controls: up / down move between them (scrolling the
 * panel on the way), left / right change a slider or a list, A presses a button or ticks a box.
 */

import { PAD, STICK_PRESS } from '../../shared/gamepad';

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

/** The next position in a list of `count` controls, stopping at either end; -1 if there are none. */
export function stepIndex(count: number, current: number, dir: number): number {
  // Nothing chosen yet: start at the top, whichever way was pressed.
  if (count <= 0) return -1;
  if (current < 0) return 0;
  return Math.max(0, Math.min(count - 1, current + dir));
}

/** A slider's value one step up or down, kept on its step grid and inside its range. */
export function steppedValue(value: number, min: number, max: number, step: number, dir: number): number {
  const size = step > 0 ? step : 1;
  const next = min + Math.round((value - min) / size + dir) * size;
  return Math.max(min, Math.min(max, next));
}

/** The controls in a panel that a gamepad can reach: visible, enabled buttons, inputs and lists. */
function panelControls(dialog: HTMLElement): HTMLElement[] {
  return [...dialog.querySelectorAll<HTMLElement>('button, input, select')].filter(
    (el) => !(el as HTMLButtonElement).disabled && el.getAttribute('type') !== 'file' && el.getClientRects().length > 0,
  );
}

/** Where the gamepad last was in the open panel, for when the focused control is redrawn and loses focus. */
let panelIndex = -1;

function clearPanelFocus(): void {
  document.querySelectorAll('.panel .nav-focus').forEach((el) => el.classList.remove('nav-focus'));
}

/**
 * Moves the gamepad's focus up or down a panel. A control that is off screen is scrolled toward
 * first, a screenful at a time, so long panels (the trophy list) can be read on the way.
 */
function movePanelFocus(dialog: HTMLDialogElement, dir: number): void {
  const controls = panelControls(dialog);
  const active = controls.indexOf(document.activeElement as HTMLElement);
  const from = active >= 0 ? active : Math.min(panelIndex, controls.length - 1);
  const next = stepIndex(controls.length, from, dir);
  const target = controls[next];
  const view = dialog.getBoundingClientRect();
  const box = target?.getBoundingClientRect();
  const offScreen = box !== undefined && (box.top < view.top || box.bottom > view.bottom);
  if (!target || next === from || offScreen) {
    const before = dialog.scrollTop;
    dialog.scrollBy({ top: dir * dialog.clientHeight * 0.6, behavior: 'auto' });
    // Still more to read (or nowhere left to go): the focus stays where it is.
    if (dialog.scrollTop !== before || !target || next === from) return;
  }
  clearPanelFocus();
  panelIndex = next;
  // A class as well as :focus-visible, because focus moved by a gamepad isn't always "visible" to the browser.
  target.classList.add('nav-focus');
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: 'nearest' });
}

/** Left / right on the focused control: one step of a slider, or the previous / next entry of a list. */
function adjustPanelControl(dir: number): void {
  const el = document.activeElement;
  if (el instanceof HTMLInputElement && el.type === 'range') {
    const next = steppedValue(Number(el.value), Number(el.min || 0), Number(el.max || 100), Number(el.step || 1), dir);
    if (next === Number(el.value)) return;
    el.value = String(next);
  } else if (el instanceof HTMLSelectElement) {
    const next = stepIndex(el.options.length, el.selectedIndex, dir);
    if (next === el.selectedIndex) return;
    el.selectedIndex = next;
  } else return;
  // The panels listen for these, exactly as when the control is changed by hand.
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/** A on the focused control: press the button or tick the box. With nothing focused yet, focus the first control. */
function activatePanelControl(dialog: HTMLDialogElement): void {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement) || !dialog.contains(el) || !panelControls(dialog).includes(el)) {
    movePanelFocus(dialog, 1);
    return;
  }
  if (el instanceof HTMLButtonElement || (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio'))) el.click();
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
  document.addEventListener('pointerdown', () => {
    cards().forEach((c) => c.classList.remove('nav-focus'));
    clearPanelFocus();
  });
  // Each panel starts from its first control again the next time it opens.
  document.querySelectorAll('dialog').forEach((d) =>
    d.addEventListener('close', () => {
      panelIndex = -1;
      clearPanelFocus();
    }),
  );

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
      if (b(PAD.left) || ax < -STICK_PRESS) down.add('left');
      if (b(PAD.right) || ax > STICK_PRESS) down.add('right');
      if (b(PAD.up) || ay < -STICK_PRESS) down.add('up');
      if (b(PAD.down) || ay > STICK_PRESS) down.add('down');
      if (b(PAD.a)) down.add('a');
      if (b(PAD.b)) down.add('b');
      if (b(PAD.y)) down.add('y');
      if (b(PAD.lb)) down.add('lb');
      if (b(PAD.rb)) down.add('rb');
      if (b(PAD.start)) down.add('start');
      const pressed = (k: string) => down.has(k) && !prev.has(k);

      const dialog = openDialog();
      const waiting = dialog?.querySelector<HTMLElement>('.rebind.listening') ?? null;
      if (dialog && waiting) {
        // While Settings waits for a gamepad button to bind (src/hub/pad-bindings.ts), every press is
        // an answer. A key binding waits for a key instead, so B stands in for Escape and cancels it.
        if (pressed('b') && !waiting.closest('#pad-bindings')) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        heldDir = '';
      } else if (dialog) {
        if (pressed('b')) dialog.close();
        else if (pressed('a')) activatePanelControl(dialog);
      }
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
      }
      // Directions move between cards, or between the controls of an open panel.
      if (!waiting) {
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
    const [dx, dy] = d[dir];
    const dialog = openDialog();
    if (!dialog) moveFocus(dx, dy);
    else if (dy) movePanelFocus(dialog, dy);
    else adjustPanelControl(dx);
  };
  requestAnimationFrame(poll);
}
