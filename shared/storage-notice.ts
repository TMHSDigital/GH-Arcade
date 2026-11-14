import { checkStorage, onSaveFailed } from './storage';
import { showToast } from './toast';

/**
 * Tells the player, once per page, when this browser will not keep their progress (saved data
 * blocked, some private windows, storage full). The arcade still plays; scores, trophies and
 * settings just will not be there next time. Called by the hub and by every game page.
 */
export function initStorageNotice(): void {
  onSaveFailed(() => showToast("Progress can't be saved", 'This browser is blocking saved data'));
  checkStorage();
}
