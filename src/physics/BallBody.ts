/**
 * 球的物理体 / Ball Physics Body
 *
 * 管理单个球的 2D 物理状态: 位置、速度、角速度
 * Manages a single ball's 2D physics state: position, velocity, angular velocity
 *
 * 专为斯诺克设计的简化物理体，不使用 cannon-es
 * Simplified physics body designed for snooker, without cannon-es
 */

import {
  BALL_RADIUS,
  TABLE_LENGTH,
  TABLE_WIDTH,
  VELOCITY_THRESHOLD,
  ANGULAR_VELOCITY_THRESHOLD,
} from '../constants';
import { BallType, BallState, Vec3 } from '../types';
import { PhysicsWorld } from './PhysicsWorld';

export class BallBody {
  /** 球的标识 / Ball identifier */
  public id: string;

  /** 球的类型 / Ball type */
  public type: BallType;

  /** 2D 位置 (台面坐标) / 2D position (table coordinates) */
  public posX: number;
  public posZ: number;
  public posY: number = BALL_RADIUS;
  public velY: number = 0;
  public pocketIndex: number | null = null;

  /** 2D 速度 (m/s) / 2D velocity (m/s) */
  public velX: number = 0;
  public velZ: number = 0;

  /** 角速度 (rad/s) / Angular velocity (rad/s) */
  public angularVelX: number = 0;
  public angularVelY: number = 0;
  public angularVelZ: number = 0;

  /** 是否已进袋 / Whether potted */
  public isPotted: boolean = false;

  /** 是否在台面上 / Whether on table */
  public isOnTable: boolean = true;

  /** 本杆碰撞记录 / Collision records for this shot */
  public collisions: string[] = [];

  /** 视觉滚动角度 (用于渲染) / Visual roll angle (for rendering) */
  public visualRollAngle: number = 0;

  public orientation = { x: 0, y: 0, z: 0, w: 1 };

  /** Integrate world-space angular velocity in physics time, independent of FPS. */
  integrateOrientation(dt: number): void {
    const speed = Math.hypot(this.angularVelX, this.angularVelY, this.angularVelZ);
    if (speed < 1e-12) return;
    const sin = Math.sin(speed * dt / 2) / speed, c = Math.cos(speed * dt / 2);
    const x = this.angularVelX * sin, y = this.angularVelY * sin, z = this.angularVelZ * sin;
    const q = this.orientation;
    const next = { x: c * q.x + x * q.w + y * q.z - z * q.y,
      y: c * q.y - x * q.z + y * q.w + z * q.x,
      z: c * q.z + x * q.y - y * q.x + z * q.w,
      w: c * q.w - x * q.x - y * q.y - z * q.z };
    const norm = Math.hypot(next.x, next.y, next.z, next.w);
    this.orientation = { x: next.x / norm, y: next.y / norm, z: next.z / norm, w: next.w / norm };
  }

  constructor(
    id: string,
    type: BallType,
    position: { x: number; z: number },
    physicsWorld: PhysicsWorld,
  ) {
    this.id = id;
    this.type = type;
    this.posX = position.x;
    this.posZ = position.z;

    // 注册到物理世界 / Register with physics world
    physicsWorld.addBall(this);
  }

  /** 是否是白球 / Whether this is the cue ball */
  get isCueBall(): boolean {
    return this.type === BallType.CUE;
  }

  // ============================================================================
  // 位置与速度 / Position & Velocity
  // ============================================================================

  /** 获取当前位置 / Get current position */
  getPosition(): Vec3 {
    return { x: this.posX, y: this.posY, z: this.posZ };
  }

  /** 获取当前速度 / Get current velocity */
  getVelocity(): Vec3 {
    return { x: this.velX, y: this.velY, z: this.velZ };
  }

  /** 获取角速度 / Get angular velocity */
  getAngularVelocity(): Vec3 {
    return { x: this.angularVelX, y: this.angularVelY, z: this.angularVelZ };
  }

  /** 设置位置 (用于复位/放置) / Set position (for re-spotting/placement) */
  setPosition(x: number, z: number): void {
    this.posY = BALL_RADIUS; this.velY = 0; this.pocketIndex = null;
    this.posX = x;
    this.posZ = z;
    this.velX = 0;
    this.velZ = 0;
    this.angularVelX = 0;
    this.angularVelY = 0;
    this.angularVelZ = 0;
  }

