import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BALL_RADIUS as R, TABLE_LENGTH as L, TABLE_WIDTH as W, POCKET_POSITIONS } from '../src/constants';
import { classifyShot, cushionGap, mergeStatistics, ShotStatistics, suggestPot,
  type ShotClassification, type PocketName } from '../src/game/ShotStatistics';
import { FrameRecord } from '../src/game/FrameRecord';
import { GameStateManager } from '../src/game/GameState';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { BallBody } from '../src/physics/BallBody';
import { BallType as B, FoulType, GameMode, GamePhase, AIDifficulty,
  type BallState, type ShotResult } from '../src/types';

const state = (id: string, x: number, z: number): BallState => ({ id, type: id === 'cue' ? B.CUE : B.RED,
  position: { x, y: R, z }, velocity: { x: 0, y: 0, z: 0 }, angularVelocity: { x: 0, y: 0, z: 0 },
  isOnTable: true, isPotted: false });
const shot = (patch: Partial<ShotResult> = {}): ShotResult => ({ ballsPotted: [], firstBallHit: B.RED,
  foul: null, foulBallValue: 0, penaltyPoints: 0, scorePoints: 0, switchTurn: true, isMiss: false,
  needsRespot: [], cueBallInHand: false, freeBallAvailable: false, breakPoints: 0, ...patch });
const pot = (points = 1) => shot({ ballsPotted: [B.RED], scorePoints: points, switchTurn: false });
const attack: ShotClassification = { intent: 'attack', long: true, cushion: true, rest: true };
const safety: ShotClassification = { ...attack, intent: 'safety' };

test('long pots use both initial distances, strictly over two thirds; every pocket uses its own distance', () => {
  const cue = state('cue', L * 2 / 3, 0), target = state('red', 1, 0);
  const selection = { intent: 'attack' as const, bridge: 'hand' as const, targetBallId: 'red', pocket: 'BL' as const };
  assert.equal(classifyShot([cue, target], selection).long, false);
  cue.position.x += 1e-6;
  assert.equal(classifyShot([cue, target], selection).long, true);
  cue.position.x -= 2e-6;
  assert.equal(classifyShot([cue, target], selection).long, false);
  cue.position = { x: 1.3, y: R, z: .8 }; target.position = { x: 2.8, y: R, z: .8 };
  for (const [name, pocket] of Object.entries(POCKET_POSITIONS)) {
    const length = 1.5 + Math.hypot(target.position.x - pocket.x, target.position.z - pocket.z);
    assert.equal(classifyShot([cue, target], { ...selection, pocket: name as PocketName }).long, length > L * 2 / 3);
  }
  assert.equal(classifyShot([cue, target], { ...selection, targetBallId: 'missing' }).long, false);
});

test('cushion shots use either ball surface, inclusive quarter-diameter gap on all four cushions', () => {
  const selection = { intent: 'attack' as const, bridge: 'hand' as const, targetBallId: 'red' };
  const gap = R / 2;
  for (const position of [
    { x: 1, y: R, z: R + gap }, { x: 1, y: R, z: W - R - gap },
    { x: R + gap, y: R, z: .8 }, { x: L - R - gap, y: R, z: .8 },
  ]) {
    assert.ok(Math.abs(cushionGap(position) - gap) < 1e-9);
    for (const id of ['cue', 'red']) {
      const balls = [state('cue', 1, .8), state('red', 2, .8)];
      balls.find(b => b.id === id)!.position = position;
      assert.equal(classifyShot(balls, selection).cushion, true);
    }
  }
  assert.equal(classifyShot([state('cue', 1, R * 1.5 + 1e-6), state('red', 2, .8)], selection).cushion, false);
  assert.equal(classifyShot([state('cue', 1, R), state('red', 2, .8)], selection).cushion, true);
});

test('both mechanical rests count, hand bridge does not', () => {
  for (const bridge of ['hand', 'rest', 'spider'] as const) {
    assert.equal(classifyShot([], { intent: 'attack', bridge }).rest, bridge !== 'hand');
  }
});

