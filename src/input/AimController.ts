import { MIN_POWER, MAX_POWER, DEFAULT_POWER } from '../constants';
import { InputManager } from './InputManager';
import { CueCamera } from '../camera/CueCamera';

export class AimController {
  private power = (DEFAULT_POWER - MIN_POWER) / (MAX_POWER - MIN_POWER);
  private enabled = false;
  private queuedShot = false;
  private queuedAngle = 0;
  private held: Record<string, number> = {};
  public fineMode = false;

  constructor(private input: InputManager, private camera: CueCamera) {}
  enable(): void {
    this.enabled = true; this.queuedShot = false; this.queuedAngle = 0; this.held = {};
    this.power = (DEFAULT_POWER - MIN_POWER) / (MAX_POWER - MIN_POWER);
  }
  disable(): void { this.enabled = false; this.queuedShot = false; }
  getPower(): number { return this.power; }
  getActualPower(): number { return MIN_POWER + this.power * (MAX_POWER - MIN_POWER); }
  setPower(p: number): void { this.power = Math.max(0, Math.min(1, p)); }
  requestShot(): void { if (this.enabled) this.queuedShot = true; }
  nudge(degrees: number): void { if (this.enabled) this.queuedAngle += degrees * Math.PI / 180; }
  update(dt: number): boolean {
    if (!this.enabled) return false;
    if (this.input.isKeyJustPressed('KeyF')) this.fineMode = !this.fineMode;
    const fine = this.fineMode || this.input.isKeyPressed('ShiftLeft') || this.input.isKeyPressed('ShiftRight');
    // Consume the final mouse delta even when the button was released within this frame.
    const delta = this.input.dragDeltaX || 0;
    if (delta !== 0) this.camera.rotateAim(-delta * (fine ? 0.00008 : 0.0015));
    if (this.queuedAngle !== 0) { this.camera.rotateAim(this.queuedAngle); this.queuedAngle = 0; }
    for (const [key, sign] of [['ArrowLeft', -1], ['ArrowRight', 1]] as const) {
      if (this.input.isKeyJustPressed(key)) this.nudgeImmediate(sign * (fine ? 0.002 : 0.02));
      if (this.input.isKeyPressed(key)) {
        const previous = this.held[key] ?? 0;
        this.held[key] = previous + dt;
        const movingTime = Math.max(0, this.held[key] - 0.25) - Math.max(0, previous - 0.25);
        if (movingTime > 0) this.nudgeImmediate(sign * (fine ? 1 : 20) * movingTime);
      } else this.held[key] = 0;
    }
    const scroll = this.input.scrollDelta || 0;
    if (scroll) this.setPower(this.power - scroll * (fine ? 0.000025 : 0.0002));
    if (this.input.isKeyPressed('ArrowUp')) this.setPower(this.power + dt * (fine ? 0.03 : 0.3));
    if (this.input.isKeyPressed('ArrowDown')) this.setPower(this.power - dt * (fine ? 0.03 : 0.3));
    const fire = this.queuedShot || this.input.isKeyJustPressed('Space');
    this.queuedShot = false;
    return fire;
  }
  private nudgeImmediate(degrees: number): void { this.camera.rotateAim(degrees * Math.PI / 180); }
  isDragging(): boolean { return this.input.isDragging; }
}
