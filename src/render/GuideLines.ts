import * as THREE from 'three';
import { BALL_RADIUS, GUIDE_DASH_SIZE, GUIDE_GAP_SIZE } from '../constants';
import type { Vec3, SpinParams } from '../types';
import type { BallBody } from '../physics/BallBody';
import { predictShot } from '../physics/ShotPredictor';

export class GuideLines {
  private lines: THREE.Line[] = [];
  private key = '';
  private lastUpdate = -Infinity;
  private materials = [0xffffff, 0x88bbff, 0xff8844, 0xffdc65, 0x55ee88].map(color =>
    new THREE.LineDashedMaterial({ color, dashSize: GUIDE_DASH_SIZE,
      gapSize: GUIDE_GAP_SIZE, transparent: true, opacity: 0.65 }));
  private marker: THREE.Mesh;

  constructor(private scene: THREE.Scene) {
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(BALL_RADIUS * 0.85, BALL_RADIUS, 32),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true,
        opacity: 0.5, side: THREE.DoubleSide }),
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.visible = false;
    scene.add(this.marker);
  }

  update(cue: BallBody, direction: Vec3, balls: BallBody[],
    spin: SpinParams = { side: 0, vertical: 0 }, power = 1.3): void {
    const key = JSON.stringify([cue.id, direction, spin, power,
      balls.map(b => [b.id, b.posX, b.posZ, b.isOnTable, b.isPotted])]);
    const now = performance.now();
    if (key === this.key || now - this.lastUpdate < 80) return;
    this.clear();
    this.key = key;
    this.lastUpdate = now;
    const preview = predictShot(cue, balls, direction, spin, power);
    this.draw(preview.approach, 0);
    this.draw(preview.cueAfter, preview.hitCushion ? 2 : 1);
    this.draw(preview.target, preview.targetPotted ? 4 : 3);
    if (preview.contact) {
      this.marker.position.set(preview.contact.x, 0.003, preview.contact.z);
      this.marker.visible = true;
    }
  }

  private draw(path: Vec3[], material: number): void {
    if (path.length < 2) return;
    const geometry = new THREE.BufferGeometry().setFromPoints(
      path.map(p => new THREE.Vector3(p.x, Math.max(0.003, p.y), p.z)));
    const line = new THREE.Line(geometry, this.materials[material]);
    line.computeLineDistances();
    this.scene.add(line); this.lines.push(line);
  }
  clear(): void {
    for (const line of this.lines) { this.scene.remove(line); line.geometry.dispose(); }
    this.lines = [];
    this.key = '';
    this.marker.visible = false;
  }
  setVisible(visible: boolean): void {
    for (const line of this.lines) line.visible = visible;
    this.marker.visible = visible && this.key !== '' && this.marker.visible;
  }
  dispose(): void {
    this.clear();
    for (const material of this.materials) material.dispose();
    this.scene.remove(this.marker);
    this.marker.geometry.dispose();
    (this.marker.material as THREE.Material).dispose();
  }
}
