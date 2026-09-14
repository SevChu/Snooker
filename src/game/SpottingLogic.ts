import {
  BALL_RADIUS, COLOUR_SPOTS, TABLE_LENGTH, RESPAWN_PRIORITY,
  BAULK_LINE_X, D_CENTER, D_RADIUS, TOUCHING_BALL_TOLERANCE,
} from '../constants';
import { BallType } from '../types';
import type { BallBody } from '../physics/BallBody';

type Position = { x: number; z: number };
type Colour = keyof typeof COLOUR_SPOTS;
// Remain outside the physics engine's touching tolerance, with only a 0.02 mm gap.
const SEPARATION = 2 * BALL_RADIUS + 2 * TOUCHING_BALL_TOLERANCE;
const EPSILON = 1e-10;

/** WPBSA Section 3.7(e–i): own spot, highest vacant spot, nearest legal line position. */
export class SpottingLogic {
  findRespotPosition(ballType: BallType, allBalls: BallBody[]): Position {
    const original = COLOUR_SPOTS[ballType as Colour];
    if (!original) throw new Error(`Cannot spot a non-colour: ${ballType}`);
    if (this.isSpotAvailable(original, allBalls)) return { ...original };
    for (const colour of RESPAWN_PRIORITY) {
      const spot = COLOUR_SPOTS[colour];
      if (this.isSpotAvailable(spot, allBalls)) return { ...spot };
    }

    // The nearest part of the top cushion is straight ahead of the OWN spot.
    // Yellow/green keep their own z coordinate; they do not move to the centre line.
    const forward = this.nearestOnLine(original, allBalls, 1);
    if (forward) return forward;
    if (ballType === BallType.PINK || ballType === BallType.BLACK) {
      const backward = this.nearestOnLine(original, allBalls, -1);
      if (backward) return backward;
    }
    // Not reachable with a legal 22-ball set. Never silently place a ball on another.
    throw new Error(`No legal re-spot position for ${ballType}`);
  }

  /** First return colours with vacant own spots, then resolve occupied spots high to low. */
  respotColours(colours: BallType[], allBalls: BallBody[]): BallBody[] {
    const pending = RESPAWN_PRIORITY.filter(type => colours.includes(type as BallType))
      .flatMap(type => allBalls.filter(ball => ball.type === type && (ball.isPotted || !ball.isOnTable)));
    const restored: BallBody[] = [];
    const ownSpots = pending.filter(ball => this.isSpotAvailable(COLOUR_SPOTS[ball.type as Colour], allBalls));
    for (const ball of ownSpots) {
      const spot = COLOUR_SPOTS[ball.type as Colour];
      ball.respawn(spot.x, spot.z); restored.push(ball);
    }
    for (const ball of pending) {
      if (restored.includes(ball)) continue;
      const spot = this.findRespotPosition(ball.type, allBalls);
      ball.respawn(spot.x, spot.z); restored.push(ball);
    }
    return restored;
  }

  isSpotAvailable(spot: Position, allBalls: BallBody[]): boolean {
    return allBalls.every(ball => !ball.isOnTable || ball.isPotted ||
      Math.hypot(ball.posX - spot.x, ball.posZ - spot.z) >= SEPARATION - EPSILON);
  }

  /** Project exclusion circles onto the search line and skip their merged intervals. */
  private nearestOnLine(original: Position, allBalls: BallBody[], direction: 1 | -1): Position | null {
    const limit = direction === 1 ? TABLE_LENGTH - BALL_RADIUS - original.x : original.x - BALL_RADIUS;
    const blocked: [number, number][] = [];
    for (const ball of allBalls) {
      if (!ball.isOnTable || ball.isPotted) continue;
      const dz = ball.posZ - original.z;
      if (Math.abs(dz) >= SEPARATION) continue;
      const halfWidth = Math.sqrt(SEPARATION ** 2 - dz ** 2);
      const along = direction * (ball.posX - original.x);
      blocked.push([along - halfWidth, along + halfWidth]);
    }
    blocked.sort((a, b) => a[0] - b[0]);
    let distance = 0;
    for (const [start, end] of blocked) {
      if (end < distance) continue;
      if (start > distance) break;
      distance = end + EPSILON;
    }
    if (distance > limit) return null;
    const candidate = { x: original.x + direction * distance, z: original.z };
    return this.isSpotAvailable(candidate, allBalls) ? candidate : null;
  }

  isInDZone(x: number, z: number): boolean {
    return x <= BAULK_LINE_X + 0.001 && Math.hypot(x - D_CENTER.x, z - D_CENTER.z) <= D_RADIUS + 0.001;
  }
}
