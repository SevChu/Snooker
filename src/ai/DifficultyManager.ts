/**
 * 难度管理器 / Difficulty Manager
 *
 * 管理 AI 的三档难度，通过添加随机误差来模拟不同水平的对手
 * Manages three AI difficulty levels by adding random errors to simulate opponents
 *
 * 简单: 大误差，经常失误 / Easy: Large errors, frequent mistakes
 * 中等: 适中误差，偶尔失误 / Medium: Moderate errors, occasional mistakes
 * 困难: 小误差，接近完美 / Hard: Small errors, near-perfect play
 */

import { AIDifficulty, DifficultyConfig, AIShotPlan } from '../types';

/** 难度预设 / Difficulty presets */
const DIFFICULTY_PRESETS: Record<AIDifficulty, DifficultyConfig> = {
  [AIDifficulty.EASY]: {
    aimAccuracy: 0.55,
    powerAccuracy: 0.45,
    spinAccuracy: 0.3,
    strategyLevel: 1,
    thinkTime: 0.8,
    maxAngleError: 0.12,   // ~7度 / ~7 degrees
    powerErrorRatio: 0.35, // 力度误差 35% / 35% power error
  },
  [AIDifficulty.MEDIUM]: {
    aimAccuracy: 0.78,
    powerAccuracy: 0.70,
    spinAccuracy: 0.5,
    strategyLevel: 2,
    thinkTime: 1.2,
    maxAngleError: 0.05,   // ~3度 / ~3 degrees
    powerErrorRatio: 0.18, // 力度误差 18% / 18% power error
  },
  [AIDifficulty.HARD]: {
    aimAccuracy: 0.95,
    powerAccuracy: 0.90,
    spinAccuracy: 0.8,
    strategyLevel: 3,
    thinkTime: 1.5,
    maxAngleError: 0.015,  // ~0.9度 / ~0.9 degrees
    powerErrorRatio: 0.08, // 力度误差 8% / 8% power error
  },
};

export class DifficultyManager {
  private config: DifficultyConfig;
  private difficulty: AIDifficulty;

  constructor(difficulty: AIDifficulty) {
    this.difficulty = difficulty;
    this.config = DIFFICULTY_PRESETS[difficulty];
  }

  /** 获取当前难度配置 / Get current difficulty config */
  getConfig(): DifficultyConfig {
    return this.config;
  }

  /** 设置新难度 / Set new difficulty */
  setDifficulty(difficulty: AIDifficulty): void {
    this.difficulty = difficulty;
    this.config = DIFFICULTY_PRESETS[difficulty];
  }

  /**
   * 给击球方案添加误差 / Apply errors to shot plan
   *
   * 根据难度等级，在瞄准方向、力度和旋转上添加高斯随机误差
   * Adds Gaussian random errors to aim direction, power, and spin based on difficulty
   */
  applyError(plan: AIShotPlan): AIShotPlan {
    const result = { ...plan, direction: { ...plan.direction }, spin: { ...plan.spin } };

    // === 1. 瞄准方向误差 / Aim direction error ===
    const angleError = this.gaussianRandom() * this.config.maxAngleError;

    // 旋转方向向量 / Rotate direction vector
    const cos = Math.cos(angleError);
    const sin = Math.sin(angleError);
    const newX = result.direction.x * cos - result.direction.z * sin;
    const newZ = result.direction.x * sin + result.direction.z * cos;
    result.direction.x = newX;
    result.direction.z = newZ;

    // === 2. 力度误差 / Power error ===
    const powerError = 1 + this.gaussianRandom() * this.config.powerErrorRatio;
    result.power *= Math.max(0.3, powerError);

    // === 3. 旋转误差 / Spin error ===
    result.spin.side += this.gaussianRandom() * (1 - this.config.spinAccuracy) * 0.5;
    result.spin.vertical += this.gaussianRandom() * (1 - this.config.spinAccuracy) * 0.5;

    // 限制旋转范围 / Clamp spin values
    result.spin.side = Math.max(-1, Math.min(1, result.spin.side));
    result.spin.vertical = Math.max(-1, Math.min(1, result.spin.vertical));

    return result;
  }

  /**
   * 获取 AI 思考时间 / Get AI think time (seconds)
   */
  getThinkTime(): number {
    return this.config.thinkTime;
  }

  /**
   * Box-Muller 高斯随机数 / Box-Muller Gaussian random number
   *
   * 生成均值为 0、标准差为 1 的高斯分布随机数
   * Generates Gaussian random number with mean=0, stddev=1
   */
  private gaussianRandom(): number {
    let u1 = 0, u2 = 0;
    while (u1 === 0) u1 = Math.random();
    while (u2 === 0) u2 = Math.random();
    return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  }
}
