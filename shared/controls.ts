import Phaser from 'phaser';

/**
 * Unified input for arcade games: keyboard, gamepad and on-screen touch controls behind one API.
 *
 *   const controls = new ArcadeControls(this);             // default bindings
 *   const controls = new ArcadeControls(this, { hold: { keys: ['C'], buttons: [3] } });  // plus extras
 *
 *   controls.isDown('left')       held this frame
 *   controls.justPressed('action') went down since last frame (never misses quick taps)
 *   controls.axisX / axisY        -1..1, analog from the left stick, digital from keys and d-pad
 *
 * State refreshes automatically at the start of every scene update.
 */

export interface Binding {
  /** Phaser key names, e.g. 'LEFT', 'A', 'SPACE'. */
  keys?: string[];
  /** Standard gamepad button indices (0 A, 1 B, 2 X, 3 Y, 8 Back, 9 Start, 12-15 d-pad). */
  buttons?: number[];
  /** Left-stick direction that also triggers this binding. */
  stick?: 'left' | 'right' | 'up' | 'down';
}

export const DEFAULT_BINDINGS = {
  left: { keys: ['LEFT', 'A'], buttons: [14], stick: 'left' },
  right: { keys: ['RIGHT', 'D'], buttons: [15], stick: 'right' },
  up: { keys: ['UP', 'W'], buttons: [12], stick: 'up' },
  down: { keys: ['DOWN', 'S'], buttons: [13], stick: 'down' },
  action: { keys: ['SPACE', 'ENTER'], buttons: [0] },
  alt: { keys: ['SHIFT', 'X'], buttons: [1] },
  pause: { keys: ['P', 'ESC'], buttons: [9] },
  mute: { keys: ['M'], buttons: [8] },
} satisfies Record<string, Binding>;

export type DefaultAction = keyof typeof DEFAULT_BINDINGS;

const STICK_DEADZONE = 0.25;
/** How far the stick must move before it counts as a digital direction press. */
const STICK_PRESS = 0.5;

export class ArcadeControls<Extra extends string = never> {
  private readonly bindings: Record<string, Binding>;
  private readonly keys = new Map<string, Phaser.Input.Keyboard.Key>();
  private readonly virtual = new Map<string, Array<() => boolean>>();
  private stickSource?: () => { x: number; y: number };

  private down = new Set<string>();
  private prevNonKey = new Set<string>();
  private pressed = new Set<string>();
  private latched = new Set<string>();

  constructor(
    private readonly scene: Phaser.Scene,
    extra?: Record<Extra, Binding>,
  ) {
    this.bindings = { ...DEFAULT_BINDINGS, ...(extra ?? {}) } as Record<string, Binding>;
    const kb = scene.input.keyboard;
    for (const [name, binding] of Object.entries(this.bindings)) {
      for (const code of binding.keys ?? []) {
        if (!kb) continue;
        if (!this.keys.has(code)) this.keys.set(code, kb.addKey(code));
        // Latch key presses from events so a tap shorter than one frame is never missed.
        kb.on(`keydown-${code}`, (e: KeyboardEvent) => {
          if (!e.repeat) this.latched.add(name);
        });
      }
    }
    scene.events.on(Phaser.Scenes.Events.PRE_UPDATE, this.refresh, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.PRE_UPDATE, this.refresh, this));
  }

  /** First connected gamepad, if any. */
  get pad(): Phaser.Input.Gamepad.Gamepad | undefined {
    const gp = this.scene.input.gamepad;
    if (!gp || gp.total === 0) return undefined;
    return gp.getAll().find((p) => p.connected);
  }

  get usingGamepad(): boolean {
    return this.pad !== undefined;
  }

  /** Adds an extra source (e.g. an on-screen button) that holds a binding down. */
  addVirtual(name: DefaultAction | Extra, isDown: () => boolean): void {
    const list = this.virtual.get(name) ?? [];
    list.push(isDown);
    this.virtual.set(name, list);
  }

  /** Adds an analog stick source (e.g. an on-screen joystick) merged into axisX/axisY. */
  setStick(source: () => { x: number; y: number }): void {
    this.stickSource = source;
  }

  isDown(name: DefaultAction | Extra): boolean {
    return this.down.has(name);
  }

  justPressed(name: DefaultAction | Extra): boolean {
    return this.pressed.has(name);
  }

  get axisX(): number {
    return this.axis('x');
  }

  get axisY(): number {
    return this.axis('y');
  }

  private axis(which: 'x' | 'y'): number {
    const stick = this.stickValue();
    const analog = which === 'x' ? stick.x : stick.y;
    if (Math.abs(analog) > STICK_DEADZONE) return analog;
    const neg = which === 'x' ? 'left' : 'up';
    const pos = which === 'x' ? 'right' : 'down';
    // Keys and d-pad only; the stick was already handled above.
    return (this.digitalDown(pos) ? 1 : 0) - (this.digitalDown(neg) ? 1 : 0);
  }

  private stickValue(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    const pad = this.pad;
    if (pad) {
      x = pad.leftStick.x;
      y = pad.leftStick.y;
    }
    if (this.stickSource) {
      const v = this.stickSource();
      if (Math.abs(v.x) > Math.abs(x)) x = v.x;
      if (Math.abs(v.y) > Math.abs(y)) y = v.y;
    }
    return { x, y };
  }

  private digitalDown(name: string): boolean {
    const b = this.bindings[name];
    if (!b) return false;
    if ((b.keys ?? []).some((k) => this.keys.get(k)?.isDown)) return true;
    const pad = this.pad;
    if (pad && (b.buttons ?? []).some((i) => pad.buttons[i]?.pressed)) return true;
    return (this.virtual.get(name) ?? []).some((fn) => fn());
  }

  private refresh(): void {
    const stick = this.stickValue();
    const down = new Set<string>();
    const nonKeyDown = new Set<string>();
    for (const [name, b] of Object.entries(this.bindings)) {
      const keyDown = (b.keys ?? []).some((k) => this.keys.get(k)?.isDown);
      const pad = this.pad;
      const buttonDown = !!pad && (b.buttons ?? []).some((i) => pad.buttons[i]?.pressed);
      const stickDown =
        (b.stick === 'left' && stick.x < -STICK_PRESS) ||
        (b.stick === 'right' && stick.x > STICK_PRESS) ||
        (b.stick === 'up' && stick.y < -STICK_PRESS) ||
        (b.stick === 'down' && stick.y > STICK_PRESS);
      const virtualDown = (this.virtual.get(name) ?? []).some((fn) => fn());
      if (buttonDown || stickDown || virtualDown) nonKeyDown.add(name);
      if (keyDown || buttonDown || stickDown || virtualDown) down.add(name);
    }
    // Edge detection: keyboard presses come from latched events, everything else from frame-to-frame state.
    const pressed = new Set(this.latched);
    for (const name of nonKeyDown) if (!this.prevNonKey.has(name)) pressed.add(name);
    this.latched.clear();
    this.prevNonKey = nonKeyDown;
    this.down = down;
    this.pressed = pressed;
  }
}
