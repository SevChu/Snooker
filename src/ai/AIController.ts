/**
 * AI 控制器 / AI Controller
 *
 * AI 决策主控制器，负责:
 * 1. 分析当前局面
 * 2. 评估所有可能的击球方案
 * 3. 选择最优方案
 * 4. 根据难度添加误差
 * 5. 执行击球
 *
 * AI decision controller responsible for analyzing the table,
 * evaluating shots, selecting the best plan, adding error based on difficulty,
 * and executing the shot.
 */

import {
  BallType,
  FrameState,
  GamePhase,
  AIShotPlan,
  DifficultyConfig,
  AIDifficulty,
  SpinParams,
  Vec3,
  ballValue,
  isColour,
} from '../types';
import {
  BALL_RADIUS,
  TABLE_LENGTH,
  TABLE_WIDTH,
  POCKET_POSITIONS,
  MIN_POWER,
  MAX_POWER,
  TOTAL_REDS,
  RED_TRIANGLE_APEX,
} from '../constants';
import { BallBody } from '../physics/BallBody';
import { BallOnCalculator } from '../game/BallOnCalculator';
import { SnookerDetector } from '../game/SnookerDetector';
import { ShotEvaluator } from './ShotEvaluator';
import { DifficultyManager } from './DifficultyManager';

export class AIController {
  private ballOnCalc: BallOnCalculator;
  private snookerDetector: SnookerDetector;
  private shotEvaluator: ShotEvaluator;
  private difficultyManager: DifficultyManager;

  constructor(difficulty: AIDifficulty) {
    this.ballOnCalc = new BallOnCalculator();
    this.snookerDetector = new SnookerDetector();
    this.shotEvaluator = new ShotEvaluator();
    this.difficultyManager = new DifficultyManager(difficulty);
  }

  /** 获取 AI 思考时间 / Get AI think time */
  getThinkTime(): number {
    return this.difficultyManager.getThinkTime();
  }

  /**
   * 计算 AI 的击球方案
   * Calculate AI's shot plan
   *
   * @param cueBall - 白球 / Cue ball
   * @param allBalls - 所有球 / All balls
   * @param frame - 当前局状态 / Current frame state
   * @returns 击球方案 / Shot plan
   */
  calculateShot(
    cueBall: BallBody,
    allBalls: BallBody[],
    frame: FrameState,
  ): AIShotPlan {
    const ballOn = this.ballOnCalc.getBallOn(frame);
    const ballsOnTable = allBalls.filter(
      b => b.isOnTable && !b.isPotted && b.type !== BallType.CUE
    );
    const difficultyConfig = this.difficultyManager.getConfig();

    // === 0. 开球检测 / Opening break detection ===
    // 如果所有红球都在台上且白球在D区附近，视为开球
    // If all reds remain and cue ball is near D-zone, treat as opening break
    if (frame.redsRemaining >= TOTAL_REDS - 1 && ballOn.includes(BallType.RED)) {
      const cuePos = cueBall.getPosition();
      if (cuePos.x < TABLE_LENGTH * 0.35) {
        const breakPlan = this.calculateBreakShot(cueBall, allBalls);
        if (breakPlan) {
          return this.difficultyManager.applyError(breakPlan);
        }
      }
    }

    let bestPlan: AIShotPlan | null = null;
    let bestScore = -Infinity;

    // === 1. 评估所有可能的进球方案 / Evaluate all possible potting shots ===
    for (const targetBall of ballsOnTable) {
      if (!ballOn.includes(targetBall.type)) continue;

      // 对每颗目标球，尝试每个袋口 / For each target, try each pocket
      for (const [_pocketName, pocketPos] of Object.entries(POCKET_POSITIONS)) {
        const plan = this.evaluatePotShot(
          cueBall, targetBall, pocketPos, allBalls, difficultyConfig
        );

        if (plan && plan.score > bestScore) {
          bestScore = plan.score;
          bestPlan = plan;
        }
      }
    }

    // === 2. 如果没有好的进球方案，考虑安全球 / If no good pot, consider safety ===
    if (!bestPlan || bestScore < 0.3) {
      const safetyPlan = this.calculateSafetyShot(
        cueBall, allBalls, frame, difficultyConfig
      );

      if (safetyPlan && (!bestPlan || safetyPlan.score > bestScore)) {
        bestPlan = safetyPlan;
      }
    }

    // === 3. 如果还是没有方案，随机打一颗目标球 / If still no plan, hit random target ===
    if (!bestPlan) {
      bestPlan = this.calculateRandomShot(cueBall, allBalls, ballOn);
    }

    // === 4. 添加难度误差 / Add difficulty-based error ===
    bestPlan = this.difficultyManager.applyError(bestPlan);

    return bestPlan;
  }

