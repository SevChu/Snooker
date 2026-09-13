/**
 * 游戏状态机 / Game State Machine
 *
 * 管理游戏的各种状态转换:
 * MENU → AIMING → SHOOTING → SIMULATING → EVALUATING → AIMING (循环)
 *                                           → PLACING → AIMING
 *                                           → MISS_CHOICE → AIMING
 *                                           → FREE_BALL_SELECT → AIMING
 *                                           → GAME_OVER
 *
 * Manages all game state transitions
 */

import {
  GameState,
  GamePhase,
  GameMode,
  BallType,
  FrameState,
  MatchState,
  ShotResult,
  GameConfig,
  cloneBalls,
  ballValue,
  isColour,
} from '../types';
import {
  BAULK_LINE_X,
  D_CENTER,
  D_RADIUS,
  BALL_RADIUS,
  COLOURS_ORDER,
  TOTAL_REDS,
} from '../constants';
import { RulesEngine, ShotTracker } from './RulesEngine';
import { BallBody } from '../physics/BallBody';
import { gameEvents } from '../utils/EventEmitter';
import { framesToWin } from './MatchFormat';
import { FrameRecord, type FrameSummary } from './FrameRecord';

export class GameStateManager {
  /** 当前游戏状态 / Current game state */
  private state: GameState = GameState.MENU;

  /** 比赛状态 / Match state */
  public match: MatchState | null = null;

  /** 规则引擎 / Rules engine */
  private rulesEngine: RulesEngine;

  /** 击球追踪器 / Shot tracker */
  public shotTracker: ShotTracker | null = null;

  /** 上一次击球结果 / Last shot result */
  public lastShotResult: ShotResult | null = null;
  private preShotFrame: FrameState | null = null;
  public frameRecord = new FrameRecord();
  public frameSummary: FrameSummary | null = null;

  constructor() {
    this.rulesEngine = new RulesEngine();
  }

  /** 获取当前状态 / Get current state */
  getState(): GameState {
    return this.state;
  }

  /** 获取规则引擎 / Get rules engine */
  getRulesEngine(): RulesEngine {
    return this.rulesEngine;
  }

  /** 设置状态 / Set state */
  setState(state: GameState): void {
    const oldState = this.state;
    this.state = state;
    gameEvents.emit('state-change', { from: oldState, to: state });
  }

  /**
   * 开始新比赛 / Start a new match
   */
  startMatch(config: GameConfig): void {
    framesToWin(config.totalFrames); // Validate before replacing an existing match.
    this.lastShotResult = null; this.shotTracker = null; this.preShotFrame = null;
    this.frameRecord = new FrameRecord(); this.frameSummary = null;
    this.match = {
      mode: config.mode,
      difficulty: config.difficulty,
      totalFrames: config.totalFrames,
      currentFrame: 1,
      framesWon: [0, 0],
      frame: this.createNewFrame(),
      playerNames: [config.player1Name, config.player2Name],
    };

    this.setState(GameState.AIMING);
  }

  /**
   * 创建新的局 / Create a new frame
   */
  createNewFrame(): FrameState {
    return {
      phase: GamePhase.REDS,
      lastPottedWasRed: false,
      striker: 0,
      scores: [0, 0],
      redsRemaining: TOTAL_REDS,
      currentBreak: 0,
      consecutiveMisses: 0,
      balls: [], // 将在 BallRenderer.initBalls() 后填充
      preShotSnapshot: null,
    };
  }

  /**
   * 初始化球状态 (在物理球创建后调用)
   * Initialize ball states (called after physics balls are created)
   */
  initBallStates(allBalls: BallBody[]): void {
    if (this.match) {
      this.match.frame.balls = allBalls.map(b => b.getState());
    }
  }

