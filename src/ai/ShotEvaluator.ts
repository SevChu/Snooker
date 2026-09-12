/**
 * 击球评估器 / Shot Evaluator
 *
 * 评估一个击球方案的可行性与得分潜力
 * Evaluates feasibility and scoring potential of a shot plan
 *
 * 评分因素:
 * - 进球角度 (越直越好) / Pot angle (straighter is better)
 * - 距离 (越近越好) / Distance (closer is better)
 * - 袋口类型 (角袋比中袋容易) / Pocket type (corners easier than sides)
 * - 球的分值 (高分球优先) / Ball value (prefer higher value)
 */

import { Vec3 } from '../types';

export class ShotEvaluator {
  /**
   * 评估进球方案 / Evaluate a potting shot
   *
   * @returns 0~1 的评分，越高越好 / Score 0~1, higher is better
   */
  evaluateShot(
    cuePos: Vec3,
    targetPos: Vec3,
    pocketPos: { x: number; z: number },
    cueToTargetDist: number,
    targetToPocketDist: number,
    aimDirX: number,
    aimDirZ: number,
  ): number {
    let score = 1.0;

    // === 1. 进球角度惩罚 / Pot angle penalty ===
    // 计算白球→目标球 与 目标球→袋口 之间的夹角
    // Calculate angle between cue→target and target→pocket
    const toPocketX = pocketPos.x - targetPos.x;
    const toPocketZ = pocketPos.z - targetPos.z;
    const toPocketLen = Math.sqrt(toPocketX * toPocketX + toPocketZ * toPocketZ);

    if (toPocketLen > 0.01) {
      const pocketDirX = toPocketX / toPocketLen;
      const pocketDirZ = toPocketZ / toPocketLen;

      // 进球方向的"入射角" (越接近直线越好) / Pot "incident angle" (straighter = better)
      // aimDir 是白球到接触点的方向 / aimDir is cue ball to contact point direction
      // pocketDir 是目标球到袋口的方向 / pocketDir is target ball to pocket direction
      // 两者同向 (dot ≈ 1) 表示直球 / Both same direction (dot ≈ 1) = straight pot
      const dot = aimDirX * pocketDirX + aimDirZ * pocketDirZ;
      const angleScore = (dot + 1) / 2; // 归一化到 0~1 / Normalize to 0~1
      score *= Math.pow(Math.max(0.01, angleScore), 0.5); // 角度影响较大
    }

    // === 2. 距离惩罚 / Distance penalty ===
    const totalDist = cueToTargetDist + targetToPocketDist;
    const distScore = Math.max(0, 1 - totalDist / 5.0); // 5米以上评分趋近0
    score *= (0.5 + 0.5 * distScore);

    // === 3. 目标到袋口距离惩罚 / Target-to-pocket distance penalty ===
    const potDistScore = Math.max(0, 1 - targetToPocketDist / 3.0);
    score *= (0.6 + 0.4 * potDistScore);

    return Math.max(0, Math.min(1, score));
  }

  /**
   * 评估安全球方案 / Evaluate a safety shot
   *
   * @returns 0~1 的评分 / Score 0~1
   */
  evaluateSafety(
    cueBallEndPos: Vec3,
    allBalls: BallBody[],
    ballOn: BallType[],
  ): number {
    // 评估白球停位对对手的困难程度
    // Evaluate how difficult the resulting position is for opponent
    // 简化版本: 白球离目标球越远越好 / Simplified: farther from target = better

    let minDist = Infinity;
    for (const ball of allBalls) {
      if (!ball.isOnTable || ball.isPotted || ball.type === BallType.CUE) continue;
      if (!ballOn.includes(ball.type)) continue;

      const pos = ball.getPosition();
      const dist = Math.sqrt(
        (pos.x - cueBallEndPos.x) ** 2 + (pos.z - cueBallEndPos.z) ** 2
      );
      minDist = Math.min(minDist, dist);
    }

    return Math.min(1, minDist / 3.0);
  }
}

// 避免循环导入，这里用 inline 类型 / Avoid circular imports with inline types
import { BallType } from '../types';
import { BallBody } from '../physics/BallBody';
