import { BALL_RADIUS as R, MAX_TIP_OFFSET, MAX_CUE_ELEVATION, CUE_LENGTH,
  TABLE_LENGTH as L, TABLE_WIDTH as W, FRAME_WIDTH, RAIL_TOP_HEIGHT } from '../constants';
import type { BallBody } from './BallBody';
import type { SpinParams, Vec3 } from '../types';

export type BridgeKind = 'hand' | 'rest' | 'spider';
export interface CuePose { contact: Vec3; backward: Vec3; direction: Vec3 }
export interface CueAccess { allowed: boolean; reason: string; minimumElevation: number; pose: CuePose }

export function cuePose(center: Vec3, aim: Vec3, spin: SpinParams): CuePose {
  const length = Math.hypot(aim.x, aim.z) || 1, dx = aim.x / length, dz = aim.z / length;
  const angle = Math.max(0, Math.min(MAX_CUE_ELEVATION, spin.elevation ?? 0)) * Math.PI / 180;
  const c = Math.cos(angle), s = Math.sin(angle);
  const direction = { x: dx * c, y: -s, z: dz * c };
  const scale = Math.max(1, Math.hypot(spin.side, spin.vertical));
  const side = spin.side / scale * MAX_TIP_OFFSET * R;
  const top = spin.vertical / scale * MAX_TIP_OFFSET * R;
  const along = -Math.sqrt(R * R - side * side - top * top);
  return {
    direction, backward: { x: -direction.x, y: -direction.y, z: -direction.z },
    contact: { x: center.x - dz * side + dx * s * top + along * direction.x,
      y: center.y + c * top + along * direction.y,
      z: center.z + dx * side + dz * s * top + along * direction.z },
  };
}

export function bridgePoint(pose: CuePose): Vec3 {
  return { x: pose.contact.x + pose.backward.x * 0.25,
    y: pose.contact.y + pose.backward.y * 0.25,
    z: pose.contact.z + pose.backward.z * 0.25 };
}

function obstruction(cue: BallBody, balls: BallBody[], pose: CuePose, bridge: BridgeKind): string {
  const { contact: p, backward: d } = pose;
  for (const b of balls) {
    if (b === cue || !b.isOnTable || b.isPotted) continue;
    const t = Math.max(0, Math.min(CUE_LENGTH, (b.posX - p.x) * d.x
      + (b.posY - p.y) * d.y + (b.posZ - p.z) * d.z));
    const radius = 0.005 + 0.009 * t / CUE_LENGTH;
    if (Math.hypot(p.x + d.x * t - b.posX, p.y + d.y * t - b.posY,
      p.z + d.z * t - b.posZ) < R + radius + 0.0005) return `球杆被 ${b.type} 挡住`;
  }
  // Test swept tapered shaft at slab-entry points, not merely the cue tip.
  for (const box of [[-FRAME_WIDTH, 0, -FRAME_WIDTH, W + FRAME_WIDTH],
    [L, L + FRAME_WIDTH, -FRAME_WIDTH, W + FRAME_WIDTH],
    [0, L, -FRAME_WIDTH, 0], [0, L, W, W + FRAME_WIDTH]]) {
    let enter = 0, exit = CUE_LENGTH;
    for (const [value, delta, low, high] of [[p.x, d.x, box[0], box[1]], [p.z, d.z, box[2], box[3]]]) {
      if (Math.abs(delta) < 1e-12) { if (value < low || value > high) exit = -1; }
      else { const a = (low - value) / delta, b = (high - value) / delta;
        enter = Math.max(enter, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b)); }
    }
    if (enter <= exit && p.y + d.y * enter - (0.005 + 0.009 * enter / CUE_LENGTH) < RAIL_TOP_HEIGHT)
      return '库沿挡杆：需要抬高杆尾或改变击球点';
  }
  if (p.y < 0.005) return '击球点过低，皮头会碰到台呢';
  if (bridge === 'hand') {
    const head = bridgePoint(pose);
    if (head.y < 0.09 && balls.some(b => b !== cue && b.isOnTable && !b.isPotted &&
      Math.hypot(head.x - b.posX, head.z - b.posZ) < R + 0.025))
      return '手架支点有球：可提高支撑位置或使用高架杆';
  }
  if (bridge !== 'hand') {
    const head = bridgePoint(pose), support = bridge === 'spider' ? 0.085 : 0.045;
    if (head.y < support) return bridge === 'spider' ? '高架杆需要更高的杆尾角度' : '十字架杆需要抬杆';
    if (head.x < 0 || head.x > L || head.z < 0 || head.z > W) return '架杆支点超出台面';
    const spread = bridge === 'spider' ? 0.07 : 0.04;
    const flat = Math.hypot(d.x, d.z) || 1;
    for (const sign of [-1, 1]) for (const b of balls) {
      if (b === cue || !b.isOnTable || b.isPotted) continue;
      const x = head.x - sign * d.z / flat * spread - d.x / flat * 0.025;
      const z = head.z + sign * d.x / flat * spread - d.z / flat * 0.025;
      if (Math.hypot(x - b.posX, z - b.posZ) < R + 0.005) return '架杆落脚处有球，需调整方向或支架';
    }
  }
  return '';
}

export function assessCueAccess(cue: BallBody, balls: BallBody[], aim: Vec3,
  spin: SpinParams, bridge: BridgeKind = 'hand'): CueAccess {
  const pose = cuePose(cue.getPosition(), aim, spin);
  const reason = obstruction(cue, balls, pose, bridge);
  let minimumElevation = 0;
  for (; minimumElevation <= MAX_CUE_ELEVATION; minimumElevation += 0.5) {
    if (!obstruction(cue, balls, cuePose(cue.getPosition(), aim, { ...spin, elevation: minimumElevation }), bridge)) break;
  }
  return { pose, reason, allowed: reason === '', minimumElevation };
}