  /**
   * 开始新一杆 / Start a new shot
   */
  startShot(cueBall: BallBody, allBalls: BallBody[]): void {
    // 保存快照 (用于 Miss 规则) / Save snapshot (for Miss rule)
    if (this.match) {
      this.match.frame.preShotSnapshot = allBalls.map(b => b.getState());
      this.preShotFrame = { ...this.match.frame, scores: [...this.match.frame.scores] };
    }

    // 创建击球追踪器 / Create shot tracker
    const snookerDetector = this.rulesEngine.getSnookerDetector();
    const ballOnCalc = this.rulesEngine.getBallOnCalculator();
    const ballOn = this.match ? ballOnCalc.getBallOn(this.match.frame) : [];

    this.shotTracker = {
      firstBallHit: null,
      allBallsContacted: new Set(),
      pottedBalls: [],
      cueBallPotted: false,
      ballsOffTable: [],
      wasSnookered: snookerDetector.isSnookered(cueBall, ballOn, allBalls),
      touching: this.match ? this.rulesEngine.getTouchingBall().startShot(cueBall, allBalls, this.match.frame) : undefined,
    };

    // 清除碰撞记录 / Clear collision records
    for (const ball of allBalls) {
      ball.clearCollisions();
    }

    this.setState(GameState.SIMULATING);
  }

  /**
   * 记录碰撞事件 / Record collision event
   */
  recordCollision(cueBall: BallBody, otherBall: BallBody, time = 0): void {
    if (!this.shotTracker) return;

    // 记录首先碰到的球 / Record first ball contacted
    if (this.shotTracker.firstBallHit === null && otherBall.id !== cueBall.id) {
      this.shotTracker.firstBallHit = otherBall;
      this.shotTracker.firstContactTime = time;
      this.shotTracker.firstContactIds = new Set([otherBall.id]);
    }

    if (Math.abs(time - (this.shotTracker.firstContactTime ?? time)) < 1e-8)
      this.shotTracker.firstContactIds?.add(otherBall.id);
    this.shotTracker.allBallsContacted.add(otherBall.id);
  }

  /** Record only physical impulses during the initial touching contact. */
  recordTouchingPush(ids: string[]): void {
    const touching = this.shotTracker?.touching;
    for (const id of ids) {
      if (touching?.balls.some(b => b.id === id)) touching.pushedIds.add(id);
    }
  }

  /** 记录进球事件 / Record potting event */
  recordPot(ball: BallBody): void {
    if (!this.shotTracker) return;

    if (ball.type === BallType.CUE) {
      this.shotTracker.cueBallPotted = true;
    } else {
      this.shotTracker.pottedBalls.push(ball);
    }
  }

  /**
   * 评估击球结果 (所有球停止后调用)
   * Evaluate shot result (called when all balls stop)
   */
  evaluateShot(allBalls: BallBody[], cueBall: BallBody): ShotResult {
    if (this.frameSummary) return this.lastShotResult ?? this.createEmptyResult();
    if (!this.match || !this.shotTracker) {
      return this.createEmptyResult();
    }

    const result = this.rulesEngine.evaluateShot(
      this.shotTracker,
      this.match.frame,
      allBalls,
      cueBall,
    );

    this.lastShotResult = result;
    this.applyShotResult(result, allBalls);

    return result;
  }

  /**
   * 应用击球结果到局状态 / Apply shot result to frame state
   */
  private applyShotResult(result: ShotResult, allBalls: BallBody[]): void {
    if (!this.match) return;
    const frame = this.match.frame;
    this.frameRecord.recordShot(frame, result);
    const beforeObjects = frame.balls.filter(b => b.type !== BallType.CUE && b.isOnTable && !b.isPotted);
    const decidingBlack = beforeObjects.length === 1 && beforeObjects[0].type === BallType.BLACK;
    const wasRedOn = this.rulesEngine.getBallOnCalculator().getBallOn(frame).includes(BallType.RED);
    if (result.scorePoints > 0) {
      frame.scores[frame.striker] += result.scorePoints; frame.currentBreak += result.scorePoints;
    }
    if (result.penaltyPoints > 0) {
      frame.scores[frame.striker === 0 ? 1 : 0] += result.penaltyPoints; frame.currentBreak = 0;
    }
    if (result.needsRespot.length) this.respotColours(result.needsRespot, allBalls);
    frame.redsRemaining = allBalls.filter(b => b.type === BallType.RED && b.isOnTable && !b.isPotted).length;
    frame.lastPottedWasRed = !result.foul && result.scorePoints > 0 && wasRedOn;
    if (frame.redsRemaining === 0 && !frame.lastPottedWasRed) frame.phase = GamePhase.COLOURS;
    frame.consecutiveMisses = result.isMiss ? frame.consecutiveMisses + 1 : 0;
    if (result.switchTurn) { frame.striker = 1 - frame.striker; frame.currentBreak = 0; }
    frame.nominatedFreeBall = null; frame.nominatedColour = null; frame.freeBallAvailable = false;
    frame.balls = allBalls.map(b => b.getState());
    if (decidingBlack && (result.foul || result.scorePoints > 0)) {
      if (frame.scores[0] !== frame.scores[1]) { this.endFrame(); return; }
      const black = allBalls.find(b => b.type === BallType.BLACK)!;
      const spot = this.rulesEngine.getSpottingLogic().findRespotPosition(BallType.BLACK, allBalls.filter(b => b !== black));
      black.respawn(spot.x, spot.z);
      const nextStriker = Math.random() < 0.5 ? 0 : 1;
      this.frameRecord.switchTurn(frame.striker, nextStriker, '重置黑球，抽签开球');
      frame.striker = nextStriker; frame.currentBreak = 0;
      frame.balls = allBalls.map(b => b.getState()); result.cueBallInHand = true;
      this.setState(GameState.PLACING); return;
    }
    if (result.foul) {
      const cue = allBalls.find(b => b.isCueBall)!;
      result.freeBallAvailable = this.rulesEngine.getFreeBallRule().checkFreeBall(cue, frame, allBalls, result.cueBallInHand);
      frame.freeBallAvailable = result.freeBallAvailable;
    }
    if (this.isFrameOver(allBalls)) { this.endFrame(); return; }
    if (result.cueBallInHand) this.setState(GameState.PLACING);
    else if (result.freeBallAvailable) this.setState(GameState.FREE_BALL_SELECT);
    else this.setState(GameState.AIMING);
  }

