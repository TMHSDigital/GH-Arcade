import { loadJSON, saveJSON } from '../../shared/storage';

// Chromium browsers fire this when the arcade can be installed as an app; show our own button for it.
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const IOS_HINT_KEY = 'hub:ios-install-hint';

function isIosBrowserTab(): boolean {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; the touch points give it away.
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  return ios && !standalone;
}

/** Wires up the Install button, and the one-time hint for iPhone and iPad where there is no install event. */
export function initInstallPrompt(): void {
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
  if (isIosBrowserTab() && !loadJSON<boolean>(IOS_HINT_KEY, false)) {
    iosHint.hidden = false;
    iosHint.querySelector('button')!.addEventListener('click', () => {
      iosHint.hidden = true;
      saveJSON(IOS_HINT_KEY, true);
    });
  }
}
