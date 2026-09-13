/**
 * 全局类型定义 / Global Type Definitions
 *
 * 定义游戏中使用的所有枚举、接口和类型别名
 * Defines all enums, interfaces, and type aliases used throughout the game
 */

// ============================================================================
// 枚举类型 / Enumerations
// ============================================================================

/** 球的类型 / Ball types */
export enum BallType {
  CUE = 'cue',       // 白球 (母球) / Cue ball (white)
  RED = 'red',       // 红球 / Red ball
  YELLOW = 'yellow', // 黄球 (2分) / Yellow (2 pts)
  GREEN = 'green',   // 绿球 (3分) / Green (3 pts)
  BROWN = 'brown',   // 棕球 (4分) / Brown (4 pts)
  BLUE = 'blue',     // 蓝球 (5分) / Blue (5 pts)
  PINK = 'pink',     // 粉球 (6分) / Pink (6 pts)
  BLACK = 'black',   // 黑球 (7分) / Black (7 pts)
}

/** 判断是否为彩球 / Check if a ball type is a colour ball */
export function isColour(type: BallType): boolean {
  return type !== BallType.CUE && type !== BallType.RED;
}

/** 获取球的分值 / Get point value of a ball */
export function ballValue(type: BallType): number {
  switch (type) {
    case BallType.RED: return 1;
    case BallType.YELLOW: return 2;
    case BallType.GREEN: return 3;
    case BallType.BROWN: return 4;
    case BallType.BLUE: return 5;
    case BallType.PINK: return 6;
    case BallType.BLACK: return 7;
    case BallType.CUE: return 0;
  }
}

/** 游戏阶段 / Game phases */
export enum GamePhase {
  /** 红球阶段: 交替打红球和彩球 / Reds phase: alternate red and colour */
  REDS = 'reds',
  /** 清彩球阶段: 按分值从低到高 / Colours phase: pot colours low to high */
  COLOURS = 'colours',
}

/** 游戏状态 / Game states (state machine) */
export enum GameState {
  /** 主菜单 / Main menu */
  MENU = 'menu',
  /** 瞄准中 / Aiming */
  AIMING = 'aiming',
  /** 击球动画 / Shot animation (cue striking) */
  SHOOTING = 'shooting',
  /** 球在运动中 / Balls in motion (physics simulating) */
  SIMULATING = 'simulating',
  /** 规则结算中 / Evaluating shot result */
  EVALUATING = 'evaluating',
  /** 白球需要放置 (in-hand) / Cue ball needs placement */
  PLACING = 'placing',
  /** 等待对手选择 (Miss 规则) / Waiting for opponent's choice (Miss rule) */
  MISS_CHOICE = 'miss_choice',
  /** 自由球选择中 / Free ball selection */
  FREE_BALL_SELECT = 'free_ball_select',
  /** Frame result awaits the player's acknowledgement before re-racking. */
  FRAME_OVER = 'frame_over',
  /** 比赛结束 / Match over */
  GAME_OVER = 'game_over',
}

/** 游戏模式 / Game modes */
export enum GameMode {
  /** 人机对战 / Player vs AI */
  VS_AI = 'ai',
  /** 双人轮流 / Pass and Play (two players) */
  PASS_PLAY = 'pvp',
}

/** AI 难度 / AI difficulty levels */
export enum AIDifficulty {
  EASY = 'easy',
  MEDIUM = 'medium',
  HARD = 'hard',
}

/** 犯规类型 / Foul types */
export enum FoulType {
  /** 白球进袋 / Cue ball potted */
  CUE_POTTED = 'cue_potted',
  /** 未碰到任何球 / No ball contacted */
  NO_CONTACT = 'no_contact',
  /** 首先碰到非目标球 / Wrong ball first */
  WRONG_BALL_FIRST = 'wrong_ball_first',
  /** 白球飞出台面 / Cue ball off table */
  CUE_OFF_TABLE = 'cue_off_table',
  /** 非目标球飞出台面 / Non-cue ball off table */
  BALL_OFF_TABLE = 'ball_off_table',
  /** 同时碰到两颗非红球 / Simultaneous contact (non-reds) */
  SIMULTANEOUS = 'simultaneous',
  /** 推杆 / Push stroke */
  PUSH_STROKE = 'push_stroke',
  /** 跳球 / Jump shot */
  JUMP_SHOT = 'jump_shot',
  FREE_BALL_SNOOKER = 'free_ball_snooker',
  /** 目标球进错袋 (清彩球阶段) / Wrong pot in colours phase */
  WRONG_POT = 'wrong_pot',
}

