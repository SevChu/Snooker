import {
  TABLE_LENGTH as L, TABLE_WIDTH as W, CORNER_POCKET_RADIUS,
  SIDE_POCKET_RADIUS, CUSHION_JAW_RADIUS as J,
} from '../constants';

export interface CushionSegment {
  ax: number; az: number; bx: number; bz: number; leather?: boolean; rim?: boolean;
}
export interface Point2 { x: number; z: number }
/** A constant-width throat joined tangentially to a rear semicircle. */
export interface Pocket extends Point2 {
  radius: number;
  mouth: Point2;
  outward: Point2;
  throatLength: number;
}
const c = Math.SQRT2 * (CORNER_POCKET_RADIUS + J) - J;
const s = SIDE_POCKET_RADIUS + J;
const m = L / 2;
const segments: CushionSegment[] = [];
export const CUSHION_PATHS: Point2[][] = [];

function path(points: Point2[]): void {
  CUSHION_PATHS.push(points);
  for (let i = 1; i < points.length; i++) segments.push({
    ax: points[i - 1].x, az: points[i - 1].z, bx: points[i].x, bz: points[i].z,
  });
}

// Tube centres are offset by J so the inner faces are separated by the pocket diameter.
// Each jaw is straight all the way to the rear arc.
const cornerSide = (CORNER_POCKET_RADIUS + J) / Math.SQRT2;
for (const edge of [0, W]) {
  const out = edge === 0 ? -1 : 1;
  const transform = (p: Point2) => ({ x: p.x, z: edge + out * p.z });
  const left = [
    { x: cornerSide, z: cornerSide }, { x: c, z: J },
    { x: m - s, z: J }, { x: m - s, z: SIDE_POCKET_RADIUS },
  ];
  path(left.map(transform));
  path(left.map(p => transform({ x: L - p.x, z: p.z })));
}
for (const edge of [0, L]) {
  const out = edge === 0 ? -1 : 1;
  path([
    { x: cornerSide, z: cornerSide }, { x: J, z: c },
    { x: J, z: W - c }, { x: cornerSide, z: W - cornerSide },
  ].map(p => ({ x: edge + out * p.x, z: p.z })));
}

export const POCKETS: readonly Pocket[] = [
  ...[0, L].flatMap(x => [0, W].map(z => {
    const outward = { x: (x === 0 ? -1 : 1) / Math.SQRT2, z: (z === 0 ? -1 : 1) / Math.SQRT2 };
    return { x, z, radius: CORNER_POCKET_RADIUS, outward, throatLength: CORNER_POCKET_RADIUS,
      mouth: { x: x - outward.x * CORNER_POCKET_RADIUS, z: z - outward.z * CORNER_POCKET_RADIUS } };
  })),
  ...[0, W].map(z => {
    const outward = { x: 0, z: z === 0 ? -1 : 1 };
    return { x: m, z: z + outward.z * SIDE_POCKET_RADIUS, radius: SIDE_POCKET_RADIUS,
      mouth: { x: m, z }, outward, throatLength: SIDE_POCKET_RADIUS };
  }),
];

/** Coordinate across the opening and distance into the pocket from its mouth. */
export function pocketCoordinates(p: Pocket, x: number, z: number): { across: number; depth: number } {
  const dx = x - p.mouth.x, dz = z - p.mouth.z;
  return { across: -p.outward.z * dx + p.outward.x * dz, depth: p.outward.x * dx + p.outward.z * dz };
}

/** Open U outline, from one mouth endpoint along both sides and the rear semicircle. */
export function pocketOutline(p: Pocket, padding = 0): Point2[] {
  const radius = p.radius + padding, tx = -p.outward.z, tz = p.outward.x;
  const points = [{ x: p.mouth.x - tx * radius, z: p.mouth.z - tz * radius }];
  for (let i = 0; i <= 32; i++) {
    const angle = Math.PI * i / 32;
    points.push({ x: p.x + radius * (-tx * Math.cos(angle) + p.outward.x * Math.sin(angle)),
      z: p.z + radius * (-tz * Math.cos(angle) + p.outward.z * Math.sin(angle)) });
  }
  points.push({ x: p.mouth.x + tx * radius, z: p.mouth.z + tz * radius });
  return points;
}

// Only the rear semicircle is leather; the two straight sides belong to the cushions.
for (const p of POCKETS) {
  const arc = pocketOutline(p, J).slice(1, -1);
  for (let i = 1; i < arc.length; i++) segments.push({
    ax: arc[i - 1].x, az: arc[i - 1].z, bx: arc[i].x, bz: arc[i].z, leather: true,
  });
}
export const CUSHIONS: readonly CushionSegment[] = segments;

export function containsPocket(p: Pocket, x: number, z: number): boolean {
  const { across, depth } = pocketCoordinates(p, x, z);
  if (depth < -1e-10 || Math.abs(across) > p.radius + 1e-10) return false;
  return depth <= p.throatLength || across * across + (depth - p.throatLength) ** 2 <= p.radius ** 2 + 1e-12;
}

export function pocketAt(x: number, z: number): number | null {
  const index = POCKETS.findIndex(p => containsPocket(p, x, z));
  return index < 0 ? null : index;
}

/** Swept entry into the SAME U-shaped opening; no narrower circular capture trigger. */
export function pocketEntryTime(p: Pocket, x: number, z: number, vx: number, vz: number, limit: number): number | null {
  if (containsPocket(p, x, z)) return 0;
  const { across, depth } = pocketCoordinates(p, x, z);
  const va = -p.outward.z * vx + p.outward.x * vz, vd = p.outward.x * vx + p.outward.z * vz;
  let enter = 0, leave = limit;
  for (const [position, velocity, low, high] of [[across, va, -p.radius, p.radius], [depth, vd, 0, p.throatLength]]) {
    if (Math.abs(velocity) < 1e-14) {
      if (position < low || position > high) { enter = Infinity; break; }
    } else {
      const a = (low - position) / velocity, b = (high - position) / velocity;
      enter = Math.max(enter, Math.min(a, b)); leave = Math.min(leave, Math.max(a, b));
    }
  }
  let time = enter <= leave ? enter : Infinity;
  // The front half of this circle lies wholly in the throat rectangle.
  const dx = x - p.x, dz = z - p.z, speedSquared = vx * vx + vz * vz;
  const dot = dx * vx + dz * vz, c = dx * dx + dz * dz - p.radius * p.radius;
  const discriminant = dot * dot - speedSquared * c;
  if (speedSquared > 1e-16 && dot < 0 && discriminant >= 0) {
    const circleTime = c / (-dot + Math.sqrt(discriminant));
    if (circleTime >= 0) time = Math.min(time, circleTime);
  }
  return time >= 0 && time <= limit ? time : null;
}
