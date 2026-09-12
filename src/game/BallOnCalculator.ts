/**
 * 当前目标球计算 / Ball-On Calculator
 *
 * 根据当前游戏阶段和上一杆结果，计算当前应该打的目标球
 * Determines which ball(s) the striker must hit based on game phase and last shot result
 *
 * 规则:
 * - 红球阶段: 必须打红球 (除非上一杆进了红球，则可以打任意彩球)
 * - 清彩球阶段: 按分值从低到高依次打 (黄→绿→棕→蓝→粉→黑)
 *
 * Rules:
 * - Reds phase: must hit a red (unless last potted was red, then any colour)
 * - Colours phase: must pot colours in ascending order (Y→G→Br→Bl→P→Bk)
 */

import {
  BallType,
  GamePhase,
  FrameState,
  isColour,
} from '../types';
import { COLOURS_ORDER } from '../constants';
import { BallBody } from '../physics/BallBody';

export class BallOnCalculator {
  /** A previous nomination does not lock the player's choice before striking. */
  getColourChoices(frame: FrameState, balls: BallBody[]): BallBody[] {
    if (!frame.lastPottedWasRed) return [];
    return balls.filter(ball => ball.isOnTable && !ball.isPotted && isColour(ball.type));
  }

  /**
   * 获取当前目标球类型列表
   * Get list of current ball-on types
   *
   * @param frame - 当前局状态 / Current frame state
   * @returns 目标球类型列表 / List of ball-on types
   */
  getBallOn(frame: FrameState): BallType[] {
    if (frame.nominatedColour && frame.lastPottedWasRed) return [frame.nominatedColour];
    if (frame.phase === GamePhase.REDS) {
      return this.getRedsPhaseTarget(frame);
    } else {
      return this.getColoursPhaseTarget(frame);
    }
  }

  /**
   * 红球阶段目标球 / Reds phase target ball
   */
  private getRedsPhaseTarget(frame: FrameState): BallType[] {
    if (frame.lastPottedWasRed) {
      // 上一杆进了红球 → 可以打任意彩球
      // Last potted was red → can pot any colour
      return [BallType.YELLOW, BallType.GREEN, BallType.BROWN,
              BallType.BLUE, BallType.PINK, BallType.BLACK];
    } else {
      // 必须打红球 / Must hit a red
      if (frame.redsRemaining > 0) {
        return [BallType.RED];
      } else {
        // 所有红球已清完 → 进入清彩球阶段
        // All reds gone → enter colours phase
        return this.getColoursPhaseTarget(frame);
      }
    }
  }

  /**
   * 清彩球阶段目标球 / Colours phase target
   *
   * 按分值从低到高，找到台面上分值最低的彩球
   * Pot colours in ascending order, find lowest value colour on table
   */
  private getColoursPhaseTarget(frame: FrameState): BallType[] {
    // 按顺序查找台面上还有哪颗彩球
    // Find which colour is next on the table in order
    const ballsOnTable = frame.balls.filter(b => b.isOnTable && !b.isPotted);

    for (const colour of COLOURS_ORDER) {
      const colourType = colour as unknown as BallType;
      const ballOnTable = ballsOnTable.find(b => b.type === colourType);
      if (ballOnTable) {
        return [colourType];
      }
    }

    // 所有球都已进袋 / All balls potted
    return [];
  }

  /**
   * 检查击球是否合法地首先碰到了目标球
   * Check if the shot legally hit the ball-on first
   *
   * @param firstHit - 首先碰到的球类型 / First ball contacted
   * @param frame - 当前局状态 / Current frame state
   * @returns 是否合法 / Whether it's legal
   */
  isLegalFirstContact(firstHit: BallType | null, frame: FrameState): boolean {
    if (firstHit === null) return false; // 没碰到球 / No contact

    const ballOn = this.getBallOn(frame);
    return ballOn.includes(firstHit);
  }

  /**
   * 检查进球是否合法
   * Check if a potted ball is legal
   *
   * @param pottedBall - 进袋的球类型 / Potted ball type
   * @param frame - 当前局状态 / Current frame state
   * @returns 是否合法进球 / Whether it's a legal pot
   */
  isLegalPot(pottedBall: BallType, frame: FrameState): boolean {
    const ballOn = this.getBallOn(frame);
    return ballOn.includes(pottedBall);
  }

  /**
   * 确定阶段切换
   * Determine phase transitions
   *
   * @param frame - 当前局状态 / Current frame state
   * @param pottedBalls - 本杆进球 / Balls potted this shot
   * @returns 新的游戏阶段 / New game phase
   */
  determinePhase(frame: FrameState, pottedBalls: BallType[]): GamePhase {
    if (frame.phase === GamePhase.COLOURS) {
      return GamePhase.COLOURS; // 清彩球阶段不可逆 / Colours phase is irreversible
    }

    // 检查红球是否还有剩余 / Check if any reds remain
    const redsOnTable = frame.balls.filter(
      b => b.type === BallType.RED && b.isOnTable && !b.isPotted
    );

    if (redsOnTable.length === 0) {
      // 所有红球已清完
      // All reds are gone

      // 如果上一杆进了红球且本杆进了彩球，则进入清彩球阶段
      // If last was red and this shot potted a colour, enter colours phase
      if (frame.lastPottedWasRed) {
        const pottedColour = pottedBalls.find(b => isColour(b));
        if (pottedColour) {
          return GamePhase.COLOURS;
        }
      }

      // 否则仍然是红球阶段 (等待打完最后一颗彩球)
      // Otherwise still in reds phase (waiting to finish last colour)
      // 但如果没有任何红球被本杆进球改变，则切换到清彩球
      if (!frame.lastPottedWasRed) {
        return GamePhase.COLOURS;
      }
    }

    return GamePhase.REDS;
  }
}
