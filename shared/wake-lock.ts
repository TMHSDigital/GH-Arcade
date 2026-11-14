/**
 * Keeps the screen on while a run is in progress. Keys and touches do that on their own, but a
 * gamepad does not count as activity to most browsers, so a phone or laptop played with one would
 * dim or lock mid-run. The lock is dropped whenever play stops (pause, menu, game over), and
 * browsers without the Screen Wake Lock API simply carry on as before. No Phaser here.
 */

let wanted = false;
let requesting = false;
let lock: WakeLockSentinel | null = null;

async function acquire(): Promise<void> {
  if (!wanted || lock || requesting) return;
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  requesting = true;
  try {
    const granted = await navigator.wakeLock.request('screen');
    // The browser lets go of the lock by itself when the tab is hidden; forget it then.
    granted.addEventListener('release', () => {
      if (lock === granted) lock = null;
    });
    lock = granted;
  } catch {
    /* refused (battery saver, permissions policy): the screen follows the device's own timeout */
  } finally {
    requesting = false;
  }
  // Play stopped while the request was in flight.
  if (!wanted) drop();
}

function drop(): void {
  const held = lock;
  lock = null;
  held?.release().catch(() => undefined);
}

/** Asks the browser to keep the screen on (true) or lets it sleep again (false). Safe to call repeatedly. */
export function keepScreenAwake(on: boolean): void {
  wanted = on;
  if (on) void acquire();
  else drop();
}

// A hidden tab loses its lock, so ask again when the player comes back to a run that is still going.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void acquire();
  });
}
