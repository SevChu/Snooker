/**
 * 球台 3D 渲染 / Table 3D Renderer
 *
 * 创建写实风格的球台模型，包括:
 * - 绿色台呢 (Playing surface with green cloth)
 * - 木质边框 (Wooden frame/rails)
 * - 库边橡胶面 (Cushion rubber faces)
 * - 袋口 (Pockets)
 * - 台面标记线 (Table markings: baulk line, D-zone, spots)
 */

import * as THREE from 'three';
import {
  TABLE_LENGTH,
  TABLE_WIDTH,
  CUSHION_HEIGHT,
  CUSHION_NOSE_HEIGHT,
  RAIL_TOP_HEIGHT,
  CUSHION_JAW_RADIUS,
  FRAME_WIDTH,
  TABLE_BED_THICKNESS,
  BALL_RADIUS,
  BAULK_LINE_X,
  D_CENTER,
  D_RADIUS,
  COLOUR_SPOTS,
  CORNER_POCKET_RADIUS,
  SIDE_POCKET_RADIUS,
  POCKET_DEPTH,
} from '../constants';
import { CUSHIONS, CUSHION_PATHS, POCKETS, type Point2 } from '../physics/TableGeometry';

/** Shared boundary: wood starts where the rubber backing ends, never underneath its top face. */
function backingEdge(points: Point2[]): Point2[] {
  const long = Math.abs(points.at(-1)!.x - points[0].x) > Math.abs(points.at(-1)!.z - points[0].z);
  const outside = long ? (points[0].z < 0 ? -1 : 1) : (points[0].x < 0 ? -1 : 1);
  return points.map(p => ({ x: p.x + (long ? 0 : outside * .027),
    z: p.z + (long ? outside * .027 : 0) }));
}

export class TableRenderer {
  /** 球台 Group (包含所有子物体) / Table group (contains all sub-objects) */
  public group: THREE.Group;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'SnookerTable';

