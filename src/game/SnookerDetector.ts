import { BALL_RADIUS as R, D_CENTER, D_RADIUS, BAULK_LINE_X } from '../constants';
import { BallType, type Vec3 } from '../types';
import type { BallBody } from '../physics/BallBody';
type Point = { x: number; z: number };
type Line = { x: number; z: number; c: number };
const diameter = 2 * R;

function blockedRay(from: Point, dx: number, dz: number, length: number, b: BallBody): boolean {
  const x = b.posX - from.x, z = b.posZ - from.z;
  const projection = x * dx + z * dz;
  const perpendicular2 = x * x + z * z - projection * projection;
  if (perpendicular2 > diameter * diameter + 1e-10) return false;
  const offset = Math.sqrt(Math.max(0, diameter * diameter - perpendicular2));
  return projection + offset > 1e-8 && projection - offset < length - 1e-8;
}

export class SnookerDetector {
  /** The rules require BOTH extreme edges clear of balls NOT on. Cushions are ignored. */
  isSnookered(cue: BallBody, targetTypes: BallType[], balls: BallBody[]): boolean {
    return this.isSnookeredFrom(cue.getPosition(), cue.id, targetTypes, balls);
  }
  isSnookeredFrom(from: Point, cueId: string, targetTypes: BallType[], balls: BallBody[]): boolean {
    const active = balls.filter(b => b.id !== cueId && b.isOnTable && !b.isPotted);
    const blockers = active.filter(b => !targetTypes.includes(b.type));
    const targets = active.filter(b => targetTypes.includes(b.type));
    if (targets.length === 0) return false;
    return targets.every(target => !this.bothEdgesClear(from, target, blockers));
  }
  bothEdgesClear(from: Point, target: BallBody, blockers: BallBody[]): boolean {
    const x = target.posX - from.x, z = target.posZ - from.z, d = Math.hypot(x, z);
    if (d < diameter - 1e-8) return false;
    const sine = Math.min(1, diameter / d), cosine = Math.sqrt(Math.max(0, 1 - sine * sine));
    const length = Math.sqrt(Math.max(0, d * d - diameter * diameter));
    for (const side of [-1, 1]) {
      const dx = x / d * cosine - side * z / d * sine;
      const dz = z / d * cosine + side * x / d * sine;
      if (blockers.some(b => blockedRay(from, dx, dz, length, b))) return false;
    }
    return true;
  }

  /** In-hand: look for a legal witness ANYWHERE in D, not at the chosen placement.
   * Visibility changes on common tangents of the expanded target/blocker circles.
   * Test the arrangement's vertices plus adjacent cells, including the D boundary
   * and occupied-position circles. No coarse grid that can miss a narrow corridor.
   */
  isSnookeredInD(cueId: string, types: BallType[], balls: BallBody[]): boolean {
    const active = balls.filter(b => b.id !== cueId && b.isOnTable && !b.isPotted);
    const targets = active.filter(b => types.includes(b.type));
    const blockers = active.filter(b => !types.includes(b.type));
    if (!targets.length || !blockers.length) return false;
    const visible = (p: Point) => p.x <= BAULK_LINE_X + 1e-9
      && Math.hypot(p.x - D_CENTER.x, p.z - D_CENTER.z) <= D_RADIUS + 1e-9
      && active.every(b => Math.hypot(p.x - b.posX, p.z - b.posZ) >= diameter - 1e-9)
      && !this.isSnookeredFrom(p, cueId, types, balls);
    const witness = (p: Point) => {
      if (visible(p)) return true;
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        if (visible({ x: p.x + 1e-6 * Math.cos(a), z: p.z + 1e-6 * Math.sin(a) })) return true;
      }
      return false;
    };
    for (const p of [D_CENTER, { x: D_CENTER.x - D_RADIUS, z: D_CENTER.z },
      { x: D_CENTER.x, z: D_CENTER.z - D_RADIUS }, { x: D_CENTER.x, z: D_CENTER.z + D_RADIUS }])
      if (witness(p)) return false;
    const lines: Line[] = [{ x: 1, z: 0, c: BAULK_LINE_X }];
    for (const target of targets) for (const blocker of blockers) {
      const dx = blocker.posX - target.posX, dz = blocker.posZ - target.posZ, d = Math.hypot(dx, dz);
      if (d < 1e-10) continue;
      for (const sign1 of [-1, 1]) for (const sign2 of [-1, 1]) {
        const q = diameter * (sign1 - sign2) / d;
        if (Math.abs(q) > 1) continue;
        const h = Math.sqrt(Math.max(0, 1 - q * q));
        for (const side of [-1, 1]) {
          const x = dx / d * q - dz / d * h * side;
          const z = dz / d * q + dx / d * h * side;
          const c = x * target.posX + z * target.posZ + diameter * sign1;
          if (Math.abs(x * D_CENTER.x + z * D_CENTER.z - c) <= D_RADIUS + 1e-8) lines.push({ x, z, c });
        }
      }
    }
    const circles = [{ x: D_CENTER.x, z: D_CENTER.z, r: D_RADIUS },
      ...active.filter(b => Math.hypot(b.posX - D_CENTER.x, b.posZ - D_CENTER.z) < D_RADIUS + diameter)
        .map(b => ({ x: b.posX, z: b.posZ, r: diameter }))];
    for (let i = 0; i < lines.length; i++) {
      const a = lines[i];
      for (const circle of circles) {
        const d = a.c - a.x * circle.x - a.z * circle.z;
        if (Math.abs(d) > circle.r) continue;
        const h = Math.sqrt(Math.max(0, circle.r ** 2 - d ** 2));
        for (const side of [-1, 1]) if (witness({
          x: circle.x + a.x * d - a.z * h * side, z: circle.z + a.z * d + a.x * h * side,
        })) return false;
      }
      for (let j = i + 1; j < lines.length; j++) {
        const b = lines[j], det = a.x * b.z - a.z * b.x;
        if (Math.abs(det) < 1e-10) continue;
        const p = { x: (a.c * b.z - a.z * b.c) / det, z: (a.x * b.c - a.c * b.x) / det };
        if (p.x <= BAULK_LINE_X + 1e-5 && Math.hypot(p.x - D_CENTER.x, p.z - D_CENTER.z) <= D_RADIUS + 1e-5 && witness(p)) return false;
      }
    }
    for (let i = 0; i < circles.length; i++) for (let j = i + 1; j < circles.length; j++) {
      const a = circles[i], b = circles[j], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      if (d < 1e-10 || d > a.r + b.r || d < Math.abs(a.r - b.r)) continue;
      const q = (a.r ** 2 - b.r ** 2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, a.r ** 2 - q * q));
      for (const side of [-1, 1]) if (witness({
        x: a.x + dx / d * q - side * dz / d * h, z: a.z + dz / d * q + side * dx / d * h,
      })) return false;
    }
    return true;
  }

  hasDirectLineOfSight(from: Vec3, to: Vec3, balls: BallBody[], ...excludeIds: string[]): boolean {
    const dx = to.x - from.x, dz = to.z - from.z, d = Math.hypot(dx, dz);
    if (d < diameter) return true;
    return !balls.some(b => b.isOnTable && !b.isPotted && !excludeIds.includes(b.id)
      && blockedRay(from, dx / d, dz / d, d - diameter, b));
  }
  isBallSnookered(cue: BallBody, target: BallBody, balls: BallBody[]): boolean {
    return !this.bothEdgesClear(cue.getPosition(), target,
      balls.filter(b => b !== cue && b !== target && b.type !== target.type && b.isOnTable && !b.isPotted));
  }
}
