import { describe, expect, it } from 'vitest';
import type Phaser from 'phaser';
import { onSwipe, type SwipeDir, type SwipeOptions } from './swipe';

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
    const pointer = { id, x, y, isDown: event !== 'pointerup' } as Phaser.Input.Pointer;
    for (const fn of listeners.get(event) ?? []) fn(pointer);
  };
  return { seen, send };
}

describe('onSwipe', () => {
  it('reports a short press as a tap', () => {
    const { seen, send } = swipeHarness();
    send('pointerdown', 100, 100);
    send('pointerup', 104, 98);
    expect(seen).toEqual(['tap']);
  });

  it('reports the direction of a drag past the threshold', () => {
    const { seen, send } = swipeHarness({ threshold: 20 });
    send('pointerdown', 100, 100);
    send('pointerup', 100, 60);
    send('pointerdown', 100, 100);
    send('pointerup', 150, 110);
    expect(seen).toEqual(['up', 'right']);
  });

  it('fires during a long drag when continuous, and not again as a tap on release', () => {
    const { seen, send } = swipeHarness({ threshold: 20, continuous: true });
    send('pointerdown', 100, 100);
    send('pointermove', 125, 100);
    send('pointermove', 150, 100);
    send('pointerup', 152, 100);
    expect(seen).toEqual(['right', 'right']);
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
