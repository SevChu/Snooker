import { BallType, GamePhase, ballValue, isColour, type FrameState } from '../types';

/** Maximum potting points from the settled position, excluding future fouls. */
export function remainingPoints(frame: FrameState): number {
  const objects = frame.balls.filter(b => b.isOnTable && !b.isPotted && b.type !== BallType.CUE);
  const reds = objects.filter(b => b.type === BallType.RED).length;
  const colours = objects.filter(b => isColour(b.type)).map(b => ballValue(b.type));
  const clearance = colours.reduce((sum, value) => sum + value, 0);
  const highest = Math.max(0, ...colours);
  const redsPhase = frame.phase === GamePhase.REDS;
  let points = clearance + reds * (1 + highest);
  // After any red (including the last), a colour is still available before clearance.
  if (redsPhase && frame.lastPottedWasRed) points += highest;
  if (frame.freeBallAvailable || frame.nominatedFreeBall) {
    if (redsPhase && !frame.lastPottedWasRed && reds > 0 && colours.length) points += 1 + highest;
    else if (!reds && !frame.lastPottedWasRed && colours.length > 1) points += Math.min(...colours);
  }
  return points;
}
