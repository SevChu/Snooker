import type { FrameState } from '../types';
import { remainingPoints } from './RemainingPoints';

/** Equality permits a tie by clearance. Only a strictly larger deficit needs snookers. */
export function needsPenaltyPoints(frame: FrameState): boolean {
  return Math.abs(frame.scores[0] - frame.scores[1]) > remainingPoints(frame);
}

/** Game policy: no replacement once either side needed snookers, even if this foul closes the gap. */
export function replayBlockedByScore(before: FrameState, after: FrameState): boolean {
  return needsPenaltyPoints(before) || needsPenaltyPoints(after);
}