test('automatic intended pot follows ideal cut direction and allows independent manual overrides', () => {
  const cue = state('cue', 1, .8), target = state('red', 2.7, 1.1);
  const pocket = POCKET_POSITIONS.TR;
  const dx = pocket.x - target.position.x, dz = pocket.z - target.position.z;
  const length = Math.hypot(dx, dz);
  const direction = { x: target.position.x - dx / length * R * 2 - cue.position.x, y: 0,
    z: target.position.z - dz / length * R * 2 - cue.position.z };
  assert.deepEqual(suggestPot(cue, [target], direction), { targetBallId: 'red', pocket: 'TR' });
  assert.equal(suggestPot(cue, [target], direction, undefined, 'BL').pocket, 'BL');
  assert.equal(suggestPot(cue, [target], { x: -1, y: 0, z: 0 }, 'red', 'BL').targetBallId, 'red');
  assert.deepEqual(suggestPot(cue, [], direction), {});
  assert.equal(suggestPot(cue, [state('back', 3, .8), state('front', 2, .8)],
    { x: 1, y: 0, z: 0 }).targetBallId, 'front');
});

test('only attacks enter pot metrics, multi-pots count once, fouled pots fail, safety pots still build breaks', () => {
  const record = new FrameRecord(), frame = new GameStateManager().createNewFrame();
  record.recordShot(frame, pot(7), safety);
  record.recordShot(frame, { ...pot(2), ballsPotted: [B.RED, B.RED] }, attack);
  record.recordShot(frame, shot({ foul: FoulType.CUE_POTTED, ballsPotted: [B.RED], penaltyPoints: 4 }), attack);
  for (const key of ['pot', 'long', 'cushion', 'rest'] as const) {
    assert.deepEqual(record.statistics.players[0][key], { successes: 1, attempts: 2 });
  }
  assert.equal(record.statistics.players[0].highestBreak, 9);
  assert.deepEqual(record.statistics.players[1].pot, { successes: 0, attempts: 0 });
});

test('safety is resolved by the next opponent shot, regardless of their intent; each transfer resolves once', () => {
  const stats = new ShotStatistics();
  stats.record(0, shot(), safety);
  assert.deepEqual(stats.players[0].safety, { successes: 0, attempts: 0 });
  stats.record(1, shot(), safety);
  assert.deepEqual(stats.players[0].safety, { successes: 1, attempts: 1 });
  stats.record(0, pot(), attack);
  assert.deepEqual(stats.players[1].safety, { successes: 0, attempts: 1 });
  stats.record(0, pot(), attack);
  assert.equal(stats.players[1].safety.attempts, 1);
});

test('fouled safeties fail; an opponent foul with a potted ball does not defeat a legal safety', () => {
  const stats = new ShotStatistics();
  stats.record(0, shot(), safety);
  stats.record(1, shot({ foul: FoulType.CUE_POTTED, ballsPotted: [B.RED] }), safety);
  assert.deepEqual(stats.players[0].safety, { successes: 1, attempts: 1 });
  assert.deepEqual(stats.players[1].safety, { successes: 0, attempts: 1 });
  stats.record(0, shot(), attack);
  assert.equal(stats.players[1].safety.attempts, 1);
});

test('safety pots without transfer and unplayed responses are excluded; replay/black-choice cannot fabricate samples', () => {
  const record = new FrameRecord(), frame = new GameStateManager().createNewFrame();
  record.recordShot(frame, pot(), safety);
  record.recordShot(frame, shot(), safety);
  record.switchTurn(1, 0, '复位重打');
  record.recordShot(frame, pot(), attack);
  assert.deepEqual(record.statistics.players[0].safety, { successes: 0, attempts: 0 });
});

test('match rates sum unequal denominators, highest breaks take max, snapshots share no mutable objects', () => {
  const first = new ShotStatistics(), second = new ShotStatistics();
  first.record(0, pot(), attack);
  for (let i = 0; i < 9; i++) second.record(0, shot(), attack);
  first.players[0].highestBreak = 32; second.players[0].highestBreak = 16;
  const total = mergeStatistics(first.players, second.players);
  assert.deepEqual(total[0].pot, { successes: 1, attempts: 10 });
  assert.equal(total[0].highestBreak, 32);
  first.players[0].pot.successes++;
  total[0].rest.successes++;
  assert.equal(total[0].pot.successes, 1);
  assert.equal(first.players[0].rest.successes, 1);
});

