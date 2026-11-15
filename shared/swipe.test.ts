import { describe, expect, it } from 'vitest';
import type Phaser from 'phaser';
import { direction, onSwipe, type SwipeDir, type SwipeOptions } from './swipe';

type Listener = (p: Phaser.Input.Pointer) => void;

/** A scene with just enough of `input` for onSwipe, and a way to send it pointer events. */
function swipeHarness(opts: SwipeOptions = {}) {
  const listeners = new Map<string, Listener[]>();
  const scene = {
    input: { on: (event: string, fn: Listener) => void listeners.set(event, [...(listeners.get(event) ?? []), fn]) },
  } as unknown as Phaser.Scene;
  const seen: SwipeDir[] = [];
  onSwipe(scene, (dir) => seen.push(dir), opts);
  const send = (event: string, x: number, y: number, id = 1) => {
    const pointer = { id, x, y, isDown: !event.startsWith('pointerup') } as Phaser.Input.Pointer;
    for (const fn of listeners.get(event) ?? []) fn(pointer);
  };
  return { seen, send };
}

describe('direction', () => {
  it('is null for a drag shorter than the threshold', () => {
    expect(direction(29, 0, 30)).toBeNull();
    expect(direction(0, 0, 30)).toBeNull();
  });

  it('follows the longer axis from the threshold up', () => {
    expect(direction(30, 0, 30)).toBe('right');
    expect(direction(-40, 39, 30)).toBe('left');
    expect(direction(0, -50, 30)).toBe('up');
    expect(direction(10, 45, 30)).toBe('down');
  });

  it('sends an exact diagonal to the vertical', () => {
    expect(direction(30, 30, 30)).toBe('down');
    expect(direction(-30, -30, 30)).toBe('up');
  });
});

describe('onSwipe', () => {
  it('reports a short press as a tap', () => {
    const { seen, send } = swipeHarness();
    send('pointerdown', 100, 100);
    send('pointerup', 104, 98);
    expect(seen).toEqual(['tap']);
  });

  it('reports the direction of a drag once, on release', () => {
    const { seen, send } = swipeHarness({ threshold: 20 });
    send('pointerdown', 100, 100);
    send('pointermove', 100, 70);
    expect(seen).toEqual([]);
    send('pointerup', 100, 60);
    send('pointerdown', 100, 100);
    send('pointerup', 150, 110);
    expect(seen).toEqual(['up', 'right']);
  });

  it('completes a swipe that ends off the canvas', () => {
    const { seen, send } = swipeHarness();
    send('pointerdown', 780, 100);
    send('pointerupoutside', 840, 100);
    expect(seen).toEqual(['right']);
  });

  it('fires during a long drag when continuous, and neither a direction nor a tap on release', () => {
    const { seen, send } = swipeHarness({ continuous: true });
    // 70 px to the right with the default 30 px threshold: two steps, and 10 px left over.
    send('pointerdown', 100, 100);
    send('pointermove', 130, 100);
    send('pointermove', 160, 100);
    send('pointermove', 170, 100);
    expect(seen).toEqual(['right', 'right']);
    send('pointerup', 170, 100);
    expect(seen).toEqual(['right', 'right']);
  });

  it('ignores a touch that starts outside its region', () => {
    const region = { contains: (x: number) => x < 400 } as unknown as Phaser.Geom.Rectangle;
    const { seen, send } = swipeHarness({ region });
    send('pointerdown', 500, 100);
    send('pointerup', 600, 100);
    expect(seen).toEqual([]);
    send('pointerdown', 300, 100);
    send('pointerup', 300, 160);
    expect(seen).toEqual(['down']);
  });

  it('drops a press that starts while ignored, even when it is released after', () => {
    let paused = true;
    const { seen, send } = swipeHarness({ ignore: () => paused });
    // The tap that chooses RESUME: the game is still paused when the finger goes down.
    send('pointerdown', 100, 100);
    paused = false;
    send('pointerup', 100, 100);
    expect(seen).toEqual([]);

    // The next tap belongs to the game.
    send('pointerdown', 100, 100);
    send('pointerup', 100, 100);
    expect(seen).toEqual(['tap']);
  });

  it('tracks each finger separately', () => {
    const { seen, send } = swipeHarness();
    send('pointerdown', 100, 100, 1);
    send('pointerdown', 500, 300, 2);
    send('pointerup', 40, 100, 1);
    send('pointerup', 500, 360, 2);
    expect(seen).toEqual(['left', 'down']);
  });

  it('does not let an ignored finger hide another one', () => {
    let paused = true;
    const { seen, send } = swipeHarness({ ignore: () => paused });
    send('pointerdown', 100, 100, 1);
    paused = false;
    send('pointerdown', 300, 100, 2);
    send('pointerup', 100, 100, 1);
    send('pointerup', 300, 160, 2);
    expect(seen).toEqual(['down']);
  });
});
