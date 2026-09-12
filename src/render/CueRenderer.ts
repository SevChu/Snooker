/**
 * 球杆模型与动画 / Cue Stick Renderer & Animation
 *
 * 创建球杆的3D模型，并提供击球动画效果
 * Creates 3D cue stick model with shot animation
 *
 * 球杆结构:
 * - 杆头 (Tip): 皮头，接触白球的部分
 * - 先角 (Ferrule): 杆头后的金属/塑料环
 * - 前节 (Shaft): 木质细长部分
 * - 后把 (Butt): 较粗的握持部分
 */

import * as THREE from 'three';
import { CUE_LENGTH, BALL_RADIUS, CUE_TIP_DISTANCE } from '../constants';
import { Vec3, type SpinParams } from '../types';
import { cuePose, bridgePoint, type BridgeKind } from '../physics/CueMechanics';

/** 击球动画阶段 / Shot animation phases */
enum CueAnimPhase {
  IDLE,       // 静止 / Idle
  PULL_BACK,  // 拉杆 / Pulling back
  STRIKE,     // 击出 / Striking forward
  FOLLOW,     // 随杆 / Follow through
}

export class CueRenderer {
  /** 球杆 Group / Cue stick group */
  public group: THREE.Group;
  private restGroup = new THREE.Group();
  private lastBridge = '';

  /** 当前动画阶段 / Current animation phase */
  private animPhase: CueAnimPhase = CueAnimPhase.IDLE;

  /** 动画进度 (0~1) / Animation progress (0~1) */
  private animProgress: number = 0;

  /** 拉杆距离 / Pull-back distance */
  private pullBackDistance: number = 0.15;

  /** 击球方向角度 (弧度) / Aim angle in radians */
  private aimAngle: number = 0;

  constructor(private scene: THREE.Scene) {
    this.group = new THREE.Group();
    this.group.name = 'CueStick';

    this.createCueModel();
    this.group.visible = false; // 初始隐藏 / Initially hidden
    scene.add(this.group);
    scene.add(this.restGroup);
  }

  /**
   * 创建球杆模型 / Create cue stick model
   *
   * 使用圆柱体组合模拟球杆外形
   * Uses combined cylinders to simulate cue shape
   */
  private createCueModel(): void {
    // === 杆头 (Tip) / Cue tip ===
    const tipGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.015, 8);
    const tipMat = new THREE.MeshStandardMaterial({
      color: 0x4488bb, // 蓝色皮头 / Blue tip
      roughness: 0.9,
    });
    const tip = new THREE.Mesh(tipGeo, tipMat);
    tip.position.y = 0;
    tip.name = 'CueTip';
    this.group.add(tip);