/** 相机模式 / Camera modes */
export enum CameraMode {
  /** 瞄准视角 (白球后方) / Aiming view (behind cue ball) */
  AIMING = 'aiming',
  /** 追踪视角 (球运动中) / Tracking view (balls in motion) */
  TRACKING = 'tracking',
  /** 放置视角 (D区上方) / Placement view (above D-zone) */
  PLACING = 'placing',
  /** 回放视角 / Replay view */
  REPLAY = 'replay',
}

// ============================================================================
// 接口定义 / Interfaces
// ============================================================================

/** 3D 向量 / 3D Vector (simple representation) */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** 2D 向量 / 2D Vector */
export interface Vec2 {
  x: number;
  y: number;
}

/** 球的状态 / Ball state */
export interface BallState {
  /** 球的唯一标识 / Unique ball identifier */
  id: string;
  /** 球的类型 / Ball type */
  type: BallType;
  /** 当前位置 / Current position */
  position: Vec3;
  /** 线速度 / Linear velocity */
  velocity: Vec3;
  /** 角速度 (旋转) / Angular velocity (spin) */
  angularVelocity: Vec3;
  /** 是否已进袋 / Whether the ball has been potted */
  isPotted: boolean;
  /** 是否在台面上 / Whether the ball is on the table */
  isOnTable: boolean;
}

/** 旋转参数 / Spin parameters */
export interface SpinParams {
  /** Cue elevation in degrees above horizontal. */
  elevation?: number;
  /** 左右旋转 (负=左塞, 正=右塞) / Side spin (negative=left, positive=right) */
  side: number;
  /** 上下旋转 (负=低杆, 正=高杆) / Vertical spin (negative=bottom, positive=top) */
  vertical: number;
}

/** 击球参数 / Shot parameters */
export interface ShotParams {
  /** 击球方向 (单位向量) / Shot direction (unit vector in XZ plane) */
  direction: Vec3;
  /** 击球力度 / Shot power */
  power: number;
  /** 旋转参数 / Spin parameters */
  spin: SpinParams;
}

/** 击球结果 / Shot result (computed after all balls stop) */
export interface ShotResult {
  /** 本杆进球列表 / List of balls potted this shot */
  ballsPotted: BallType[];
  /** 首先碰到的球 / First ball contacted */
  firstBallHit: BallType | null;
  /** 犯规类型 / Foul type (null if no foul) */
  foul: FoulType | null;
  /** 犯规涉及的最高分值球 / Highest value ball involved in foul */
  foulBallValue: number;
  /** 罚分 / Penalty points awarded to opponent */
  penaltyPoints: number;
  /** 得分 / Points scored by striker */
  scorePoints: number;
  /** 是否换人 / Whether turn switches to opponent */
  switchTurn: boolean;
  /** 是否判 Miss / Whether a Miss is called */
  isMiss: boolean;
  /** 需要复位的彩球 / Colours that need re-spotting */
  needsRespot: BallType[];
  /** 白球是否 in-hand / Whether cue ball goes in-hand */
  cueBallInHand: boolean;
  /** 是否可以打自由球 / Whether free ball is available */
  freeBallAvailable: boolean;
  /** 本杆连续进球数 / Break (consecutive points in this visit) */
  breakPoints: number;
}

/** 一局(frame)的状态 / Frame state */
export interface FrameState {
  freeBallAvailable?: boolean;
  nominatedFreeBall?: string | null;
  nominatedColour?: BallType | null;
  /** 当前游戏阶段 / Current game phase */
  phase: GamePhase;
  /** 上一次打进的是否为红球 / Whether last potted ball was red */
  lastPottedWasRed: boolean;
  /** 当前击球者 (0 或 1) / Current striker (0 or 1) */
  striker: number;
  /** 双方得分 / Scores for both players */
  scores: [number, number];
  /** 剩余红球数 / Number of reds remaining on table */
  redsRemaining: number;
  /** 本杆得分 (break) / Current break */
  currentBreak: number;
  /** 连续 Miss 次数 / Consecutive miss count */
  consecutiveMisses: number;
  /** 所有球的状态 / State of all balls */
  balls: BallState[];
  /** 击球前快照 (用于 Miss 规则复位) / Pre-shot snapshot (for Miss rule re-spotting) */
  preShotSnapshot: BallState[] | null;
}

