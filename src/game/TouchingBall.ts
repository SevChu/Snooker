import { BALL_RADIUS, TOUCHING_BALL_TOLERANCE } from '../constants';
import type { FrameState } from '../types';
import type { BallBody } from '../physics/BallBody';
import { BallOnCalculator } from './BallOnCalculator';

export interface TouchingShot {
  balls: BallBody[];
  /** Satisfies first contact only; touching never awards points. */
  deemedContact: BallBody | null;
  pushedIds: Set<string>;
}
const names: Record<string, string> = { red: '红球', yellow: '黄球', green: '绿球',
  brown: '棕球', blue: '蓝球', pink: '粉球', black: '黑球' };

/** WPBSA Section 3.8; snapshot the final nomination before striking. */
export class TouchingBall {
  private ballOnCalc = new BallOnCalculator();

  findTouchingBalls(cue: BallBody, balls: BallBody[]): BallBody[] {
    if (!cue.isOnTable || cue.isPotted) return [];
    return balls.filter(b => b !== cue && b.isOnTable && !b.isPotted &&
      Math.hypot(b.posX - cue.posX, b.posY - cue.posY, b.posZ - cue.posZ)
        <= 2 * BALL_RADIUS + TOUCHING_BALL_TOLERANCE);
  }

  findTouchingBallsOn(cue: BallBody, balls: BallBody[], frame: FrameState): BallBody[] {
    const on = this.ballOnCalc.getBallOn(frame);
    return this.findTouchingBalls(cue, balls).filter(b => frame.nominatedFreeBall
      ? b.id === frame.nominatedFreeBall : on.includes(b.type));
  }

  startShot(cue: BallBody, balls: BallBody[], frame: FrameState): TouchingShot {
    return { balls: this.findTouchingBalls(cue, balls),
      deemedContact: this.findTouchingBallsOn(cue, balls, frame)[0] ?? null, pushedIds: new Set() };
  }

  isPlayingAway(cue: BallBody, touching: BallBody, direction: { x: number; z: number }): boolean {
    return (cue.posX - touching.posX) * direction.x +
      (cue.posZ - touching.posZ) * direction.z >= -1e-10;
  }

  getTouchingBallMessage(cue: BallBody, balls: BallBody[], frame: FrameState): string {
    const touching = this.findTouchingBalls(cue, balls);
    if (!touching.length) return '';
    const on = this.findTouchingBallsOn(cue, balls, frame);
    const list = touching.map(b => names[b.type]).join('、');
    if (frame.lastPottedWasRed && !frame.nominatedColour && !frame.nominatedFreeBall)
      return '贴住：' + list + ' · 请先指定彩球；可指定贴住的彩球，也可另选';
    if (on.length) {
      const other = touching.filter(b => !on.includes(b));
      return '贴球：' + on.map(b => names[b.type]).join('、') +
        ' · 打离且不推动贴球，无须另碰目标球；贴球本身不计分' +
        (other.length ? ' · 另贴住非目标球：' + other.map(b => names[b.type]).join('、') : '');
    }
    return '贴住非目标球：' + list + ' · 打离且不推动贴球，仍须先碰本杆目标球';
  }
}
