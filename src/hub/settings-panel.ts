import { cssColor, PALETTES } from '../../shared/palette';
import {
  DEFAULT_KEY_LABELS,
  getSettings,
  type KeyBinding,
  onSettingsChange,
  REBINDABLE,
  type RebindableAction,
  resetSettings,
  updateSettings,
} from '../../shared/settings';

const ACTION_NAMES: Record<RebindableAction, string> = {
  left: 'Move left',
  right: 'Move right',
  up: 'Up / jump / thrust',
  down: 'Down / slide / soft drop',
  action: 'Action (launch, fire, jump)',
  alt: 'Alternate (warp, slide)',
  pause: 'Pause',
  mute: 'Mute',
};

/** Friendly label for a pressed key: "Space", arrows as symbols, letters uppercase. */
function keyLabel(e: KeyboardEvent): string {
  const arrows: Record<string, string> = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓' };
  if (arrows[e.key]) return arrows[e.key];
  if (e.key === ' ') return 'Space';
  if (e.key.length === 1) return e.key.toUpperCase();
  return e.key;
}

/** Wires up the settings dialog in index.html. Everything saves immediately; games pick changes up on their next load. */
export function initSettingsPanel(): void {
  const dialog = document.querySelector<HTMLDialogElement>('#settings')!;
  const open = document.querySelector<HTMLButtonElement>('#open-settings')!;
  const volume = dialog.querySelector<HTMLInputElement>('#volume')!;
  const volumeValue = dialog.querySelector<HTMLOutputElement>('#volume-value')!;
  const muted = dialog.querySelector<HTMLInputElement>('#muted')!;
  const motion = dialog.querySelector<HTMLInputElement>('#reduced-motion')!;
  const colorblind = dialog.querySelector<HTMLInputElement>('#colorblind')!;
  const swatches = dialog.querySelector<HTMLDivElement>('#swatches')!;
  const bindingList = dialog.querySelector<HTMLTableSectionElement>('#bindings')!;
  let listening: { action: RebindableAction; button: HTMLButtonElement } | null = null;

  const render = () => {
    const s = getSettings();
    volume.value = String(Math.round(s.volume * 100));
    volumeValue.value = `${volume.value}%`;
    muted.checked = s.muted;
    motion.checked = s.reducedMotion;
    colorblind.checked = s.palette === 'colorblind';
    swatches.replaceChildren(
      ...Object.values(PALETTES[s.palette]).map((c) => {
        const chip = document.createElement('span');
        chip.style.background = cssColor(c);
        return chip;
      }),
    );
    document.documentElement.classList.toggle('reduced-motion', s.reducedMotion);
    bindingList.replaceChildren(
      ...REBINDABLE.map((action) => {
        const row = document.createElement('tr');
        const custom = s.bindings[action];
        row.innerHTML = `<th scope="row">${ACTION_NAMES[action]}</th><td><kbd class="${custom ? 'custom' : ''}"></kbd></td><td><button type="button" class="rebind">Change</button></td>`;
        row.querySelector('kbd')!.textContent = custom ? custom.label : DEFAULT_KEY_LABELS[action];
        const button = row.querySelector<HTMLButtonElement>('.rebind')!;
        button.addEventListener('click', () => startListening(action, button));
        return row;
      }),
    );
  };

  const startListening = (action: RebindableAction, button: HTMLButtonElement) => {
    listening?.button.classList.remove('listening');
    listening = { action, button };
    button.textContent = 'Press a key';
    button.classList.add('listening');
  };

  // Capture the next key press for the action being rebound. Escape cancels.
  window.addEventListener(
    'keydown',
    (e) => {
      if (!listening || !dialog.open) return;
      e.preventDefault();
      e.stopPropagation();
      const { action } = listening;
      listening = null;
      if (e.key !== 'Escape') {
        const binding: KeyBinding = { code: e.keyCode, label: keyLabel(e) };
        updateSettings({ bindings: { ...getSettings().bindings, [action]: binding } });
      }
      render();
    },
    true,
  );

  volume.addEventListener('input', () => updateSettings({ volume: Number(volume.value) / 100 }));
  muted.addEventListener('change', () => updateSettings({ muted: muted.checked }));
  motion.addEventListener('change', () => updateSettings({ reducedMotion: motion.checked }));
  colorblind.addEventListener('change', () => updateSettings({ palette: colorblind.checked ? 'colorblind' : 'neon' }));
  dialog.querySelector('#reset-bindings')!.addEventListener('click', () => updateSettings({ bindings: {} }));
  dialog.querySelector('#reset-all')!.addEventListener('click', () => resetSettings());
  dialog.querySelector('#close-settings')!.addEventListener('click', () => dialog.close());
  // Clicking the dimmed backdrop closes the dialog too.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => {
    listening = null;
    render();
  });
  open.addEventListener('click', () => {
    render();
    dialog.showModal();
  });

  onSettingsChange(render);
  render();
}
