import { exportBackup, importBackup, resetHighScores } from '../../shared/backup';

/**
 * Wires up the "Your data" section of the settings dialog: download a backup of everything saved
 * on this device, restore one, or clear the best scores.
 */
export function initDataPanel(): void {
  const section = document.querySelector<HTMLElement>('#your-data')!;
  const note = section.querySelector<HTMLParagraphElement>('#data-note')!;
  const fileInput = section.querySelector<HTMLInputElement>('#import-file')!;

  const say = (text: string) => {
    note.textContent = text;
    note.hidden = text === '';
  };

  section.querySelector('#export-data')!.addEventListener('click', () => {
    const backup = exportBackup();
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `gh-arcade-backup-${backup.exportedAt.slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    say('Backup downloaded. Keep the file somewhere safe.');
  });

  section.querySelector('#import-data')!.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    // Clear the input so choosing the same file again still fires a change event.
    fileInput.value = '';
    if (!file) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      say('That file could not be read as a backup. Nothing was changed.');
      return;
    }
    if (!window.confirm('Replace the trophies, stats, best scores and settings on this device with the ones in this backup?')) return;
    const result = importBackup(parsed);
    if (!result.ok) {
      say(`${result.reason} Nothing was changed.`);
      return;
    }
    // Settings and trophies keep a copy in memory, so start again from the restored values.
    window.location.reload();
  });

  section.querySelector('#reset-scores')!.addEventListener('click', () => {
    if (!window.confirm('Reset the best score for every game on this device? Trophies and stats are kept.')) return;
    resetHighScores();
    window.location.reload();
  });
}
