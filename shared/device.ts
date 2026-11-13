/** Small environment checks with no Phaser dependency, so the hub can use them too. */

export function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
}
