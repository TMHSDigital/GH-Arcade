import Phaser from 'phaser';
import {
  COL_SPACING,
  COLS,
  ENEMY_BULLET_SPEED,
  ENEMY_FIRE_MS,
  FORMATION_TOP,
  GAME_ID,
  HEIGHT,
  INVASION_Y,
  INVULNERABLE_MS,
  MAX_ENEMY_BULLETS,
  MAX_WAVE_DROP,
  MOTHERSHIP_MS,
  MOTHERSHIP_POINTS,
  MOTHERSHIP_SPEED,
  MOTHERSHIP_Y,
  PLAYER_BULLET_SPEED,
  PLAYER_SPEED,
  PLAYER_Y,
  RESPAWN_MS,
  ROW_SPACING,
  ROWS,
  SHIELD_CELL,
  SHIELD_Y,
  START_LIVES,
  STEP_BASE_MS,
  STEP_DOWN,
  STEP_PER_ALIEN_MS,
  STEP_X,
  WAVE_DROP,
  WIDTH,
} from '../config';
import { ALIEN_POINTS, type AlienKind, makeSprites, ROW_KINDS } from '../sprites';
import { unlock } from '../../../shared/achievements';
import { ArcadeControls } from '../../../shared/controls';
import { PauseController } from '../../../shared/pause';
import { noise, tone } from '../../../shared/sfx';
import { isTouchDevice } from '../../../shared/touch';
import { burstEmitter, floatText, NEON, neonText, PIXEL_FONT, showBanner } from '../../../shared/ui';

interface Alien {
  img: Phaser.GameObjects.Image;
  kind: AlienKind;
  col: number;
  row: number;
  alive: boolean;
}

interface Shot {
  x: number;
  y: number;
}

interface Ship {
  id: 1 | 2;
  img: Phaser.GameObjects.Image;
  color: number;
  lives: number;
  /** On the field right now (false while waiting to respawn or out of lives). */
  active: boolean;
  respawnAt: number;
  invulnerableUntil: number;
  shot: Shot | null;
  controls: ArcadeControls;
  lifeIcons: Phaser.GameObjects.Image[];
}

interface Shield {
  x: number;
  y: number;
  cells: boolean[][];
}

export interface SiegeData {
  players?: 1 | 2;
}

/** Shield outline: a bunker with a notch cut into its base. */
const SHIELD_SHAPE = [
  '...##########...',
  '..############..',
  '.##############.',
  '################',
  '################',
  '################',
  '################',
  '#####......#####',
  '####........####',
  '####........####',
];

export class GameScene extends Phaser.Scene {
  private coop = false;
  private ships: Ship[] = [];
  private aliens: Alien[] = [];
  private enemyShots: (Shot & { phase: number })[] = [];
  private shields: Shield[] = [];
  private mothership: { x: number; vx: number } | null = null;

  private score = 0;
  private wave = 1;
  private fx = 0;
  private fy = 0;
  private dir = 1;
  private frame = 0;
  private stepTimer = 0;
  private marchNote = 0;
  private fireTimer = ENEMY_FIRE_MS;
  private motherTimer = 0;
  private elapsed = 0;
  private over = false;
  private clearing = false;
  private touchX: number | null = null;
  private touchFiring = false;

  private gfx!: Phaser.GameObjects.Graphics;
  private burst!: Phaser.GameObjects.Particles.ParticleEmitter;
  private motherImg!: Phaser.GameObjects.Image;
  private scoreText!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;
  private pause!: PauseController;

  constructor() {
    super('Game');
  }

  init(data: SiegeData): void {
    this.coop = data.players === 2;
    this.ships = [];
    this.aliens = [];
    this.enemyShots = [];
    this.shields = [];
    this.mothership = null;
    this.score = 0;
    this.wave = 1;
    this.elapsed = 0;
    this.over = false;
    this.clearing = false;
    this.touchX = null;
    this.touchFiring = false;
    this.motherTimer = Phaser.Math.Between(...MOTHERSHIP_MS);
  }

