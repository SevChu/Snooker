import type { PhysicsEvent } from '../physics/PhysicsWorld';
import type { BallBody } from '../physics/BallBody';
import { BALL_RADIUS } from '../constants';

/** Track actual airborne crossings separately from merely lifting off the cloth. */
export class JumpRule {
  private origin: { x: number; z: number };
  private touching: Set<string>;
  private first: string | null = null;
  private contacts = new Set<string>();
  private cushionAfterContact = false;
  private candidates = new Map<string, BallBody>();
  public foul = false;
  constructor(cue: BallBody, balls: BallBody[]) {
    this.origin = { x: cue.posX, z: cue.posZ };
    this.touching = new Set(balls.filter(b => b !== cue && b.isOnTable &&
      Math.hypot(b.posX - cue.posX, b.posZ - cue.posZ) <= 2 * BALL_RADIUS + 1e-5).map(b => b.id));
  }
  record(event: PhysicsEvent, cue: BallBody): void {
    if (event.kind === 'ball' && (event.ball === cue || event.other === cue)) {
      const other = event.ball === cue ? event.other! : event.ball;
      if (!this.touching.has(other.id)) {
        this.first ??= other.id; this.contacts.add(other.id);
      }
    } else if (event.kind === 'cushion' && event.ball === cue && this.first) {
      this.cushionAfterContact = true;
    } else if (event.kind === 'over' && event.other) {
      if (this.first && event.other.id !== this.first) return; // Section 2.20(a)
      if (event.other.id === this.first && (this.cushionAfterContact || this.contacts.size > 1)) return; // 2.20(c)
      this.candidates.set(event.other.id, event.other);
    } else if (event.kind === 'slate' && event.ball === cue) {
      this.finishFlight(event.x, event.z, event.objectPositions);
      this.origin = { x: event.x, z: event.z };
    } else if ((event.kind === 'off' || event.kind === 'pot') && event.ball === cue) {
      if (this.candidates.size) this.foul = true;
    }
  }
  private finishFlight(x: number, z: number, positions?: PhysicsEvent['objectPositions']): void {
    for (const [id, target] of this.candidates) {
      const point = positions?.[id] ?? { x: target.posX, z: target.posZ };
      const nearSide = (x - point.x) * (this.origin.x - point.x)
        + (z - point.z) * (this.origin.z - point.z) >= 0;
      if (!(this.first === id && nearSide && !this.touching.has(id))) this.foul = true; // 2.20(b)
    }
    this.candidates.clear();
  }
}