  /** Section 3.10(h): retain the balls and penalty, ask the offender to play again. */
  requireOffenderToPlay(): void {
    if (!this.match || !this.lastShotResult?.foul || !this.preShotFrame) return;
    const frame = this.match.frame;
    this.frameRecord.switchTurn(frame.striker, this.preShotFrame.striker, '要求犯规方继续击球');
    frame.striker = this.preShotFrame.striker;
    frame.freeBallAvailable = false; frame.nominatedFreeBall = null; frame.nominatedColour = null;
    this.setState(this.lastShotResult.cueBallInHand ? GameState.PLACING : GameState.AIMING);
  }

  /** Keep awarded penalty points, restore ball-on and offender when replay is requested. */
  replayShot(allBalls: BallBody[]): void {
    if (!this.match || !this.preShotFrame?.preShotSnapshot) return;
    for (const state of this.preShotFrame.preShotSnapshot) allBalls.find(b => b.id === state.id)?.restoreState(state);
    const frame = this.match.frame;
    this.frameRecord.switchTurn(frame.striker, this.preShotFrame.striker, '复位重打');
    frame.currentBreak = 0;
    frame.phase = this.preShotFrame.phase; frame.striker = this.preShotFrame.striker;
    frame.lastPottedWasRed = this.preShotFrame.lastPottedWasRed;
    frame.redsRemaining = this.preShotFrame.redsRemaining;
    frame.nominatedColour = null; frame.nominatedFreeBall = null; frame.freeBallAvailable = false;
    frame.balls = allBalls.map(b => b.getState());
    this.setState(GameState.AIMING);
  }

  /**
   * 彩球复位 / Re-spot colours
   */
  private respotColours(colours: BallType[], allBalls: BallBody[]): void {
    const spottingLogic = this.rulesEngine.getSpottingLogic();

    for (const colour of colours) {
      const balls = allBalls.filter(b => b.type === colour);
      for (const ball of balls) {
        if (ball.isPotted || !ball.isOnTable) {
          const spot = spottingLogic.findRespotPosition(colour, allBalls);
          ball.respawn(spot.x, spot.z);
          gameEvents.emit('ball-respotted', { type: colour, position: spot });
        }
      }
    }
  }

  /**
   * 检查局是否结束 / Check if frame is over
   */
  private isFrameOver(allBalls: BallBody[]): boolean {
    if (!this.match) return false;

    // 所有球都已进袋 / All balls potted
    const ballsOnTable = allBalls.filter(
      b => b.type !== BallType.CUE && b.isOnTable && !b.isPotted
    );
    if (ballsOnTable.length === 0) return true;

    // A player may still obtain penalty points through snookers; a points deficit
    // alone does not end the frame. The deciding black is handled when scored/fouled.
    return false;
  }

