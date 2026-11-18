import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeGameObject } from './test-utils';

vi.mock('phaser', async () => (await import('./test-utils')).phaserMock());

/** An Image that records its texture key, as Phaser's does. */
class FakeImage extends FakeGameObject {
  texture: { key: string };
  constructor(x: number, y: number, key: string) {
    super(x, y);
    this.texture = { key };
  }
  tint = 0xffffff;
  setTexture(key: string): this {
    this.texture = { key };
    return this;
  }
  setTint(tint: number): this {
    this.tint = tint;
    return this;
  }
  scale = 1;
  setScale(scale: number): this {
    this.scale = scale;
    return this;
  }
}

class FakeGraphics {
  calls: string[] = [];
  constructor(private readonly keys: Set<string>) {}
  generateTexture(key: string): this {
    this.keys.add(key);
    this.calls.push(`generate:${key}`);
    return this;
  }
  destroy(): void {
    this.calls.push('destroy');
  }
}

function fakeScene() {
  const images: FakeImage[] = [];
  /** Images made off the display list, for a Container. */
  const made: FakeImage[] = [];
  const keys = new Set<string>();
  const graphics: FakeGraphics[] = [];
  const scene = {
    add: {
      image: (x: number, y: number, key: string) => {
        const image = new FakeImage(x, y, key);
        images.push(image);
        return image;
      },
    },
    make: {
      image: ({ x, y, key }: { x: number; y: number; key: string }) => {
        const image = new FakeImage(x, y, key);
        made.push(image);
        return image;
      },
      graphics: () => {
        const g = new FakeGraphics(keys);
        graphics.push(g);
        return g;
      },
    },
    textures: {
      exists: (key: string) => keys.has(key),
    },
  };
  return { scene, images, made, graphics };
}

afterEach(() => {
  vi.resetModules();
});

describe('bakeTexture', () => {
  it('draws a texture the first time only and returns its key', async () => {
    const { bakeTexture } = await import('./stamps');
    const { scene, graphics } = fakeScene();
    const s = scene as unknown as Parameters<typeof bakeTexture>[0];
    const draw = vi.fn();
    expect(bakeTexture(s, 'cell', 10, 10, draw)).toBe('cell');
    expect(bakeTexture(s, 'cell', 10, 10, draw)).toBe('cell');
    expect(draw).toHaveBeenCalledTimes(1);
    expect(graphics[0].calls).toEqual(['generate:cell', 'destroy']);
  });
});

describe('StampLayer', () => {
  it('reuses its Images from frame to frame and hides the ones a frame leaves unused', async () => {
    const { StampLayer } = await import('./stamps');
    const { scene, images } = fakeScene();
    const layer = new StampLayer(scene as unknown as ConstructorParameters<typeof StampLayer>[0]);

    layer.begin();
    layer.stamp('a', 1, 2);
    layer.stamp('b', 3, 4, 0.5, 0xff0000).setScale(2);
    layer.stamp('a', 5, 6);
    layer.end();
    expect(images).toHaveLength(3);
    expect(images[1]).toMatchObject({ alpha: 0.5, tint: 0xff0000 });

    layer.begin();
    layer.stamp('b', 7, 8);
    layer.stamp('a', 9, 10);
    layer.end();
    expect(images).toHaveLength(3);
    expect(images[0]).toMatchObject({ x: 7, y: 8, alpha: 1, visible: true, texture: { key: 'b' } });
    // The reused Image drops the last frame's alpha, tint and scale.
    expect(images[1]).toMatchObject({ x: 9, y: 10, alpha: 1, tint: 0xffffff, scale: 1, texture: { key: 'a' } });
    expect(images.map((i) => i.visible)).toEqual([true, true, false]);
  });

  it('puts its Images in the parent Container when given one', async () => {
    const { StampLayer } = await import('./stamps');
    const { scene, images, made } = fakeScene();
    const children: FakeImage[] = [];
    const parent = { add: (child: FakeImage) => children.push(child) };
    type Args = ConstructorParameters<typeof StampLayer>;
    const layer = new StampLayer(scene as unknown as Args[0], 0, parent as unknown as Args[2]);
    layer.begin();
    layer.stamp('a', 1, 2);
    layer.end();
    expect(images).toHaveLength(0);
    expect(children).toEqual(made);
    expect(children[0]).toMatchObject({ x: 1, y: 2, texture: { key: 'a' } });
  });

  it('only creates Images when a frame needs more than any frame before', async () => {
    const { StampLayer } = await import('./stamps');
    const { scene, images } = fakeScene();
    const layer = new StampLayer(scene as unknown as ConstructorParameters<typeof StampLayer>[0]);
    for (let frame = 1; frame <= 4; frame++) {
      layer.begin();
      for (let i = 0; i < frame; i++) layer.stamp('a', i, 0);
      layer.end();
    }
    layer.begin();
    layer.stamp('a', 0, 0);
    layer.end();
    expect(images).toHaveLength(4);
    expect(images.filter((i) => i.visible)).toHaveLength(1);
  });
});
