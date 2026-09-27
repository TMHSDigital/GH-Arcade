import Phaser from 'phaser';
import {
  BULLET_LIFE_S,
  BULLET_SPEED,
  DRAG_PER_SECOND,
  EXTRA_LIFE_EVERY,
  FIRE_COOLDOWN_MS,
  FIRST_WAVE_ROCKS,
  GAME_ID,
  HEIGHT,
  INVULNERABLE_MS,
  MAX_BULLETS,
  MAX_SPEED,
  MAX_WAVE_ROCKS,
  RESPAWN_DELAY_MS,
  ROCKS,
  type RockSize,
  SHIP_RADIUS,
  START_LIVES,
  THRUST,
  TURN_SPEED,
  UFO_FIRE_MS,
  UFO_FIRST_WAVE,
  UFO_POINTS,
  UFO_RADIUS,
  UFO_SPAWN_MS,
  UFO_SPEED,
  WARP_COOLDOWN_MS,
  WIDTH,
} from '../config';
import { addCounter, unlock } from '../../../shared/achievements';
import { ArcadeControls } from '../../../shared/controls';
import { PauseController } from '../../../shared/pause';
import { noise, tone } from '../../../shared/sfx';
import { isTouchDevice, VirtualButton, VirtualStick } from '../../../shared/touch';
import { burstEmitter, floatText, NEON, PIXEL_FONT, showBanner } from '../../../shared/ui';

interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
}
interface Bullet extends Body {
  life: number;
  hostile: boolean;
}
interface Rock extends Body {
  size: RockSize;
  angle: number;
  spin: number;
  shape: number[];
}
interface Ufo extends Body {
  fireIn: number;
  wobble: number;
}
interface Debris extends Body {
  angle: number;
  spin: number;
  len: number;
  life: number;
}

type Extra = 'fire';

const TAU = Math.PI * 2;

function wrap(b: Body, margin: number): void {
  if (b.x < -margin) b.x += WIDTH + margin * 2;
  else if (b.x > WIDTH + margin) b.x -= WIDTH + margin * 2;
  if (b.y < -margin) b.y += HEIGHT + margin * 2;
  else if (b.y > HEIGHT + margin) b.y -= HEIGHT + margin * 2;
}

function hit(a: Body, ar: number, b: Body, br: number): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy < (ar + br) * (ar + br);
}

export class GameScene extends Phaser.Scene {
  private ship = { x: WIDTH / 2, y: HEIGHT / 2, vx: 0, vy: 0, angle: -Math.PI / 2 };
  private alive = true;
  private invulnerable = 0;
  private thrusting = false;
  private bullets: Bullet[] = [];
  private rocks: Rock[] = [];
  private debris: Debris[] = [];
  private ufo: Ufo | null = null;
  private ufoTimer = 0;

  private score = 0;
  private lives = START_LIVES;
  private nextExtraLife = EXTRA_LIFE_EVERY;
  private wave = 0;
  private waveRocks = 0;
  private fireCooldown = 0;
  private warpCooldown = 0;
  private beatTimer = 0;
  private beatHigh = false;
  private thrustSound = 0;
  private waveClearing = false;
  private over = false;
  private elapsed = 0;

  private gfx!: Phaser.GameObjects.Graphics;
  private burst!: Phaser.GameObjects.Particles.ParticleEmitter;
  private scoreText!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;
  private controls!: ArcadeControls<Extra>;
  private pause!: PauseController;

  constructor() {
    super('Game');
  }

  init(): void {
    this.ship = { x: WIDTH / 2, y: HEIGHT / 2, vx: 0, vy: 0, angle: -Math.PI / 2 };
    this.alive = true;
    this.invulnerable = INVULNERABLE_MS;
    this.bullets = [];
    this.rocks = [];
    this.debris = [];
    this.ufo = null;
    this.ufoTimer = Phaser.Math.Between(...UFO_SPAWN_MS);
    this.score = 0;
    this.lives = START_LIVES;
    this.nextExtraLife = EXTRA_LIFE_EVERY;
    this.wave = 0;
    this.fireCooldown = 0;
    this.warpCooldown = 0;
    this.waveClearing = false;
    this.over = false;
    this.elapsed = 0;
  }