  /**
   * 计算台面剩余分值 / Calculate remaining points on table
   */
  private calculateRemainingPoints(allBalls: BallBody[]): number {
    let points = 0;

    for (const ball of allBalls) {
      if (ball.isOnTable && !ball.isPotted && ball.type !== BallType.CUE) {
        points += ballValue(ball.type);
      }
    }

    // 红球阶段: 每颗红球后跟一颗彩球 (7分) / Reds phase: each red followed by a colour (7pts)
    if (this.match && this.match.frame.phase === GamePhase.REDS) {
      const redsOnTable = allBalls.filter(
        b => b.type === BallType.RED && b.isOnTable && !b.isPotted
      ).length;
      points += redsOnTable * 7; // 假设每颗红球后跟黑球 (最大可能) / Assume black after each red
    }

    return points;
  }

  /**
   * 结束当前局 / End current frame
   */
  private endFrame(): void {
    if (!this.match) return;

    const frame = this.match.frame;
    const winner = frame.scores[0] > frame.scores[1] ? 0 : 1;

    this.match.framesWon[winner]++;
    const matchComplete = this.match.framesWon[winner] >= framesToWin(this.match.totalFrames);
    this.frameSummary = {
      frameNumber: this.match.currentFrame, winner, scores: [...frame.scores],
      highestBreaks: [...this.frameRecord.highestBreaks], framesWon: [...this.match.framesWon],
      playerNames: [...this.match.playerNames], visits: this.frameRecord.snapshot(), matchComplete,
    };
    gameEvents.emit('frame-over', {
      winner,
      scores: frame.scores,
      framesWon: this.match.framesWon,
    });

    // 检查比赛是否结束 / Check if match is over
    if (matchComplete) {
      this.setState(GameState.GAME_OVER);
      gameEvents.emit('match-over', {
        winner,
        framesWon: this.match.framesWon,
      });
    } else {
      this.setState(GameState.FRAME_OVER);
    }
  }

  /** Advance only after the frame's result panel has been acknowledged. */
  continueFrame(): boolean {
    if (!this.match || this.state !== GameState.FRAME_OVER || !this.frameSummary) return false;
    this.match.currentFrame++;
    this.match.frame = this.createNewFrame();
    this.frameRecord = new FrameRecord(); this.frameSummary = null;
    this.lastShotResult = null; this.shotTracker = null; this.preShotFrame = null;
    this.setState(GameState.AIMING);
    return true;
  }

  /**
   * 白球 in-hand 放置 / Place cue ball in-hand
   *
   * @param x - X 坐标 (必须在D区内) / X coordinate (must be in D-zone)
   * @param z - Z 坐标 / Z coordinate
   * @param allBalls - 所有球 / All balls
   * @returns 是否放置成功 / Whether placement succeeded
   */
  placeCueBall(x: number, z: number, allBalls: BallBody[]): boolean {
    // 验证位置在D区内 / Validate position is in D-zone
    if (x > BAULK_LINE_X + 0.001) return false;

    const dx = x - D_CENTER.x;
    const dz = z - D_CENTER.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > D_RADIUS + 0.001) return false;

    // 验证不与其他球重叠 / Validate no overlap with other balls
    const minDist = BALL_RADIUS * 2.05;
    for (const ball of allBalls) {
      if (ball.type === BallType.CUE || !ball.isOnTable || ball.isPotted) continue;
      const pos = ball.getPosition();
      const d = Math.sqrt((pos.x - x) ** 2 + (pos.z - z) ** 2);
      if (d < minDist) return false;
    }

    // 放置白球 / Place cue ball
    const cueBall = allBalls.find(b => b.type === BallType.CUE);
    if (cueBall) {
      cueBall.respawn(x, z);
    }

    // In-hand eligibility was assessed over ALL legal D positions after the foul.
    // A deliberately snookered chosen placement must not manufacture a free ball.
    if (this.match?.frame.freeBallAvailable) {
      this.setState(GameState.FREE_BALL_SELECT);
      return true;
    }

    this.setState(GameState.AIMING);
    return true;
  }

  /** 创建空结果 / Create empty result */
  private createEmptyResult(): ShotResult {
    return {
      ballsPotted: [],
      firstBallHit: null,
      foul: null,
      foulBallValue: 0,
      penaltyPoints: 0,
      scorePoints: 0,
      switchTurn: true,
      isMiss: false,
      needsRespot: [],
      cueBallInHand: false,
      freeBallAvailable: false,
      breakPoints: 0,
    };
  }
}
