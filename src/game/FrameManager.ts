/**
 * 一局管理 / Frame Manager
 *
 * 管理单局的完整生命周期: 开局摆球、进行过程、结束判定
 * Manages complete lifecycle of a single frame: racking, gameplay, end detection
 */

import {
  BallType,
  FrameState,
  GamePhase,
} from '../types';
import { TOTAL_REDS } from '../constants';
import { BallBody } from '../physics/BallBody';
import { gameEvents } from '../utils/EventEmitter';

export class FrameManager {
  /**
   * 获取一局开始时的球位置列表
   * Get ball positions for frame start (racking)
   *
   * 返回所有球的初始位置配置
   * Returns initial position config for all balls
   */
  static getInitialPositions(): Array<{
    id: string;
    type: BallType;
    x: number;
    z: number;
  }> {
    // 这个由 BallRenderer.initBalls() 处理
    // This is handled by BallRenderer.initBalls()
    // 这里提供验证和辅助方法
    return [];
  }

  /**
   * 验证初始摆球是否正确
   * Verify initial racking is correct
   */
  static verifyRack(allBalls: BallBody[]): boolean {
    const reds = allBalls.filter(b => b.type === BallType.RED);
    const colours = allBalls.filter(b => b.type !== BallType.RED && b.type !== BallType.CUE);
    const cue = allBalls.find(b => b.type === BallType.CUE);

    // 15颗红球 / 15 reds
    if (reds.length !== 15) return false;

    // 6颗彩球 / 6 colours
    if (colours.length !== 6) return false;

    // 1颗白球 / 1 cue ball
    if (!cue) return false;

    return true;
  }

  /**
   * 检查是否应该结束一局
   * Check if frame should end
   *
   * 结束条件:
   * 1. 所有球都已进袋 (包括最后的黑球)
   * 2. 分数差距超过台面剩余分数 (清彩球阶段)
   * 3. 玩家认输
   * 4. 连续3次 Miss 判负
   * 5. 僵局 (stalemate)
   */
  static checkFrameEnd(frame: FrameState, allBalls: BallBody[]): boolean {
    // 1. 所有球已进袋 / All balls potted
    const ballsOnTable = allBalls.filter(
      b => b.type !== BallType.CUE && b.isOnTable && !b.isPotted
    );
    if (ballsOnTable.length === 0) return true;

    // 2. 分数差距 (清彩球阶段) / Score gap (colours phase)
    if (frame.phase === GamePhase.COLOURS) {
      const remaining = FrameManager.remainingPointsOnTable(allBalls);
      const diff = Math.abs(frame.scores[0] - frame.scores[1]);
      if (diff > remaining) return true;
    }

    // 3. 连续3次 Miss / Three consecutive misses
    if (frame.consecutiveMisses >= 3) return true;

    return false;
  }

  /**
   * 计算台面剩余分值 / Calculate remaining points on table
   */
  static remainingPointsOnTable(allBalls: BallBody[]): number {
    let total = 0;
    for (const ball of allBalls) {
      if (ball.isOnTable && !ball.isPotted && ball.type !== BallType.CUE) {
        total += FrameManager.ballValue(ball.type);
      }
    }
    return total;
  }

  /**
   * 获取球的分值 / Get ball value
   */
  static ballValue(type: BallType): number {
    switch (type) {
      case BallType.RED: return 1;
      case BallType.YELLOW: return 2;
      case BallType.GREEN: return 3;
      case BallType.BROWN: return 4;
      case BallType.BLUE: return 5;
      case BallType.PINK: return 6;
      case BallType.BLACK: return 7;
      default: return 0;
    }
  }

  /**
   * 获取剩余红球数 / Get remaining red count
   */
  static redsRemaining(allBalls: BallBody[]): number {
    return allBalls.filter(
      b => b.type === BallType.RED && b.isOnTable && !b.isPotted
    ).length;
  }
}
