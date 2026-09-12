import type { AimController } from './AimController';
import type { CueAccess, BridgeKind } from '../physics/CueMechanics';
import { CueElevation } from './CueElevation';

export class ShotControls {
  readonly cueElevation = new CueElevation();
  get elevation(): number { return this.cueElevation.value; }
  bridge: BridgeKind = 'hand';
  private panel = document.getElementById('shot-controls')!;
  private lift = document.getElementById('cue-elevation') as HTMLInputElement;
  private power = document.getElementById('shot-power') as HTMLInputElement;
  private fine = document.getElementById('fine-aim') as HTMLButtonElement;
  private fire = document.getElementById('shoot-button') as HTMLButtonElement;
  private status = document.getElementById('cue-access')!;
  private auto = document.getElementById('auto-elevate') as HTMLButtonElement;
  constructor(private aim: AimController) {
    this.lift.addEventListener('input', () => this.cueElevation.setManual(Number(this.lift.value)));
    this.power.addEventListener('input', () => aim.setPower(Number(this.power.value) / 100));
    this.fine.addEventListener('click', () => { aim.fineMode = !aim.fineMode; });
    this.fire.addEventListener('click', () => aim.requestShot());
    document.getElementById('aim-minus')!.addEventListener('click', () => aim.nudge(-0.005));
    document.getElementById('aim-plus')!.addEventListener('click', () => aim.nudge(0.005));
    document.getElementById('bridge-kind')!.addEventListener('change', e => {
      this.bridge = (e.target as HTMLSelectElement).value as BridgeKind;
    });
    this.auto.addEventListener('click', () => {
      this.cueElevation.automatic = true;
    });
    // Mouse adjustments should not steal the following Space / arrow-key shot controls.
    for (const input of [this.lift, this.power]) {
      input.addEventListener('pointerup', () => input.blur());
    }
    document.getElementById('bridge-kind')!.addEventListener('change', e => (e.target as HTMLElement).blur());
  }
  setVisible(visible: boolean): void { this.panel.hidden = !visible; }
  reset(): void { this.cueElevation.reset(); this.lift.value = '0'; this.bridge = 'hand';
    (document.getElementById('bridge-kind') as HTMLSelectElement).value = 'hand'; }
  update(access: CueAccess): void {
    this.fire.disabled = !access.allowed;
    this.auto.setAttribute('aria-pressed', String(this.cueElevation.automatic));
    this.auto.textContent = this.cueElevation.automatic ? '自动' : '手动';
    this.auto.title = this.cueElevation.automatic ? '随杆路自动使用最低可用倾角' : '恢复自动倾角';
    this.fine.setAttribute('aria-pressed', String(this.aim.fineMode));
    this.fine.textContent = this.aim.fineMode ? '精瞄 · 开' : '精瞄 · F';
    this.power.value = String(this.aim.getPower() * 100);
    this.lift.value = String(this.elevation);
    this.power.style.setProperty('--fill', `${this.aim.getPower() * 100}%`);
    this.lift.style.setProperty('--fill', `${this.elevation / 80 * 100}%`);
    this.status.textContent = access.allowed
      ? (this.elevation >= 45 ? '陡杆 · 注意越球犯规' : '')
      : access.reason + (access.minimumElevation <= 80 ? ' · 可切回自动倾角' : ' · 请改变方向或支撑');
    this.status.dataset.blocked = String(!access.allowed);
  }
}