  create(): void {
    this.cameras.main.fadeIn(250, 5, 5, 13);
    this.drawStars();
    this.gfx = this.add.graphics();
    this.burst = burstEmitter(this, 260, 800);

    const style = { fontFamily: PIXEL_FONT, fontSize: '16px', color: '#e8e8ff' };
    this.scoreText = this.add.text(WIDTH / 2, 24, '0', style).setOrigin(0.5).setDepth(100);
    this.waveText = this.add.text(WIDTH - 20, 24, '', { ...style, fontSize: '12px' }).setOrigin(1, 0.5).setDepth(100);

    this.controls = new ArcadeControls<Extra>(this, { fire: { keys: ['Z', 'J'], buttons: [5, 7] } });
    this.pause = new PauseController(this, this.controls, { canPause: () => !this.over });

    if (isTouchDevice()) {
      const stick = new VirtualStick(this, new Phaser.Geom.Rectangle(0, HEIGHT * 0.35, WIDTH * 0.5, HEIGHT * 0.65), 58);
      this.controls.setStick(() => stick.value);
      const fire = new VirtualButton(this, WIDTH - 85, HEIGHT - 95, 'FIRE', NEON.pink, 46);
      const warp = new VirtualButton(this, WIDTH - 190, HEIGHT - 55, 'WARP', NEON.purple, 32);
      this.controls.addVirtual('fire', () => fire.isDown);
      this.controls.addVirtual('alt', () => warp.isDown);
    }

    this.nextWave();
  }

  private drawStars(): void {
    const g = this.add.graphics().setDepth(-10);
    for (let i = 0; i < 90; i++) {
      g.fillStyle(0xffffff, Phaser.Math.FloatBetween(0.1, 0.5));
      g.fillCircle(Phaser.Math.Between(0, WIDTH), Phaser.Math.Between(0, HEIGHT), Phaser.Math.FloatBetween(0.5, 1.4));
    }
  }

  // ---------------------------------------------------------------- waves

  private nextWave(): void {
    this.wave++;
    if (this.wave >= 5) unlock('astro.wave5');
    this.waveRocks = Math.min(FIRST_WAVE_ROCKS + this.wave - 1, MAX_WAVE_ROCKS);
    for (let i = 0; i < this.waveRocks; i++) {
      // Spawn on the edges, away from the ship.
      let x: number;
      let y: number;
      do {
        x = Phaser.Math.Between(0, WIDTH);
        y = Phaser.Math.Between(0, HEIGHT);
      } while (Phaser.Math.Distance.Between(x, y, this.ship.x, this.ship.y) < 220);
      this.addRock(x, y, 3);
    }
    this.waveClearing = false;
    showBanner(this, `WAVE ${this.wave}`, NEON.cyan);
    this.updateHud();
  }

  private addRock(x: number, y: number, size: RockSize): void {
    const { speed } = ROCKS[size];
    const dir = Phaser.Math.FloatBetween(0, TAU);
    const v = Phaser.Math.FloatBetween(speed[0], speed[1]) * (1 + Math.min(this.wave - 1, 8) * 0.04);
    const points = 9 + size * 2;
    this.rocks.push({
      x,
      y,
      vx: Math.cos(dir) * v,
      vy: Math.sin(dir) * v,
      size,
      angle: Phaser.Math.FloatBetween(0, TAU),
      spin: Phaser.Math.FloatBetween(-1.2, 1.2),
      shape: Array.from({ length: points }, () => Phaser.Math.FloatBetween(0.72, 1.08)),
    });
  }

  // ---------------------------------------------------------------- loop

