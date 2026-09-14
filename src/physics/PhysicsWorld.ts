import {
  BALL_RADIUS as R, CUSHION_JAW_RADIUS, CUSHION_NOSE_HEIGHT, PHYSICS_TIMESTEP,
  PHYSICS_MAX_ITERATIONS, GRAVITY, TABLE_LENGTH as L, TABLE_WIDTH as W,
  FRAME_WIDTH, RAIL_TOP_HEIGHT, TOUCHING_BALL_TOLERANCE,
} from '../constants';
import type { BallBody } from './BallBody';
import { applyCloth } from './SpinPhysics';
import { collideBalls, collideCushion, collideSlate } from './Contacts';
import { CUSHIONS, POCKETS, pocketAt, pocketEntryTime, type CushionSegment } from './TableGeometry';

export type PhysicsEvent = {
  kind: 'ball' | 'cushion' | 'pot' | 'slate' | 'fall' | 'off' | 'over';
  time: number; ball: BallBody; other?: BallBody; speed: number;
  x: number; y: number; z: number; otherX?: number; otherY?: number; otherZ?: number;
  objectPositions?: Record<string, { x: number; z: number }>;
  /** Touching objects receiving an impulse before the cue separates. */
  touchingPushIds?: string[];
};
type Hit = { time: number; ball: BallBody; other?: BallBody;
  kind: PhysicsEvent['kind']; nx: number; ny: number; nz: number; surface?: CushionSegment; pocket?: number };
const EPS = 1e-10;
const SINK_DEPTH = 0.075;

/** Stable quadratic root; gravity is split symmetrically around every fixed tick. */
function sphereTime(px: number, py: number, pz: number, vx: number, vy: number, vz: number,
  radius: number, limit: number): number | null {
  const c = px * px + py * py + pz * pz - radius * radius;
  const dot = px * vx + py * vy + pz * vz;
  if (c <= EPS && dot < -1e-9) return 0;
  const a = vx * vx + vy * vy + vz * vz;
  if (a < 1e-16 || dot >= -1e-9) return null;
  const disc = dot * dot - a * c;
  if (disc <= 0) return null;
  const t = Math.max(0, c / (-dot + Math.sqrt(disc)));
  return t <= limit + EPS ? Math.min(t, limit) : null;
}
const onBed = (x: number, z: number) => x >= 0 && x <= L && z >= 0 && z <= W;

export class PhysicsWorld {
  private balls: BallBody[] = [];
  private accumulator = 0;
  private elapsed = 0;
  private events: PhysicsEvent[] = [];
  private overPairs = new Set<string>();
  private correctionNeeded = true;
  private initialCueContacts = new Map<string, BallBody>();
  public collisionBudgetExceeded = 0;

  addBall(ball: BallBody): void { this.balls.push(ball); this.correctionNeeded = true; }
  removeBall(ball: BallBody): void { this.balls = this.balls.filter(b => b !== ball); }
  getBalls(): BallBody[] { return this.balls; }
  removeAllBalls(): void {
    this.balls = []; this.resetShot(); this.elapsed = 0; this.collisionBudgetExceeded = 0;
  }
  resetShot(): void {
    this.accumulator = 0; this.events = []; this.overPairs.clear(); this.correctionNeeded = true;
    this.initialCueContacts.clear();
    const cue = this.balls.find(b => b.isCueBall && b.isOnTable && !b.isPotted);
    if (cue) for (const b of this.balls) {
      if (b !== cue && b.isOnTable && !b.isPotted &&
        Math.hypot(b.posX - cue.posX, b.posY - cue.posY, b.posZ - cue.posZ) <= 2 * R + TOUCHING_BALL_TOLERANCE)
        this.initialCueContacts.set(b.id, b);
    }
  }
  private clearSeparatedContacts(): void {
    if (!this.initialCueContacts.size) return;
    const cue = this.balls.find(b => b.isCueBall)!;
    for (const [id, b] of this.initialCueContacts) {
      if (!b.isOnTable || !cue.isOnTable || b.isPotted ||
        Math.hypot(b.posX - cue.posX, b.posY - cue.posY, b.posZ - cue.posZ) > 2 * R + TOUCHING_BALL_TOLERANCE)
        this.initialCueContacts.delete(id);
    }
  }
  drainEvents(): PhysicsEvent[] { const events = this.events; this.events = []; return events; }
  private emit(kind: PhysicsEvent['kind'], b: BallBody, speed: number, time: number, other?: BallBody): void {
    this.events.push({ kind, ball: b, other, speed, time, x: b.posX, y: b.posY, z: b.posZ,
      touchingPushIds: kind === 'ball' && speed > 1e-10
        ? [b, other].filter((ball): ball is BallBody => !!ball && this.initialCueContacts.has(ball.id)).map(ball => ball.id)
        : undefined,
      otherX: other?.posX, otherY: other?.posY, otherZ: other?.posZ,
      objectPositions: kind === 'slate' && b.isCueBall
        ? Object.fromEntries(this.balls.map(ball => [ball.id, { x: ball.posX, z: ball.posZ }])) : undefined });
  }
  step(frameDt: number): void {
    if (!Number.isFinite(frameDt) || frameDt <= 0) return;
    this.accumulator += Math.min(frameDt, PHYSICS_TIMESTEP * PHYSICS_MAX_ITERATIONS);
    let steps = 0;
    while (this.accumulator + 1e-12 >= PHYSICS_TIMESTEP && steps++ < PHYSICS_MAX_ITERATIONS) {
      this.substep(PHYSICS_TIMESTEP);
      this.accumulator = Math.max(0, this.accumulator - PHYSICS_TIMESTEP);
    }
  }

