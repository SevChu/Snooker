/**
 * 全局常量定义 / Global Constants
 *
 * Table/ball dimensions follow WPBSA; contact/material parameters are tunable approximations.
 * 所有物理量使用米(m)作为单位 / All physical quantities in meters (m)
 *
 * 坐标系说明 / Coordinate System:
 * - X 轴: 台面长边方向 (从左到右) / Long side of table (left to right)
 * - Y 轴: 垂直向上 / Vertical (up)
 * - Z 轴: 台面短边方向 (从下到上) / Short side of table (bottom to top)
 * - 原点: 台面左下角 (底库边与左库边交汇处的台面角落)
 *   Origin: bottom-left corner of the playing surface
 */

// ============================================================================
// 球台尺寸 / Table Dimensions
// ============================================================================

/** 台面长边 (库边内沿) / Playing surface length (between cushion noses) */
export const TABLE_LENGTH = 3.569;

/** 台面短边 (库边内沿) / Playing surface width (between cushion noses) */
export const TABLE_WIDTH = 1.778;

/** 库边高度 / Cushion height above playing surface */
export const CUSHION_HEIGHT = 0.039;

/** Separate nose/contact height and wood top; estimated L-profile setup, not a certified template. */
export const CUSHION_NOSE_HEIGHT = 0.031;
export const RAIL_TOP_HEIGHT = 0.039;
export const RESTITUTION_SLATE = 0.45;
export const LANDING_SLEEP_SPEED = 0.06;
export const MAX_CUE_ELEVATION = 80;

/** 库边宽度 (顶部平面) / Cushion rail width (top flat surface) */
export const CUSHION_RAIL_WIDTH = 0.05;

/** 台面边框总宽度 (含库边) / Total frame width including cushions */
export const FRAME_WIDTH = 0.15;

/** 台面厚度 (石板) / Table bed thickness (slate) */
export const TABLE_BED_THICKNESS = 0.05;

/** 台面整体高度 (含腿) / Total table height (with legs) */
export const TABLE_TOTAL_HEIGHT = 0.85;

// ============================================================================
// 球的参数 / Ball Parameters
// ============================================================================

/** 球的半径 (官方: 直径 52.5mm) / Ball radius (official: diameter 52.5mm) */
export const BALL_RADIUS = 0.02625;

/** Numerical contact tolerance: 0.01 mm, not a visible gap. */
export const TOUCHING_BALL_TOLERANCE = 1e-5;

/** 球的质量 / Ball mass (kg) */
export const BALL_MASS = 0.142;

/** 球的惯性矩 (实心球) / Ball moment of inertia (solid sphere) I = 2/5 * m * r^2 */
export const BALL_INERTIA = 0.4 * BALL_MASS * BALL_RADIUS * BALL_RADIUS;

// ============================================================================
// 袋口参数 / Pocket Parameters
// ============================================================================

/** 角袋开口半径 / Corner pocket opening radius */
export const CORNER_POCKET_RADIUS = 0.043; // 86mm 开口 / 86mm opening

/** 中袋开口半径 / Side (middle) pocket opening radius */
export const SIDE_POCKET_RADIUS = 0.045; // 90mm model opening; not a certified WPBSA template

/** 袋口深度 / Pocket depth (for rendering) */
export const POCKET_DEPTH = 0.10;

/**
 * 六个袋口位置 (台面坐标)
 * Pocket positions (table coordinates)
 *
 * 命名: BL=左下角, BR=右下角, TL=左上角, TR=右上角, ML=左中, MR=右中
 * Naming: BL=Bottom-Left, BR=Bottom-Right, TL=Top-Left, TR=Top-Right, ML=Middle-Left, MR=Middle-Right
 */
export const POCKET_POSITIONS = {
  BL: { x: 0,              z: 0 },               // 左下角 / Bottom-Left corner
  BR: { x: 0,              z: TABLE_WIDTH },      // 右下角 / Bottom-Right corner
  TL: { x: TABLE_LENGTH,   z: 0 },               // 左上角 / Top-Left corner
  TR: { x: TABLE_LENGTH,   z: TABLE_WIDTH },      // 右上角 / Top-Right corner
  ML: { x: TABLE_LENGTH / 2, z: 0 },              // 左中袋 / Middle-Left side
  MR: { x: TABLE_LENGTH / 2, z: TABLE_WIDTH },     // 右中袋 / Middle-Right side
} as const;

