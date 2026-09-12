/**
 * 3D 场景管理 / 3D Scene Manager
 *
 * 管理 Three.js 的场景、渲染器、主循环
 * Manages Three.js scene, renderer, and main loop
 */

import * as THREE from 'three';
import { CAMERA_FOV, CAMERA_NEAR, CAMERA_FAR } from '../constants';

export class SceneManager {
  /** Three.js 场景 / Three.js scene */
  public scene: THREE.Scene;

  /** 透视相机 / Perspective camera */
  public camera: THREE.PerspectiveCamera;

  /** WebGL 渲染器 / WebGL renderer */
  public renderer: THREE.WebGLRenderer;

  /** 主画布元素 / Main canvas element */
  private canvas: HTMLCanvasElement;

  /** 帧回调列表 / Frame callback list */
  private updateCallbacks: Array<(dt: number) => void> = [];

  /** 上一帧时间 / Last frame timestamp */
  private lastTime: number = 0;

  /** 动画帧ID / Animation frame ID */
  private animFrameId: number = 0;

  /** 是否正在运行 / Whether the loop is running */
  private running: boolean = false;

  constructor(canvasId: string) {
    this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;

    // 创建场景 / Create scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);
    // 添加雾效增加深度感 / Add fog for depth effect
    this.scene.fog = new THREE.FogExp2(0x1a1a2e, 0.05);

    // 创建相机 / Create camera
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, aspect, CAMERA_NEAR, CAMERA_FAR);

    // 创建渲染器 / Create renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.56;

    // 监听窗口大小变化 / Listen for window resize
    window.addEventListener('resize', this.onResize.bind(this));
  }

  /** 处理窗口大小变化 / Handle window resize */
  private onResize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  /** 注册每帧更新回调 / Register per-frame update callback */
  onUpdate(callback: (dt: number) => void): void {
    this.updateCallbacks.push(callback);
  }

  /** 启动渲染循环 / Start render loop */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.loop();
  }

  /** 停止渲染循环 / Stop render loop */
  stop(): void {
    this.running = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
    }
  }

  /** 主循环 / Main loop */
  private loop(): void {
    if (!this.running) return;

    this.animFrameId = requestAnimationFrame(this.loop.bind(this));

    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.25); // 限制 dt
    this.lastTime = now;

    // 执行更新回调 / Execute update callbacks
    for (const cb of this.updateCallbacks) {
      cb(dt);
    }

    // 渲染场景 / Render scene
    this.renderer.render(this.scene, this.camera);
  }

  /** 将物体添加到场景 / Add object to scene */
  add(object: THREE.Object3D): void {
    this.scene.add(object);
  }

  /** 从场景移除物体 / Remove object from scene */
  remove(object: THREE.Object3D): void {
    this.scene.remove(object);
  }

  /** 清理资源 / Dispose resources */
  dispose(): void {
    this.stop();
    window.removeEventListener('resize', this.onResize.bind(this));
    this.renderer.dispose();
  }
}
