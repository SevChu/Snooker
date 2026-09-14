import type { AimController } from './AimController';
import type { CueAccess, BridgeKind } from '../physics/CueMechanics';
import { CueElevation } from './CueElevation';
import { BallType, type BallState, type Vec3 } from '../types';
import { suggestPot, POCKET_LABELS, type PocketName, type ShotSelection } from '../game/ShotStatistics';

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
  private intent = document.getElementById('shot-intent') as HTMLSelectElement;
  private target = document.getElementById('stats-target') as HTMLSelectElement;
  private pocket = document.getElementById('stats-pocket') as HTMLSelectElement;
  private targets: BallState[] = [];
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
    this.intent.addEventListener('change', () => {
      document.getElementById('attack-selection')!.hidden = this.intent.value !== 'attack';
      this.intent.blur();
    });
    for (const input of [this.target, this.pocket]) input.addEventListener('change', () => input.blur());
    for (const [key, label] of Object.entries(POCKET_LABELS)) this.pocket.add(new Option(label, key));
  }
  setVisible(visible: boolean): void { this.panel.hidden = !visible; }
  reset(): void { this.cueElevation.reset(); this.lift.value = '0'; this.bridge = 'hand';
    (document.getElementById('bridge-kind') as HTMLSelectElement).value = 'hand';
    this.intent.value = 'attack'; this.target.value = ''; this.pocket.value = '';
    const selection = document.getElementById('attack-selection') as HTMLDetailsElement;
    selection.hidden = false; selection.open = false;
  }
  setTargets(targets: BallState[]): void {
    this.targets = targets;
    const previous = this.target.value;
    this.target.replaceChildren(new Option('目标球：自动', ''));
    targets.forEach((ball, i) => this.target.add(new Option(this.targetName(ball, i), ball.id)));
    this.target.value = targets.some(ball => ball.id === previous) ? previous : '';
  }
  private targetName(ball: BallState, index: number): string {
    const names: Record<string, string> = { red: '红球', yellow: '黄球', green: '绿球', brown: '棕球',
      blue: '蓝球', pink: '粉球', black: '黑球' };
    return names[ball.type] + (ball.type === BallType.RED ? ` ${index + 1}` : '');
  }
  getSelection(cue: BallState, direction: Vec3): ShotSelection {
    const suggestion = suggestPot(cue, this.targets, direction,
      this.target.value || undefined, (this.pocket.value || undefined) as PocketName | undefined);
    const target = this.targets.find(b => b.id === suggestion.targetBallId);
    const label = target && suggestion.pocket
      ? `进攻目标：${this.targetName(target, this.targets.indexOf(target))} → ${POCKET_LABELS[suggestion.pocket]}`
      : '进攻目标：未识别，请指定';
    const summary = document.getElementById('attack-selection-label')!;
    if (summary.textContent !== label) summary.textContent = label;
    return { intent: this.intent.value === 'safety' ? 'safety' : 'attack', bridge: this.bridge, ...suggestion };
  }
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