  /** 设置速度 (用于击球) / Set velocity (for shooting) */
  setVelocity(vx: number, vy: number, vz: number): void {
    this.velX = vx;
    this.velY = vy;
    this.velZ = vz;
  }

  /** 设置角速度 (用于旋转) / Set angular velocity (for spin) */
  setAngularVelocity(wx: number, wy: number, wz: number): void {
    this.angularVelX = wx;
    this.angularVelY = wy;
    this.angularVelZ = wz;
  }

  // ============================================================================
  // 状态检测 / State Detection
  // ============================================================================

  /** 检查球是否已停止 / Check if ball has stopped moving */
  isAtRest(): boolean {
    if (!this.isOnTable || this.isPotted) return true;
    if (this.posY > BALL_RADIUS + 1e-6 || this.posY < BALL_RADIUS - 1e-6 || this.velY !== 0 || this.pocketIndex !== null) return false;
    const speed = Math.sqrt(this.velX * this.velX + this.velZ * this.velZ);
    const angSpeed = Math.sqrt(
      this.angularVelX * this.angularVelX +
      this.angularVelY * this.angularVelY +
      this.angularVelZ * this.angularVelZ
    );
    return speed < VELOCITY_THRESHOLD && angSpeed < ANGULAR_VELOCITY_THRESHOLD;
  }

  /** 检查球是否飞出桌面 / Check if ball went off table */
  isOffTable(): boolean {
    const margin = BALL_RADIUS * 0.5;
    return (
      this.posX < -margin ||
      this.posX > TABLE_LENGTH + margin ||
      this.posZ < -margin ||
      this.posZ > TABLE_WIDTH + margin
    );
  }

  // ============================================================================
  // 进袋 / Potting
  // ============================================================================

  /** 标记为已进袋 / Mark as potted */
  markPotted(): void {
    this.velY = 0;
    this.isPotted = true;
    this.isOnTable = false;
    this.velX = 0;
    this.velZ = 0;
    this.angularVelX = 0;
    this.angularVelY = 0;
    this.angularVelZ = 0;
  }

  /** 兼容旧接口的 pot 方法 / Compat: pot method */
  pot(): void {
    this.markPotted();
  }

  /** 兼容旧接口的 checkPocket 方法 / Compat: checkPocket method */
  checkPocket(): boolean {
    return this.isPotted;
  }

  /** 重置并放置到指定位置 / Reset and place at position */
  respawn(x: number, z: number): void {
    this.posY = BALL_RADIUS; this.velY = 0; this.pocketIndex = null;
    this.isPotted = false;
    this.isOnTable = true;
    this.posX = x;
    this.posZ = z;
    this.velX = 0;
    this.velZ = 0;
    this.angularVelX = 0;
    this.angularVelY = 0;
    this.angularVelZ = 0;
    this.visualRollAngle = 0;
    this.orientation = { x: 0, y: 0, z: 0, w: 1 };
    this.collisions = [];
    (this as any)._potRecorded = false;
  }

  // ============================================================================
  // 碰撞记录 / Collision Records
  // ============================================================================

  /** 清除碰撞记录 / Clear collision records */
  clearCollisions(): void {
    this.collisions = [];
  }

  // ============================================================================
  // 状态快照 / State Snapshot
  // ============================================================================

  /** 获取球的状态快照 / Get ball state snapshot */
  getState(): BallState {
    return {
      id: this.id,
      type: this.type,
      position: this.getPosition(),
      velocity: this.getVelocity(),
      angularVelocity: this.getAngularVelocity(),
      isPotted: this.isPotted,
      isOnTable: this.isOnTable,
    };
  }

  /** 从状态快照恢复 / Restore from state snapshot */
  restoreState(state: BallState): void {
    if (state.isPotted) {
      this.markPotted();
    } else {
      this.respawn(state.position.x, state.position.z);
      this.velX = state.velocity.x;
      this.posY = state.position.y;
      this.velY = state.velocity.y;
      this.velZ = state.velocity.z;
      this.angularVelX = state.angularVelocity.x;
      this.angularVelY = state.angularVelocity.y;
      this.angularVelZ = state.angularVelocity.z;
      this.isOnTable = state.isOnTable;
    }
  }
}