// ============================================================================
// 台面标记 / Table Markings
// ============================================================================

/** 开球线 (Baulk Line) 距底库边的距离 / Baulk line distance from bottom cushion */
export const BAULK_LINE_DISTANCE = 0.737; // 29 inches

/** D 区半径 / D-zone semicircle radius */
export const D_RADIUS = 0.292; // 11.5 inches

/** 开球线 X 坐标 / Baulk line X coordinate */
export const BAULK_LINE_X = BAULK_LINE_DISTANCE;

/** D 区圆心 (在开球线中点) / D-zone center (midpoint of baulk line) */
export const D_CENTER = { x: BAULK_LINE_X, z: TABLE_WIDTH / 2 };

// ============================================================================
// 彩球点位 / Colour Ball Spot Positions
// ============================================================================

/**
 * 黄球点位 (D 区右侧角) / Yellow spot (right corner of D)
 * 面向顶库时的右手边 / Right side when facing the top cushion
 */
export const YELLOW_SPOT = { x: BAULK_LINE_X, z: D_CENTER.z + D_RADIUS };

/**
 * 绿球点位 (D 区左侧角) / Green spot (left corner of D)
 * 面向顶库时的左手边 / Left side when facing the top cushion
 */
export const GREEN_SPOT = { x: BAULK_LINE_X, z: D_CENTER.z - D_RADIUS };

/** 棕球点位 (开球线中点) / Brown spot (center of baulk line) */
export const BROWN_SPOT = { x: BAULK_LINE_X, z: TABLE_WIDTH / 2 };

/** 蓝球点位 (台面中心) / Blue spot (center of table) */
export const BLUE_SPOT = { x: TABLE_LENGTH / 2, z: TABLE_WIDTH / 2 };

/** 粉球点位 (台面中心与顶库之间) / Pink spot (between center and top cushion) */
export const PINK_SPOT = { x: TABLE_LENGTH * 0.75, z: TABLE_WIDTH / 2 };

/** 黑球点位 (距顶库 12.75 inches) / Black spot (12.75 inches from top cushion) */
export const BLACK_SPOT = { x: TABLE_LENGTH - 0.324, z: TABLE_WIDTH / 2 };

/**
 * 所有彩球点位集合 (按分值升序)
 * All colour ball spots (sorted by value ascending)
 */
export const COLOUR_SPOTS = {
  yellow: YELLOW_SPOT,
  green: GREEN_SPOT,
  brown: BROWN_SPOT,
  blue: BLUE_SPOT,
  pink: PINK_SPOT,
  black: BLACK_SPOT,
} as const;

/**
 * 红球三角形排列起始位置
 * Red balls triangle starting position
 * 顶点朝向底库，中心线与粉球/黑球共线
 * Apex towards bottom cushion, center line aligned with pink/black spots
 */
export const RED_TRIANGLE_APEX = { x: PINK_SPOT.x + BALL_RADIUS * 2 + 0.0001, z: TABLE_WIDTH / 2 };

// ============================================================================
// 物理参数 / Physics Parameters
// ============================================================================

/** 重力加速度 / Gravitational acceleration */
export const GRAVITY = -9.82;

/** 台面滑动摩擦系数 / Table sliding friction coefficient */
export const FRICTION_TABLE_SLIDING = 0.2;

/** 台面滚动摩擦系数 (用于自定义物理) / Table rolling friction coefficient (for custom physics) */
export const FRICTION_ROLLING = 0.01;

/** 库边摩擦系数 / Cushion friction coefficient */
export const FRICTION_CUSHION = 0.14;

/** Tunable contact friction, axial spin deceleration (rad/s²), safe tip offset. */
export const FRICTION_BALL = 0.04;
export const SPIN_DECELERATION = 8.0;
export const MAX_TIP_OFFSET = 0.5;
export const CUSHION_JAW_RADIUS = 0.008;

