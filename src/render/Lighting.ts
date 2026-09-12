/**
 * 灯光设置 / Lighting Setup
 *
 * 模拟斯诺克赛场顶部灯光效果
 * Simulates snooker venue overhead lighting
 *
 * 典型赛场灯光:
 * - 球台正上方主灯 (提供均匀照明)
 * - 环境光 (避免硬阴影)
 * - 可选的侧面补光
 */

import * as THREE from 'three';
import { TABLE_LENGTH, TABLE_WIDTH } from '../constants';

export class Lighting {
  private lights: THREE.Light[] = [];

  constructor(private scene: THREE.Scene) {
    this.setupLighting();
  }

  private setupLighting(): void {
    const centerX = TABLE_LENGTH / 2;
    const centerZ = TABLE_WIDTH / 2;
    const lightHeight = 2.5; // 灯罩高度 / Lamp shade height

    // === 环境光 / Ambient light ===
    // 提供基础照明，避免完全黑暗的区域
    // Provides base illumination to avoid completely dark areas
    const ambient = new THREE.AmbientLight(0xffffff, 0.39);
    this.scene.add(ambient);
    this.lights.push(ambient);

    // === 半球光 / Hemisphere light ===
    // 天空色 + 地面色，提供自然的环境照明
    // Sky + ground color for natural environmental lighting
    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.52);
    hemi.position.set(centerX, lightHeight + 2, centerZ);
    this.scene.add(hemi);
    this.lights.push(hemi);

    // === 主聚光灯 (球台正上方) / Main spotlight (directly above table) ===
    // 模拟赛场上方的灯罩 / Simulates overhead lamp shade
    const mainLight = new THREE.SpotLight(0xfff5e0, 3.25, 8, Math.PI / 4, 0.3, 1.0);
    mainLight.position.set(centerX, lightHeight, centerZ);
    mainLight.target.position.set(centerX, 0, centerZ);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    mainLight.shadow.camera.near = 0.5;
    mainLight.shadow.camera.far = 5;
    mainLight.shadow.bias = -0.001;
    this.scene.add(mainLight);
    this.scene.add(mainLight.target);
    this.lights.push(mainLight);

    // === 补光 (球台两侧) / Fill lights (both sides of table) ===
    const fillIntensity = 1.04;

    // 左侧补光 / Left fill
    const fillLeft = new THREE.PointLight(0xfff8f0, fillIntensity, 5);
    fillLeft.position.set(centerX * 0.4, lightHeight * 0.8, -1);
    this.scene.add(fillLeft);
    this.lights.push(fillLeft);

    // 右侧补光 / Right fill
    const fillRight = new THREE.PointLight(0xfff8f0, fillIntensity, 5);
    fillRight.position.set(centerX * 1.6, lightHeight * 0.8, TABLE_WIDTH + 1);
    this.scene.add(fillRight);
    this.lights.push(fillRight);

    // === 创建灯罩模型 / Create lamp shade visual ===
    this.createLampShade(centerX, lightHeight, centerZ);
  }

  /**
   * 创建灯罩装饰模型 / Create decorative lamp shade
   */
  private createLampShade(x: number, y: number, z: number): void {
    // 灯罩使用简单的几何体
    const shadeGeo = new THREE.CylinderGeometry(0.4, 0.6, 0.15, 6);
    const shadeMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 0.3,
      metalness: 0.8,
    });
    const shade = new THREE.Mesh(shadeGeo, shadeMat);
    shade.position.set(x, y + 0.1, z);
    this.scene.add(shade);

    // 灯杆 / Lamp pole
    const poleGeo = new THREE.CylinderGeometry(0.02, 0.02, 1.5, 8);
    const poleMat = new THREE.MeshStandardMaterial({
      color: 0x333333,
      metalness: 0.9,
      roughness: 0.2,
    });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(x, y + 0.85, z);
    this.scene.add(pole);
  }

  /** 清理灯光 / Clean up lights */
  dispose(): void {
    for (const light of this.lights) {
      this.scene.remove(light);
    }
    this.lights = [];
  }
}