  create(): void {
    this.cameras.main.fadeIn(250, 5, 5, 13);
    makeSprites(this);
    this.drawStars();
    this.gfx = this.add.graphics();
    this.burst = burstEmitter(this, 240, 600);
    this.motherImg = this.add.image(-100, MOTHERSHIP_Y, 'mothership').setTint(NEON.pink).setVisible(false);
    this.motherImg.preFX?.addGlow(NEON.pink, 3, 0, false);

    const style = { fontFamily: PIXEL_FONT, fontSize: '16px', color: '#e8e8ff' };
    this.scoreText = this.add.text(WIDTH / 2, 24, '0', style).setOrigin(0.5).setDepth(10);
    this.waveText = this.add.text(WIDTH / 2, 46, '', { ...style, fontSize: '10px', color: '#8a8ab8' }).setOrigin(0.5).setDepth(10);

    const seats: (1 | 2)[] = this.coop ? [1, 2] : [1];
    this.ships = seats.map((id) => this.makeShip(id));
    this.pause = new PauseController(
      this,
      this.ships.map((s) => s.controls),
      { canPause: () => !this.over },
    );

    if (!this.coop) this.bindTouch();
    this.startWave();
  }

  private makeShip(id: 1 | 2): Ship {
    const color = id === 1 ? NEON.cyan : NEON.pink;
    const x = this.coop ? (id === 1 ? WIDTH * 0.35 : WIDTH * 0.65) : WIDTH / 2;
    const img = this.add.image(x, PLAYER_Y, 'cannon').setTint(color).setDepth(5);
    img.preFX?.addGlow(color, 3, 0, false);
    const ship: Ship = {
      id,
      img,
      color,
      lives: START_LIVES,
      active: true,
      respawnAt: 0,
      invulnerableUntil: 0,
      shot: null,
      controls: new ArcadeControls(this, undefined, this.coop ? { player: id } : {}),
      lifeIcons: [],
    };
    this.drawLives(ship);
    return ship;
  }

  private drawStars(): void {
    const g = this.add.graphics().setDepth(-10);
    for (let i = 0; i < 70; i++) {
      g.fillStyle(0xffffff, Phaser.Math.FloatBetween(0.08, 0.4)).fillCircle(Phaser.Math.Between(0, WIDTH), Phaser.Math.Between(0, HEIGHT), 1);
    }
    g.lineStyle(2, NEON.green, 0.5).lineBetween(0, PLAYER_Y + 22, WIDTH, PLAYER_Y + 22);
  }

