import {
  TABLE_LENGTH as L, TABLE_WIDTH as W, CORNER_POCKET_RADIUS,
  SIDE_POCKET_RADIUS, CUSHION_JAW_RADIUS as J,
} from '../constants';

export interface CushionSegment {
  ax: number; az: number; bx: number; bz: number; leather?: boolean; rim?: boolean;
}
export interface Pocket { x: number; z: number; radius: number; captureRadius: number }
export interface Point2 { x: number; z: number }
const c = (2 * CORNER_POCKET_RADIUS + 2 * J) / Math.SQRT2 - J;
const s = SIDE_POCKET_RADIUS + J;
const m = L / 2;
const segments: CushionSegment[] = [];
export const CUSHION_PATHS: Point2[][] = [];

function curve(a: Point2, b: Point2, c: Point2, d: Point2): Point2[] {
  return Array.from({ length: 17 }, (_, i) => {
    const t = i / 16, u = 1 - t;
    return { x: u ** 3 * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t ** 3 * d.x,
      z: u ** 3 * a.z + 3 * u * u * t * b.z + 3 * u * t * t * c.z + t ** 3 * d.z };
  });
}
function path(points: Point2[]): void {
  CUSHION_PATHS.push(points);
  for (let i = 1; i < points.length; i++) segments.push({
    ax: points[i - 1].x, az: points[i - 1].z, bx: points[i].x, bz: points[i].z,
  });
}
for (const edge of [0, W]) {
  const out = edge === 0 ? -1 : 1;
  const transform = (p: Point2) => ({ x: p.x, z: edge + out * p.z });
  const left = [
    ...curve({ x: c - 0.025, z: 0.058 }, { x: c - 0.025, z: 0.008 },
      { x: c, z: J }, { x: c + 0.02, z: J }),
    ...curve({ x: m - s - 0.026, z: J }, { x: m - s + 0.002, z: J },
      { x: m - s + 0.002, z: 0.036 }, { x: m - s + 0.002, z: 0.07 }),
  ];
  path(left.map(transform));
  path(left.map(p => transform({ x: L - p.x, z: p.z })));
}
for (const edge of [0, L]) {
  const out = edge === 0 ? -1 : 1;
  const bottom = curve({ x: 0.058, z: c - 0.025 }, { x: J, z: c - 0.025 },
    { x: J, z: c }, { x: J, z: c + 0.02 });
  path([...bottom, ...bottom.map(p => ({ x: p.x, z: W - p.z })).reverse()]
    .map(p => ({ x: edge + out * p.x, z: p.z })));
}
export const POCKETS: readonly Pocket[] = [
  ...[0, L].flatMap(x => [0, W].map(z => ({
    x: x + (x === 0 ? -0.012 : 0.012), z: z + (z === 0 ? -0.012 : 0.012),
    radius: CORNER_POCKET_RADIUS + 0.009, captureRadius: 0.048,
  }))),
  ...[0, W].map(z => ({
    x: m, z: z + (z === 0 ? -0.043 : 0.043),
    radius: SIDE_POCKET_RADIUS, captureRadius: 0.036,
  })),
];
// Pocket leather and slate rims are visual geometry only; captured balls sink without rebound.
for (let i = 0; i < POCKETS.length; i++) {
  const p = POCKETS[i];
  const toward = Math.atan2(W / 2 - p.z, L / 2 - p.x);
  const arc = Math.PI * 1.05, radius = p.radius + 0.024;
  for (let k = 0; k < 24; k++) {
    const a = toward + Math.PI - arc / 2 + arc * k / 24;
    const b = toward + Math.PI - arc / 2 + arc * (k + 1) / 24;
    segments.push({ ax: p.x + Math.cos(a) * radius, az: p.z + Math.sin(a) * radius,
      bx: p.x + Math.cos(b) * radius, bz: p.z + Math.sin(b) * radius, leather: true });
  }
  for (let k = 0; k < 32; k++) {
    const a = 2 * Math.PI * k / 32, b = 2 * Math.PI * (k + 1) / 32;
    const mx = p.x + Math.cos((a + b) / 2) * p.captureRadius;
    const mz = p.z + Math.sin((a + b) / 2) * p.captureRadius;
    // Slate exists only on the playing side of a pocket; no fictitious rear stone lip.
    if (mx < 0 || mx > L || mz < 0 || mz > W) continue;
    segments.push({ ax: p.x + Math.cos(a) * p.captureRadius, az: p.z + Math.sin(a) * p.captureRadius,
      bx: p.x + Math.cos(b) * p.captureRadius, bz: p.z + Math.sin(b) * p.captureRadius, rim: true });
  }
}
export const CUSHIONS: readonly CushionSegment[] = segments;

export function pocketAt(x: number, z: number): number | null {
  const index = POCKETS.findIndex(p => (x - p.x) ** 2 + (z - p.z) ** 2 < p.captureRadius ** 2);
  return index < 0 ? null : index;
}
