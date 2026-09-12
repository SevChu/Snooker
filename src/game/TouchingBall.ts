/**
 * 贴球规则 / Touching Ball Rule
 *
 * 当白球与目标球接触时，击球者必须"打离"该球
 * 不能使被贴球移动 (否则犯规)
 *
 * When cue ball is touching the ball-on, the striker must play away from it
 * Must not move the touching ball (otherwise it's a foul)
 */

import { BALL_RADIUS } from '../constants';
import { BallType, FrameState } from '../types';
import { BallBody } from '../physics/BallBody';
import { BallOnCalculator } from './BallOnCalculator';

export class TouchingBall {
  private ballOnCalc: BallOnCalculator;

  constructor() {
    this.ballOnCalc = new BallOnCalculator();
  }

  /**
   * 检查白球是否与某颗球贴球
   * Check if cue ball is touching another ball
   *
   * @param cueBall - 白球 / Cue ball
   * @param allBalls - 所有球 / All balls
   * @returns 被贴球的列表 / List of touching balls
   */
  findTouchingBalls(cueBall: BallBody, allBalls: BallBody[]): BallBody[] {
    const cuePos = cueBall.getPosition();
    const touching: BallBody[] = [];

    for (const ball of allBalls) {
      if (ball.id === cueBall.id || !ball.isOnTable || ball.isPotted) continue;

      const ballPos = ball.getPosition();
      const dx = ballPos.x - cuePos.x;
      const dz = ballPos.z - cuePos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      // 两球心距离小于等于两倍球半径 + 容差 → 贴球
      // Ball center distance ≤ 2*BALL_RADIUS + tolerance → touching
      if (dist <= BALL_RADIUS * 2 + 0.001) {
        touching.push(ball);
      }
    }

    return touching;
  }

  /**
   * 检查白球是否与目标球贴球
   * Check if cue ball is touching a ball-on
   *
   * @param cueBall - 白球 / Cue ball
   * @param allBalls - 所有球 / All balls
   * @param frame - 当前局状态 / Current frame state
   * @returns 被贴的目标球列表 / List of touching balls-on
   */
  findTouchingBallsOn(
    cueBall: BallBody,
    allBalls: BallBody[],
    frame: FrameState,
  ): BallBody[] {
    const touching = this.findTouchingBalls(cueBall, allBalls);
    const ballOn = this.ballOnCalc.getBallOn(frame);

    return touching.filter(b => ballOn.includes(b.type));
  }

  /**
   * 检查击球方向是否是"打离"被贴球的方向
   * Check if shot direction is "away from" the touching ball
   *
   * @param cueBall - 白球 / Cue ball
   * @param touchingBall - 被贴球 / Touching ball
   * @param shotDirection - 击球方向 / Shot direction
   * @returns 是否是合法的打离方向 / Whether it's a valid away direction
   */
  isPlayingAway(
    cueBall: BallBody,
    touchingBall: BallBody,
    shotDirection: { x: number; z: number },
  ): boolean {
    const cuePos = cueBall.getPosition();
    const touchPos = touchingBall.getPosition();

    // 从目标球到白球的方向 / Direction from touching ball to cue ball
    const awayX = cuePos.x - touchPos.x;
    const awayZ = cuePos.z - touchPos.z;
    const awayLen = Math.sqrt(awayX * awayX + awayZ * awayZ);

    if (awayLen < 0.001) return true; // 完全重合的特殊情况

    // 归一化 / Normalize
    const normAwayX = awayX / awayLen;
    const normAwayZ = awayZ / awayLen;

    // 击球方向与"打离"方向的点积
    // Dot product of shot direction with "away" direction
    const dot = shotDirection.x * normAwayX + shotDirection.z * normAwayZ;

    // 点积 > 0 表示击球方向与打离方向一致
    // Positive dot product means shot is in the same general direction as "away"
    return dot > -0.1; // 允许一定容差 / Allow some tolerance
  }

  /**
   * 获取贴球提示信息
   * Get touching ball info message
   */
  getTouchingBallMessage(touchingBalls: BallBody[]): string {
    if (touchingBalls.length === 0) return '';

    const names = touchingBalls.map(b => {
      switch (b.type) {
        case BallType.RED: return 'Red';
        case BallType.YELLOW: return 'Yellow';
        case BallType.GREEN: return 'Green';
        case BallType.BROWN: return 'Brown';
        case BallType.BLUE: return 'Blue';
        case BallType.PINK: return 'Pink';
        case BallType.BLACK: return 'Black';
        default: return 'Ball';
      }
    });

    return `Touching Ball: ${names.join(', ')} - 必须打离! / Must play away!`;
  }
}