    this.createPlayingSurface();
    this.createFrame();
    this.createCushions();
    this.createPockets();
    this.createMarkings();
    this.createLegs();
  }

  /**
   * 创建台面 (台呢) / Create playing surface (cloth)
   *
   * 深绿色平面，模拟标准斯诺克台呢质感
   * Dark green surface simulating standard snooker cloth
   */
  private createPlayingSurface(): void {
    // Cut the corner slate openings out of the bed itself. The same capture
    // circles define the physical slate rims; falling balls remain visible below it.
    const radius = POCKETS[0].captureRadius, offset = -POCKETS[0].x;
    const start = Math.asin(offset / radius), end = Math.acos(offset / radius);
    const arc = Array.from({ length: 25 }, (_, i) => {
      const a = start + (end - start) * i / 24;
      return { x: -offset + radius * Math.cos(a), z: -offset + radius * Math.sin(a) };
    });
    const outline = [
      ...[...arc].reverse(),
      ...arc.map(p => ({ x: TABLE_LENGTH - p.x, z: p.z })),
      ...[...arc].reverse().map(p => ({ x: TABLE_LENGTH - p.x, z: TABLE_WIDTH - p.z })),
      ...arc.map(p => ({ x: p.x, z: TABLE_WIDTH - p.z })),
    ];
    const shape = new THREE.Shape(outline.map(p => new THREE.Vector2(p.x, -p.z)));
    shape.closePath();
    const geometry = new THREE.ShapeGeometry(shape);

    // 台呢材质: 深绿色，微粗糙 / Cloth material: dark green, slightly rough
    const material = new THREE.MeshStandardMaterial({
      color: 0x0a6b37, // 标准台呢绿 / Standard cloth green
      roughness: 0.85,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });

    const surface = new THREE.Mesh(geometry, material);
    surface.rotation.x = -Math.PI / 2; // 水平放置 / Lay flat
    surface.position.y = 0.001;
    surface.receiveShadow = true;
    surface.name = 'PlayingSurface';

    this.group.add(surface);
    const bed = new THREE.ExtrudeGeometry(shape, { depth: TABLE_BED_THICKNESS, bevelEnabled: false });
    bed.rotateX(-Math.PI / 2);
    const slate = new THREE.Mesh(bed, new THREE.MeshStandardMaterial({ color: 0x26392d, roughness: .9 }));
    slate.position.y = -TABLE_BED_THICKNESS - .001;
    this.group.add(slate);
  }

  /**
   * 创建边框 / Create frame (wooden rails)
   *
   * 围绕台面的木质边框，略高于台面
   * Wooden frame around the table, slightly above the playing surface
   */
  private createFrame(): void {
    const material = new THREE.MeshStandardMaterial({ color: 0x4a2810, roughness: .6 });
    CUSHION_PATHS.forEach((nosePath, index) => {
      const path = backingEdge(nosePath);
      const long = index < 4, first = path[0], last = path[path.length - 1];
      const coordinate = long ? first.z : first.x;
      const outer = coordinate < 0 ? -FRAME_WIDTH : (long ? TABLE_WIDTH : TABLE_LENGTH) + FRAME_WIDTH;
      const shape = new THREE.Shape(path.map(p => new THREE.Vector2(p.x, -p.z)));
      if (long) { shape.lineTo(last.x, -outer); shape.lineTo(first.x, -outer); }
      else { shape.lineTo(outer, -last.z); shape.lineTo(outer, -first.z); }
      shape.closePath();
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: TABLE_BED_THICKNESS, bevelEnabled: false });
      geometry.rotateX(-Math.PI / 2);
      const rail = new THREE.Mesh(geometry, material);
      rail.name = 'WoodRail';
      rail.position.y = RAIL_TOP_HEIGHT - TABLE_BED_THICKNESS;
      rail.castShadow = true; rail.receiveShadow = true; this.group.add(rail);
    });
  }

  /**
   * 创建库边 / Create cushion faces
   *
   * 库边是台面上方的绿色橡胶条
   * Cushions are green rubber strips above the playing surface
   */
  private createCushions(): void {
    const material = new THREE.MeshStandardMaterial({ color: 0x0a5a2f, roughness: .8 });
    for (const points of CUSHION_PATHS) {
      const curve = new THREE.CurvePath<THREE.Vector3>();
      for (let i = 1; i < points.length; i++) curve.add(new THREE.LineCurve3(
        new THREE.Vector3(points[i - 1].x, CUSHION_NOSE_HEIGHT, points[i - 1].z),
        new THREE.Vector3(points[i].x, CUSHION_NOSE_HEIGHT, points[i].z)));
      const nose = new THREE.Mesh(new THREE.TubeGeometry(curve, points.length * 3,
        CUSHION_JAW_RADIUS, 12, false), material);
      nose.name = 'CushionNose';
      nose.castShadow = true; this.group.add(nose);
      // Rubber backing: follows the same rounded mouth contour.
      const shape = new THREE.Shape(points.map(p => new THREE.Vector2(p.x, -p.z)));
      for (const p of backingEdge(points).reverse()) shape.lineTo(p.x, -p.z);
      shape.closePath();
      const body = new THREE.ExtrudeGeometry(shape, { depth: CUSHION_HEIGHT - .006, bevelEnabled: false });
      body.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(body, material); mesh.position.y = .006;
      mesh.name = 'RubberBacking';
      mesh.castShadow = true; this.group.add(mesh);
    }
    const leather = new THREE.MeshStandardMaterial({ color: 0x714b29, roughness: .95 });
    for (const s of CUSHIONS.filter(s => s.leather)) {
      const a = new THREE.Vector3(s.ax, CUSHION_NOSE_HEIGHT, s.az);
      const b = new THREE.Vector3(s.bx, CUSHION_NOSE_HEIGHT, s.bz);
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(CUSHION_JAW_RADIUS,
        CUSHION_JAW_RADIUS, a.distanceTo(b), 10), leather);
      mesh.position.copy(a).add(b).multiplyScalar(.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
      this.group.add(mesh);
      const dx = s.bx - s.ax, dz = s.bz - s.az;
      const face = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(dx, dz), CUSHION_NOSE_HEIGHT + .08,
        CUSHION_JAW_RADIUS * 2), leather);
      face.position.set((s.ax + s.bx) / 2, (CUSHION_NOSE_HEIGHT - .08) / 2, (s.az + s.bz) / 2);
      face.rotation.y = -Math.atan2(dz, dx); this.group.add(face);
    }
  }

  /**
   * 创建袋口 / Create pockets
   *
   * 六个袋口: 四个角袋 + 两个中袋
   * Six pockets: four corner + two middle
   */
  private createPockets(): void {
    const pocketMaterial = new THREE.MeshStandardMaterial({
      color: 0x111111, // 黑色 / Black
      roughness: 0.9,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });

    const pockets = POCKETS.map(p => ({ pos: p, radius: p.radius }));

    for (const pocket of pockets) {
      // 袋口圆柱体 / Pocket cylinder
      const geo = new THREE.CylinderGeometry(pocket.radius + .016, pocket.radius + .006, POCKET_DEPTH, 48, 1, true);
      const mesh = new THREE.Mesh(geo, pocketMaterial);
      mesh.position.set(pocket.pos.x, -POCKET_DEPTH / 2, pocket.pos.z);
      mesh.name = `Pocket_${pocket.pos.x.toFixed(1)}_${pocket.pos.z.toFixed(1)}`;
      this.group.add(mesh);

      const bottom = new THREE.Mesh(new THREE.CircleGeometry(pocket.radius + .016, 48),
        new THREE.MeshBasicMaterial({ color: 0x080b09, side: THREE.DoubleSide }));
      bottom.rotation.x = -Math.PI / 2;
      bottom.position.set(pocket.pos.x, -POCKET_DEPTH, pocket.pos.z);
      this.group.add(bottom);

    }
  }

  /**
   * 创建台面标记 / Create table markings
   *
   * 包括: 开球线、D 区半圆、各彩球点位
   * Including: baulk line, D-zone semicircle, colour ball spots
   */
  private createMarkings(): void {
    const lineColor = 0xffffff;
    const lineOpacity = 0.6;
    const lineWidth = 0.003;

    // === 开球线 / Baulk line ===
    const baulkGeo = new THREE.PlaneGeometry(lineWidth, TABLE_WIDTH);
    const baulkMat = new THREE.MeshBasicMaterial({
      color: lineColor,
      transparent: true,
      opacity: lineOpacity,
      side: THREE.DoubleSide,
    });
    const baulkLine = new THREE.Mesh(baulkGeo, baulkMat);
    baulkLine.rotation.x = -Math.PI / 2;
    baulkLine.position.set(BAULK_LINE_X, 0.002, TABLE_WIDTH / 2);
    this.group.add(baulkLine);

    // === D 区半圆 / D-zone semicircle ===
    // D 区半圆开口朝向底库边 (x 减小方向)
    // D-zone semicircle opens toward bottom cushion (negative x direction)
    const dCurve = new THREE.EllipseCurve(
      D_CENTER.x, D_CENTER.z, // 圆心 / Center
      D_RADIUS, D_RADIUS,     // 半径 / Radius
      Math.PI / 2, Math.PI * 3 / 2, // 角度范围: 朝 -x 方向的半圆 / Angle range: semicircle toward -x
      false, 0,
    );
    const dPoints = dCurve.getPoints(32);
    const dGeo = new THREE.BufferGeometry().setFromPoints(
      dPoints.map(p => new THREE.Vector3(p.x, 0.002, p.y))
    );
    const dMat = new THREE.LineBasicMaterial({ color: lineColor, transparent: true, opacity: lineOpacity });
    const dLine = new THREE.Line(dGeo, dMat);
    this.group.add(dLine);

    // === 彩球点位 / Colour ball spots ===
    const spotGeo = new THREE.CircleGeometry(BALL_RADIUS * 0.6, 12);
    const spotMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
    });

    for (const [_name, spot] of Object.entries(COLOUR_SPOTS)) {
      const spotMesh = new THREE.Mesh(spotGeo.clone(), spotMat.clone());
      spotMesh.rotation.x = -Math.PI / 2;
      spotMesh.position.set(spot.x, 0.002, spot.z);
      this.group.add(spotMesh);
    }
  }

  /**
   * 创建球台腿 / Create table legs
   */
  private createLegs(): void {
    const legMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a2810,
      roughness: 0.6,
      metalness: 0.1,
    });

    const legRadius = 0.05;
    const legHeight = 0.80;
    const legGeo = new THREE.CylinderGeometry(legRadius, legRadius * 0.8, legHeight, 8);

    const margin = 0.2;
    const positions = [
      { x: margin, z: margin },
      { x: margin, z: TABLE_WIDTH - margin },
      { x: TABLE_LENGTH - margin, z: margin },
      { x: TABLE_LENGTH - margin, z: TABLE_WIDTH - margin },
      { x: TABLE_LENGTH / 2, z: margin },
      { x: TABLE_LENGTH / 2, z: TABLE_WIDTH - margin },
    ];

    for (const pos of positions) {
      const leg = new THREE.Mesh(legGeo.clone(), legMaterial);
      leg.position.set(pos.x, -legHeight / 2, pos.z);
      leg.castShadow = true;
      this.group.add(leg);
    }
  }
}
