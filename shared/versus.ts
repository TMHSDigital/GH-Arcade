/**
 * The setup shared by games played against a CPU or a second player on the same device (Pong,
 * Tanks): the menu modes, the CPU strengths and the data a restart carries. Each game keeps its own
 * CPU tuning per strength in its config. No Phaser here.
 */

export const CPU_LEVELS = ['easy', 'normal', 'hard'] as const;
export type CpuLevel = (typeof CPU_LEVELS)[number];

/** Beating the CPU at these strengths earns trophies. A win against the easy CPU still counts as a play and scores. */
export const TROPHY_LEVELS: readonly CpuLevel[] = ['normal', 'hard'];

/** What a menu mode or a restart passes to the game scene. */
export interface VersusData {
  players?: 1 | 2;
  cpu?: CpuLevel;
}

/** The menu modes: the CPU at each strength, then two players. */
export const VERSUS_MODES: readonly { label: string; data: VersusData }[] = [
  { label: 'VS CPU', data: { players: 1 } },
  { label: 'EASY CPU', data: { players: 1, cpu: 'easy' } },
  { label: 'HARD CPU', data: { players: 1, cpu: 'hard' } },
  { label: '2 PLAYERS', data: { players: 2 } },
];

/** The CPU strength a scene was started with: normal unless the data names a known one. */
export function parseCpuLevel(value: unknown): CpuLevel {
  return CPU_LEVELS.includes(value as CpuLevel) ? (value as CpuLevel) : 'normal';
}

/** How the result screen names the opponent: "CPU" at normal strength, else "EASY CPU" or "HARD CPU". */
export function cpuLabel(level: CpuLevel): string {
  return level === 'normal' ? 'CPU' : `${level.toUpperCase()} CPU`;
}

/** The data that starts the same match again from the pause menu. */
export function versusRestartData(versus: boolean, level: CpuLevel): VersusData {
  return versus ? { players: 2 } : { players: 1, cpu: level };
}
