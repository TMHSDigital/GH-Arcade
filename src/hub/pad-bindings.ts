import {
  DEFAULT_PAD_BUTTONS,
  getSettings,
  onSettingsChange,
  padButtonFor,
  padButtonLabel,
  REBINDABLE,
  type RebindableAction,
  updateSettings,
} from '../../shared/settings';
import { ACTION_NAMES } from './settings-panel';

/**
 * Wires up the "Gamepad controls" section of the settings dialog: each action shows its gamepad
 * button, and Change waits for the next button pressed on any connected gamepad. Everything saves
 * immediately; games pick changes up on their next load.
 */
export function initPadPanel(): void {
  const dialog = document.querySelector<HTMLDialogElement>('#settings')!;
  const list = dialog.querySelector<HTMLTableSectionElement>('#pad-bindings')!;
  const noteEl = dialog.querySelector<HTMLParagraphElement>('#pad-binding-note')!;
  /** The action waiting for a button, and the buttons that were already down when it started waiting. */
  let listening: { action: RebindableAction; held: Set<string> } | null = null;

  const note = (text: string) => {
    noteEl.textContent = text;
    noteEl.hidden = text === '';
  };

  /** Every button currently pressed, as "<pad>:<button>", so two pads never get confused. */
  const pressedNow = (): Set<string> => {
    const down = new Set<string>();
    for (const pad of navigator.getGamepads?.() ?? []) {
      if (!pad?.connected) continue;
      pad.buttons.forEach((b, i) => {
        if (b.pressed) down.add(`${pad.index}:${i}`);
      });
    }
    return down;
  };

  const render = () => {
    const custom = getSettings().padBindings;
    list.replaceChildren(
      ...REBINDABLE.map((action) => {
        const row = document.createElement('tr');
        const own = custom[action] !== undefined;
        const waiting = listening?.action === action;
        row.innerHTML = `<th scope="row">${ACTION_NAMES[action]}</th><td><kbd class="${own ? 'custom' : ''}"></kbd></td><td><button type="button" class="rebind${waiting ? ' listening' : ''}">${waiting ? 'Press a button' : 'Change'}</button>${own ? ' <button type="button" class="rebind default">Default</button>' : ''}</td>`;
        row.querySelector('kbd')!.textContent = padButtonLabel(padButtonFor(action));
        row.querySelector<HTMLButtonElement>('.rebind')!.addEventListener('click', () => startListening(action));
        row.querySelector<HTMLButtonElement>('.default')?.addEventListener('click', () => restoreDefault(action));
        return row;
      }),
    );
  };

  /** Gives an action a button, unless another action already uses it. */
  const assign = (action: RebindableAction, button: number) => {
    const clash = REBINDABLE.find((other) => other !== action && padButtonFor(other) === button);
    if (clash) {
      render();
      note(`${padButtonLabel(button)} is already used for ${ACTION_NAMES[clash]}. Pick another button, or change that one first.`);
      return;
    }
    note('');
    updateSettings({ padBindings: { ...getSettings().padBindings, [action]: { button } } });
  };

  /** Puts one action back on its default button, unless another action has since been given it. */
  const restoreDefault = (action: RebindableAction) => {
    const padBindings = { ...getSettings().padBindings };
    delete padBindings[action];
    const taken = REBINDABLE.find((other) => other !== action && padBindings[other]?.button === DEFAULT_PAD_BUTTONS[action]);
    if (taken) {
      note(`${ACTION_NAMES[taken]} is using that button. Change it first.`);
      return;
    }
    note('');
    updateSettings({ padBindings });
  };

  const poll = () => {
    if (!listening) return;
    if (!dialog.open) {
      listening = null;
      return;
    }
    const down = pressedNow();
    // A button that was already down has to be let go before it can count as a press.
    for (const id of listening.held) if (!down.has(id)) listening.held.delete(id);
    const fresh = [...down].find((id) => !listening!.held.has(id));
    if (fresh !== undefined) {
      const { action } = listening;
      listening = null;
      assign(action, Number(fresh.split(':')[1]));
      render();
      return;
    }
    requestAnimationFrame(poll);
  };

  const startListening = (action: RebindableAction) => {
    const already = listening !== null;
    listening = { action, held: pressedNow() };
    render();
    note('getGamepads' in navigator ? '' : 'This browser cannot read gamepads.');
    if (!already) requestAnimationFrame(poll);
  };

  // Escape cancels, without also closing the dialog.
  window.addEventListener(
    'keydown',
    (e) => {
      if (!listening || e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      listening = null;
      render();
    },
    true,
  );

  dialog.querySelector('#reset-pad-bindings')!.addEventListener('click', () => {
    listening = null;
    note('');
    updateSettings({ padBindings: {} });
  });
  dialog.addEventListener('close', () => {
    listening = null;
    note('');
    render();
  });

  onSettingsChange(render);
  render();
}
