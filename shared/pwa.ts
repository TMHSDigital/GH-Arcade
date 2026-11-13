import { registerSW } from 'virtual:pwa-register';
import { STORAGE_PREFIX } from './storage';
import { showToast } from './toast';

/** Set just before the hub reloads itself for an update, so the fresh page can say what happened. */
const UPDATED_FLAG = `${STORAGE_PREFIX}updated`;

/**
 * Registers the arcade's service worker so every page works offline after the first visit, and
 * tells the player what it is doing:
 *
 * - once everything is cached for the first time: "Ready to play offline";
 * - when a new version has been downloaded: the hub reloads into it and says so, while a game page
 *   keeps running (reloading would throw away the run) and says the update loads next time.
 *
 * Safe to call from every page.
 */
export function registerOffline(page: 'hub' | 'game' = 'game'): void {
  if (!('serviceWorker' in navigator)) return;
  try {
    if (sessionStorage.getItem(UPDATED_FLAG)) {
      sessionStorage.removeItem(UPDATED_FLAG);
      showToast('Arcade updated', 'You have the latest version');
    }
    registerSW({
      immediate: true,
      onOfflineReady: () => showToast('Ready to play offline', 'The arcade is saved on this device'),
      // Without this the plugin reloads the page as soon as an update activates, even mid-game.
      onNeedReload: () => {
        if (page === 'hub') {
          sessionStorage.setItem(UPDATED_FLAG, '1');
          window.location.reload();
        } else {
          showToast('Update ready', 'It loads the next time you open a game');
        }
      },
    });
  } catch {
    /* service workers or storage unavailable (e.g. some private modes); the site still works online */
  }
}
