/**
 * 斯诺克游戏 - 主入口 / Snooker Game - Main Entry
 *
 * 初始化所有系统并启动游戏主循环
 * Initializes all systems and starts the game main loop
 *
 * 系统集成:
 * 1. 物理系统 (Physics) - 连续碰撞与旋转摩擦
 * 2. 渲染系统 (Rendering) - Three.js 3D 渲染
 * 3. 相机系统 (Camera) - 第一人称球杆视角
 * 4. 输入系统 (Input) - 鼠标/键盘操控
 * 5. 规则系统 (Rules) - WPBSA 官方规则
 * 6. AI 系统 (AI) - 电脑对手
 * 7. UI 系统 (UI) - 菜单、计分板
 * 8. 音效系统 (Audio) - Web Audio API 合成音效
 */

import * as THREE from 'three';
import {
  GameState,
  GamePhase,
  FoulType,
  GameMode,
  BallType,
  GameConfig,
  CameraMode,
  vec3,
} from './types';
import {
  BALL_RADIUS,
  AI_THINK_TIME,
  TABLE_LENGTH,
  TABLE_WIDTH,
  BAULK_LINE_X,
  D_CENTER,
  D_RADIUS,
} from './constants';

// 物理系统 / Physics
import { PhysicsWorld } from './physics/PhysicsWorld';
import { BallBody } from './physics/BallBody';
import { SpinPhysics } from './physics/SpinPhysics';

// 渲染系统 / Rendering
import { SceneManager } from './render/SceneManager';
import { TableRenderer } from './render/TableRenderer';
import { BallRenderer } from './render/BallRenderer';
import { Lighting } from './render/Lighting';
import { CueRenderer } from './render/CueRenderer';
import { GuideLines } from './render/GuideLines';

// 相机 / Camera
import { CueCamera } from './camera/CueCamera';

// 输入 / Input
import { InputManager } from './input/InputManager';
import { AimController } from './input/AimController';
import { SpinSelector } from './input/SpinSelector';
import { ShotControls } from './input/ShotControls';
import { assessCueAccess, type CueAccess } from './physics/CueMechanics';
import { JumpRule } from './game/JumpRule';

// 游戏逻辑 / Game Logic
import { GameStateManager } from './game/GameState';

// AI
import { AIController } from './ai/AIController';

// UI
import { UIManager } from './ui/UIManager';

// 音效 / Audio
import { AudioManager } from './audio/AudioManager';

// 事件 / Events
import { gameEvents } from './utils/EventEmitter';

// ============================================================================
// 游戏主类 / Main Game Class
// ============================================================================

class SnookerGame {
  // 系统实例 / System instances
  private physicsWorld!: PhysicsWorld;
  private spinPhysics!: SpinPhysics;

  private sceneManager!: SceneManager;
  private tableRenderer!: TableRenderer;
  private ballRenderer!: BallRenderer;
  private lighting!: Lighting;
  private cueRenderer!: CueRenderer;
  private guideLines!: GuideLines;

  private camera!: CueCamera;
  private inputManager!: InputManager;
  private aimController!: AimController;
  private spinSelector!: SpinSelector;
  private shotControls!: ShotControls;
  private cueAccess: CueAccess | null = null;
  private accessKey = '';
  private jumpRule: JumpRule | null = null;

  private gameState!: GameStateManager;
  private aiController: AIController | null = null;
  private uiManager!: UIManager;
  private audioManager!: AudioManager;

  // AI 计时 / AI timing
  private aiThinkTimer: number = 0;
  private aiIsThinking: boolean = false;
  private paused = false;

  // 瞄准启动保护期 (秒) / Aiming startup guard (seconds)
  // 进入瞄准状态后短暂禁止击球，防止残留输入触发
  // Brief input lockout after entering aiming to prevent stale input
  private aimingWarmup: number = 0;

  // 白球放置预览 / Cue ball placement preview
  private ghostBall: THREE.Mesh | null = null;
  private dZoneHighlight: THREE.Mesh | null = null;

  constructor() {
    this.init();
  }

