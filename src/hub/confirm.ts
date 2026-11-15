/**
 * The hub's "are you sure?" step for actions that reset or replace saved data. It is a dialog in the
 * page rather than the browser's own confirm box, so a gamepad can answer it as well as a keyboard
 * or mouse (src/hub/navigation.ts works the buttons of whichever dialog is on top).
 *
 * Cancel is focused first, so a stray press of A, Enter or Space changes nothing. Esc, B and a
 * click outside the box cancel too.
 */
export function askToConfirm(question: string, action: string): Promise<boolean> {
  const dialog = document.querySelector<HTMLDialogElement>('#confirm')!;
  const cancel = dialog.querySelector<HTMLButtonElement>('#confirm-cancel')!;
  const ok = dialog.querySelector<HTMLButtonElement>('#confirm-ok')!;
  dialog.querySelector<HTMLParagraphElement>('#confirm-question')!.textContent = question;
  ok.textContent = action;
  // Carry the gamepad's highlight over from the button that asked, if a gamepad is what pressed it.
  const byGamepad = document.querySelector('.panel .nav-focus') !== null;

  return new Promise((resolve) => {
    let confirmed = false;
    const onOk = () => {
      confirmed = true;
      dialog.close();
    };
    const onCancel = () => dialog.close();
    const onBackdrop = (e: MouseEvent) => {
      if (e.target === dialog) dialog.close();
    };
    const onClose = () => {
      ok.removeEventListener('click', onOk);
      cancel.removeEventListener('click', onCancel);
      dialog.removeEventListener('click', onBackdrop);
      resolve(confirmed);
    };
    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
    dialog.addEventListener('click', onBackdrop);
    dialog.addEventListener('close', onClose, { once: true });

    dialog.showModal();
    cancel.focus();
    if (byGamepad) cancel.classList.add('nav-focus');
  });
}
