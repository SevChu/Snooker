/**
 * 路径搜索 / Path Finder
 *
 * 用于 AI 寻找绕过障碍球的击球路径
 * Used by AI to find shot paths that avoid obstacle balls
 *
 * 简化实现: 主要使用直线检测，对于复杂情况考虑库边反弹
 * Simplified: primarily uses straight-line detection, with cushion rebound for complex cases
 */

import { BALL_RADIUS, TABLE_LENGTH, TABLE_WIDTH } from '../constants';
import { Vec3 } from '../types';
import { BallBody } from '../physics/BallBody';

export class PathFinder {
  /**
   * 查找从白球到目标球的可行路径
   * Find a viable path from cue ball to target ball
   *
   * @returns 路径方向向量 (null 表示无法到达) / Path direction vector (null = unreachable)
   */
  findPath(
    from: Vec3,
    to: Vec3,
    allBalls: BallBody[],
    excludeIds: string[],
  ): { x: number; z: number } | null {
    // 1. 首先尝试直线路径 / First try straight line
    if (this.isDirectPathClear(from, to, allBalls, excludeIds)) {
      const dx = to.x - from.x;
      const dz = to.z - from.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > 0.001) {
        return { x: dx / dist, z: dz / dist };
      }
    }

    // 2. 尝试库边反弹路径 (简化版) / Try cushion rebound path (simplified)
    const reboundPath = this.findReboundPath(from, to, allBalls, excludeIds);
    if (reboundPath) return reboundPath;

    // 3. 无法找到路径 / No path found
    return null;
  }

  /**
   * 检查直线路径是否畅通 / Check if direct path is clear
   */
  isDirectPathClear(
    from: Vec3, to: Vec3, allBalls: BallBody[], excludeIds: string[],
  ): boolean {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < BALL_RADIUS * 2) return true;

    const dirX = dx / dist;
    const dirZ = dz / dist;
    const collisionDist = BALL_RADIUS * 2;

    for (const ball of allBalls) {
      if (!ball.isOnTable || ball.isPotted) continue;
      if (excludeIds.includes(ball.id)) continue;

      const pos = ball.getPosition();
      const bx = pos.x - from.x;
      const bz = pos.z - from.z;
      const proj = bx * dirX + bz * dirZ;

      if (proj < BALL_RADIUS || proj > dist - BALL_RADIUS) continue;

      const perpX = bx - proj * dirX;
      const perpZ = bz - proj * dirZ;
      const perpDist = Math.sqrt(perpX * perpX + perpZ * perpZ);

      if (perpDist < collisionDist) return false;
    }

    return true;
  }

  /**
   * 查找库边反弹路径 / Find cushion rebound path
   *
   * 检查通过一次库边反弹能否到达目标
   * Check if target can be reached with one cushion rebound
   */
  findReboundPath(
    from: Vec3, to: Vec3, allBalls: BallBody[], excludeIds: string[],
  ): { x: number; z: number } | null {
    const margin = BALL_RADIUS;
    const walls = [
      { axis: 'x' as const, value: margin },
      { axis: 'x' as const, value: TABLE_LENGTH - margin },
      { axis: 'z' as const, value: margin },
      { axis: 'z' as const, value: TABLE_WIDTH - margin },
    ];

    for (const wall of walls) {
      // 计算目标点关于库边的镜像点 / Calculate mirror point of target across cushion
      const mirror = { x: to.x, z: to.z };
      if (wall.axis === 'x') {
        mirror.x = 2 * wall.value - to.x;
      } else {
        mirror.z = 2 * wall.value - to.z;
      }

      // 检查白球到镜像点的直线是否畅通 / Check if path from cue to mirror is clear
      if (this.isDirectPathClear(from, { x: mirror.x, y: 0, z: mirror.z }, allBalls, excludeIds)) {
        // 计算反弹点的方向 / Calculate direction to rebound point
        const dx = mirror.x - from.x;
        const dz = mirror.z - from.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > 0.001) {
          return { x: dx / dist, z: dz / dist };
        }
      }
    }

    return null;
  }
}
