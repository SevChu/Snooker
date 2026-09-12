/**
 * 彩球复位逻辑 / Colour Re-spotting Logic
 *
 * 当彩球需要复位时的位置选择算法
 * Algorithm for choosing where to re-spot a colour ball
 *
 * 规则 (按优先级):
 * 1. 放回原始点位
 * 2. 如果点位被占，放到最高分值的可用点位
 * 3. 如果所有点位被占，放到中心线上原始点位向顶库方向最近的位置
 *
 * Rules (by priority):
 * 1. Return to original spot
 * 2. If spot occupied, place on highest value available spot
 * 3. If all spots occupied, place on center line nearest to original spot toward top cushion
 */

import {
  BALL_RADIUS,
  COLOUR_SPOTS,
  TABLE_LENGTH,
  TABLE_WIDTH,
  RESPAWN_PRIORITY,
  BAULK_LINE_X,
  D_CENTER,
  D_RADIUS,
} from '../constants';
import { BallType } from '../types';
import { BallBody } from '../physics/BallBody';
import { Vec3, vec3 } from '../types';

/** 彩球类型到点位的映射 / Colour type to spot mapping */
const BALL_SPOT_MAP: Record<string, { x: number; z: number }> = {
  yellow: COLOUR_SPOTS.yellow,
  green: COLOUR_SPOTS.green,
  brown: COLOUR_SPOTS.brown,
  blue: COLOUR_SPOTS.blue,
  pink: COLOUR_SPOTS.pink,
  black: COLOUR_SPOTS.black,
};

export class SpottingLogic {
  /**
   * 计算彩球复位位置
   * Calculate re-spot position for a colour ball
   *
   * @param ballType - 彩球类型 / Colour ball type
   * @param allBalls - 所有球 / All balls
   * @returns 复位位置 / Re-spot position
   */
  findRespotPosition(ballType: BallType, allBalls: BallBody[]): { x: number; z: number } {
    const originalSpot = BALL_SPOT_MAP[ballType];
    if (!originalSpot) {
      // 不应该发生，返回台面中心 / Should not happen, return table center
      return { x: TABLE_LENGTH / 2, z: TABLE_WIDTH / 2 };
    }

    // 1. 尝试原始点位 / Try original spot
    if (this.isSpotAvailable(originalSpot, allBalls)) {
      return originalSpot;
    }

    // 2. 尝试更高分值的点位 / Try higher value spots
    const currentPriority = RESPAWN_PRIORITY.indexOf(ballType as any);
    for (let i = currentPriority - 1; i >= 0; i--) {
      const altBallType = RESPAWN_PRIORITY[i];
      const altSpot = BALL_SPOT_MAP[altBallType];
      if (altSpot && this.isSpotAvailable(altSpot, allBalls)) {
        return altSpot;
      }
    }

    // 3. 尝试更低分值的点位 / Try lower value spots
    for (let i = currentPriority + 1; i < RESPAWN_PRIORITY.length; i++) {
      const altBallType = RESPAWN_PRIORITY[i];
      const altSpot = BALL_SPOT_MAP[altBallType];
      if (altSpot && this.isSpotAvailable(altSpot, allBalls)) {
        return altSpot;
      }
    }

    // 4. 所有点位被占 → 放在中心线上 / All spots occupied → center line
    return this.findCenterLinePosition(originalSpot, allBalls);
  }

  /**
   * 检查点位是否可用 / Check if a spot is available
   *
   * 点位被占: 任何在台面上的球的球心到该点位的距离小于两倍球半径
   * Spot occupied: any ball on table has center within 2*BALL_RADIUS of the spot
   */
  isSpotAvailable(spot: { x: number; z: number }, allBalls: BallBody[]): boolean {
    const MIN_DISTANCE = BALL_RADIUS * 2.05; // 略大于两球直径 / Slightly more than two diameters

    for (const ball of allBalls) {
      if (!ball.isOnTable || ball.isPotted) continue;

      const pos = ball.getPosition();
      const dx = pos.x - spot.x;
      const dz = pos.z - spot.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < MIN_DISTANCE) {
        return false; // 点位被占 / Spot is occupied
      }
    }

    return true;
  }

  /**
   * 在中心线上找到最近可用位置
   * Find nearest available position on the center line
   *
   * 从原始点位向顶库方向搜索
   * Search from original spot toward top cushion
   */
  private findCenterLinePosition(
    originalSpot: { x: number; z: number },
    allBalls: BallBody[],
  ): { x: number; z: number } {
    const centerZ = TABLE_WIDTH / 2; // 中心线 Z 坐标 / Center line Z coordinate
    const step = BALL_RADIUS * 2.1; // 步进距离 / Step distance
    const margin = BALL_RADIUS; // 台边留白 / Table edge margin

    // 先向顶库方向搜索 / Search toward top cushion first
    for (let x = originalSpot.x + step; x < TABLE_LENGTH - margin; x += step) {
      const pos = { x, z: centerZ };
      if (this.isSpotAvailable(pos, allBalls)) {
        return pos;
      }
    }

    // 然后向底库方向搜索 / Then search toward bottom cushion
    for (let x = originalSpot.x - step; x > margin; x -= step) {
      const pos = { x, z: centerZ };
      if (this.isSpotAvailable(pos, allBalls)) {
        return pos;
      }
    }

    // 极端情况: 所有位置都被占 (不太可能) / Extreme case: all positions occupied
    // 放在台面中心 / Place at table center
    return { x: TABLE_LENGTH / 2, z: centerZ };
  }

  /**
   * 检查指定位置是否在D区内
   * Check if a position is within the D-zone
   */
  isInDZone(x: number, z: number): boolean {
    // 必须在开球线后方 (或线上) / Must be behind baulk line (or on it)
    if (x > BAULK_LINE_X + 0.001) return false;

    // 必须在D区半圆内 / Must be within D-zone semicircle
    const dx = x - D_CENTER.x;
    const dz = z - D_CENTER.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    return dist <= D_RADIUS + 0.001;
  }
}