/** 球-球碰撞弹性系数 / Ball-ball restitution coefficient */
export const RESTITUTION_BALL = 0.96;

/** 球-库边碰撞弹性系数 / Ball-cushion restitution coefficient */
export const RESTITUTION_CUSHION = 0.82;

/** 球停止运动的速度阈值 / Velocity threshold for considering ball at rest */
export const VELOCITY_THRESHOLD = 0.0001;

/** 球停止旋转的角速度阈值 / Angular velocity threshold for considering ball stopped spinning */
export const ANGULAR_VELOCITY_THRESHOLD = 0.05;

/** 物理模拟步长 / Physics simulation timestep */
export const PHYSICS_TIMESTEP = 1 / 240;

/** 每帧最大物理迭代次数 / Max physics iterations per frame */
export const PHYSICS_MAX_ITERATIONS = 60;

// ============================================================================
// 击球参数 / Shot Parameters
// ============================================================================

/** 最小击球力度 / Minimum shot power */
export const MIN_POWER = 0.1;

/** 最大击球力度 / Maximum shot power */
export const MAX_POWER = 8.0;

/** 默认击球力度 / Default shot power */
export const DEFAULT_POWER = 1.3;

/** 球杆长度 (渲染用) / Cue stick length (for rendering) */
export const CUE_LENGTH = 1.45;

/** 球杆击球距离 (球杆头到白球) / Cue tip distance from cue ball */
export const CUE_TIP_DISTANCE = 0.02;

// ============================================================================
// 相机参数 / Camera Parameters
// ============================================================================

/** 相机高度 (瞄准时) / Camera height during aiming */
export const CAMERA_AIM_HEIGHT = 0.35;

/** 相机到白球距离 (瞄准时) / Camera distance from cue ball during aiming */
export const CAMERA_AIM_DISTANCE = 0.5;

/** 相机 FOV / Camera field of view (degrees) */
export const CAMERA_FOV = 60;

/** 相机近裁面 / Camera near clipping plane */
export const CAMERA_NEAR = 0.01;

/** 相机远裁面 / Camera far clipping plane */
export const CAMERA_FAR = 50;

/** 相机跟随插值速度 / Camera follow lerp speed */
export const CAMERA_LERP_SPEED = 0.05;

/** 追踪相机高度 (球运动中) / Tracking camera height during ball motion */
export const CAMERA_TRACK_HEIGHT = 3.0;

/** 追踪相机后退距离 / Tracking camera pull-back distance */
export const CAMERA_TRACK_DISTANCE = 2.0;

// ============================================================================
// UI 参数 / UI Parameters
// ============================================================================

/** 瞄准线长度 / Aiming line length */
export const AIM_LINE_LENGTH = 5.0;

/** 辅助线虚线段长度 / Guide line dash segment length */
export const GUIDE_DASH_SIZE = 0.03;

/** 辅助线虚线间隔 / Guide line dash gap size */
export const GUIDE_GAP_SIZE = 0.02;

/** AI 思考时间 (秒) / AI think time (seconds) */
export const AI_THINK_TIME = 1.5;

// ============================================================================
// 分值定义 / Point Values
// ============================================================================

/** 各球分值 / Ball point values */
export const BALL_VALUES = {
  red: 1,
  yellow: 2,
  green: 3,
  brown: 4,
  blue: 5,
  pink: 6,
  black: 7,
} as const;

/** 最低犯规罚分 / Minimum foul penalty */
export const MIN_FOUL_PENALTY = 4;

/** 红球总数 / Total number of red balls */
export const TOTAL_REDS = 15;

// ============================================================================
// 彩球复位优先级 (从高到低) / Colour re-spotting priority (high to low)
// ============================================================================
export const RESPAWN_PRIORITY = ['black', 'pink', 'blue', 'brown', 'green', 'yellow'] as const;

/**
 * 清彩球阶段击打顺序 (从低到高)
 * Colours potting order in final phase (low to high)
 */
export const COLOURS_ORDER = ['yellow', 'green', 'brown', 'blue', 'pink', 'black'] as const;
