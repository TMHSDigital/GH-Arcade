import { isTouchDevice } from '../../shared/device';
import { cssColor, PALETTES } from '../../shared/palette';
import {
  DEFAULT_KEY_CODES,
  DEFAULT_KEY_LABELS,
  getSettings,
  keyCodesFor,
  type KeyBinding,
  onSettingsChange,
  REBINDABLE,
  type RebindableAction,
  resetSettings,
  type Settings,
  updateSettings,
} from '../../shared/settings';

export const ACTION_NAMES: Record<RebindableAction, string> = {
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

/** Keys that cannot be bound: Tab moves focus, and these modifiers and system keys belong to the browser or OS. */
const UNBINDABLE = new Set(['Tab', 'Control', 'Alt', 'AltGraph', 'Meta', 'OS', 'CapsLock', 'ContextMenu', 'Unidentified', 'Dead', 'Process']);

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
  const touchSection = dialog.querySelector<HTMLElement>('#touch-settings')!;
  const touchScale = dialog.querySelector<HTMLInputElement>('#touch-scale')!;
  const touchScaleValue = dialog.querySelector<HTMLOutputElement>('#touch-scale-value')!;
  const touchMirrored = dialog.querySelector<HTMLInputElement>('#touch-mirrored')!;
  const touchHaptics = dialog.querySelector<HTMLInputElement>('#touch-haptics')!;
  // Only worth showing where there is a touch screen to use them on.
  touchSection.hidden = !isTouchDevice();
  const bindingNote = dialog.querySelector<HTMLParagraphElement>('#binding-note')!;
  let listening: { action: RebindableAction; button: HTMLButtonElement } | null = null;

  const render = () => {
    const s = getSettings();
    volume.value = String(Math.round(s.volume * 100));
    volumeValue.value = `${volume.value}%`;
    muted.checked = s.muted;
    motion.checked = s.reducedMotion;
    colorblind.checked = s.palette === 'colorblind';
    touchScale.value = String(Math.round(s.touch.scale * 100));
    touchScaleValue.value = `${touchScale.value}%`;
    touchMirrored.checked = s.touch.mirrored;
    touchHaptics.checked = s.touch.haptics;
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
        row.innerHTML = `<th scope="row">${ACTION_NAMES[action]}</th><td><kbd class="${custom ? 'custom' : ''}"></kbd></td><td><button type="button" class="rebind">Change</button>${custom ? ' <button type="button" class="rebind default">Default</button>' : ''}</td>`;
        row.querySelector('kbd')!.textContent = custom ? custom.label : DEFAULT_KEY_LABELS[action];
        const button = row.querySelector<HTMLButtonElement>('.rebind')!;
        button.addEventListener('click', () => startListening(action, button));
        row.querySelector<HTMLButtonElement>('.default')?.addEventListener('click', () => restoreDefault(action));
        return row;
      }),
    );
  };

  const note = (text: string) => {
    bindingNote.textContent = text;
    bindingNote.hidden = text === '';
  };

  /** The other action, if any, that a key already triggers (through its custom key or its defaults). */
  const clashFor = (action: RebindableAction, code: number) =>
    REBINDABLE.find((other) => other !== action && keyCodesFor(other).includes(code));

  /** Puts one action back on its default keys, unless another action has since been given one of them. */
  const restoreDefault = (action: RebindableAction) => {
    const bindings = { ...getSettings().bindings };
    delete bindings[action];
    const taken = REBINDABLE.find(
      (other) => other !== action && bindings[other] && DEFAULT_KEY_CODES[action].includes(bindings[other]!.code),
    );
    if (taken) {
      note(`${ACTION_NAMES[taken]} is using one of those keys. Change it first.`);
      return;
    }
    note('');
    updateSettings({ bindings });
  };

  const startListening = (action: RebindableAction, button: HTMLButtonElement) => {
    note('');
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
        const clash = clashFor(action, binding.code);
        let problem = '';
        if (UNBINDABLE.has(e.key)) problem = `${binding.label} can't be used for controls.`;
        else if (clash) problem = `${binding.label} is already used for ${ACTION_NAMES[clash]}. Pick another key, or change that one first.`;
        else updateSettings({ bindings: { ...getSettings().bindings, [action]: binding } });
        render();
        note(problem);
        return;
      }
      render();
    },
    true,
  );

  volume.addEventListener('input', () => updateSettings({ volume: Number(volume.value) / 100 }));
  muted.addEventListener('change', () => updateSettings({ muted: muted.checked }));
  motion.addEventListener('change', () => updateSettings({ reducedMotion: motion.checked }));
  colorblind.addEventListener('change', () => updateSettings({ palette: colorblind.checked ? 'colorblind' : 'neon' }));
  const setTouch = (patch: Partial<Settings['touch']>) => updateSettings({ touch: { ...getSettings().touch, ...patch } });
  touchScale.addEventListener('input', () => setTouch({ scale: Number(touchScale.value) / 100 }));
  touchMirrored.addEventListener('change', () => setTouch({ mirrored: touchMirrored.checked }));
  touchHaptics.addEventListener('change', () => setTouch({ haptics: touchHaptics.checked }));
  dialog.querySelector('#reset-bindings')!.addEventListener('click', () => {
    note('');
    updateSettings({ bindings: {} });
  });
  dialog.querySelector('#reset-all')!.addEventListener('click', () => resetSettings());
  dialog.querySelector('#close-settings')!.addEventListener('click', () => dialog.close());
  // Clicking the dimmed backdrop closes the dialog too.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => {
    listening = null;
    note('');
    render();
  });
  open.addEventListener('click', () => {
    render();
    dialog.showModal();
  });

  onSettingsChange(render);
  render();
}
