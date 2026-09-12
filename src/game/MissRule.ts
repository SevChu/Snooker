/**
 * Miss 规则 / Miss Rule (Foul and a Miss)
 *
 * 触发条件: 击球者犯规 (未碰到目标球) 且裁判认为未充分尝试
 * 处理: 对手可选择 (a) 从当前球位继续 (b) 要求犯规方复位重打
 *
 * Trigger: Striker fouls (no contact with ball-on) and referee deems insufficient attempt
 * Handling: Opponent may choose (a) play from current position (b) have balls replaced and replay
 *
 * 连续 Miss 处理:
 * - 第1次: 警告
 * - 第2次: 警告
 * - 第3次: 判负该局
 */

import { BallState, FrameState, cloneBalls } from '../types';
import { BallBody } from '../physics/BallBody';

export class MissRule {
  /**
   * 判断是否应该判 Miss
   * Determine if a Miss should be called
   *
   * @param firstHit - 首先碰到的球 / First ball contacted
   * @param frame - 当前局状态 / Current frame state
   * @param wasSnookered - 击球前是否被斯诺克 / Whether snookered before shot
   * @returns 是否判 Miss / Whether Miss should be called
   */
  shouldCallMiss(
    firstHit: string | null,
    frame: FrameState,
    wasSnookered: boolean,
  ): boolean {
    // 如果击球前被斯诺克，不判 Miss (因为可能是合理的尝试)
    // If snookered before shot, don't call Miss (may be a legitimate attempt)
    if (wasSnookered) return false;

    // 如果碰到了目标球，不判 Miss
    // If ball-on was contacted, don't call Miss
    if (firstHit !== null) return false;

    // 没碰到任何球且未被斯诺克 → 判 Miss
    // No contact and not snookered → Miss
    return true;
  }

  /**
   * 保存击球前快照 (用于复位)
   * Save pre-shot snapshot (for re-spotting)
   */
  saveSnapshot(allBalls: BallBody[]): BallState[] {
    return allBalls.map(b => b.getState());
  }

  /**
   * 复位所有球到快照状态
   * Restore all balls to snapshot state
   */
  restoreSnapshot(allBalls: BallBody[], snapshot: BallState[]): void {
    for (const ball of allBalls) {
      const savedState = snapshot.find(s => s.id === ball.id);
      if (savedState) {
        ball.restoreState(savedState);
      }
    }
  }

  /**
   * 检查连续 Miss 是否达到判负条件
   * Check if consecutive misses warrant frame loss
   *
   * @param consecutiveMisses - 连续 Miss 次数 / Consecutive miss count
   * @returns 是否应判负 / Whether frame should be forfeited
   */
  shouldForfeitFrame(consecutiveMisses: number): boolean {
    return consecutiveMisses >= 3;
  }

  /**
   * 获取 Miss 警告消息
   * Get Miss warning message
   */
  getMissMessage(consecutiveMisses: number): string {
    if (consecutiveMisses >= 3) {
      return '三次连续 Miss，判负本局！/ Three consecutive Misses - Frame forfeited!';
    }
    return `Foul and a Miss! (连续 ${consecutiveMisses} 次 / ${consecutiveMisses} consecutive)`;
  }
}