  /** 初始化所有系统 / Initialize all systems */
  private init(): void {
    // 1. 渲染系统 / Rendering
    this.sceneManager = new SceneManager('game-canvas');

    // 2. 物理系统 / Physics
    this.physicsWorld = new PhysicsWorld();
    this.spinPhysics = new SpinPhysics(this.physicsWorld);

    // 3. 台面和灯光 / Table and lighting
    this.tableRenderer = new TableRenderer();
    this.sceneManager.add(this.tableRenderer.group);
    this.lighting = new Lighting(this.sceneManager.scene);

    // 添加地板 / Add floor
    this.createFloor();

    // 4. 球 / Balls
    this.ballRenderer = new BallRenderer(this.physicsWorld, this.sceneManager.scene);
    this.ballRenderer.initBalls();

    // 5. 球杆和辅助线 / Cue and guide lines
    this.cueRenderer = new CueRenderer(this.sceneManager.scene);
    this.guideLines = new GuideLines(this.sceneManager.scene);

    // 5b. 白球放置预览元素 / Cue ball placement preview elements
    this.createPlacementPreview();

    // 6. 相机 / Camera
    this.camera = new CueCamera(this.sceneManager.camera);

    // 7. 输入 / Input
    this.inputManager = new InputManager(this.sceneManager.renderer.domElement);
    this.aimController = new AimController(this.inputManager, this.camera);
    this.spinSelector = new SpinSelector();
    this.shotControls = new ShotControls(this.aimController);

    // 8. 游戏状态 / Game state
    this.gameState = new GameStateManager();

    // 9. UI / UI
    this.uiManager = new UIManager();
    this.setupUICallbacks();

    // 10. 音效 / Audio
    this.audioManager = new AudioManager();

    // 初始化球状态到 gameState / Initialize ball states in gameState
    this.gameState.initBallStates(this.ballRenderer.balls);

    // 注册主循环更新 / Register main loop update
    this.sceneManager.onUpdate(this.update.bind(this));

    // 显示主菜单 / Show main menu
    this.uiManager.showMenu();

    // 启动渲染循环 / Start render loop
    this.sceneManager.start();
  }

  /**
   * 创建白球放置预览元素 / Create cue ball placement preview elements
   *
   * 包含:
   * - 幽灵白球 (跟随鼠标在D区内移动) / Ghost ball (follows mouse in D-zone)
   * - D区高亮区域 (半透明覆盖) / D-zone highlight (semi-transparent overlay)
   */
  private createPlacementPreview(): void {
    // 幽灵白球 / Ghost cue ball
    const ghostGeo = new THREE.SphereGeometry(BALL_RADIUS, 16, 16);
    const ghostMat = new THREE.MeshStandardMaterial({
      color: 0xf5f5f0,
      transparent: true,
      opacity: 0.5,
      roughness: 0.3,
    });
    this.ghostBall = new THREE.Mesh(ghostGeo, ghostMat);
    this.ghostBall.visible = false;
    this.sceneManager.add(this.ghostBall);

    // D 区高亮圆面 / D-zone highlight disc
    const dZoneGeo = new THREE.CircleGeometry(D_RADIUS, 32, Math.PI / 2, Math.PI);
    const dZoneMat = new THREE.MeshBasicMaterial({
      color: 0x44ff44,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
    });
    this.dZoneHighlight = new THREE.Mesh(dZoneGeo, dZoneMat);
    this.dZoneHighlight.rotation.x = -Math.PI / 2;
    this.dZoneHighlight.position.set(D_CENTER.x, 0.003, D_CENTER.z);
    this.dZoneHighlight.visible = false;
    this.sceneManager.add(this.dZoneHighlight);
  }

