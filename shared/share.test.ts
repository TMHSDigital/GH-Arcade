import { afterEach, describe, expect, it, vi } from 'vitest';
import { canShare, resultText, shareResult } from './share';

afterEach(() => vi.unstubAllGlobals());

const abort = () => Object.assign(new Error('closed'), { name: 'AbortError' });

describe('resultText', () => {
  it('names the game and the score', () => {
    expect(resultText({ title: 'Neon Hop', score: 1500 })).toBe(`Neon Hop: ${(1500).toLocaleString()}`);
  });

  it('adds the date for a daily run', () => {
    expect(resultText({ title: 'Neon Stack', score: 48200, daily: '2026-11-13' })).toBe(`Neon Stack daily 2026-11-13: ${(48200).toLocaleString()}`);
  });
});

describe('canShare', () => {
  it('is false without a navigator, or with one that can neither share nor copy', () => {
    vi.stubGlobal('navigator', undefined);
    expect(canShare()).toBe(false);
    vi.stubGlobal('navigator', {});
    expect(canShare()).toBe(false);
  });

  it('is true with a share sheet or a clipboard', () => {
    vi.stubGlobal('navigator', { share: () => Promise.resolve() });
    expect(canShare()).toBe(true);
    vi.stubGlobal('navigator', { clipboard: { writeText: () => Promise.resolve() } });
    expect(canShare()).toBe(true);
  });
});

describe('shareResult', () => {
  it('uses the share sheet when there is one', async () => {
    const share = vi.fn(() => Promise.resolve());
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { share, clipboard: { writeText } });
    expect(await shareResult('Neon Hop: 10', 'https://example.test/hop/')).toBe('shared');
    expect(share).toHaveBeenCalledWith({ text: 'Neon Hop: 10', url: 'https://example.test/hop/' });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('copies the text and the link where there is no share sheet', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    expect(await shareResult('Neon Hop: 10', 'https://example.test/hop/')).toBe('copied');
    expect(writeText).toHaveBeenCalledWith('Neon Hop: 10\nhttps://example.test/hop/');
  });

  it('does not copy when the player closes the share sheet', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { share: () => Promise.reject(abort()), clipboard: { writeText } });
    expect(await shareResult('t', 'u')).toBe('cancelled');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('falls back to the clipboard when the share sheet refuses', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { share: () => Promise.reject(new Error('not allowed')), clipboard: { writeText } });
    expect(await shareResult('t', 'u')).toBe('copied');
  });

  it('reports failure when nothing works', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: () => Promise.reject(new Error('denied')) } });
    expect(await shareResult('t', 'u')).toBe('failed');
    vi.stubGlobal('navigator', {});
    expect(await shareResult('t', 'u')).toBe('failed');
    vi.stubGlobal('navigator', undefined);
    expect(await shareResult('t', 'u')).toBe('failed');
  });
});
