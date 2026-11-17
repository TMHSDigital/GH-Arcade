import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeEmitter, FakeGameObject, installMemoryStorage, installWindow } from './test-utils';

vi.mock('phaser', async () => (await import('./test-utils')).phaserMock());

/** A drawn text that also takes the style calls neonText makes. */
class FakeText extends FakeGameObject {
  setShadow(): this {
    return this;
  }
}

function fakeScene() {
  const made: FakeText[] = [];
  const tweens: { targets: FakeText; onComplete: () => void }[] = [];
  const scene = {
    events: new FakeEmitter(),
    add: {
      text: (x: number, y: number, text: string) => {
        const t = new FakeText(x, y).setText(text);
        made.push(t);
        return t;
      },
    },
    tweens: { add: (config: { targets: FakeText; onComplete: () => void }) => void tweens.push(config) },
  };
  return { scene, made, tweens };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function load() {
  installMemoryStorage();
  installWindow();
  return import('./ui');
}

describe('floatText', () => {
  it('reuses a finished popup of the same size and color instead of making another', async () => {
    const { floatText } = await load();
    const { scene, made, tweens } = fakeScene();
    const s = scene as unknown as Parameters<typeof floatText>[0];
    floatText(s, 10, 20, '+100', 0xff00ff);
    expect(made).toHaveLength(1);
    tweens[0].onComplete();
    expect(made[0].visible).toBe(false);
    floatText(s, 50, 60, '+250', 0xff00ff);
    expect(made).toHaveLength(1);
    expect(made[0]).toMatchObject({ text: '+250', x: 50, y: 60, alpha: 1, visible: true });
  });

  it('makes a new popup while the others are still showing, or for another style', async () => {
    const { floatText } = await load();
    const { scene, made, tweens } = fakeScene();
    const s = scene as unknown as Parameters<typeof floatText>[0];
    floatText(s, 0, 0, 'A', 0xff00ff);
    floatText(s, 0, 0, 'B', 0xff00ff);
    expect(made).toHaveLength(2);
    tweens[0].onComplete();
    floatText(s, 0, 0, 'C', 0x00ffff);
    floatText(s, 0, 0, 'D', 0xff00ff, 16);
    expect(made).toHaveLength(4);
  });

  it('forgets the pool when the scene shuts down', async () => {
    const { floatText } = await load();
    const { scene, made, tweens } = fakeScene();
    const s = scene as unknown as Parameters<typeof floatText>[0];
    floatText(s, 0, 0, 'A', 0xff00ff);
    tweens[0].onComplete();
    scene.events.emit('shutdown');
    floatText(s, 0, 0, 'B', 0xff00ff);
    expect(made).toHaveLength(2);
  });
});
