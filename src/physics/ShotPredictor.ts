import { PHYSICS_TIMESTEP } from '../constants';
import type { Vec3, SpinParams } from '../types';
import { BallBody } from './BallBody';
import { PhysicsWorld, type PhysicsEvent } from './PhysicsWorld';
import { applyCueSpin } from './SpinPhysics';

export interface ShotPreview {
  approach: Vec3[]; cueAfter: Vec3[]; target: Vec3[];
  contact: Vec3 | null; hitCushion: boolean; targetPotted: boolean;
}

/** Clone live state and use the actual solver. No separate aiming physics. */
export function predictShot(cue: BallBody, balls: BallBody[], direction: Vec3,
  spin: SpinParams, speed: number): ShotPreview {
  const result: ShotPreview = { approach: [], cueAfter: [], target: [],
    contact: null, hitCushion: false, targetPotted: false };
  const length = Math.hypot(direction.x, direction.z);
  if (length < 1e-10) return result;
  const world = new PhysicsWorld();
  const clones = balls.filter(b => b.isOnTable && !b.isPotted).map(b => {
    const clone = new BallBody(b.id, b.type, { x: b.posX, z: b.posZ }, world);
    clone.restoreState(b.getState());
    return clone;
  });
  const simulatedCue = clones.find(b => b.id === cue.id);
  if (!simulatedCue) return result;
  simulatedCue.setVelocity(direction.x / length * speed, 0, direction.z / length * speed);
  applyCueSpin(simulatedCue, spin, direction);
  result.approach.push(simulatedCue.getPosition());
  let firstContact: PhysicsEvent | undefined;
  let target: BallBody | undefined;
  let postTime = 0;
  for (let tick = 0; tick < 960; tick++) {
    world.step(PHYSICS_TIMESTEP);
    const events = world.drainEvents();
    if (!firstContact) {
      firstContact = events.find(e => (e.kind === 'ball' || e.kind === 'cushion')
        && (e.ball === simulatedCue || e.other === simulatedCue));
      if (firstContact) {
        // Ball center at exact contact (event.x/z belongs to event.ball).
        const point = firstContact.ball === simulatedCue
          ? { x: firstContact.x, y: firstContact.y, z: firstContact.z }
          : { x: firstContact.otherX!, y: firstContact.otherY!, z: firstContact.otherZ! };
        result.contact = point;
        result.approach.push(point);
        result.cueAfter.push(point);
        result.hitCushion = firstContact.kind === 'cushion';
        target = firstContact.ball === simulatedCue ? firstContact.other : firstContact.ball;
        if (target) result.target.push(target.getPosition());
      }
    }
    if (tick % 4 === 0 || events.length > 0) {
      (firstContact ? result.cueAfter : result.approach).push(simulatedCue.getPosition());
      if (target && !result.targetPotted) result.target.push(target.getPosition());
    }
    if (target?.isPotted) result.targetPotted = true;
    for (const b of clones) b.clearCollisions();
    if (firstContact) postTime += PHYSICS_TIMESTEP;
    if (postTime >= 0.9 || world.allBallsAtRest(clones)) break;
    if (simulatedCue.isPotted && !target) break;
  }
  const cuePath = firstContact ? result.cueAfter : result.approach;
  cuePath.push(simulatedCue.getPosition());
  world.dispose();
  return result;
}