  private forces(b: BallBody, dt: number): void {
    if (b.posY > R + 1e-7 || b.velY !== 0 || b.pocketIndex !== null) b.velY += GRAVITY * dt;
    else applyCloth(b, dt);
  }

  private substep(dt: number): void {
    const active = this.balls.filter(b => b.isOnTable && !b.isPotted);
    for (const b of active) {
      if (b.pocketIndex === null && b.posY <= R + 1e-8 && b.posY >= R - 1e-7 && b.velY < 0 && pocketAt(b.posX, b.posZ) === null) {
        const impact = collideSlate(b);
        this.emit('slate', b, impact, this.elapsed);
      }
      this.forces(b, dt / 2);
    }
    if (this.correctionNeeded) { this.separateOverlaps(active); this.correctionNeeded = false; }
    let remaining = dt, count = 0;
    while (remaining > 1e-12) {
      const hit = this.firstHit(active, remaining);
      const travel = hit?.time ?? remaining;
      const now = this.elapsed + dt - remaining;
      this.detectOverflight(active, travel, now);
      for (const b of active) {
        if (!b.isOnTable) continue;
        if (b.pocketIndex !== null) {
          // Committed pocketing is a one-way sink animation. No jaw, slate, ball
          // or leather response can throw an already captured ball back out.
          const pocket = POCKETS[b.pocketIndex], decay = Math.exp(-12 * travel);
          b.posX = pocket.x + (b.posX - pocket.x) * decay;
          b.posZ = pocket.z + (b.posZ - pocket.z) * decay;
        } else { b.posX += b.velX * travel; b.posZ += b.velZ * travel; }
        b.posY += b.velY * travel;
        b.integrateOrientation(travel);
      }
      remaining -= travel;
      // Observe departure at every collision boundary, independent of render FPS.
      // A later cushion return or cannon is not an initial touching-ball push.
      this.clearSeparatedContacts();
      if (!hit) break;
      const { ball, other, nx, ny, nz, kind, surface } = hit;
      if (kind === 'ball' || kind === 'cushion') this.correctionNeeded = true;
      let speed = Math.hypot(ball.velX, ball.velY, ball.velZ);
      if (kind === 'ball' && other) {
        speed = collideBalls(ball, other, nx, nz, ny);
        ball.collisions.push(other.id); other.collisions.push(ball.id);
      } else if (kind === 'cushion') {
        speed = collideCushion(ball, nx, nz, ny);
      } else if (kind === 'slate') {
        ball.posY = R; ball.pocketIndex = null;
        speed = collideSlate(ball);
        if (ball.isCueBall) this.overPairs.clear();
      } else if (kind === 'fall') {
        ball.pocketIndex = hit.pocket!;
        ball.velX = 0; ball.velZ = 0;
        ball.velY = Math.min(0, ball.velY);
      } else if (kind === 'off') {
        ball.isOnTable = false; ball.setVelocity(0, 0, 0); ball.setAngularVelocity(0, 0, 0);
      } else { ball.markPotted(); }
      this.emit(kind, ball, speed, this.elapsed + dt - remaining, other);
      if (++count >= 512) { this.collisionBudgetExceeded++; break; }
    }
    for (const b of active) if (b.isOnTable) {
      this.forces(b, dt / 2);
      if (b.posY < -R && b.pocketIndex === null) {
        b.isOnTable = false; b.setVelocity(0, 0, 0); b.setAngularVelocity(0, 0, 0);
        this.emit('off', b, 0, this.elapsed + dt);
      }
    }
    this.elapsed += dt;
  }

