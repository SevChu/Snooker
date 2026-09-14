import { BALL_RADIUS, CUSHION_JAW_RADIUS, POCKET_POSITIONS, TABLE_LENGTH } from '../constants';
import { CUSHIONS } from '../physics/TableGeometry';
import type { BridgeKind } from '../physics/CueMechanics';
import { BallType, type BallState, type ShotResult, type Vec3 } from '../types';

export type ShotIntent = 'attack' | 'safety';
export type PocketName = keyof typeof POCKET_POSITIONS;
export const POCKET_LABELS: Record<PocketName, string> = {
  BL: '开球端左角袋', BR: '开球端右角袋', TL: '黑球端左角袋', TR: '黑球端右角袋',
  ML: '左中袋', MR: '右中袋',
};
export interface ShotSelection {
  intent: ShotIntent;
  bridge: BridgeKind;
  targetBallId?: string;
  pocket?: PocketName;
}
export interface ShotClassification { intent: ShotIntent; long: boolean; cushion: boolean; rest: boolean }
export interface SuccessRate { attempts: number; successes: number }
export interface PlayerStatistics {
  pot: SuccessRate;
  long: SuccessRate;
  safety: SuccessRate;
  cushion: SuccessRate;
  rest: SuccessRate;
  highestBreak: number;
}
export type StatisticsPair = [PlayerStatistics, PlayerStatistics];
export const RATE_KEYS = ['pot', 'long', 'safety', 'cushion', 'rest'] as const;
export function emptyStatistics(): StatisticsPair {
  const player = (): PlayerStatistics => ({ pot: { attempts: 0, successes: 0 },
    long: { attempts: 0, successes: 0 }, safety: { attempts: 0, successes: 0 },
    cushion: { attempts: 0, successes: 0 }, rest: { attempts: 0, successes: 0 }, highestBreak: 0 });
  return [player(), player()];
}
/** Add raw counts, never average percentages; highest break is a maximum. Also produces a deep copy. */
export function mergeStatistics(...frames: StatisticsPair[]): StatisticsPair {
  const total = emptyStatistics();
  for (const frame of frames) for (const player of [0, 1]) {
    for (const key of RATE_KEYS) {
      total[player][key].attempts += frame[player][key].attempts;
      total[player][key].successes += frame[player][key].successes;
    }
    total[player].highestBreak = Math.max(total[player].highestBreak, frame[player].highestBreak);
  }
  return total;
}

/** Surface-to-cushion gap, following the actual cushion outline (including jaws, excluding pocket rims). */
export function cushionGap(position: Vec3): number {
  let distance = Infinity;
  for (const segment of CUSHIONS) {
    if (segment.leather || segment.rim) continue;
    const dx = segment.bx - segment.ax, dz = segment.bz - segment.az;
    const t = Math.max(0, Math.min(1, ((position.x - segment.ax) * dx +
      (position.z - segment.az) * dz) / (dx * dx + dz * dz)));
    distance = Math.min(distance, Math.hypot(position.x - segment.ax - t * dx,
      position.z - segment.az - t * dz));
  }
  return Math.max(0, distance - BALL_RADIUS - CUSHION_JAW_RADIUS);
}

/** Freeze geometry before any ball moves, so misses and pots use the same classification. */
export function classifyShot(balls: BallState[], selection: ShotSelection): ShotClassification {
  const cue = balls.find(b => b.type === BallType.CUE);
  const target = balls.find(b => b.id === selection.targetBallId && b.isOnTable && !b.isPotted);
  const pocket = selection.pocket ? POCKET_POSITIONS[selection.pocket] : undefined;
  const distance = cue && target && pocket
    ? Math.hypot(cue.position.x - target.position.x, cue.position.z - target.position.z) +
      Math.hypot(target.position.x - pocket.x, target.position.z - pocket.z) : 0;
  return { intent: selection.intent, long: distance > TABLE_LENGTH * 2 / 3 + 1e-10,
    cushion: [cue, target].some(b => b && cushionGap(b.position) <= BALL_RADIUS / 2 + 1e-10),
    rest: selection.bridge !== 'hand' };
}

/** Closest ideal pot direction to the aim. Manual selections override either half of the suggestion.
 * This is an intention suggestion, not a prediction; bank/combo shots can be specified manually. */
export function suggestPot(cue: BallState, targets: BallState[], direction: Vec3,
  targetBallId?: string, pocket?: PocketName): { targetBallId?: string; pocket?: PocketName } {
  let best = -Infinity;
  let selection: { targetBallId?: string; pocket?: PocketName } = {};
  const length = Math.hypot(direction.x, direction.z);
  if (!length) return selection;
  // Prefer the first target intersected by the cue's straight approach, rather than a ball behind it.
  let directTarget: string | undefined;
  let firstDistance = Infinity;
  if (!targetBallId) for (const target of targets) {
    const dx = target.position.x - cue.position.x, dz = target.position.z - cue.position.z;
    const projection = (dx * direction.x + dz * direction.z) / length;
    const lateralSquared = Math.max(0, dx * dx + dz * dz - projection * projection);
    if (projection <= 0 || lateralSquared > (BALL_RADIUS * 2) ** 2) continue;
    const distance = projection - Math.sqrt((BALL_RADIUS * 2) ** 2 - lateralSquared);
    if (distance < firstDistance) { firstDistance = distance; directTarget = target.id; }
  }
  for (const target of targets) {
    if (targetBallId && target.id !== targetBallId) continue;
    if (!targetBallId && directTarget && target.id !== directTarget) continue;
    for (const [name, position] of Object.entries(POCKET_POSITIONS)) {
      if (pocket && pocket !== name) continue;
      const dx = position.x - target.position.x, dz = position.z - target.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 1e-10) continue;
      const x = target.position.x - dx / distance * BALL_RADIUS * 2 - cue.position.x;
      const z = target.position.z - dz / distance * BALL_RADIUS * 2 - cue.position.z;
      const dot = (direction.x * x + direction.z * z) / (length * Math.hypot(x, z));
      if (dot > best && (dot > 0 || !!targetBallId)) {
        best = dot; selection = { targetBallId: target.id, pocket: name as PocketName };
      }
    }
  }
  return selection;
}

export class ShotStatistics {
  readonly players = emptyStatistics();
  private pendingSafety: number | null = null;

  record(player: number, result: ShotResult, classification: ShotClassification): void {
    const success = !result.foul && result.scorePoints > 0;
    if (this.pendingSafety !== null) {
      // Only the opponent's first actual shot resolves a safety. Replays never create imaginary attempts.
      if (this.pendingSafety !== player) this.count(this.players[this.pendingSafety].safety, !success);
      this.pendingSafety = null;
    }
    const stats = this.players[player];
    if (classification.intent === 'attack') {
      this.count(stats.pot, success);
      for (const key of ['long', 'cushion', 'rest'] as const) {
        if (classification[key]) this.count(stats[key], success);
      }
    } else if (result.foul) {
      this.count(stats.safety, false);
    } else if (result.switchTurn) {
      this.pendingSafety = player;
    }
  }

  cancelPendingSafety(): void { this.pendingSafety = null; }
  private count(rate: SuccessRate, success: boolean): void {
    rate.attempts++;
    if (success) rate.successes++;
  }
}