  update(_time: number, deltaMs: number): void {
    if (this.pause.isPaused) return;
    const dt = Math.min(deltaMs, 50) / 1000;
    this.elapsed += deltaMs;
    if (this.alive) this.updateShip(dt, deltaMs);
    this.updateBullets(dt);
    this.updateRocks(dt);
    this.updateUfo(dt, deltaMs);
    this.updateDebris(dt);
    if (!this.over) {
      this.collide();
      this.heartbeat(deltaMs);
      if (!this.waveClearing && this.rocks.length === 0 && !this.ufo) {
        this.waveClearing = true;
        this.time.delayedCall(1500, () => this.nextWave());
      }
    }
    this.render();
  }

  private updateShip(dt: number, deltaMs: number): void {
    const c = this.controls;
    const s = this.ship;
    s.angle += c.axisX * TURN_SPEED * dt;
    this.thrusting = c.isDown('up') || c.axisY < -0.4;
    if (this.thrusting) {
      s.vx += Math.cos(s.angle) * THRUST * dt;
      s.vy += Math.sin(s.angle) * THRUST * dt;
      this.thrustSound -= deltaMs;
      if (this.thrustSound <= 0) {
        noise(0.08, 0.025);
        this.thrustSound = 90;
      }
    }
    const drag = Math.pow(DRAG_PER_SECOND, dt);
    s.vx *= drag;
    s.vy *= drag;
    const speed = Math.hypot(s.vx, s.vy);
    if (speed > MAX_SPEED) {
      s.vx *= MAX_SPEED / speed;
      s.vy *= MAX_SPEED / speed;
    }
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    wrap(s, SHIP_RADIUS);

    this.invulnerable = Math.max(0, this.invulnerable - deltaMs);
    this.fireCooldown -= deltaMs;
    this.warpCooldown -= deltaMs;
    // Held keys auto-fire; a quick tap between frames still counts via justPressed.
    const wantsFire = c.isDown('action') || c.isDown('fire') || c.justPressed('action') || c.justPressed('fire');
    if (wantsFire && this.fireCooldown <= 0 && this.bullets.filter((b) => !b.hostile).length < MAX_BULLETS) this.fire();
    if (c.justPressed('alt') && this.warpCooldown <= 0) this.warp();
  }

  private fire(): void {
    const s = this.ship;
    this.bullets.push({
      x: s.x + Math.cos(s.angle) * SHIP_RADIUS,
      y: s.y + Math.sin(s.angle) * SHIP_RADIUS,
      vx: s.vx + Math.cos(s.angle) * BULLET_SPEED,
      vy: s.vy + Math.sin(s.angle) * BULLET_SPEED,
      life: BULLET_LIFE_S,
      hostile: false,
    });
    this.fireCooldown = FIRE_COOLDOWN_MS;
    tone({ freq: 1200, toFreq: 500, duration: 0.07, type: 'square', volume: 0.04 });
  }

  /** Hyperspace: jump to a random spot with a brief shield, on a cooldown. */
  private warp(): void {
    const s = this.ship;
    this.burst.setParticleTint(NEON.purple);
    this.burst.explode(16, s.x, s.y);
    s.x = Phaser.Math.Between(60, WIDTH - 60);
    s.y = Phaser.Math.Between(60, HEIGHT - 60);
    s.vx = 0;
    s.vy = 0;
    this.invulnerable = Math.max(this.invulnerable, 600);
    this.warpCooldown = WARP_COOLDOWN_MS;
    this.burst.explode(16, s.x, s.y);
    tone({ freq: 200, toFreq: 1400, duration: 0.25, type: 'sine', volume: 0.08 });
  }

