/**
 * 球杆后方相机 / Cue Camera (First-person from behind the cue)
 *
 * 提供三种相机模式:
 * 1. 瞄准模式: 白球正后方，跟随鼠标旋转
 * 2. 追踪模式: 球运动中，从高处俯视
 * 3. 放置模式: D区上方俯视
 *
 * Provides three camera modes:
 * 1. Aiming: behind cue ball, follows mouse rotation
 * 2. Tracking: overhead view during ball motion
 * 3. Placing: above D-zone for cue ball placement
 */

import * as THREE from 'three';
import {
  TABLE_LENGTH,
  TABLE_WIDTH,
  BALL_RADIUS,
  CAMERA_AIM_HEIGHT,
  CAMERA_AIM_DISTANCE,
  CAMERA_LERP_SPEED,
  CAMERA_TRACK_HEIGHT,
  CAMERA_TRACK_DISTANCE,
  BAULK_LINE_X,
} from '../constants';
import { CameraMode, Vec3 } from '../types';

export class CueCamera {
  /** 当前相机模式 / Current camera mode */
  private mode: CameraMode = CameraMode.AIMING;

  /** 瞄准角度 (水平) / Aim angle (horizontal, radians) */
  private aimAngle: number = 0;
  private cueElevation = 0;
  private mechanicalRest = false;

  setCueSetup(elevation: number, mechanicalRest: boolean): void {
    this.cueElevation = elevation; this.mechanicalRest = mechanicalRest;
  }

  /** 目标位置 (用于平滑过渡) / Target position (for smooth transition) */
  private targetPos: THREE.Vector3 = new THREE.Vector3();

  /** 目标注视点 / Target look-at point */
  private targetLookAt: THREE.Vector3 = new THREE.Vector3();

  /** 当前注视点 (用于平滑过渡) / Current look-at (for smooth transition) */
  private currentLookAt: THREE.Vector3 = new THREE.Vector3();

  constructor(private camera: THREE.PerspectiveCamera) {
    // 初始位置: 台面中心上方 / Initial position: above table center
    camera.position.set(TABLE_LENGTH / 2, CAMERA_TRACK_HEIGHT, TABLE_WIDTH / 2);
    camera.lookAt(TABLE_LENGTH / 2, 0, TABLE_WIDTH / 2);
  }

  /** 获取当前瞄准角度 / Get current aim angle */
  getAimAngle(): number {
    return this.aimAngle;
  }

  /** 设置瞄准角度 / Set aim angle */
  setAimAngle(angle: number): void {
    this.aimAngle = angle;
  }

  /** 旋转瞄准 (增量) / Rotate aim (delta) */
  rotateAim(deltaAngle: number): void {
    this.aimAngle += deltaAngle;
    // 限制在 [-PI, PI] / Clamp to [-PI, PI]
    while (this.aimAngle > Math.PI) this.aimAngle -= Math.PI * 2;
    while (this.aimAngle < -Math.PI) this.aimAngle += Math.PI * 2;
  }

  /**
   * 切换到指定模式 / Switch to specified mode
   */
  setMode(mode: CameraMode): void {
    this.mode = mode;
  }

  /** 获取当前模式 / Get current mode */
  getMode(): CameraMode {
    return this.mode;
  }

  /**
   * 更新相机 (每帧调用) / Update camera (called each frame)
   *
   * @param cueBallPos - 白球位置 / Cue ball position
   * @param dt - 帧间隔 / Frame delta time
   */
  update(cueBallPos: Vec3 | null, dt: number): void {
    const lerpFactor = Math.min(1, CAMERA_LERP_SPEED * dt * 60);

    switch (this.mode) {
      case CameraMode.AIMING:
        this.updateAimingCamera(cueBallPos, lerpFactor);
        break;
      case CameraMode.TRACKING:
        this.updateTrackingCamera(cueBallPos, lerpFactor);
        break;
      case CameraMode.PLACING:
        this.updatePlacingCamera(lerpFactor);
        break;
    }
  }

  /**
   * 瞄准模式相机 / Aiming mode camera
   *
   * 相机位于白球正后方，略高于球杆
   * Camera behind cue ball, slightly above cue stick
   */
  private updateAimingCamera(cueBallPos: Vec3 | null, lerpFactor: number): void {
    if (!cueBallPos) return;

    const cx = cueBallPos.x;
    const cz = cueBallPos.z;

    // 相机位置: 白球后方 / Camera position: behind cue ball
    const raised = Math.max(0, (this.cueElevation - 20) / 60);
    const stance = this.mechanicalRest ? 1 : raised;
    const distance = CAMERA_AIM_DISTANCE + .4 * stance;
    const camX = cx - Math.cos(this.aimAngle) * distance;
    const camZ = cz - Math.sin(this.aimAngle) * distance;
    const camY = CAMERA_AIM_HEIGHT + .25 * stance + .35 * raised;

    this.targetPos.set(camX, camY, camZ);

    // 注视点: 白球前方 / Look-at: ahead of cue ball
    const lookAheadDist = 1.5 - .4 * stance - .7 * raised;
    const lookX = cx + Math.cos(this.aimAngle) * lookAheadDist;
    const lookZ = cz + Math.sin(this.aimAngle) * lookAheadDist;

    this.targetLookAt.set(lookX, BALL_RADIUS, lookZ);

    // 平滑过渡 / Smooth transition
    this.camera.position.lerp(this.targetPos, lerpFactor);
    this.currentLookAt.lerp(this.targetLookAt, lerpFactor);
    this.camera.lookAt(this.currentLookAt);
  }

  /**
   * 追踪模式相机 / Tracking mode camera
   *
   * 球运动中，相机升高到俯视角度
   * During ball motion, camera rises to overhead view
   */
  private updateTrackingCamera(cueBallPos: Vec3 | null, lerpFactor: number): void {
    // 俯视台面中心 / Overhead view of table center
    this.targetPos.set(
      TABLE_LENGTH / 2,
      CAMERA_TRACK_HEIGHT,
      TABLE_WIDTH / 2 + CAMERA_TRACK_DISTANCE,
    );

    this.targetLookAt.set(TABLE_LENGTH / 2, 0, TABLE_WIDTH / 2);

    this.camera.position.lerp(this.targetPos, lerpFactor * 0.5);
    this.currentLookAt.lerp(this.targetLookAt, lerpFactor * 0.5);
    this.camera.lookAt(this.currentLookAt);
  }

  /**
   * 放置模式相机 / Placing mode camera
   *
   * 白球 in-hand 时，俯视D区
   * When cue ball is in-hand, overhead view of D-zone
   */
  private updatePlacingCamera(lerpFactor: number): void {
    this.targetPos.set(BAULK_LINE_X - 0.3, 1.2, TABLE_WIDTH / 2);
    this.targetLookAt.set(BAULK_LINE_X, 0, TABLE_WIDTH / 2);

    this.camera.position.lerp(this.targetPos, lerpFactor * 0.5);
    this.currentLookAt.lerp(this.targetLookAt, lerpFactor * 0.5);
    this.camera.lookAt(this.currentLookAt);
  }

  /** 获取瞄准方向 (水平单位向量) / Get aim direction (horizontal unit vector) */
  getAimDirection(): Vec3 {
    return {
      x: Math.cos(this.aimAngle),
      y: 0,
      z: Math.sin(this.aimAngle),
    };
  }
}
