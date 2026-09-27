import { PAUSE_REQUEST_EVENT, PAUSE_STATE_EVENT } from './pause';
import { isTouchDevice } from './touch';

/**
 * Page-level controls around every game canvas (plain HTML, so they stay crisp and reachable on
 * any screen): a pause button for touch players, a fullscreen toggle, the loading indicator, and a
 * hint to turn phones sideways.
 */
export function initGameChrome(): void {
  const bar = document.createElement('div');
  bar.className = 'game-toolbar';

  const pause = button('Pause', 'Pause the game');
  pause.hidden = true;
  pause.addEventListener('click', () => {
    window.dispatchEvent(new Event(PAUSE_REQUEST_EVENT));
    pause.blur(); // so Space in the game doesn't re-press the button
  });
  window.addEventListener(PAUSE_STATE_EVENT, (e) => {
    const { paused, available } = (e as CustomEvent<{ paused: boolean; available: boolean }>).detail;
    pause.hidden = !available;
    pause.textContent = paused ? 'Resume' : 'Pause';
    pause.setAttribute('aria-label', paused ? 'Resume the game' : 'Pause the game');
  });
  bar.append(pause);

  if (document.fullscreenEnabled) {
    const full = button('Fullscreen', 'Enter fullscreen');
    full.addEventListener('click', async () => {
      full.blur();
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else {
          await document.documentElement.requestFullscreen();
          // Phones play best sideways; browsers that allow it will lock the orientation.
          await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape').catch(() => undefined);
        }
      } catch {
        /* fullscreen refused (e.g. not triggered by a user gesture); nothing to do */
      }
    });
    document.addEventListener('fullscreenchange', () => {
      full.textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen';
    });
    bar.append(full);
  }
  document.body.append(bar);

  if (isTouchDevice()) initRotateHint();
}

/** Removes the static "loading" placeholder once the game has drawn its first frame. */
export function hideLoader(): void {
  document.querySelector('.game-loading')?.remove();
}

function button(label: string, aria: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'game-button';
  b.textContent = label;
  b.setAttribute('aria-label', aria);
  return b;
}

/** On phones held upright, suggest turning sideways (the games are landscape). Dismissible. */
function initRotateHint(): void {
  const KEY = 'gh-arcade:rotate-dismissed';
  let dismissed = false;
  try {
    dismissed = sessionStorage.getItem(KEY) === '1';
  } catch {
    /* storage blocked; show the hint anyway */
  }
  if (dismissed) return;
  const hint = document.createElement('div');
  hint.className = 'rotate-hint';
  hint.setAttribute('role', 'note');
  hint.innerHTML = '<span>Turn your device sideways for a bigger view</span>';
  const close = button('OK', 'Dismiss');
  close.addEventListener('click', () => {
    hint.remove();
    try {
      sessionStorage.setItem(KEY, '1');
    } catch {
      /* ignore */
    }
  });
  hint.append(close);
  document.body.append(hint);
  const portrait = window.matchMedia('(orientation: portrait)');
  const sync = () => (hint.hidden = !portrait.matches);
  sync();
  portrait.addEventListener('change', sync);
}
