import { registerSW } from 'virtual:pwa-register';

/**
 * Registers the arcade's service worker so every page works offline after the first visit.
 * Updates apply automatically on the next load. Safe to call from every page.
 */
export function registerOffline(): void {
  if (!('serviceWorker' in navigator)) return;
  try {
    registerSW({ immediate: true });
  } catch {
    /* service workers unavailable (e.g. some private modes); the site still works online */
  }
}
