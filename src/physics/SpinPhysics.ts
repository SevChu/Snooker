import {
  BALL_RADIUS as R, FRICTION_TABLE_SLIDING, FRICTION_ROLLING, GRAVITY,
  SPIN_DECELERATION,
} from '../constants';
import type { SpinParams, Vec3 } from '../types';
import type { BallBody } from './BallBody';
import type { PhysicsWorld } from './PhysicsWorld';
import { cuePose } from './CueMechanics';

/** Three-dimensional cue impulse: angular velocity = tip offset × impulse / inertia. */
export function applyCueSpin(ball: BallBody, spin: SpinParams, direction: Vec3): void {
  const length = Math.hypot(direction.x, direction.z);
  if (length < 1e-10) return;
  const speed = Math.hypot(ball.velX, ball.velZ);
  const pose = cuePose(ball.getPosition(), direction, spin);
  const r = { x: pose.contact.x - ball.posX, y: pose.contact.y - ball.posY, z: pose.contact.z - ball.posZ };
  const v = { x: pose.direction.x * speed, y: pose.direction.y * speed, z: pose.direction.z * speed };
  ball.setVelocity(v.x, v.y, v.z);
  const factor = 2.5 / (R * R);
  ball.setAngularVelocity((r.y * v.z - r.z * v.y) * factor,
    (r.z * v.x - r.x * v.z) * factor, (r.x * v.y - r.y * v.x) * factor);
}

/** Cloth impulse, split at slip→roll so friction cannot overshoot/reverse slip. */
export function applyCloth(ball: BallBody, dt: number): void {
  if (ball.posY > R + 1e-7 || ball.posY < R - 1e-7 || ball.velY !== 0 || ball.pocketIndex !== null) return;
  const ux = ball.velX + R * ball.angularVelZ;
  const uz = ball.velZ - R * ball.angularVelX;
  const slip = Math.hypot(ux, uz);
  let rollingTime = dt;
  if (slip > 1e-10) {
    const a = FRICTION_TABLE_SLIDING * Math.abs(GRAVITY);
    const slideTime = Math.min(dt, slip / (3.5 * a));
    const dvx = -a * slideTime * ux / slip;
    const dvz = -a * slideTime * uz / slip;
    ball.velX += dvx; ball.velZ += dvz;
    ball.angularVelX -= 2.5 * dvz / R;
    ball.angularVelZ += 2.5 * dvx / R;
    rollingTime -= slideTime;
  }
  if (rollingTime > 0) {
    const speed = Math.hypot(ball.velX, ball.velZ);
    const next = Math.max(0, speed - FRICTION_ROLLING * Math.abs(GRAVITY) * rollingTime);
    if (speed > 0) { ball.velX *= next / speed; ball.velZ *= next / speed; }
    ball.angularVelX = ball.velZ / R;
    ball.angularVelZ = -ball.velX / R;
  }
  ball.angularVelY = Math.sign(ball.angularVelY)
    * Math.max(0, Math.abs(ball.angularVelY) - SPIN_DECELERATION * dt);
}

export class SpinPhysics {
  constructor(private physicsWorld: PhysicsWorld) {}
  applySpin(ball: BallBody, spin: SpinParams, direction: Vec3): void {
    applyCueSpin(ball, spin, direction);
  }
  clearAll(): void {
    for (const ball of this.physicsWorld.getBalls()) {
      ball.setAngularVelocity(0, 0, 0);
      ball.setVelocity(0, 0, 0);
    }
  }
}