test('live game freezes initial geometry, prevents duplicate evaluation, accumulates frames and resets a new match', () => {
  const game = new GameStateManager(), world = new PhysicsWorld();
  const config = { mode: GameMode.PASS_PLAY, difficulty: AIDifficulty.MEDIUM,
    totalFrames: 3, player1Name: '甲', player2Name: '乙' };
  game.startMatch(config);
  const cue = new BallBody('cue', B.CUE, { x: 1, z: R }, world);
  const black = new BallBody('black', B.BLACK, { x: 3, z: 1 }, world);
  const balls = world.getBalls();
  const setup = () => { game.initBallStates(balls); game.match!.frame.phase = GamePhase.COLOURS; };
  setup();
  const finish = () => { game.recordCollision(cue, black); black.pot(); game.recordPot(black); game.evaluateShot(balls, cue); };
  game.startShot(cue, balls, { intent: 'attack', bridge: 'spider', targetBallId: 'black', pocket: 'BL' });
  cue.setPosition(2, .8); black.setPosition(2.1, .8); finish();
  const first = game.frameSummary!;
  for (const key of ['pot', 'long', 'cushion', 'rest'] as const) {
    assert.deepEqual(first.frameStatistics[0][key], { successes: 1, attempts: 1 });
  }
  game.evaluateShot(balls, cue);
  assert.equal(first.matchStatistics[0].pot.attempts, 1);
  assert.equal(game.continueFrame(), true);
  assert.equal(game.frameRecord.statistics.players[0].pot.attempts, 0);
  black.respawn(2, .8); setup();
  game.startShot(cue, balls, { intent: 'attack', bridge: 'hand', targetBallId: 'black', pocket: 'TR' });
  finish();
  assert.equal(game.frameSummary!.matchComplete, true);
  assert.equal(game.frameSummary!.frameStatistics[0].pot.attempts, 1);
  assert.equal(game.frameSummary!.matchStatistics[0].pot.attempts, 2);
  assert.equal(game.frameSummary!.matchStatistics[0].highestBreak, 7);
  assert.equal(first.matchStatistics[0].pot.attempts, 1);
  game.startMatch(config); black.respawn(2, .8); setup();
  game.startShot(cue, balls); finish();
  assert.equal(game.frameSummary!.matchStatistics[0].pot.attempts, 1);
});

test('replayed live fouls count once per actual stroke, including misses and rest failures', () => {
  const game = new GameStateManager(), world = new PhysicsWorld();
  game.startMatch({ mode: GameMode.PASS_PLAY, difficulty: AIDifficulty.MEDIUM,
    totalFrames: 1, player1Name: '甲', player2Name: '乙' });
  const cue = new BallBody('cue', B.CUE, { x: 1, z: .8 }, world);
  new BallBody('red', B.RED, { x: 2, z: .8 }, world);
  new BallBody('black', B.BLACK, { x: 2.5, z: 1.1 }, world);
  const balls = world.getBalls(); game.initBallStates(balls);
  game.startShot(cue, balls, { intent: 'attack', bridge: 'rest', targetBallId: 'red', pocket: 'BL' });
  game.evaluateShot(balls, cue); game.evaluateShot(balls, cue);
  assert.equal(game.frameRecord.statistics.players[0].pot.attempts, 1);
  assert.equal(game.replayShot(balls), true);
  assert.equal(game.frameRecord.statistics.players[1].pot.attempts, 0);
  game.startShot(cue, balls, { intent: 'attack', bridge: 'rest', targetBallId: 'red', pocket: 'BL' });
  game.evaluateShot(balls, cue);
  assert.deepEqual(game.frameRecord.statistics.players[0].rest, { successes: 0, attempts: 2 });
});
