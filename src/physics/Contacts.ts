import {
  BALL_RADIUS as R, BALL_MASS as M, BALL_INERTIA as I,
  RESTITUTION_BALL, RESTITUTION_CUSHION, FRICTION_BALL, FRICTION_CUSHION,
  RESTITUTION_SLATE, FRICTION_TABLE_SLIDING, LANDING_SLEEP_SPEED,
} from '../constants';
import type { BallBody } from './BallBody';

function tangentImpulse(x: number, y: number, z: number, mass: number, limit: number): number[] {
  const length = Math.hypot(x, y, z);
  const scale = length > 1e-12 ? -Math.min(length / mass, limit) / length : 0;
  return [x * scale, y * scale, z * scale];
}

/** Three-dimensional equal/opposite impulses at two spherical contacts. */
export function collideBalls(a: BallBody, b: BallBody, nx: number, nz: number, ny = 0): number {
  const vx = b.velX - a.velX, vy = b.velY - a.velY, vz = b.velZ - a.velZ;
  const closing = -(vx * nx + vy * ny + vz * nz);
  if (closing <= 1e-10) return 0;
  const jn = (1 + RESTITUTION_BALL) * closing * M / 2;
  const wx = a.angularVelX + b.angularVelX, wy = a.angularVelY + b.angularVelY;
  const wz = a.angularVelZ + b.angularVelZ;
  const tx = vx + closing * nx - R * (wy * nz - wz * ny);
  const ty = vy + closing * ny - R * (wz * nx - wx * nz);
  const tz = vz + closing * nz - R * (wx * ny - wy * nx);
  const [jxT, jyT, jzT] = tangentImpulse(tx, ty, tz, 2 / M + 2 * R * R / I, FRICTION_BALL * jn);
  const jx = jn * nx + jxT, jy = jn * ny + jyT, jz = jn * nz + jzT;
  a.velX -= jx / M; a.velY -= jy / M; a.velZ -= jz / M;
  b.velX += jx / M; b.velY += jy / M; b.velZ += jz / M;
  const dwx = -R * (ny * jz - nz * jy) / I;
  const dwy = -R * (nz * jx - nx * jz) / I;
  const dwz = -R * (nx * jy - ny * jx) / I;
  a.angularVelX += dwx; b.angularVelX += dwx;
  a.angularVelY += dwy; b.angularVelY += dwy;
  a.angularVelZ += dwz; b.angularVelZ += dwz;
  return closing;
}

export function collideSurface(ball: BallBody, nx: number, ny: number, nz: number,
  restitution: number, friction: number): number {
  const vn = ball.velX * nx + ball.velY * ny + ball.velZ * nz;
  if (vn >= -1e-10) return 0;
  const jn = -(1 + restitution) * vn * M;
  const tx = ball.velX - vn * nx - R * (ball.angularVelY * nz - ball.angularVelZ * ny);
  const ty = ball.velY - vn * ny - R * (ball.angularVelZ * nx - ball.angularVelX * nz);
  const tz = ball.velZ - vn * nz - R * (ball.angularVelX * ny - ball.angularVelY * nx);
  const [jxT, jyT, jzT] = tangentImpulse(tx, ty, tz, 1 / M + R * R / I, friction * jn);
  const jx = jn * nx + jxT, jy = jn * ny + jyT, jz = jn * nz + jzT;
  ball.velX += jx / M; ball.velY += jy / M; ball.velZ += jz / M;
  ball.angularVelX -= R * (ny * jz - nz * jy) / I;
  ball.angularVelY -= R * (nz * jx - nx * jz) / I;
  ball.angularVelZ -= R * (nx * jy - ny * jx) / I;
  return -vn;
}

export function collideCushion(ball: BallBody, nx: number, nz: number, ny = 0): number {
  return collideSurface(ball, nx, ny, nz, RESTITUTION_CUSHION, FRICTION_CUSHION);
}

export function collideSlate(ball: BallBody): number {
  const speed = -ball.velY;
  const impact = collideSurface(ball, 0, 1, 0,
    speed < LANDING_SLEEP_SPEED ? 0 : RESTITUTION_SLATE, FRICTION_TABLE_SLIDING);
  if (Math.abs(ball.velY) < LANDING_SLEEP_SPEED) ball.velY = 0;
  return impact;
}