/** 比赛状态 / Match state */
export interface MatchState {
  /** 游戏模式 / Game mode */
  mode: GameMode;
  /** AI 难度 (仅人机模式) / AI difficulty (VS_AI mode only) */
  difficulty: AIDifficulty;
  /** 总局数 / Total number of frames */
  totalFrames: number;
  /** 当前局号 / Current frame number */
  currentFrame: number;
  /** 各方赢的局数 / Frames won by each player */
  framesWon: [number, number];
  /** 当前局状态 / Current frame state */
  frame: FrameState;
  /** 玩家名称 / Player names */
  playerNames: [string, string];
}

/** 游戏配置 / Game configuration */
export interface GameConfig {
  /** 游戏模式 / Game mode */
  mode: GameMode;
  /** AI 难度 / AI difficulty */
  difficulty: AIDifficulty;
  /** 总局数 / Total frames */
  totalFrames: number;
  /** 玩家 1 名称 / Player 1 name */
  player1Name: string;
  /** 玩家 2 名称 / Player 2 name (or "AI") */
  player2Name: string;
}

/** 难度配置 / Difficulty configuration */
export interface DifficultyConfig {
  /** 瞄准精度 (0~1) / Aiming accuracy */
  aimAccuracy: number;
  /** 力度控制精度 (0~1) / Power control accuracy */
  powerAccuracy: number;
  /** 旋转控制精度 (0~1) / Spin control accuracy */
  spinAccuracy: number;
  /** 策略水平 (1~3) / Strategy level */
  strategyLevel: number;
  /** 思考时间 (秒) / Think time (seconds) */
  thinkTime: number;
  /** 最大角度误差 (弧度) / Maximum angle error (radians) */
  maxAngleError: number;
  /** 力度误差比例 / Power error ratio */
  powerErrorRatio: number;
}

/** AI 击球方案 / AI shot plan */
export interface AIShotPlan {
  /** 目标球 / Target ball */
  targetBall: BallType;
  /** 瞄准方向 / Aim direction */
  direction: Vec3;
  /** 力度 / Power */
  power: number;
  /** 旋转 / Spin */
  spin: SpinParams;
  /** 方案评分 (越高越好) / Plan score (higher is better) */
  score: number;
  /** 是否是安全球 / Whether this is a safety shot */
  isSafety: boolean;
}

/** 碰撞事件数据 / Collision event data */
export interface CollisionEvent {
  /** 碰撞类型 / Collision type */
  type: 'ball-ball' | 'ball-cushion' | 'ball-table' | 'ball-pocket';
  /** 球 A 的 ID / Ball A's ID */
  ballA: string;
  /** 球 B 的 ID (仅 ball-ball 碰撞) / Ball B's ID (ball-ball only) */
  ballB?: string;
  /** 碰撞位置 / Collision position */
  position: Vec3;
  /** 碰撞力度 (用于音效) / Collision force (for audio) */
  force: number;
}

/** 事件总线事件类型 / Event bus event types */
export type GameEventType =
  | 'shot-fired'          // 击球 / Shot fired
  | 'ball-collision'      // 球碰撞 / Ball collision
  | 'ball-potted'         // 球进袋 / Ball potted
  | 'ball-respotted'      // 彩球复位 / Colour re-spotted
  | 'all-balls-stopped'   // 所有球停止 / All balls stopped
  | 'foul-called'         // 犯规 / Foul called
  | 'miss-called'         // Miss 判罚 / Miss called
  | 'free-ball'           // 自由球 / Free ball available
  | 'turn-switch'         // 换人 / Turn switch
  | 'frame-over'          // 一局结束 / Frame over
  | 'match-over'          // 比赛结束 / Match over
  | 'state-change'        // 状态切换 / State change
  | 'break-update';       // Break 更新 / Break update

// ============================================================================
// 工具函数 / Utility Types
// ============================================================================

/** 创建零向量 / Create zero vector */
export function vec3Zero(): Vec3 {
  return { x: 0, y: 0, z: 0 };
}

/** 创建向量 / Create vector */
export function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

/** 向量加法 / Vector addition */
export function vec3Add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

/** 向量减法 / Vector subtraction */
export function vec3Sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

/** 向量缩放 / Vector scaling */
export function vec3Scale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

/** 向量长度 / Vector length */
export function vec3Length(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

/** 向量归一化 / Vector normalization */
export function vec3Normalize(v: Vec3): Vec3 {
  const len = vec3Length(v);
  if (len === 0) return { x: 0, y: 0, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/** 向量点积 / Vector dot product */
export function vec3Dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** 深拷贝球状态数组 / Deep copy ball state array */
export function cloneBalls(balls: BallState[]): BallState[] {
  return balls.map(b => ({
    ...b,
    position: { ...b.position },
    velocity: { ...b.velocity },
    angularVelocity: { ...b.angularVelocity },
  }));
}