  private firstHit(balls: BallBody[], limit: number): Hit | null {
    let best: Hit | null = null, horizon = limit;
    const accept = (time: number | null, ball: BallBody, kind: Hit['kind'],
      nx = 0, ny = 0, nz = 0, other?: BallBody, surface?: CushionSegment, pocket?: number) => {
      if (time === null || time > horizon || (best && time >= horizon)) return;
      best = { time, ball, kind, nx, ny, nz, other, surface, pocket }; horizon = time;
    };
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      if (!a.isOnTable) continue;
      if (a.pocketIndex !== null) {
        if (a.posY <= -SINK_DEPTH) accept(0, a, 'pot');
        else if (a.velY < 0) accept((-SINK_DEPTH - a.posY) / a.velY, a, 'pot');
        continue;
      }
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j];
        if (!b.isOnTable || b.pocketIndex !== null) continue;
        if (a.velX === b.velX && a.velY === b.velY && a.velZ === b.velZ) continue;
        const dx = b.posX - a.posX, dy = b.posY - a.posY, dz = b.posZ - a.posZ;
        const vx = b.velX - a.velX, vy = b.velY - a.velY, vz = b.velZ - a.velZ;
        const time = sphereTime(dx, dy, dz, vx, vy, vz, 2 * R, horizon);
        if (time !== null) {
          const x = dx + vx * time, y = dy + vy * time, z = dz + vz * time, d = Math.hypot(x, y, z);
          if (d > 1e-12) accept(time, a, 'ball', x / d, y / d, z / d, b);
        }
      }
      const moving = a.velX !== 0 || a.velY !== 0 || a.velZ !== 0;
      if (!moving && pocketAt(a.posX, a.posZ) === null) continue;
      const endX = a.posX + a.velX * horizon, endZ = a.posZ + a.velZ * horizon;
      if (moving) for (const s of CUSHIONS) {
        if (s.rim || s.leather) continue; // Decorative pocket interior, never a rejecting collider.
        const radius = R + (s.rim ? 0.001 : CUSHION_JAW_RADIUS);
        if (Math.max(a.posX, endX) < Math.min(s.ax, s.bx) - radius ||
          Math.min(a.posX, endX) > Math.max(s.ax, s.bx) + radius ||
          Math.max(a.posZ, endZ) < Math.min(s.az, s.bz) - radius ||
          Math.min(a.posZ, endZ) > Math.max(s.az, s.bz) + radius) continue;
        const height = s.leather ? Math.max(-0.08, Math.min(CUSHION_NOSE_HEIGHT, a.posY))
          : s.rim ? -0.001 : CUSHION_NOSE_HEIGHT;
        const dy = a.posY - height;
        const contactVy = s.leather && a.posY <= CUSHION_NOSE_HEIGHT && a.posY >= -0.08 ? 0 : a.velY;
        const dx = s.bx - s.ax, dz = s.bz - s.az, length = Math.hypot(dx, dz);
        const tx = dx / length, tz = dz / length, nx = -tz, nz = tx;
        const distance = (a.posX - s.ax) * nx + (a.posZ - s.az) * nz;
        const velocity = a.velX * nx + a.velZ * nz;
        const time = sphereTime(distance, dy, 0, velocity, contactVy, 0, radius, horizon);
        if (time !== null) {
          const along = (a.posX + a.velX * time - s.ax) * tx + (a.posZ + a.velZ * time - s.az) * tz;
          const horizontal = distance + velocity * time, vertical = dy + contactVy * time;
          const d = Math.hypot(horizontal, vertical);
          if (along >= 0 && along <= length && d > 1e-12)
            accept(time, a, 'cushion', nx * horizontal / d, vertical / d, nz * horizontal / d, undefined, s);
        }
        for (const [x, z] of [[s.ax, s.az], [s.bx, s.bz]]) {
          const t = sphereTime(a.posX - x, dy, a.posZ - z, a.velX, contactVy, a.velZ, radius, horizon);
          if (t === null) continue;
          const hx = a.posX + a.velX * t - x, hy = dy + contactVy * t, hz = a.posZ + a.velZ * t - z;
          const d = Math.hypot(hx, hy, hz);
          if (d > 1e-12) accept(t, a, 'cushion', hx / d, hy / d, hz / d, undefined, s);
        }
      }
      if (a.velY < 0) {
        const t = (R - a.posY) / a.velY;
        if (t >= -EPS && t <= horizon) {
          const time = Math.max(0, t), x = a.posX + a.velX * time, z = a.posZ + a.velZ * time;
          const pocket = pocketAt(x, z);
          if (pocket !== null && a.pocketIndex === null) accept(time, a, 'fall', 0, 0, 0, undefined, undefined, pocket);
          else if (pocket === null && onBed(x, z)) accept(time, a, 'slate');
        }
        // A ball landing on the wood is off the playing area, not a pocketed ball.
        const railTime = (RAIL_TOP_HEIGHT + R - a.posY) / a.velY;
        if (railTime >= 0 && railTime <= horizon) {
          const x = a.posX + a.velX * railTime, z = a.posZ + a.velZ * railTime;
          if (!onBed(x, z) && pocketAt(x, z) === null && a.pocketIndex === null) accept(railTime, a, 'off');
        }
      }
      if (a.posY <= R + 1e-7 && a.pocketIndex === null) for (let p = 0; p < POCKETS.length; p++) {
        const time = pocketEntryTime(POCKETS[p], a.posX, a.posZ, a.velX, a.velZ, horizon);
        accept(time, a, 'fall', 0, 0, 0, undefined, undefined, p);
      }
      if (a.posX < -FRAME_WIDTH || a.posX > L + FRAME_WIDTH || a.posZ < -FRAME_WIDTH || a.posZ > W + FRAME_WIDTH)
        accept(0, a, 'off');
    }
    return best;
  }

  private detectOverflight(balls: BallBody[], time: number, now: number): void {
    const cue = balls.find(b => b.isCueBall && b.isOnTable);
    if (!cue || cue.pocketIndex !== null || cue.posY <= R + 1e-5 || time <= 0) return;
    for (const b of balls) {
      if (b === cue || !b.isOnTable || b.pocketIndex !== null || this.overPairs.has(b.id)) continue;
      const x = cue.posX - b.posX, z = cue.posZ - b.posZ;
      const vx = cue.velX - b.velX, vz = cue.velZ - b.velZ;
      const denom = vx * vx + vz * vz;
      const t = denom > 1e-12 ? Math.max(0, Math.min(time, -(x * vx + z * vz) / denom)) : 0;
      const dx = x + vx * t, dz = z + vz * t, dy = cue.posY - b.posY + (cue.velY - b.velY) * t;
      if (dy > 0 && dx * dx + dz * dz < (2 * R) ** 2 - 1e-8 &&
        dx * dx + dz * dz + dy * dy > (2 * R) ** 2 + 1e-8) {
        this.overPairs.add(b.id); this.emit('over', cue, 0, now + t, b);
      }
    }
  }

  private separateOverlaps(balls: BallBody[]): void {
    balls = balls.filter(b => b.isOnTable && b.pocketIndex === null);
    for (let iteration = 0; iteration < 8; iteration++) {
      let corrected = false;
      for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) {
        const a = balls[i], b = balls[j];
        const dx = b.posX - a.posX, dy = b.posY - a.posY, dz = b.posZ - a.posZ, distance = Math.hypot(dx, dy, dz);
        if (distance >= 2 * R - 1e-8) continue;
        const nx = distance > 1e-12 ? dx / distance : 1, ny = distance > 1e-12 ? dy / distance : 0;
        const nz = distance > 1e-12 ? dz / distance : 0, push = (2 * R - distance + 1e-10) / 2;
        a.posX -= nx * push; a.posY -= ny * push; a.posZ -= nz * push;
        b.posX += nx * push; b.posY += ny * push; b.posZ += nz * push; corrected = true;
      }
      for (const b of balls) {
        if (b.posY < R && pocketAt(b.posX, b.posZ) === null && b.pocketIndex === null && onBed(b.posX, b.posZ)) b.posY = R;
        for (const s of CUSHIONS) {
          if (s.rim || s.leather) continue;
          const radius = R + CUSHION_JAW_RADIUS;
          if (b.posX < Math.min(s.ax, s.bx) - radius || b.posX > Math.max(s.ax, s.bx) + radius ||
            b.posZ < Math.min(s.az, s.bz) - radius || b.posZ > Math.max(s.az, s.bz) + radius) continue;
          const dx = s.bx - s.ax, dz = s.bz - s.az;
          const t = Math.max(0, Math.min(1, ((b.posX - s.ax) * dx + (b.posZ - s.az) * dz) / (dx * dx + dz * dz)));
          const height = s.leather ? Math.max(-0.08, Math.min(CUSHION_NOSE_HEIGHT, b.posY)) : CUSHION_NOSE_HEIGHT;
          const x = b.posX - s.ax - t * dx, y = b.posY - height, z = b.posZ - s.az - t * dz;
          const distance = Math.hypot(x, y, z);
          if (distance > 1e-12 && distance < radius - 1e-8) {
            // Grounded balls recover horizontally so the constraint does not sink them into slate.
            const horizontal = Math.hypot(x, z), required = Math.sqrt(Math.max(0, radius * radius - y * y));
            if (horizontal > 1e-12) { b.posX += x / horizontal * (required - horizontal); b.posZ += z / horizontal * (required - horizontal); }
            corrected = true;
          }
        }
      }
      if (!corrected) break;
    }
  }
  allBallsAtRest(balls: BallBody[]): boolean { return balls.every(b => !b.isOnTable || b.isPotted || b.isAtRest()); }
  dispose(): void { this.removeAllBalls(); }
}
