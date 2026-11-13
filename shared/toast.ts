import './toast.css';

/**
 * Small DOM toast (e.g. "Trophy unlocked", "Ready to play offline"). It's plain HTML, so on game
 * pages it sits over the canvas, stays crisp at any scale and needs nothing from the scenes.
 */

let container: HTMLDivElement | null = null;

export function showToast(title: string, detail: string): void {
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-stack';
    container.setAttribute('role', 'status');
    container.setAttribute('aria-live', 'polite');
    document.body.append(container);
  }
  const toast = document.createElement('div');
  toast.className = 'toast';
  const t = document.createElement('strong');
  t.textContent = title;
  const d = document.createElement('span');
  d.textContent = detail;
  toast.append(t, d);
  container.append(toast);
  // Next frame, so the entry transition runs.
  requestAnimationFrame(() => toast.classList.add('show'));
  window.setTimeout(() => {
    toast.classList.remove('show');
    window.setTimeout(() => toast.remove(), 400);
  }, 3200);
}