  /** Solo touch play: drag to move the cannon, keep a finger down to keep firing. */
  private bindTouch(): void {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.touchX = p.x;
      this.touchFiring = true;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.isDown) this.touchX = p.x;
    });
    const release = () => {
      this.touchX = null;
      this.touchFiring = false;
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);
    if (isTouchDevice()) {
      const hint = neonText(this, WIDTH / 2, PLAYER_Y - 60, 'DRAG TO MOVE, HOLD TO FIRE', 10, NEON.white);
      this.tweens.add({ targets: hint, alpha: 0, delay: 2500, duration: 600 });
    }
  }

  // ---------------------------------------------------------------- waves

  private startWave(): void {
    this.aliens.forEach((a) => a.img.destroy());
    this.fx = 0;
    this.fy = Math.min((this.wave - 1) * WAVE_DROP, MAX_WAVE_DROP);
    this.dir = 1;
    this.frame = 0;
    this.stepTimer = 0;
    const startX = (WIDTH - (COLS - 1) * COL_SPACING) / 2;
    const rowColors = [NEON.purple, NEON.pink, NEON.pink, NEON.green, NEON.green];
    this.aliens = [];
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const kind = ROW_KINDS[row];
        const img = this.add.image(startX + col * COL_SPACING, 0, `${kind}0`).setTint(rowColors[row]);
        this.aliens.push({ img, kind, col, row, alive: true });
      }
    }
    this.placeAliens();
    this.buildShields();
    this.enemyShots = [];
    this.clearing = false;
    showBanner(this, `WAVE ${this.wave}`, NEON.yellow);
    this.waveText.setText(`WAVE ${this.wave}`);
  }

  private placeAliens(): void {
    const startX = (WIDTH - (COLS - 1) * COL_SPACING) / 2;
    for (const a of this.aliens) {
      a.img.setPosition(startX + a.col * COL_SPACING + this.fx, FORMATION_TOP + this.fy + a.row * ROW_SPACING);
      a.img.setTexture(`${a.kind}${this.frame}`);
    }
  }

  private buildShields(): void {
    const w = SHIELD_SHAPE[0].length * SHIELD_CELL;
    this.shields = [0, 1, 2, 3].map((i) => ({
      x: WIDTH * (0.2 + i * 0.2) - w / 2,
      y: SHIELD_Y,
      cells: SHIELD_SHAPE.map((row) => [...row].map((c) => c === '#')),
    }));
  }

  // ---------------------------------------------------------------- loop

  update(_time: number, deltaMs: number): void {
    if (this.pause.isPaused) return;
    const dt = Math.min(deltaMs, 50) / 1000;
    this.elapsed += deltaMs;

    for (const ship of this.ships) this.updateShip(ship, dt);
    this.updatePlayerShots(dt);
    if (!this.over && !this.clearing) {
      this.updateFormation(deltaMs);
      this.updateEnemyFire(deltaMs);
    }
    this.updateEnemyShots(dt);
    this.updateMothership(dt, deltaMs);
    this.render();
  }

  private updateShip(ship: Ship, dt: number): void {
    if (!ship.active) {
      if (ship.lives > 0 && !this.over && this.elapsed >= ship.respawnAt) this.respawn(ship);
      return;
    }
    const c = ship.controls;
    let move = c.axisX;
    // Solo touch: glide toward the finger.
    if (this.touchX !== null) move = Phaser.Math.Clamp((this.touchX - ship.img.x) / 40, -1, 1);
    ship.img.x = Phaser.Math.Clamp(ship.img.x + move * PLAYER_SPEED * dt, 24, WIDTH - 24);
    const invulnerable = this.elapsed < ship.invulnerableUntil;
    ship.img.setAlpha(invulnerable && Math.floor(this.elapsed / 100) % 2 === 0 ? 0.3 : 1);
    const wantsFire = c.justPressed('action') || c.isDown('action') || c.justPressed('up') || this.touchFiring;
    // One shot on screen per cannon: every miss costs you time, as in the classics.
    if (wantsFire && !ship.shot && !this.over) {
      ship.shot = { x: ship.img.x, y: PLAYER_Y - 16 };
      tone({ freq: 1400, toFreq: 700, duration: 0.07, type: 'square', volume: 0.04 });
    }
  }

  private respawn(ship: Ship): void {
    ship.active = true;
    ship.img.setVisible(true);
    ship.invulnerableUntil = this.elapsed + INVULNERABLE_MS;
  }

  private updatePlayerShots(dt: number): void {
    for (const ship of this.ships) {
      const s = ship.shot;
      if (!s) continue;
      s.y -= PLAYER_BULLET_SPEED * dt;
      if (s.y < 30) {
        ship.shot = null;
        continue;
      }
      // Aliens.
      const hit = this.aliens.find((a) => a.alive && Math.abs(a.img.x - s.x) < a.img.width / 2 + 1 && Math.abs(a.img.y - s.y) < a.img.height / 2 + 4);
      if (hit) {
        ship.shot = null;
        this.killAlien(hit);
        continue;
      }
      // Mothership.
      if (this.mothership && Math.abs(this.mothership.x - s.x) < 26 && Math.abs(MOTHERSHIP_Y - s.y) < 12) {
        ship.shot = null;
        this.killMothership();
        continue;
      }
      // Shields.
      if (this.hitShield(s.x, s.y)) {
        ship.shot = null;
        continue;
      }
      // Shots cancel each other out.
      const clash = this.enemyShots.findIndex((e) => Math.abs(e.x - s.x) < 6 && Math.abs(e.y - s.y) < 12);
      if (clash >= 0) {
        this.burst.setParticleTint(NEON.white);
        this.burst.explode(6, s.x, s.y);
        this.enemyShots.splice(clash, 1);
        ship.shot = null;
      }
    }
  }

  private killAlien(a: Alien): void {
    a.alive = false;
    a.img.setVisible(false);
    const points = ALIEN_POINTS[a.kind];
    this.addScore(points);
    this.burst.setParticleTint(a.img.tintTopLeft);
    this.burst.explode(12, a.img.x, a.img.y);
    noise(0.12, 0.06);
    tone({ freq: 300, toFreq: 120, duration: 0.1, type: 'sawtooth', volume: 0.05 });
    if (this.aliens.every((x) => !x.alive)) this.clearWave();
  }

  private clearWave(): void {
    this.clearing = true;
    this.enemyShots = [];
    if (this.wave >= 3) unlock('siege.wave3');
    if (this.coop) unlock('siege.coop');
    const bonus = 100 * this.wave;
    this.addScore(bonus);
    showBanner(this, `WAVE CLEAR\n+${bonus}`, NEON.green);
    [523, 659, 784, 1047].forEach((f, i) => this.time.delayedCall(i * 110, () => tone({ freq: f, duration: 0.16, type: 'triangle', volume: 0.08 })));
    this.time.delayedCall(2000, () => {
      this.wave++;
      this.startWave();
    });
  }

  private updateFormation(deltaMs: number): void {
    const alive = this.aliens.filter((a) => a.alive);
    if (!alive.length) return;
    // March faster as the formation thins out and as waves go by.
    const waveFactor = Math.max(0.55, 1 - (this.wave - 1) * 0.07);
    const interval = (STEP_BASE_MS + alive.length * STEP_PER_ALIEN_MS) * waveFactor;
    this.stepTimer += deltaMs;
    if (this.stepTimer < interval) return;
    this.stepTimer = 0;

    const minX = Math.min(...alive.map((a) => a.img.x - a.img.width / 2));
    const maxX = Math.max(...alive.map((a) => a.img.x + a.img.width / 2));
    if ((this.dir > 0 && maxX + STEP_X > WIDTH - 12) || (this.dir < 0 && minX - STEP_X < 12)) {
      this.fy += STEP_DOWN;
      this.dir *= -1;
    } else {
      this.fx += STEP_X * this.dir;
    }
    this.frame = 1 - this.frame;
    this.placeAliens();
    // The four-note march, lower as it speeds up.
    tone({ freq: [98, 87, 78, 73][this.marchNote++ % 4], duration: 0.09, type: 'square', volume: 0.06 });

    // Aliens chew through shields they touch, and the invasion wins if they get low enough.
    for (const a of alive) this.eraseShieldBox(a.img.x, a.img.y, a.img.width / 2, a.img.height / 2);
    const lowest = Math.max(...alive.map((a) => a.img.y + a.img.height / 2));
    if (lowest >= INVASION_Y) this.invaded();
  }

  private updateEnemyFire(deltaMs: number): void {
    this.fireTimer -= deltaMs;
    if (this.fireTimer > 0 || this.enemyShots.length >= MAX_ENEMY_BULLETS + Math.min(this.wave - 1, 3)) return;
    this.fireTimer = Math.max(350, ENEMY_FIRE_MS - (this.wave - 1) * 90) * Phaser.Math.FloatBetween(0.6, 1.3);
    // A random column fires from its lowest alien; half the time it picks one above a player.
    const cols = [...new Set(this.aliens.filter((a) => a.alive).map((a) => a.col))];
    if (!cols.length) return;
    const target = this.ships.find((s) => s.active);
    let col = Phaser.Utils.Array.GetRandom(cols);
    if (target && Math.random() < 0.5) {
      col = cols.reduce((best, c) => {
        const x = this.aliens.find((a) => a.col === c)!.img.x;
        const bx = this.aliens.find((a) => a.col === best)!.img.x;
        return Math.abs(x - target.img.x) < Math.abs(bx - target.img.x) ? c : best;
      }, col);
    }
    const shooter = this.aliens.filter((a) => a.alive && a.col === col).sort((a, b) => b.row - a.row)[0];
    this.enemyShots.push({ x: shooter.img.x, y: shooter.img.y + 14, phase: Math.random() * 10 });
  }

  private updateEnemyShots(dt: number): void {
    const speed = ENEMY_BULLET_SPEED + Math.min(this.wave - 1, 8) * 15;
    for (let i = this.enemyShots.length - 1; i >= 0; i--) {
      const e = this.enemyShots[i];
      e.y += speed * dt;
      e.phase += dt * 20;
      let gone = e.y > HEIGHT;
      if (!gone && this.hitShield(e.x, e.y)) gone = true;
      if (!gone) {
        const ship = this.ships.find((s) => s.active && this.elapsed >= s.invulnerableUntil && Math.abs(s.img.x - e.x) < 18 && Math.abs(PLAYER_Y - e.y) < 12);
        if (ship) {
          gone = true;
          this.killShip(ship);
        }
      }
      if (gone) this.enemyShots.splice(i, 1);
    }
  }

  private updateMothership(dt: number, deltaMs: number): void {
    if (!this.mothership) {
      if (this.over || this.clearing) return;
      this.motherTimer -= deltaMs;
      if (this.motherTimer <= 0) {
        const fromLeft = Math.random() < 0.5;
        this.mothership = { x: fromLeft ? -30 : WIDTH + 30, vx: (fromLeft ? 1 : -1) * MOTHERSHIP_SPEED };
        this.motherImg.setVisible(true);
      }
      return;
    }
    const m = this.mothership;
    m.x += m.vx * dt;
    this.motherImg.setPosition(m.x, MOTHERSHIP_Y);
    if (Math.floor(this.elapsed / 160) !== Math.floor((this.elapsed - deltaMs) / 160)) {
      tone({ freq: Math.floor(this.elapsed / 160) % 2 ? 660 : 520, duration: 0.12, type: 'sine', volume: 0.03 });
    }
    if (m.x < -40 || m.x > WIDTH + 40) this.hideMothership();
  }

  private hideMothership(): void {
    this.mothership = null;
    this.motherImg.setVisible(false);
    this.motherTimer = Phaser.Math.Between(...MOTHERSHIP_MS);
  }

  private killMothership(): void {
    const x = this.mothership!.x;
    const points = Phaser.Utils.Array.GetRandom(MOTHERSHIP_POINTS);
    this.addScore(points);
    floatText(this, x, MOTHERSHIP_Y, `+${points}`, NEON.pink, 14);
    this.burst.setParticleTint(NEON.pink);
    this.burst.explode(30, x, MOTHERSHIP_Y);
    noise(0.35, 0.1);
    unlock('siege.mothership');
    this.hideMothership();
  }

  // ---------------------------------------------------------------- shields

  /** If (x, y) hits a shield cell, blast a small crater around it and return true. */
  private hitShield(x: number, y: number): boolean {
    for (const sh of this.shields) {
      const cx = Math.floor((x - sh.x) / SHIELD_CELL);
      const cy = Math.floor((y - sh.y) / SHIELD_CELL);
      if (cy < 0 || cy >= sh.cells.length || cx < 0 || cx >= sh.cells[0].length) continue;
      if (!sh.cells[cy][cx]) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (Math.abs(dx) + Math.abs(dy) > 2 + (Math.random() < 0.5 ? 1 : 0)) continue;
          const row = sh.cells[cy + dy];
          if (row && cx + dx >= 0 && cx + dx < row.length) row[cx + dx] = false;
        }
      }
      return true;
    }
    return false;
  }

  private eraseShieldBox(x: number, y: number, hw: number, hh: number): void {
    for (const sh of this.shields) {
      sh.cells.forEach((row, cy) =>
        row.forEach((on, cx) => {
          if (!on) return;
          const px = sh.x + cx * SHIELD_CELL + SHIELD_CELL / 2;
          const py = sh.y + cy * SHIELD_CELL + SHIELD_CELL / 2;
          if (Math.abs(px - x) < hw && Math.abs(py - y) < hh) row[cx] = false;
        }),
      );
    }
  }

  // ---------------------------------------------------------------- lives and scoring

  private killShip(ship: Ship): void {
    ship.active = false;
    ship.lives--;
    ship.shot = null;
    ship.img.setVisible(false);
    ship.respawnAt = this.elapsed + RESPAWN_MS;
    this.drawLives(ship);
    this.burst.setParticleTint(ship.color);
    this.burst.explode(34, ship.img.x, PLAYER_Y);
    this.cameras.main.shake(260, 0.01);
    this.cameras.main.flash(160, 255, 46, 151);
    noise(0.5, 0.12);
    tone({ freq: 280, toFreq: 40, duration: 0.6, type: 'sawtooth', volume: 0.08 });
    if (this.ships.every((s) => s.lives <= 0)) this.endGame(`REACHED WAVE ${this.wave}`);
  }

  private invaded(): void {
    // End first so the result reads as an invasion rather than running out of lives.
    this.endGame('THE INVASION LANDED');
    for (const s of this.ships) if (s.active) this.killShip(s);
    for (const s of this.ships) {
      s.lives = 0;
      this.drawLives(s);
    }
  }

  private endGame(detail: string): void {
    if (this.over) return;
    this.over = true;
    this.time.delayedCall(1800, () =>
      this.scene.start('GameOver', { gameId: GAME_ID, score: this.score, detail, restartData: { players: this.coop ? 2 : 1 } }),
    );
  }

  private addScore(points: number): void {
    this.score += points;
    if (this.score >= 5000) unlock('siege.score');
    this.scoreText.setText(this.score.toLocaleString());
  }

  private drawLives(ship: Ship): void {
    ship.lifeIcons.forEach((i) => i.destroy());
    const left = ship.id === 1;
    ship.lifeIcons = Array.from({ length: Math.max(ship.lives, 0) }, (_, i) =>
      this.add
        .image(left ? 140 + i * 30 : WIDTH - 40 - i * 30, 26, 'cannon')
        .setTint(ship.color)
        .setScale(0.55)
        .setDepth(10),
    );
  }

  // ---------------------------------------------------------------- render

  private render(): void {
    const g = this.gfx.clear();
    for (const sh of this.shields) {
      g.fillStyle(NEON.green, 0.85);
      sh.cells.forEach((row, cy) => row.forEach((on, cx) => on && g.fillRect(sh.x + cx * SHIELD_CELL, sh.y + cy * SHIELD_CELL, SHIELD_CELL, SHIELD_CELL)));
    }
    for (const ship of this.ships) {
      if (!ship.shot) continue;
      g.fillStyle(ship.color, 0.3).fillRect(ship.shot.x - 3, ship.shot.y - 8, 6, 16);
      g.fillStyle(0xffffff, 1).fillRect(ship.shot.x - 1, ship.shot.y - 7, 2, 14);
    }
    // Enemy shots are zigzag bolts, so they read differently from yours even without color.
    g.lineStyle(2, NEON.yellow, 1);
    for (const e of this.enemyShots) {
      const w = Math.sin(e.phase) * 3;
      g.beginPath();
      g.moveTo(e.x + w, e.y - 8);
      g.lineTo(e.x - w, e.y - 3);
      g.lineTo(e.x + w, e.y + 2);
      g.lineTo(e.x - w, e.y + 7);
      g.strokePath();
    }
  }
}
