import Phaser from 'phaser';

/**
 * Draws a shape into a texture under `key` the first time it is asked for, and returns the key.
 * Phaser rebuilds and triangulates every shape on a Graphics on every frame, so a shape drawn
 * many times a frame (a board cell, a snake segment) is far cheaper as a baked texture.
 */
export function bakeTexture(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  draw: (g: Phaser.GameObjects.Graphics) => void,
): string {
  if (!scene.textures.exists(key)) {
    const g = scene.make.graphics({}, false);
    draw(g);
    g.generateTexture(key, width, height);
    g.destroy();
  }
  return key;
}

/**
 * A pool of Images refilled every frame, in place of a Graphics that is cleared and redrawn.
 * Call `begin`, then `stamp` once per shape in back-to-front order, then `end` to hide the
 * Images this frame did not use. Images are only created when a frame needs more than any
 * frame before it, so a steady scene allocates nothing.
 */
export class StampLayer {
  private readonly images: Phaser.GameObjects.Image[] = [];
  private used = 0;

  /**
   * With a `parent`, the Images go into that Container, so they draw where it does in the display
   * list and positions are relative to it. A Container draws its children in the order added, so
   * `depth` then has no effect.
   */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly depth = 0,
    private readonly parent?: Phaser.GameObjects.Container,
  ) {}

  begin(): void {
    this.used = 0;
  }

  /**
   * Shows the texture `key` with its top-left corner at (x, y). A white texture with a `tint`
   * comes out in exactly that color, so one texture can serve every color of a shape.
   */
  stamp(key: string, x: number, y: number, alpha = 1, tint = 0xffffff): Phaser.GameObjects.Image {
    let image = this.images[this.used];
    if (!image) {
      if (this.parent) {
        // Phaser's typings for this config leave out `key`, which make.image does read.
        image = this.scene.make.image({ x, y, key } as Phaser.Types.GameObjects.GameObjectConfig, false);
        this.parent.add(image);
      } else {
        image = this.scene.add.image(x, y, key);
      }
      image.setOrigin(0).setDepth(this.depth);
      this.images.push(image);
    } else if (image.texture.key !== key) {
      image.setTexture(key);
    }
    this.used++;
    // Scale is reset too, for callers that scale the Image this returns (about its top-left).
    return image.setPosition(x, y).setAlpha(alpha).setTint(tint).setScale(1).setVisible(true);
  }

  end(): void {
    for (let i = this.used; i < this.images.length; i++) this.images[i].setVisible(false);
  }
}
