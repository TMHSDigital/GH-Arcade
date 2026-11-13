import Phaser from 'phaser';
import { ALIEN_KINDS, ART } from './art';
import { PX } from './config';

export { ALIEN_POINTS, type AlienKind, ROW_KINDS } from './art';

/** Draws one bitmap from art.ts as a white texture; it is tinted per row when used. */
function draw(scene: Phaser.Scene, key: string, rows: readonly string[]): void {
  if (scene.textures.exists(key)) return;
  const w = rows[0].length * PX;
  const h = rows.length * PX;
  const g = scene.make.graphics({}, false);
  g.fillStyle(0xffffff, 1);
  rows.forEach((row, y) => [...row].forEach((c, x) => c === '#' && g.fillRect(x * PX, y * PX, PX, PX)));
  g.generateTexture(key, w, h);
  g.destroy();
}

/** Creates every Star Siege texture (safe to call from several scenes). */
export function makeSprites(scene: Phaser.Scene): void {
  for (const kind of ALIEN_KINDS) {
    ART[kind].forEach((frame, i) => draw(scene, `${kind}${i}`, frame));
  }
  draw(scene, 'cannon', ART.cannon[0]);
  draw(scene, 'mothership', ART.mothership[0]);
}