  /**
   * 评估进球方案 / Evaluate a potting shot
   */
  private evaluatePotShot(
    cueBall: BallBody,
    targetBall: BallBody,
    pocketPos: { x: number; z: number },
    allBalls: BallBody[],
    config: DifficultyConfig,
  ): AIShotPlan | null {
    const cuePos = cueBall.getPosition();
    const targetPos = targetBall.getPosition();

    // === 计算进球角度 / Calculate potting angle ===
    // 目标球到袋口的方向 / Target ball to pocket direction
    const toPocketX = pocketPos.x - targetPos.x;
    const toPocketZ = pocketPos.z - targetPos.z;
    const toPocketDist = Math.sqrt(toPocketX * toPocketX + toPocketZ * toPocketZ);
    if (toPocketDist < 0.01) return null;

    const pocketDirX = toPocketX / toPocketDist;
    const pocketDirZ = toPocketZ / toPocketDist;

    // 白球需要击中目标球的"对侧"使目标球朝袋口方向运动
    // Cue ball must hit target ball on the "opposite side" to send it toward pocket
    const contactX = targetPos.x - pocketDirX * BALL_RADIUS * 2;
    const contactZ = targetPos.z - pocketDirZ * BALL_RADIUS * 2;

    // 白球到接触点的方向 / Cue ball to contact point direction
    const toContactX = contactX - cuePos.x;
    const toContactZ = contactZ - cuePos.z;
    const toContactDist = Math.sqrt(toContactX * toContactX + toContactZ * toContactZ);
    if (toContactDist < BALL_RADIUS * 2) return null;

    const aimDirX = toContactX / toContactDist;
    const aimDirZ = toContactZ / toContactDist;

    // === 检查路径是否畅通 / Check if path is clear ===
    // 白球到接触点的路径 / Cue ball to contact point path
    const pathClear = this.isPathClear(
      cuePos, { x: contactX, y: 0, z: contactZ }, allBalls,
      cueBall.id, targetBall.id
    );
    if (!pathClear) return null;

    // 目标球到袋口的路径 / Target ball to pocket path
    const potPathClear = this.isPathClear(
      targetPos, { x: pocketPos.x, y: 0, z: pocketPos.z }, allBalls,
      targetBall.id, cueBall.id
    );
    if (!potPathClear) return null;

    // === 计算方案评分 / Calculate plan score ===
    const score = this.shotEvaluator.evaluateShot(
      cuePos, targetPos, pocketPos,
      toContactDist, toPocketDist,
      aimDirX, aimDirZ,
    );

    // === 计算力度 / Calculate power ===
    const totalDist = toContactDist + toPocketDist;
    const power = Math.min(MAX_POWER, MIN_POWER + totalDist * 1.5);

    return {
      targetBall: targetBall.type,
      targetBallId: targetBall.id,
      targetPocket: (Object.keys(POCKET_POSITIONS) as Array<keyof typeof POCKET_POSITIONS>)
        .find(key => POCKET_POSITIONS[key].x === pocketPos.x && POCKET_POSITIONS[key].z === pocketPos.z),
      direction: { x: aimDirX, y: 0, z: aimDirZ },
      power,
      spin: { side: 0, vertical: 0 },
      score,
      isSafety: false,
    };
  }

