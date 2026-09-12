/**
 * 球体 3D 渲染 / Ball 3D Renderer
 *
 * 创建写实风格的斯诺克球体，每种球有对应的颜色和外观
 * Creates realistic snooker balls with appropriate colors and appearance
 *
 * 球的颜色:
 * - 白球: 纯白色
 * - 红球: 深红色 (15颗)
 * - 黄球: 黄色 (2分)
 * - 绿球: 深绿色 (3分)
 * - 棕球: 棕色 (4分)
 * - 蓝球: 蓝色 (5分)
 * - 粉球: 粉红色 (6分)
 * - 黑球: 黑色 (7分)
 */

import * as THREE from 'three';
import {
  BALL_RADIUS,
  COLOUR_SPOTS,
  BLACK_SPOT,
  RED_TRIANGLE_APEX,
  TABLE_WIDTH,
  TOTAL_REDS,
} from '../constants';
import { BallType } from '../types';
import { BallBody } from '../physics/BallBody';
import { PhysicsWorld } from '../physics/PhysicsWorld';

/** 球的颜色映射 / Ball color mapping */
const BALL_COLORS: Record<string, number> = {
  [BallType.CUE]: 0xf5f5f0,    // 米白色 / Off-white
  [BallType.RED]: 0xcc1111,    // 深红色 / Deep red
  [BallType.YELLOW]: 0xffd700, // 金黄色 / Gold yellow
  [BallType.GREEN]: 0x1a7a1a,  // 深绿色 / Dark green
  [BallType.BROWN]: 0x8B4513,  // 棕色 / Saddle brown
  [BallType.BLUE]: 0x1e40af,   // 深蓝色 / Deep blue
  [BallType.PINK]: 0xff69b4,   // 粉红色 / Hot pink
  [BallType.BLACK]: 0x111111,  // 近黑色 / Near black
};

export class BallRenderer {
  /** 所有球的物理体 / All ball physics bodies */
  public balls: BallBody[] = [];

  /** 球ID → 3D网格映射 / Ball ID → 3D mesh mapping */
  private meshes: Map<string, THREE.Mesh> = new Map();

  /** 白球引用 / Cue ball reference */
  public cueBall: BallBody | null = null;

  constructor(private physicsWorld: PhysicsWorld, private scene: THREE.Scene) {}

  /**
   * 初始化所有球 / Initialize all balls
   *
   * 创建白球、15颗红球、6颗彩球
   * Creates cue ball, 15 reds, and 6 colours
   */
  initBalls(): void {
    // === 白球 / Cue ball ===
    const cueBallPos = { x: 0.5, z: TABLE_WIDTH / 2 }; // 开球位置 / Starting position
    this.cueBall = this.createBall('cue', BallType.CUE, cueBallPos);

    // === 6颗彩球 / 6 colour balls ===
    this.createBall('yellow', BallType.YELLOW, COLOUR_SPOTS.yellow);
    this.createBall('green', BallType.GREEN, COLOUR_SPOTS.green);
    this.createBall('brown', BallType.BROWN, COLOUR_SPOTS.brown);
    this.createBall('blue', BallType.BLUE, COLOUR_SPOTS.blue);
    this.createBall('pink', BallType.PINK, COLOUR_SPOTS.pink);
    this.createBall('black', BallType.BLACK, BLACK_SPOT);
    // === 15颗红球 (三角形排列) / 15 red balls (triangle formation) ===
    this.createRedTriangle();
  }

  /**
   * 创建单个球 / Create a single ball
   */
  private createBall(
    id: string,
    type: BallType,
    position: { x: number; z: number },
  ): BallBody {
    // 创建物理体 / Create physics body
    const ballBody = new BallBody(id, type, position, this.physicsWorld);
    this.balls.push(ballBody);

    // 创建3D网格 / Create 3D mesh
    const geometry = new THREE.SphereGeometry(BALL_RADIUS, 32, 32);
    const material = new THREE.MeshStandardMaterial({
      color: BALL_COLORS[type] || 0xffffff,
      roughness: type === BallType.CUE ? 0.3 : 0.2,
      metalness: type === BallType.CUE ? 0.0 : 0.05,
      envMapIntensity: 0.5,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `Ball_${id}`;

    // 设置初始位置 / Set initial position
    mesh.position.set(position.x, BALL_RADIUS, position.z);

    this.scene.add(mesh);
    this.meshes.set(id, mesh);

    return ballBody;
  }

  /**
   * 创建红球三角形排列 / Create red balls in triangle formation
   *
   * 15颗红球排列成紧密三角形:
   * - 顶点朝向底库边 (靠近粉球)
   * - 第1排: 1颗, 第2排: 2颗, ... 第5排: 5颗
   * - 球与球之间紧密接触
   */
  private createRedTriangle(): void {
    const apex = RED_TRIANGLE_APEX;
    const d = BALL_RADIUS * 2.01; // 球直径 + 微小间隙防止初始重叠 / Diameter + tiny gap to prevent initial overlap
    const rowSpacing = d * Math.cos(Math.PI / 6); // 行间距 ≈ d * 0.866

    let redIndex = 0;
    for (let row = 0; row < 5; row++) {
      const numInRow = row + 1;
      for (let col = 0; col < numInRow; col++) {
        const x = apex.x + row * rowSpacing;
        const z = apex.z + (col - row / 2) * d;

        const id = `red_${redIndex + 1}`;
        this.createBall(id, BallType.RED, { x, z });
        redIndex++;
      }
    }
  }

  /**
   * 更新所有球的渲染位置 / Update all ball render positions
   *
   * 每帧调用，将物理位置同步到3D网格
   * Called each frame to sync physics positions to 3D meshes
   */
  update(): void {
    for (const ball of this.balls) {
      const mesh = this.meshes.get(ball.id);
      if (!mesh) continue;

      if (ball.isPotted || !ball.isOnTable) {
        mesh.visible = false;
        continue;
      }

      mesh.visible = true;

      // 同步位置 / Sync position
      const pos = ball.getPosition();
      mesh.position.set(pos.x, pos.y, pos.z);

      const q = ball.orientation;
      mesh.quaternion.set(q.x, q.y, q.z, q.w);
    }
  }

  /** 根据ID获取球 / Get ball by ID */
  getBall(id: string): BallBody | undefined {
    return this.balls.find(b => b.id === id);
  }

  /** 获取白球 / Get cue ball */
  getCueBall(): BallBody {
    return this.cueBall!;
  }

  /** 获取所有在台面上的球 / Get all balls on table */
  getBallsOnTable(): BallBody[] {
    return this.balls.filter(b => b.isOnTable && !b.isPotted);
  }

  /** 获取所有红球 (在台上的) / Get all red balls (on table) */
  getRedsOnTable(): BallBody[] {
    return this.balls.filter(b => b.type === BallType.RED && b.isOnTable && !b.isPotted);
  }

  /** 根据类型获取球 / Get balls by type */
  getBallsByType(type: BallType): BallBody[] {
    return this.balls.filter(b => b.type === type);
  }

  /** 根据ID获取3D网格 / Get 3D mesh by ball ID */
  getMesh(id: string): THREE.Mesh | undefined {
    return this.meshes.get(id);
  }

  /** 清理所有球 / Clean up all balls */
  dispose(): void {
    for (const [_id, mesh] of this.meshes) {
      this.scene.remove(mesh);
      (mesh.geometry as THREE.BufferGeometry).dispose();
      ((mesh.material as THREE.Material)).dispose();
    }
    this.meshes.clear();
    this.balls = [];
  }
}
