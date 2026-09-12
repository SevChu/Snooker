/**
 * 自由球规则 / Free Ball Rule
 *
 * 触发条件: 犯规后，对手被斯诺克 (无法直线到达任何目标球)
 * 处理: 对手可以指定任意球作为自由球，该球算作目标球的分值
 *
 * Trigger: After a foul, if the opponent is snookered on all balls-on
 * Handling: Opponent may nominate any ball as free ball, scored as ball-on value
 */

import { BallType, FrameState } from '../types';
import { BallBody } from '../physics/BallBody';
import { BallOnCalculator } from './BallOnCalculator';
import { SnookerDetector } from './SnookerDetector';

export class FreeBallRule {
  private ballOnCalc: BallOnCalculator;
  private snookerDetector: SnookerDetector;

  constructor() {
    this.ballOnCalc = new BallOnCalculator();
    this.snookerDetector = new SnookerDetector();
  }

  /**
   * 检查是否应该判自由球
   * Check if a free ball should be awarded
   *
   * @param cueBall - 白球 / Cue ball
   * @param frame - 当前局状态 / Current frame state
   * @param allBalls - 所有球 / All balls
   * @returns 是否可获得自由球 / Whether free ball is available
   */
  checkFreeBall(
    cueBall: BallBody,
    frame: FrameState,
    allBalls: BallBody[],
    inHand = false,
  ): boolean {
    const ballOn = this.ballOnCalc.getBallOn(frame);

    if (ballOn.length === 0) return false; // 没有目标球 / No target balls

    // 检查白球是否对所有目标球都被斯诺克
    // Check if cue ball is snookered on all balls-on
    return inHand ? this.snookerDetector.isSnookeredInD(cueBall.id, ballOn, allBalls)
      : this.snookerDetector.isSnookered(cueBall, ballOn, allBalls);
  }

  /**
   * 获取自由球可以指定的球列表
   * Get list of balls that can be nominated as free ball
   *
   * 任何在台面上的非白球都可以被指定
   * Any ball on the table except the cue ball can be nominated
   */
  getNominatableBalls(allBalls: BallBody[], ballOn: BallType[] = []): BallBody[] {
    return allBalls.filter(b => b.type !== BallType.CUE && !ballOn.includes(b.type) && b.isOnTable && !b.isPotted);
  }

  /**
   * 自由球打进后的分值计算
   * Calculate points when free ball is potted
   *
   * 自由球算作当前目标球的分值
   * Free ball scores the same as the ball-on
   */
  getFreeBallValue(ballOn: BallType[]): number {
    if (ballOn.length === 0) return 4;
    // 取目标球中最低的分值
    // Take the lowest value among balls-on
    const values = ballOn.map(b => {
      switch (b) {
        case BallType.RED: return 1;
        case BallType.YELLOW: return 2;
        case BallType.GREEN: return 3;
        case BallType.BROWN: return 4;
        case BallType.BLUE: return 5;
        case BallType.PINK: return 6;
        case BallType.BLACK: return 7;
        default: return 4;
      }
    });
    return Math.min(...values);
  }
}
