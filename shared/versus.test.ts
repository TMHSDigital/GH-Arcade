import { describe, expect, it } from 'vitest';
import { cpuLabel, parseCpuLevel, TROPHY_LEVELS, VERSUS_MODES, versusRestartData } from './versus';

describe('versus setup', () => {
  it('reads the CPU strength from scene data, defaulting to normal', () => {
    expect(parseCpuLevel('easy')).toBe('easy');
    expect(parseCpuLevel('hard')).toBe('hard');
    expect(parseCpuLevel(undefined)).toBe('normal');
    expect(parseCpuLevel('toString')).toBe('normal');
    expect(parseCpuLevel(3)).toBe('normal');
  });

  it('names the opponent on the result screen', () => {
    expect(cpuLabel('normal')).toBe('CPU');
    expect(cpuLabel('easy')).toBe('EASY CPU');
    expect(cpuLabel('hard')).toBe('HARD CPU');
  });

  it('restarts the same kind of match', () => {
    expect(versusRestartData(true, 'hard')).toEqual({ players: 2 });
    expect(versusRestartData(false, 'easy')).toEqual({ players: 1, cpu: 'easy' });
  });

  it('offers every CPU strength and two players, with trophies above easy', () => {
    expect(VERSUS_MODES.map((m) => m.label)).toEqual(['VS CPU', 'EASY CPU', 'HARD CPU', '2 PLAYERS']);
    expect(VERSUS_MODES.map((m) => parseCpuLevel(m.data.cpu))).toEqual(['normal', 'easy', 'hard', 'normal']);
    expect(TROPHY_LEVELS).toEqual(['normal', 'hard']);
  });
});