    // === 先角 (Ferrule) ===
    const ferruleGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.02, 8);
    const ferruleMat = new THREE.MeshStandardMaterial({
      color: 0xeeeeee,
      roughness: 0.3,
      metalness: 0.5,
    });
    const ferrule = new THREE.Mesh(ferruleGeo, ferruleMat);
    ferrule.position.y = 0.018;
    this.group.add(ferrule);

    // === 前节 (Shaft) ===
    const shaftLength = CUE_LENGTH * 0.55;
    const shaftGeo = new THREE.CylinderGeometry(0.006, 0.008, shaftLength, 8);
    const shaftMat = new THREE.MeshStandardMaterial({
      color: 0xd4a76a, // 枫木色 / Maple wood color
      roughness: 0.4,
      metalness: 0.05,
    });
    const shaft = new THREE.Mesh(shaftGeo, shaftMat);
    shaft.position.y = 0.028 + shaftLength / 2;
    shaft.castShadow = true;
    this.group.add(shaft);

    // === 接合部 (Joint) ===
    const jointGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.02, 8);
    const jointMat = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      roughness: 0.2,
      metalness: 0.8,
    });
    const joint = new THREE.Mesh(jointGeo, jointMat);
    joint.position.y = 0.028 + shaftLength + 0.01;
    this.group.add(joint);

    // === 后把 (Butt) ===
    const buttLength = CUE_LENGTH * 0.42;
    const buttGeo = new THREE.CylinderGeometry(0.009, 0.014, buttLength, 8);
    const buttMat = new THREE.MeshStandardMaterial({
      color: 0x2a1a0a, // 深色木 / Dark wood
      roughness: 0.5,
      metalness: 0.05,
    });
    const butt = new THREE.Mesh(buttGeo, buttMat);
    butt.position.y = 0.028 + shaftLength + 0.02 + buttLength / 2;
    butt.castShadow = true;
    this.group.add(butt);

    // === 底盖 (Bumper) ===
    const bumperGeo = new THREE.CylinderGeometry(0.014, 0.013, 0.015, 8);
    const bumperMat = new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.8,
    });
    const bumper = new THREE.Mesh(bumperGeo, bumperMat);
    bumper.position.y = CUE_LENGTH;
    this.group.add(bumper);

    // 整体旋转使球杆水平 / Rotate to make cue horizontal
    this.group.rotation.z = Math.PI / 2;
  }

  /**
   * 更新球杆位置和朝向 / Update cue position and orientation
   *
   * @param cueBallPos - 白球位置 / Cue ball position
   * @param aimAngle - 瞄准角度 (弧度) / Aim angle (radians)
   */
  updateAim(cueBallPos: Vec3, aimAngle: number, spin: SpinParams = { side: 0, vertical: 0 },
    bridge: BridgeKind = 'hand', allowed = true): void {
    this.aimAngle = aimAngle;
    const pose = cuePose(cueBallPos, { x: Math.cos(aimAngle), y: 0, z: Math.sin(aimAngle) }, spin);
    this.group.position.set(pose.contact.x + pose.backward.x * CUE_TIP_DISTANCE,
      pose.contact.y + pose.backward.y * CUE_TIP_DISTANCE, pose.contact.z + pose.backward.z * CUE_TIP_DISTANCE);
    this.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(pose.backward.x, pose.backward.y, pose.backward.z));
    this.group.visible = true;
    const tip = this.group.getObjectByName('CueTip') as THREE.Mesh;
    (tip.material as THREE.MeshStandardMaterial).color.setHex(allowed ? 0x4488bb : 0xff6644);
    this.restGroup.visible = bridge !== 'hand';
    if (bridge === 'hand') return;
    const point = bridgePoint(pose);
    const key = bridge + ':' + point.y.toFixed(4);
    if (this.lastBridge !== key) {
      this.restGroup.traverse(o => { if (o instanceof THREE.Mesh) {
        o.geometry.dispose(); (o.material as THREE.Material).dispose();
      } });
      this.restGroup.clear(); this.lastBridge = key;
      const spread = bridge === 'spider' ? 0.07 : 0.04, height = point.y - 0.006;
      const rod = (a: THREE.Vector3, b: THREE.Vector3, radius: number, color: number) => {
        const delta = b.clone().sub(a);
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, delta.length(), 12),
          new THREE.MeshStandardMaterial({ color, roughness: .4, metalness: color === 0xbfa771 ? .6 : 0 }));
        mesh.position.copy(a).add(b).multiplyScalar(.5);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
        this.restGroup.add(mesh);
      };
      rod(new THREE.Vector3(0, height, -spread), new THREE.Vector3(0, height, spread), .004, 0xbfa771);
      for (const sign of [-1, 1]) {
        rod(new THREE.Vector3(.025, .004, sign * spread), new THREE.Vector3(0, height, sign * spread), .004, 0xbfa771);
        rod(new THREE.Vector3(0, height, sign * .012), new THREE.Vector3(0, height + .012, sign * .014), .003, 0xbfa771);
      }
      rod(new THREE.Vector3(0, height - .006, 0), new THREE.Vector3(-1, .01, 0), .007, 0x9d7344);
    }
    this.restGroup.position.set(point.x, 0, point.z);
    this.restGroup.rotation.y = -aimAngle;
  }

  /**
   * 播放击球动画 / Play shot animation
   *
   * @param power - 击球力度 (影响拉杆距离) / Power (affects pull-back distance)
   */
  playShotAnimation(power: number): void {
    this.animPhase = CueAnimPhase.PULL_BACK;
    this.animProgress = 0;
    this.pullBackDistance = 0.05 + power * 0.03; // 力度越大，拉杆越远
  }

  /**
   * 更新击球动画 / Update shot animation
   *
   * @returns 是否动画结束 / Whether animation is complete
   */
  updateAnimation(dt: number): boolean {
    if (this.animPhase === CueAnimPhase.IDLE) return true;

    const speed = 8; // 动画速度 / Animation speed
    this.animProgress += dt * speed;

    switch (this.animPhase) {
      case CueAnimPhase.PULL_BACK:
        if (this.animProgress >= 1) {
          this.animPhase = CueAnimPhase.STRIKE;
          this.animProgress = 0;
        } else {
          // 拉杆: 向后移动 / Pull back: move backward
          const offset = this.pullBackDistance * this.animProgress;
          this.group.position.x -= Math.cos(this.aimAngle) * offset * dt * speed;
          this.group.position.z -= Math.sin(this.aimAngle) * offset * dt * speed;
        }
        break;

      case CueAnimPhase.STRIKE:
        if (this.animProgress >= 1) {
          this.animPhase = CueAnimPhase.FOLLOW;
          this.animProgress = 0;
        } else {
          // 击出: 快速向前 / Strike: fast forward
          const strikeOffset = (this.pullBackDistance + CUE_TIP_DISTANCE) * this.animProgress;
          this.group.position.x += Math.cos(this.aimAngle) * strikeOffset * dt * speed * 3;
          this.group.position.z += Math.sin(this.aimAngle) * strikeOffset * dt * speed * 3;
        }
        break;

      case CueAnimPhase.FOLLOW:
        if (this.animProgress >= 1) {
          this.animPhase = CueAnimPhase.IDLE;
          this.group.visible = false;
          return true; // 动画完成 / Animation complete
        }
        break;
    }

    return false;
  }

  /** 隐藏球杆 / Hide cue stick */
  hide(): void {
    this.group.visible = false;
    this.restGroup.visible = false;
    this.animPhase = CueAnimPhase.IDLE;
  }

  /** 显示球杆 / Show cue stick */
  show(): void {
    this.group.visible = true;
  }

  /** 清理 / Dispose */
  dispose(): void {
    this.scene.remove(this.group);
    this.scene.remove(this.restGroup);
  }
}
