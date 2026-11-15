import { vi } from 'vitest';

/** Test-only helpers. Nothing in the games or the hub imports this file. */

export interface MemoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
  key(index: number): string | null;
  readonly length: number;
  /** The raw stored entries, for assertions. */
  readonly data: Map<string, string>;
}

/** Installs an in-memory `localStorage` for the current test and returns it. */
export function installMemoryStorage(initial: Record<string, string> = {}): MemoryStorage {
  const data = new Map(Object.entries(initial));
  const storage: MemoryStorage = {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, String(value)),
    removeItem: (key) => void data.delete(key),
    clear: () => data.clear(),
    key: (index) => [...data.keys()][index] ?? null,
    get length() {
      return data.size;
    },
  };
  vi.stubGlobal('localStorage', storage);
  return storage;
}

/** Installs a minimal `window` whose reduced-motion media query answers `reduce`. */
export function installWindow(reduce = false): void {
  vi.stubGlobal('window', {
    matchMedia: () => ({ matches: reduce }),
    addEventListener: () => undefined,
  });
}

/**
 * Settings and achievements read storage when they are first imported, so each test resets the
 * module registry and imports them fresh after preparing storage.
 */
export async function freshModules() {
  vi.resetModules();
  const storage = await import('./storage');
  const settings = await import('./settings');
  const achievements = await import('./achievements');
  return { storage, settings, achievements };
}

/** The Phaser event names the shared modules listen for. Use with `vi.mock('phaser', ...)`, see phaserMock(). */
export const PHASER_EVENTS = {
  Scenes: { Events: { PRE_UPDATE: 'preupdate', UPDATE: 'update', POST_UPDATE: 'postupdate', SHUTDOWN: 'shutdown' } },
  Core: { Events: { BLUR: 'blur', FOCUS: 'focus' } },
};

/**
 * A stand-in for the `phaser` module with just the constants the shared modules read at run time:
 *
 *   vi.mock('phaser', async () => (await import('./test-utils')).phaserMock());
 */
export function phaserMock() {
  class Scene {}
  class Rectangle {
    constructor(
      public x: number,
      public y: number,
      public width: number,
      public height: number,
    ) {}
    get right(): number {
      return this.x + this.width;
    }
    get bottom(): number {
      return this.y + this.height;
    }
    contains(px: number, py: number): boolean {
      return px >= this.x && px <= this.right && py >= this.y && py <= this.bottom;
    }
  }
  class Circle {
    constructor(
      public x: number,
      public y: number,
      public radius: number,
    ) {}
    contains(px: number, py: number): boolean {
      return Circle.Contains(this, px, py);
    }
    static Contains(c: Circle, px: number, py: number): boolean {
      return Math.hypot(px - c.x, py - c.y) <= c.radius;
    }
  }
  return { default: { Scene, Geom: { Rectangle, Circle }, ...PHASER_EVENTS } };
}

/** A minimal event emitter with Phaser's on / once / off / emit, including the listener context. */
export class FakeEmitter {
  private readonly handlers = new Map<string, { fn: (...args: unknown[]) => void; context?: unknown; once: boolean }[]>();

  on(event: string, fn: (...args: never[]) => void, context?: unknown): this {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), { fn: fn as (...args: unknown[]) => void, context, once: false }]);
    return this;
  }

  once(event: string, fn: (...args: never[]) => void, context?: unknown): this {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), { fn: fn as (...args: unknown[]) => void, context, once: true }]);
    return this;
  }

  off(event: string, fn?: (...args: never[]) => void): this {
    this.handlers.set(event, fn ? (this.handlers.get(event) ?? []).filter((h) => h.fn !== fn) : []);
    return this;
  }

  emit(event: string, ...args: unknown[]): void {
    const list = this.handlers.get(event) ?? [];
    this.handlers.set(
      event,
      list.filter((h) => !h.once),
    );
    for (const h of list) h.fn.apply(h.context, args);
  }

  /** How many listeners an event has, for checking that they are removed. */
  count(event: string): number {
    return (this.handlers.get(event) ?? []).length;
  }
}