  private updateBullets(dt: number): void {
    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      wrap(b, 2);
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);
  }

  private updateRocks(dt: number): void {
    for (const r of this.rocks) {
      r.x += r.vx * dt;
      r.y += r.vy * dt;
      r.angle += r.spin * dt;
      wrap(r, ROCKS[r.size].radius);
    }
  }

  private updateUfo(dt: number, deltaMs: number): void {
    if (!this.ufo) {
      if (this.wave >= UFO_FIRST_WAVE && !this.over && !this.waveClearing && this.rocks.length > 0) {
        this.ufoTimer -= deltaMs;
        if (this.ufoTimer <= 0) this.spawnUfo();
      }
      return;
    }
    const u = this.ufo;
    u.wobble += dt;
    u.vy = Math.sin(u.wobble * 1.8) * 70;
    u.x += u.vx * dt;
    u.y += u.vy * dt;
    if (u.y < UFO_RADIUS) u.y += HEIGHT - UFO_RADIUS * 2;
    if (u.y > HEIGHT - UFO_RADIUS) u.y -= HEIGHT - UFO_RADIUS * 2;
    // It crosses the screen once, then leaves.
    if (u.x < -UFO_RADIUS * 2 || u.x > WIDTH + UFO_RADIUS * 2) {
      this.ufo = null;
      this.ufoTimer = Phaser.Math.Between(...UFO_SPAWN_MS);
      return;
    }
    // Warbling siren.
    if (Math.floor(this.elapsed / 180) !== Math.floor((this.elapsed - deltaMs) / 180)) {
      tone({ freq: Math.floor(this.elapsed / 180) % 2 ? 880 : 740, duration: 0.09, type: 'triangle', volume: 0.025 });
    }
    u.fireIn -= deltaMs;
    if (u.fireIn <= 0 && this.alive) {
      // Aims at the player, with some spread that tightens in later waves.
      const spread = Math.max(0.5 - this.wave * 0.04, 0.12);
      const a = Math.atan2(this.ship.y - u.y, this.ship.x - u.x) + Phaser.Math.FloatBetween(-spread, spread);
      this.bullets.push({ x: u.x, y: u.y, vx: Math.cos(a) * 320, vy: Math.sin(a) * 320, life: 1.6, hostile: true });
      u.fireIn = UFO_FIRE_MS;
      tone({ freq: 400, toFreq: 200, duration: 0.1, type: 'sawtooth', volume: 0.04 });
    }
  }

  private spawnUfo(): void {
    const fromLeft = Math.random() < 0.5;
    this.ufo = {
      x: fromLeft ? -UFO_RADIUS : WIDTH + UFO_RADIUS,
      y: Phaser.Math.Between(80, HEIGHT - 80),
      vx: (fromLeft ? 1 : -1) * UFO_SPEED * (1 + Math.min(this.wave, 10) * 0.03),
      vy: 0,
      fireIn: 800,
      wobble: 0,
    };
  }

  private updateDebris(dt: number): void {
    for (const d of this.debris) {
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.angle += d.spin * dt;
      d.life -= dt;
    }
    this.debris = this.debris.filter((d) => d.life > 0);
  }

  /** The classic two-note heartbeat, speeding up as the wave thins out. */
  private heartbeat(deltaMs: number): void {
    if (!this.alive || this.rocks.length === 0) return;
    this.beatTimer -= deltaMs;
    if (this.beatTimer > 0) return;
    const ratio = Math.min(this.rocks.length / (this.waveRocks * 3), 1);
    this.beatTimer = 250 + ratio * 650;
    this.beatHigh = !this.beatHigh;
    tone({ freq: this.beatHigh ? 110 : 98, duration: 0.09, type: 'square', volume: 0.05 });
  }

  // ---------------------------------------------------------------- collisions

  private collide(): void {
    for (const b of this.bullets) {
      if (b.life <= 0) continue;
      for (const r of this.rocks) {
        if (r.size && hit(b, 2, r, ROCKS[r.size].radius * 0.92)) {
          b.life = 0;
          this.breakRock(r, !b.hostile);
          break;
        }
      }
      if (b.life > 0 && !b.hostile && this.ufo && hit(b, 2, this.ufo, UFO_RADIUS)) {
        b.life = 0;
        this.destroyUfo(true);
      }
      if (b.life > 0 && b.hostile && this.alive && this.invulnerable <= 0 && hit(b, 2, this.ship, SHIP_RADIUS * 0.8)) {
        b.life = 0;
        this.killShip();
      }
    }
    this.rocks = this.rocks.filter((r) => r.size > 0);

    if (this.alive && this.invulnerable <= 0) {
      for (const r of this.rocks) {
        if (hit(this.ship, SHIP_RADIUS * 0.8, r, ROCKS[r.size].radius * 0.85)) {
          this.breakRock(r, true);
          this.killShip();
          break;
        }
      }
      if (this.alive && this.ufo && hit(this.ship, SHIP_RADIUS, this.ufo, UFO_RADIUS)) {
        this.destroyUfo(true);
        this.killShip();
      }
      this.rocks = this.rocks.filter((r) => r.size > 0);
    }
  }

  private breakRock(r: Rock, scored: boolean): void {
    const size = r.size;
    if (scored) {
      this.addScore(ROCKS[size].points, r.x, r.y);
      addCounter('astro.rocks');
    }
    this.burst.setParticleTint(size === 3 ? NEON.orange : size === 2 ? NEON.yellow : NEON.white);
    this.burst.explode(6 + size * 6, r.x, r.y);
    noise(0.12 + size * 0.08, 0.05 + size * 0.025);
    this.cameras.main.shake(40 + size * 30, 0.002 * size);
    if (size > 1) {
      const child = (size - 1) as RockSize;
      this.addRock(r.x, r.y, child);
      this.addRock(r.x, r.y, child);
    }
    (r as { size: number }).size = 0; // marked for removal
  }

  private destroyUfo(scored: boolean): void {
    const u = this.ufo;
    if (!u) return;
    if (scored) {
      this.addScore(UFO_POINTS, u.x, u.y, NEON.green);
      unlock('astro.saucer');
    }
    this.burst.setParticleTint(NEON.green);
    this.burst.explode(30, u.x, u.y);
    noise(0.4, 0.1);
    this.ufo = null;
    this.ufoTimer = Phaser.Math.Between(...UFO_SPAWN_MS);
  }

  private addScore(points: number, x: number, y: number, color: number = NEON.cyan): void {
    this.score += points;
    if (this.score >= 10000) unlock('astro.score');
    floatText(this, x, y, `+${points}`, color, 10);
    if (this.score >= this.nextExtraLife) {
      this.nextExtraLife += EXTRA_LIFE_EVERY;
      this.lives++;
      showBanner(this, 'EXTRA LIFE', NEON.pink, HEIGHT / 2 - 60);
      [523, 784, 1047].forEach((f, i) => this.time.delayedCall(i * 90, () => tone({ freq: f, duration: 0.12, type: 'triangle', volume: 0.08 })));
    }
    this.updateHud();
  }

  private killShip(): void {
    const s = this.ship;
    this.alive = false;
    this.thrusting = false;
    this.lives--;
    this.burst.setParticleTint(NEON.cyan);
    this.burst.explode(36, s.x, s.y);
    // The hull breaks into drifting line segments.
    for (let i = 0; i < 5; i++) {
      const a = Phaser.Math.FloatBetween(0, TAU);
      const v = Phaser.Math.FloatBetween(30, 90);
      this.debris.push({ x: s.x, y: s.y, vx: s.vx * 0.3 + Math.cos(a) * v, vy: s.vy * 0.3 + Math.sin(a) * v, angle: a, spin: Phaser.Math.FloatBetween(-4, 4), len: Phaser.Math.Between(8, 16), life: 1.6 });
    }
    this.cameras.main.shake(300, 0.012);
    this.cameras.main.flash(180, 0, 240, 255);
    noise(0.6, 0.14);
    tone({ freq: 300, toFreq: 40, duration: 0.7, type: 'sawtooth', volume: 0.08 });
    this.updateHud();

    if (this.lives <= 0) {
      this.over = true;
      this.time.delayedCall(2000, () =>
        this.scene.start('GameOver', { gameId: GAME_ID, score: this.score, detail: `REACHED WAVE ${this.wave}` }),
      );
      return;
    }
    this.time.delayedCall(RESPAWN_DELAY_MS, () => this.respawn());
  }

  private respawn(): void {
    this.ship = { x: WIDTH / 2, y: HEIGHT / 2, vx: 0, vy: 0, angle: -Math.PI / 2 };
    this.alive = true;
    this.invulnerable = INVULNERABLE_MS;
  }

  // ---------------------------------------------------------------- render

  /** Neon line: a wide faint stroke for glow, then a thin bright one. */
  private neonPath(g: Phaser.GameObjects.Graphics, points: { x: number; y: number }[], color: number, closed = true, alpha = 1): void {
    for (const [w, a] of [[7, 0.14], [2, 1]] as const) {
      g.lineStyle(w, color, a * alpha).beginPath();
      g.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
      if (closed) g.closePath();
      g.strokePath();
    }
  }

  private render(): void {
    const g = this.gfx.clear();

    for (const r of this.rocks) {
      const rad = ROCKS[r.size].radius;
      const pts = r.shape.map((m, i) => {
        const a = r.angle + (i / r.shape.length) * TAU;
        return { x: r.x + Math.cos(a) * rad * m, y: r.y + Math.sin(a) * rad * m };
      });
      this.neonPath(g, pts, r.size === 3 ? NEON.orange : r.size === 2 ? NEON.yellow : NEON.white);
    }

    for (const b of this.bullets) {
      // Enemy shots are hollow rings and yours are solid dots, so they read apart even without color.
      const color = b.hostile ? NEON.green : NEON.pink;
      g.fillStyle(color, 0.25).fillCircle(b.x, b.y, 6);
      if (b.hostile) g.lineStyle(2, color, 1).strokeCircle(b.x, b.y, 4);
      else g.fillStyle(color, 1).fillCircle(b.x, b.y, 2.2);
    }

    if (this.ufo) {
      const { x, y } = this.ufo;
      this.neonPath(g, [{ x: x - 18, y }, { x: x - 8, y: y - 7 }, { x: x + 8, y: y - 7 }, { x: x + 18, y }, { x: x + 8, y: y + 7 }, { x: x - 8, y: y + 7 }], NEON.green);
      this.neonPath(g, [{ x: x - 7, y: y - 7 }, { x: x - 4, y: y - 13 }, { x: x + 4, y: y - 13 }, { x: x + 7, y: y - 7 }], NEON.green, false);
      this.neonPath(g, [{ x: x - 18, y }, { x: x + 18, y }], NEON.green, false, 0.6);
    }

    for (const d of this.debris) {
      const dx = (Math.cos(d.angle) * d.len) / 2;
      const dy = (Math.sin(d.angle) * d.len) / 2;
      this.neonPath(g, [{ x: d.x - dx, y: d.y - dy }, { x: d.x + dx, y: d.y + dy }], NEON.cyan, false, Math.min(d.life, 1));
    }

    if (this.alive) {
      // Blink while invulnerable.
      const visible = this.invulnerable <= 0 || Math.floor(this.elapsed / 100) % 2 === 0;
      if (visible) this.drawShip(g, this.ship.x, this.ship.y, this.ship.angle, 1, this.thrusting);
    }

    // Remaining lives as small ships under the wave counter.
    for (let i = 0; i < this.lives; i++) this.drawShip(g, WIDTH - 26 - i * 22, 54, -Math.PI / 2, 0.6, false);
  }

  private drawShip(g: Phaser.GameObjects.Graphics, x: number, y: number, a: number, scale: number, flame: boolean): void {
    const p = (dist: number, ang: number) => ({ x: x + Math.cos(a + ang) * dist * scale, y: y + Math.sin(a + ang) * dist * scale });
    this.neonPath(g, [p(16, 0), p(12, 2.45), p(5, Math.PI), p(12, -2.45)], NEON.cyan);
    if (flame && Math.floor(this.elapsed / 50) % 2 === 0) {
      this.neonPath(g, [p(8, 2.7), p(Phaser.Math.Between(16, 22), Math.PI), p(8, -2.7)], NEON.orange, false);
    }
  }

  private updateHud(): void {
    this.scoreText.setText(this.score.toLocaleString());
    this.waveText.setText(`WAVE ${this.wave}`);
  }
}