  /** 创建地板 / Create floor */
  private createFloor(): void {
    const floorGeo = new THREE.PlaneGeometry(20, 20);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x2a2a3e,
      roughness: 0.9,
      metalness: 0.0,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(TABLE_LENGTH / 2, -0.85, TABLE_WIDTH / 2);
    floor.receiveShadow = true;
    this.sceneManager.add(floor);

    // 添加天花板 / Add ceiling
    const ceilGeo = new THREE.PlaneGeometry(20, 20);
    const ceilMat = new THREE.MeshStandardMaterial({
      color: 0x222233,
      roughness: 0.9,
    });
    const ceiling = new THREE.Mesh(ceilGeo, ceilMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(TABLE_LENGTH / 2, 4, TABLE_WIDTH / 2);
    this.sceneManager.add(ceiling);
  }

  /** 设置 UI 回调 / Setup UI callbacks */
  private setupUICallbacks(): void {
    document.getElementById('change-colour')!.addEventListener('click', () => {
      const frame = this.gameState.match?.frame;
      if (this.gameState.getState() !== GameState.AIMING || this.isAITurn() ||
          !frame?.lastPottedWasRed || !frame.nominatedColour) return;
      this.enterBallChoice(false, true);
    });
    this.uiManager.setCallbacks({
      onStartGame: (config) => this.startGame(config),
      onPlayAgain: () => this.playAgain(),
      onBackToMenu: () => this.backToMenu(),
      onPause: () => this.pauseGame(),
      onResume: () => this.resumeGame(),
      onNextFrame: () => this.nextFrame(),
    });
  }

  /** 开始游戏 / Start game */
  private startGame(config: GameConfig): void {
    this.paused = false; this.aiIsThinking = false; this.aiThinkTimer = 0;
    this.inputManager.setSuspended(false); this.aimController.clearPendingInput();
    this.audioManager.init(); // 需要用户交互后初始化 / Init after user interaction

    this.gameState.startMatch(config);
    this.spinSelector.reset();

    if (config.mode === GameMode.VS_AI) {
      this.aiController = new AIController(config.difficulty);
    } else {
      this.aiController = null;
    }

    // 重新摆球 / Re-rack balls
    this.rerackBalls();

    // 初始化游戏状态 / Initialize game state
    this.gameState.initBallStates(this.ballRenderer.balls);

    // 显示游戏 UI / Show game UI
    this.uiManager.showGame(this.gameState.match!);

    // 开球时进入 D 区放置状态 / Enter D-zone placing state for break shot
    this.enterPlacingState();
  }

  /** 重新摆球 / Re-rack balls */
  private rerackBalls(): void {
    // 清理旧的物理体和渲染体 / Clean up old bodies and meshes
    this.ballRenderer.dispose();

    // 清理物理世界中的球体 / Clean up ball bodies from physics world
    this.physicsWorld.removeAllBalls();

    // 重新创建球 / Re-create balls
    this.ballRenderer = new BallRenderer(this.physicsWorld, this.sceneManager.scene);
    this.ballRenderer.initBalls();
  }

  /** 再来一局 / Play again */
  private playAgain(): void {
    const config: GameConfig = {
      mode: this.gameState.match?.mode || GameMode.VS_AI,
      difficulty: this.gameState.match?.difficulty || 'medium' as any,
      totalFrames: this.gameState.match?.totalFrames || 1,
      player1Name: this.gameState.match?.playerNames[0] || 'Player 1',
      player2Name: this.gameState.match?.playerNames[1] || 'AI',
    };
    this.startGame(config);
  }

  /** 返回菜单 / Back to menu */
  private backToMenu(): void {
    this.paused = false; this.aiIsThinking = false; this.aiThinkTimer = 0;
    this.inputManager.setSuspended(false); this.aimController.disable();
    this.aimController.clearPendingInput(); this.spinSelector.hide();
    this.cueRenderer.hide(); this.guideLines.clear(); this.shotControls.setVisible(false);
    if (this.ghostBall) this.ghostBall.visible = false;
    if (this.dZoneHighlight) this.dZoneHighlight.visible = false;
    this.gameState.setState(GameState.MENU);
    this.gameState.match = null;
    this.rerackBalls();
    this.uiManager.showMenu();
  }

  private pauseGame(): void {
    if (this.paused || !this.gameState.match ||
        [GameState.MENU, GameState.GAME_OVER, GameState.FRAME_OVER].includes(this.gameState.getState())) return;
    this.paused = true;
    this.inputManager.setSuspended(true); this.aimController.clearPendingInput();
    this.uiManager.showPause();
  }

  private resumeGame(): void {
    if (!this.paused) return;
    this.uiManager.hidePause();
    this.inputManager.setSuspended(false); this.aimController.clearPendingInput();
    this.paused = false;
    (document.activeElement as HTMLElement | null)?.blur();
  }

  private nextFrame(): void {
    if (!this.gameState.continueFrame()) return;
    this.inputManager.setSuspended(false); this.aiIsThinking = false;
    this.rerackBalls(); this.gameState.initBallStates(this.ballRenderer.balls);
    this.uiManager.showGame(this.gameState.match!);
    this.enterPlacingState();
  }

  // ============================================================================
  // 状态切换 / State Transitions
  // ============================================================================

  /** 进入瞄准状态 / Enter aiming state */
  private enterAimingState(preserveSetup = false): void {
    const frame = this.gameState.match?.frame;
    if (this.gameState.match) this.uiManager.updateScoreboard(this.gameState.match);
    if (frame?.freeBallAvailable) { this.enterBallChoice(true); return; }
    if (frame?.lastPottedWasRed && !frame.nominatedColour) { this.enterBallChoice(false); return; }
    const power = this.aimController.getPower();
    if (!preserveSetup) this.shotControls.reset();
    this.accessKey = '';
    document.getElementById('change-colour')!.hidden =
      !frame?.lastPottedWasRed || !frame.nominatedColour || this.isAITurn();
    if (frame) {
      const names: Record<string, string> = { red: '红球', yellow: '黄球', green: '绿球',
        brown: '棕球', blue: '蓝球', pink: '粉球', black: '黑球' };
      const on = this.gameState.getRulesEngine().getBallOnCalculator().getBallOn(frame);
      const nominated = this.ballRenderer.balls.find(b => b.id === frame.nominatedFreeBall);
      document.getElementById('ball-on')!.textContent = nominated
        ? '自由球：' + names[nominated.type] + ' 代替 ' + on.map(b => names[b]).join(' / ')
        : '本杆目标：' + on.map(b => names[b]).join(' / ');
      const cue = this.ballRenderer.getCueBall();
      const touching = cue ? this.gameState.getRulesEngine().getTouchingBall()
        .getTouchingBallMessage(cue, this.ballRenderer.balls, frame) : '';
      document.getElementById('touching-info')!.textContent = touching;
      document.getElementById('touching-info')!.hidden = !touching;
    }

    // 清除残留输入 (防止 UI 点击触发击球) / Clear stale input (prevent UI clicks from firing shots)
    this.inputManager.resetFrameDeltas();
    this.aimingWarmup = 0.15; // 150ms 保护期 / 150ms guard period

    this.gameState.setState(GameState.AIMING);
    this.aimController.enable();
    if (preserveSetup) this.aimController.setPower(power);
    this.spinSelector.show();
    this.cueRenderer.show();
    this.camera.setMode(CameraMode.AIMING);

    // 隐藏放置预览元素 / Hide placement preview elements
    if (this.dZoneHighlight) this.dZoneHighlight.visible = false;
    if (this.ghostBall) this.ghostBall.visible = false;
    this.uiManager.hideMessage();

    // 更新计分板 / Update scoreboard
    if (this.gameState.match) {
      this.uiManager.updateScoreboard(this.gameState.match);
    }

    // 检查是否是 AI 的回合 / Check if it's AI's turn
    if (this.isAITurn()) {
      this.startAITurn();
    }
  }

  private enterBallChoice(free: boolean, reselect = false): void {
    const frame = this.gameState.match!.frame;
    const on = this.gameState.getRulesEngine().getBallOnCalculator().getBallOn(frame);
    const candidates = free
      ? this.gameState.getRulesEngine().getFreeBallRule().getNominatableBalls(this.ballRenderer.balls, on)
      : this.gameState.getRulesEngine().getBallOnCalculator().getColourChoices(frame, this.ballRenderer.balls);
    this.gameState.setState(GameState.FREE_BALL_SELECT);
    this.aimController.disable(); this.cueRenderer.hide(); this.guideLines.clear();
    const choose = (ball: BallBody | null) => {
      if (free) {
        if (!this.gameState.nominateFreeBall(ball?.id ?? null, this.ballRenderer.balls)) return;
      }
      else frame.nominatedColour = ball!.type;
      this.enterAimingState(reselect);
    };
    if (this.isAITurn()) { choose(free ? null : candidates[0]); return; }
    const names: Record<string, string> = { red: '红球', yellow: '黄球', green: '绿球',
      brown: '棕球', blue: '蓝球', pink: '粉球', black: '黑球' };
    this.uiManager.showMessage(free ? '自由球 · 指定代替球' : '请选择本杆彩球',
      (free ? '被指定的球按目标球计分，进袋后复位。须先碰指定球（可同时碰目标球）。无得分时不得用它造成斯诺克，仅剩黑球与另一颗彩球时例外。也可以放弃自由球。' : '本杆必须首先碰到指定的彩球，出杆前可以更换。') +
        '\n' + this.gameState.getRulesEngine().getTouchingBall().getTouchingBallMessage(
          this.ballRenderer.getCueBall()!, this.ballRenderer.balls, frame),
      [...candidates.map(b => ({ text: names[b.type], onClick: () => choose(b) })),
        ...(free ? [{ text: '放弃自由球', onClick: () => choose(null) }] : []),
        ...(reselect ? [{ text: '保留原选择', onClick: () => this.enterAimingState(true) }] : [])]);
  }

  /** 检查是否是 AI 的回合 / Check if it's the AI's turn */
  private isAITurn(): boolean {
    if (!this.gameState.match) return false;
    return (
      this.gameState.match.mode === GameMode.VS_AI &&
      this.gameState.match.frame.striker === 1
    );
  }

  /** 开始 AI 回合 / Start AI turn */
  private startAITurn(): void {
    // 清除残留输入 / Clear stale input
    this.inputManager.resetFrameDeltas();

    this.aimController.disable();
    this.spinSelector.hide();
    this.cueRenderer.hide();
    this.guideLines.clear();

    this.aiIsThinking = true;
    this.aiThinkTimer = (this.aiController as any)?.getThinkTime?.() || AI_THINK_TIME;

    // UI 提示 / UI prompt
    this.uiManager.showMessage('AI 思考中...', 'AI is thinking...', []);
  }

  /** 进入放置状态 (白球 in-hand) / Enter placing state */
  private enterPlacingState(): void {
    if (this.gameState.match) this.uiManager.updateScoreboard(this.gameState.match);
    this.gameState.setState(GameState.PLACING);
    this.aimController.disable();
    this.cueRenderer.hide();
    this.guideLines.clear();
    this.camera.setMode(CameraMode.PLACING);

    // 显示 D 区高亮和幽灵球 / Show D-zone highlight and ghost ball
    if (this.dZoneHighlight) this.dZoneHighlight.visible = true;
    if (this.ghostBall) this.ghostBall.visible = true;

    this.uiManager.showPlacementHint();
  }

  // ============================================================================
  // 主循环更新 / Main Loop Update
  // ============================================================================

  /** 主更新函数 (每帧调用) / Main update function (called each frame) */
  private update(dt: number): void {
    if (this.paused || this.gameState.getState() === GameState.FRAME_OVER ||
        this.gameState.getState() === GameState.GAME_OVER) {
      this.inputManager.resetFrameDeltas(); return;
    }
    const state = this.gameState.getState();
    this.shotControls.setVisible(state === GameState.AIMING && !this.isAITurn());
    switch (state) {
      case GameState.AIMING:
        this.updateAiming(dt);
        break;
      case GameState.SHOOTING:
        this.updateShooting(dt);
        break;
      case GameState.SIMULATING:
        this.updateSimulating(dt);
        break;
      case GameState.EVALUATING:
        this.updateEvaluating();
        break;
      case GameState.PLACING:
        this.updatePlacing(dt);
        break;
      case GameState.MISS_CHOICE:
      case GameState.BLACK_CHOICE:
        // 等待 UI 选择 / Wait for UI choice
        break;
      case GameState.GAME_OVER:
        break;
    }

    // 更新相机 / Update camera
    this.camera.setCueSetup(this.shotControls.elevation, this.shotControls.bridge !== 'hand');
    const cueBall = this.ballRenderer.getCueBall();
    this.camera.update(cueBall?.getPosition() || null, dt);

    // 更新球的渲染位置 / Update ball render positions
    this.ballRenderer.update();

    // 重置输入增量 / Reset input deltas
    this.inputManager.resetFrameDeltas();
  }

  /** 瞄准状态更新 / Aiming state update */
  private updateAiming(dt: number): void {
    // 保护期倒计时 / Warmup countdown
    if (this.aimingWarmup > 0) {
      this.aimingWarmup -= dt;
      // 保护期内清除所有输入 / Clear all input during warmup
      this.inputManager.resetFrameDeltas();
    }

    if (this.aiIsThinking) {
      this.aiThinkTimer -= dt;
      if (this.aiThinkTimer <= 0) {
        this.executeAIShot();
      }
      return;
    }

    // 更新瞄准 / Update aiming
    const shotFired = this.aimController.update(dt);

    // 计算实际力度 / Compute actual power
    const actualPower = this.aimController.getActualPower();

    // 更新辅助线 / Update guide lines
    const cueBall = this.ballRenderer.getCueBall();
    if (cueBall && cueBall.isOnTable) {
      const aimDir = this.camera.getAimDirection();
      const ballsOnTable = this.ballRenderer.getBallsOnTable();
      const spin = { ...this.spinSelector.getSpin(), elevation: this.shotControls.elevation };
      const makeAccessKey = () => JSON.stringify([aimDir, spin, this.shotControls.bridge,
        this.shotControls.cueElevation.automatic,
        ballsOnTable.map(b => [b.id, b.posX, b.posY, b.posZ])]);
      const accessKey = makeAccessKey();
      if (accessKey !== this.accessKey) {
        this.cueAccess = this.shotControls.cueElevation.assess(cueBall, ballsOnTable, aimDir, spin, this.shotControls.bridge);
        spin.elevation = this.shotControls.elevation;
        this.accessKey = makeAccessKey();
      }
      this.shotControls.update(this.cueAccess!);
      if (this.cueAccess!.allowed) this.guideLines.update(cueBall, aimDir, ballsOnTable, spin, actualPower);
      else this.guideLines.clear();

      // 更新球杆位置 / Update cue position
      this.cueRenderer.updateAim(cueBall.getPosition(), this.camera.getAimAngle(), spin,
        this.shotControls.bridge, this.cueAccess!.allowed);
    }

    // 检查是否击球 / Check if shot was fired
    if (shotFired && this.cueAccess?.allowed) {
      this.executeShot();
    }
  }

  /** 执行击球 / Execute shot */
  private executeShot(): void {
    const cueBall = this.ballRenderer.getCueBall();
    if (!cueBall || !cueBall.isOnTable) return;

    // 清除残留输入，防止连续触发 / Clear stale input to prevent double-fire
    this.inputManager.resetFrameDeltas();

    const aimDir = this.camera.getAimDirection();
    const power = this.aimController.getActualPower();
    const spin = { ...this.spinSelector.getSpin(), elevation: this.shotControls.elevation };

    if (!assessCueAccess(cueBall, this.ballRenderer.balls, aimDir, spin, this.shotControls.bridge).allowed) return;
    // 禁用输入 / Disable input
    this.aimController.disable();
    this.guideLines.clear();
    this.cueRenderer.hide();
    this.spinSelector.hide();

    this.physicsWorld.resetShot();
    this.jumpRule = new JumpRule(cueBall, this.ballRenderer.balls);
    this.gameState.startShot(cueBall, this.ballRenderer.balls);

    // 施加力和旋转 / Apply force and spin
    const vx = aimDir.x * power;
    const vz = aimDir.z * power;
    cueBall.setVelocity(vx, 0, vz);

    // 施加旋转 / Apply spin
    this.spinPhysics.applySpin(cueBall, spin, aimDir);

    // 播放击球音效 / Play strike sound
    this.audioManager.playStrike(power);

    // 开始追踪 / Start tracking
    this.camera.setMode(CameraMode.TRACKING);

    this.gameState.setState(GameState.SIMULATING);
  }

  /** 执行 AI 击球 / Execute AI shot */
  private executeAIShot(): void {
    this.aiIsThinking = false;
    this.uiManager.hideMessage();

    const cueBall = this.ballRenderer.getCueBall();
    if (!cueBall || !cueBall.isOnTable || !this.aiController || !this.gameState.match) return;

    // 计算 AI 方案 / Calculate AI plan
    const plan = this.aiController.calculateShot(
      cueBall,
      this.ballRenderer.balls,
      this.gameState.match.frame,
    );

    const access = assessCueAccess(cueBall, this.ballRenderer.balls, plan.direction, plan.spin);
    if (!access.allowed) plan.spin.elevation = Math.min(80, access.minimumElevation + 0.5);
    // 设置相机方向 / Set camera direction
    const angle = Math.atan2(plan.direction.z, plan.direction.x);
    this.camera.setAimAngle(angle);

    this.physicsWorld.resetShot();
    this.jumpRule = new JumpRule(cueBall, this.ballRenderer.balls);
    this.gameState.startShot(cueBall, this.ballRenderer.balls);

    // 施加力和旋转 / Apply force and spin
    const vx = plan.direction.x * plan.power;
    const vz = plan.direction.z * plan.power;
    cueBall.setVelocity(vx, 0, vz);
    this.spinPhysics.applySpin(cueBall, plan.spin, plan.direction);

    // 播放击球音效 / Play strike sound
    this.audioManager.playStrike(plan.power);

    // 开始追踪 / Start tracking
    this.camera.setMode(CameraMode.TRACKING);
    this.gameState.setState(GameState.SIMULATING);
  }

  /** 击球动画更新 / Shot animation update */
  private updateShooting(dt: number): void {
    // 球杆动画 / Cue animation
    const done = this.cueRenderer.updateAnimation(dt);
    if (done) {
      this.gameState.setState(GameState.SIMULATING);
    }
  }

  /** 物理模拟更新 / Physics simulation update */
  private updateSimulating(dt: number): void {
    // 步进物理 (含旋转效果) / Step physics (includes spin effects)
    this.physicsWorld.step(dt);

    // 检测进袋和碰撞 / Detect potting and collisions
    this.checkPotsAndCollisions();

    // 检查所有球是否停止 / Check if all balls have stopped
    const activeBalls = this.ballRenderer.balls.filter(b => b.isOnTable && !b.isPotted);

    if (this.physicsWorld.allBallsAtRest(activeBalls)) {
      this.spinPhysics.clearAll();
      this.gameState.setState(GameState.EVALUATING);
    }
  }

  /** 检测进袋和碰撞 / Check for pots and collisions */
  private checkPotsAndCollisions(): void {
    const cueBall = this.ballRenderer.getCueBall();
    // Consume chronological events even if the struck ball pots later in this frame.
    for (const event of this.physicsWorld.drainEvents()) {
      this.gameState.recordTouchingPush(event.touchingPushIds ?? []);
      this.jumpRule?.record(event, cueBall);
      if (this.gameState.shotTracker) this.gameState.shotTracker.jumpShot = this.jumpRule?.foul ?? false;
      if (event.kind === 'off') this.gameState.shotTracker?.ballsOffTable.push(event.ball);
      if (event.kind === 'pot') {
        this.gameState.recordPot(event.ball);
        this.audioManager.playPot();
      } else if (event.kind === 'ball' && event.other) {
        if (event.ball === cueBall) this.gameState.recordCollision(cueBall, event.other, event.time);
        else if (event.other === cueBall) this.gameState.recordCollision(cueBall, event.ball, event.time);
        if (event.speed > 0.03) this.audioManager.playCollision(event.speed);
      }
    }
    for (const ball of this.ballRenderer.balls) ball.clearCollisions();
  }

  /** 评估更新 / Evaluating update */
  private updateEvaluating(): void {
    const cueBall = this.ballRenderer.getCueBall();
    if (!cueBall || !this.gameState.match) return;
    const objectsBefore = this.gameState.match.frame.balls.filter(b => b.isOnTable && !b.isPotted && b.type !== BallType.CUE);
    const finalBlack = this.gameState.match.frame.phase === GamePhase.COLOURS &&
      objectsBefore.length === 1 && objectsBefore[0].type === BallType.BLACK;

    // Clear the next shot's tip offset only after the current shot has finished.
    this.spinSelector.reset();

    // 评估击球结果 / Evaluate shot result
    const result = this.gameState.evaluateShot(
      this.ballRenderer.balls,
      cueBall,
    );

    const nextState = this.gameState.getState();
    if (this.gameState.frameSummary) {
      if (result.foul) this.audioManager.playFoul();
      this.inputManager.setSuspended(true); this.aimController.disable();
      this.aiIsThinking = false; this.shotControls.setVisible(false);
      this.spinSelector.hide(); this.cueRenderer.hide(); this.guideLines.clear();
      if (this.ghostBall) this.ghostBall.visible = false;
      if (this.dZoneHighlight) this.dZoneHighlight.visible = false;
      this.uiManager.updateScoreboard(this.gameState.match);
      this.uiManager.showFrameSummary(this.gameState.frameSummary);
      return;
    }
    if (result.foul) {
      this.audioManager.playFoul();
      this.gameState.setState(GameState.MISS_CHOICE); // Prevent controls running behind the decision.
      const reasons: Partial<Record<FoulType, string>> = {
        [FoulType.JUMP_SHOT]: '越球犯规', [FoulType.CUE_POTTED]: '白球落袋',
        [FoulType.NO_CONTACT]: '未碰到目标球', [FoulType.WRONG_BALL_FIRST]: '首先碰错球',
        [FoulType.BALL_OFF_TABLE]: '球离开台面', [FoulType.CUE_OFF_TABLE]: '白球离开台面',
        [FoulType.WRONG_POT]: '非目标球落袋', [FoulType.FREE_BALL_SNOOKER]: '以指定自由球造成斯诺克',
        [FoulType.PUSH_STROKE]: '推杆犯规：出杆时推动贴球',
      };
      this.uiManager.showMessage(reasons[result.foul] ?? '犯规',
        '罚 ' + result.penaltyPoints + ' 分给对手' + (result.freeBallAvailable ? ' · 对手获得自由球' : '') +
          (finalBlack ? '\n最后黑球：按本杆后的比分判定胜负，平分则重置黑球。' :
            result.replayBlockedByScore ? '\n本杆前或罚分后已超分，不能复位；仍可让犯规方从现有球位继续。' :
            result.isMiss ? '\nFoul and a Miss：可保留罚分并复位重打（延分时也可复位）。' : ''),
        [{ text: '继续', onClick: () => { this.gameState.acceptFoul(); this.gameState.setState(nextState); this.afterEvaluation(result); } },
          ...(!finalBlack ? [{ text: '让对方继续打（现有球位）', onClick: () => {
            this.gameState.requireOffenderToPlay(); this.afterEvaluation(result);
          } }] : []),
          ...(this.gameState.canReplayShot() ? [{ text: '复位重打', onClick: () => {
            if (this.gameState.replayShot(this.ballRenderer.balls)) this.enterAimingState();
          } }] : [])]);
    } else this.afterEvaluation(result);

    // 更新计分板 / Update scoreboard
    if (this.gameState.match) {
      this.uiManager.updateScoreboard(this.gameState.match);
    }
  }

  /** 评估后的处理 / Post-evaluation handling */
  private afterEvaluation(result: any): void {
    // 清除残留输入 / Clear stale input
    this.inputManager.resetFrameDeltas();
    if (this.gameState.match?.frame.balls.length === 0 && this.gameState.getState() !== GameState.GAME_OVER) {
      this.rerackBalls(); this.gameState.initBallStates(this.ballRenderer.balls); this.enterPlacingState(); return;
    }

    const state = this.gameState.getState();

    if (state === GameState.BLACK_CHOICE) {
      this.enterBlackChoice();
    } else if (state === GameState.FREE_BALL_SELECT) {
      this.enterBallChoice(true);
    } else if (state === GameState.PLACING) {
      this.enterPlacingState();
    } else if (state === GameState.GAME_OVER) {
      this.showGameOver();
    } else {
      // 重新显示白球 (如果还在台上的话) / Show cue ball (if still on table)
      const cueBall = this.ballRenderer.getCueBall();
      if (cueBall && cueBall.isOnTable) {
        this.enterAimingState();
      } else {
        this.enterPlacingState();
      }
    }
  }

  private enterBlackChoice(): void {
    const match = this.gameState.match!;
    const chooser = match.frame.blackChoicePlayer!;
    this.aimController.disable(); this.cueRenderer.hide(); this.guideLines.clear();
    this.shotControls.setVisible(false); this.spinSelector.hide(); this.aiIsThinking = false;
    const choose = (player: number) => {
      if (this.gameState.chooseBlackStarter(player)) this.enterPlacingState();
    };
    const aiChooses = match.mode === GameMode.VS_AI && chooser === 1;
    this.uiManager.showMessage('平分争黑 · 黑球重置',
      `比分 ${match.frame.scores[0]} : ${match.frame.scores[1]}。抽签由 ${match.playerNames[chooser]} 获得选择权。` +
      '\n先打者从 D 区手中球开球；首次进黑球或犯规即决定本局胜负。' +
      (aiChooses ? '\nAI 选择自己先打。' : ''),
      aiChooses ? [{ text: '继续', onClick: () => choose(1) }] : [
        { text: '自己先打', onClick: () => choose(chooser) },
        { text: '让对方先打', onClick: () => choose(1 - chooser) },
      ]);
  }

  /** 放置状态更新 / Placing state update */
  private updatePlacing(dt: number): void {
    // 实时更新幽灵球位置 (跟随鼠标在台面上的投射点) / Update ghost ball position (follows mouse projection on table)
    this.updateGhostBallPosition();

    // 检测鼠标点击 (非拖动) 放置白球 / Detect mouse click (non-drag) to place cue ball
    if (this.inputManager.justClicked) {
      this.handlePlacementClick();
    }
  }

  /**
   * 更新幽灵球位置 (跟随鼠标) / Update ghost ball position (follows mouse)
   */
  private updateGhostBallPosition(): void {
    if (!this.ghostBall) return;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(
      (this.inputManager.mousePixelX / window.innerWidth) * 2 - 1,
      -(this.inputManager.mousePixelY / window.innerHeight) * 2 + 1,
    );
    raycaster.setFromCamera(mouse, this.sceneManager.camera);

    const tablePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const intersection = new THREE.Vector3();
    const hit = raycaster.ray.intersectPlane(tablePlane, intersection);

    if (hit) {
      // 检查是否在 D 区内 / Check if within D-zone
      const inDZone = this.isInDZone(intersection.x, intersection.z);

      // 更新幽灵球位置和颜色 / Update ghost ball position and color
      this.ghostBall.position.set(intersection.x, BALL_RADIUS, intersection.z);

      const mat = this.ghostBall.material as THREE.MeshStandardMaterial;
      if (inDZone) {
        mat.color.setHex(0xf5f5f0); // 白色 = 有效 / White = valid
        mat.opacity = 0.6;
      } else {
        mat.color.setHex(0xff4444); // 红色 = 无效 / Red = invalid
        mat.opacity = 0.3;
      }
    }
  }

  /**
   * 检查位置是否在 D 区内 / Check if position is in D-zone
   */
  private isInDZone(x: number, z: number): boolean {
    if (x > BAULK_LINE_X + 0.001) return false;
    const dx = x - D_CENTER.x;
    const dz = z - D_CENTER.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    return dist <= D_RADIUS + 0.001;
  }

  /**
   * 处理放置点击 / Handle placement click
   *
   * 使用 Three.js 射线投射将屏幕点击位置转换为台面坐标
   * 然后检查该位置是否在 D 区内，如果是则放置白球
   *
   * Uses Three.js raycasting to convert screen click to table coordinates,
   * then checks if position is within D-zone and places the cue ball
   */
  private handlePlacementClick(): void {
    // 创建射线投射器 / Create raycaster
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(
      (this.inputManager.clickX / window.innerWidth) * 2 - 1,
      -(this.inputManager.clickY / window.innerHeight) * 2 + 1,
    );
    raycaster.setFromCamera(mouse, this.sceneManager.camera);

    // 创建台面平面用于投射 / Create table plane for raycasting
    // 台面在 Y=0，法线朝上 / Table surface at Y=0, normal up
    const tablePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const intersection = new THREE.Vector3();
    raycaster.ray.intersectPlane(tablePlane, intersection);

    if (!intersection) return;

    // intersection.x 和 intersection.z 就是台面坐标
    // intersection.x and intersection.z are table coordinates
    const tableX = intersection.x;
    const tableZ = intersection.z;

    // 尝试放置白球 / Try to place cue ball
    const success = this.gameState.placeCueBall(
      tableX,
      tableZ,
      this.ballRenderer.balls,
    );

    if (success) {
      this.uiManager.hideMessage();
      this.enterAimingState();
    }
  }

  /** 显示游戏结束 / Show game over */
  private showGameOver(): void {
    if (!this.gameState.match) return;

    const match = this.gameState.match;
    const winner = match.framesWon[0] > match.framesWon[1] ? 0 : 1;

    this.uiManager.showGameOver(
      winner,
      match.frame.scores,
      match.framesWon,
      match.playerNames,
    );
  }
}

// ============================================================================
// 启动游戏 / Start Game
// ============================================================================

// 等待 DOM 加载完成 / Wait for DOM to load
window.addEventListener('DOMContentLoaded', () => {
  new SnookerGame();
});