export interface FakePad {
  index: number;
  connected: boolean;
  buttons: { pressed: boolean }[];
  leftStick: { x: number; y: number };
  pad: { vibrationActuator?: { playEffect: (type: string, params: unknown) => unknown } };
}

/** A connected gamepad with no buttons down and the stick at rest. */
export function fakePad(index: number): FakePad {
  return { index, connected: true, buttons: Array.from({ length: 17 }, () => ({ pressed: false })), leftStick: { x: 0, y: 0 }, pad: {} };
}

/** keyCodes for the Phaser key names the shared bindings use. Letters and digits need no entry. */
const KEY_NAMES: Record<string, number> = { ENTER: 13, SHIFT: 16, CTRL: 17, ESC: 27, SPACE: 32, LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, FORWARD_SLASH: 191 };

/**
 * A scene with just the input and lifecycle parts ArcadeControls uses, and ways to drive them:
 * `press` / `release` a key by keyCode, plug in `pads`, and `frame()` to run one scene update.
 */
export function fakeInputScene() {
  const events = new FakeEmitter();
  const keyboard = new FakeEmitter();
  const keys = new Map<number, { keyCode: number; isDown: boolean }>();
  const pads: FakePad[] = [];
  const addKey = (key: string | number) => {
    const keyCode = typeof key === 'number' ? key : (KEY_NAMES[key] ?? key.charCodeAt(0));
    if (!keys.has(keyCode)) keys.set(keyCode, { keyCode, isDown: false });
    return keys.get(keyCode)!;
  };
  const scene = {
    events,
    input: {
      keyboard: Object.assign(keyboard, { addKey }),
      gamepad: {
        get total() {
          return pads.length;
        },
        getAll: () => pads,
      },
    },
  };
  return {
    scene,
    events,
    pads,
    /** A key goes down: Phaser marks it held and fires `keydown`. */
    press(keyCode: number, repeat = false) {
      const key = keys.get(keyCode);
      if (key) key.isDown = true;
      keyboard.emit('keydown', { keyCode, repeat });
    },
    release(keyCode: number) {
      const key = keys.get(keyCode);
      if (key) key.isDown = false;
    },
    /** The start of one scene update, where ArcadeControls refreshes. */
    frame() {
      events.emit(PHASER_EVENTS.Scenes.Events.PRE_UPDATE);
    },
    shutdown() {
      events.emit(PHASER_EVENTS.Scenes.Events.SHUTDOWN);
    },
  };
}

/**
 * A drawn object (text, circle) that takes the chained calls the shared modules make and remembers
 * what it was told: position, text, visibility and whether it can be clicked. `emit` fires its own
 * pointer events, as a click or tap on it would.
 */
export class FakeGameObject extends FakeEmitter {
  width = 0;
  radius = 0;
  text = '';
  visible = true;
  interactive = false;
  color = '';
  alpha = 1;

  constructor(
    public x = 0,
    public y = 0,
  ) {
    super();
  }

  setPosition(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }
  setText(text: string): this {
    this.text = text;
    return this;
  }
  setVisible(on: boolean): this {
    this.visible = on;
    return this;
  }
  setInteractive(): this {
    this.interactive = true;
    return this;
  }
  disableInteractive(): this {
    this.interactive = false;
    return this;
  }
  setColor(color: string): this {
    this.color = color;
    return this;
  }
  setAlpha(alpha: number): this {
    this.alpha = alpha;
    return this;
  }
  setDepth(): this {
    return this;
  }
  setOrigin(): this {
    return this;
  }
  setStrokeStyle(): this {
    return this;
  }
  setFillStyle(): this {
    return this;
  }
  setScrollFactor(): this {
    return this;
  }
}