  /**
   * 计算安全球方案 / Calculate safety shot
   */
  private calculateSafetyShot(
    cueBall: BallBody,
    allBalls: BallBody[],
    frame: FrameState,
    config: DifficultyConfig,
  ): AIShotPlan | null {
    const cuePos = cueBall.getPosition();
    const ballOn = this.ballOnCalc.getBallOn(frame);

    // 找到最近的可到达的目标球 / Find nearest reachable target ball
    let nearestTarget: BallBody | null = null;
    let nearestDist = Infinity;

    for (const ball of allBalls) {
      if (!ball.isOnTable || ball.isPotted || ball.type === BallType.CUE) continue;
      if (!ballOn.includes(ball.type)) continue;

      const pos = ball.getPosition();
      const dist = Math.sqrt((pos.x - cuePos.x) ** 2 + (pos.z - cuePos.z) ** 2);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestTarget = ball;
      }
    }

    if (!nearestTarget) return null;

    const targetPos = nearestTarget.getPosition();
    const dirX = targetPos.x - cuePos.x;
    const dirZ = targetPos.z - cuePos.z;
    const dist = Math.sqrt(dirX * dirX + dirZ * dirZ);

    if (dist < 0.01) return null;

    // 安全球力度: 根据距离计算，轻柔推出 / Safety power: distance-based, gentle push
    const safetyPower = Math.min(MAX_POWER * 0.4, MIN_POWER + dist * 1.2);

    return {
      targetBall: nearestTarget.type,
      direction: { x: dirX / dist, y: 0, z: dirZ / dist },
      power: safetyPower,
      spin: { side: 0, vertical: -0.3 }, // 轻微下旋 / Slight backspin
      score: 0.2, // 安全球评分较低 / Safety has lower score
      isSafety: true,
    };
  }

  /**
   * 随机击球方案 / Random shot plan
   */
  private calculateRandomShot(
    cueBall: BallBody,
    allBalls: BallBody[],
    ballOn: BallType[],
  ): AIShotPlan {
    const cuePos = cueBall.getPosition();

    // 随机选择一颗目标球 / Random target ball
    const targets = allBalls.filter(
      b => b.isOnTable && !b.isPotted && b.type !== BallType.CUE
    );
    const target = targets[Math.floor(Math.random() * targets.length)] || allBalls[1];

    const targetPos = target.getPosition();
    const dirX = targetPos.x - cuePos.x;
    const dirZ = targetPos.z - cuePos.z;
    const dist = Math.sqrt(dirX * dirX + dirZ * dirZ);

    return {
      targetBall: target.type,
      direction: { x: dirX / Math.max(dist, 0.01), y: 0, z: dirZ / Math.max(dist, 0.01) },
      power: Math.min(MAX_POWER * 0.6, MIN_POWER + dist * 1.5), // 适中力度 / Moderate power
      spin: { side: 0, vertical: 0 },
      score: 0.05,
      isSafety: true,
    };
  }

  /**
   * 计算开球方案 / Calculate opening break shot
   *
   * 开球时瞄准三角顶点红球，稍微偏一点以打散球堆
   * On break, aim at the apex red ball with slight offset to scatter the pack
   */
  private calculateBreakShot(
    cueBall: BallBody,
    allBalls: BallBody[],
  ): AIShotPlan | null {
    const cuePos = cueBall.getPosition();

    // 瞄准红球三角的顶点 / Aim at the apex of the red triangle
    const apexX = RED_TRIANGLE_APEX.x;
    const apexZ = RED_TRIANGLE_APEX.z;

    // 稍微偏向一侧 (打散球堆效果更好) / Slight offset to scatter better
    const offsetZ = (Math.random() - 0.5) * BALL_RADIUS * 0.8;

    const dirX = apexX - cuePos.x;
    const dirZ = (apexZ + offsetZ) - cuePos.z;
    const dist = Math.sqrt(dirX * dirX + dirZ * dirZ);

    if (dist < 0.01) return null;

    return {
      targetBall: BallType.RED,
      direction: { x: dirX / dist, y: 0, z: dirZ / dist },
      power: MIN_POWER + (MAX_POWER - MIN_POWER) * 0.72, // 约 72% 力度 / ~72% power
      spin: { side: 0, vertical: -0.2 }, // 轻微低杆控制白球 / Slight backspin for control
      score: 0.5,
      isSafety: true,
    };
  }

  /**
   * 检查路径是否畅通 / Check if path is clear
   */
  private isPathClear(
    from: Vec3, to: Vec3, allBalls: BallBody[],
    ...excludeIds: string[]
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
}
