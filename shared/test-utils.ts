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
