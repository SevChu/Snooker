import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FrameRecord } from '../src/game/FrameRecord';
import { remainingPoints } from '../src/game/RemainingPoints';
import { GameStateManager } from '../src/game/GameState';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { BallBody } from '../src/physics/BallBody';
import { AIDifficulty, BallType as B, FoulType, GameMode, GamePhase, GameState,
  ballValue, type FrameState, type ShotResult } from '../src/types';

function makeFrame(reds = 15): FrameState {
  const frame = new GameStateManager().createNewFrame();
  const world = new PhysicsWorld();
  const types = [B.YELLOW, B.GREEN, B.BROWN, B.BLUE, B.PINK, B.BLACK, ...Array<B>(reds).fill(B.RED)];
  frame.balls = types.map((type, i) => new BallBody(`${type}-${i}`, type, { x: .5 + i * .1, z: .7 }, world).getState());
  frame.redsRemaining = reds;
  return frame;
}

function shot(overrides: Partial<ShotResult> = {}): ShotResult {
  return { ballsPotted: [], firstBallHit: B.RED, foul: null, foulBallValue: 0,
    penaltyPoints: 0, scorePoints: 0, switchTurn: false, isMiss: false,
    needsRespot: [], cueBallInHand: false, freeBallAvailable: false, breakPoints: 0, ...overrides };
}

test('remaining points includes the outstanding colour, clearance, and existing free-ball entitlement', () => {
  const frame = makeFrame();
  assert.equal(remainingPoints(frame), 147);
  frame.freeBallAvailable = true; assert.equal(remainingPoints(frame), 155);
  frame.freeBallAvailable = false;
  frame.balls.find(b => b.type === B.RED)!.isPotted = true;
  frame.lastPottedWasRed = true; assert.equal(remainingPoints(frame), 146);
  frame.lastPottedWasRed = false; assert.equal(remainingPoints(frame), 139);
  frame.balls.filter(b => b.type === B.RED).forEach(b => b.isPotted = true);
  frame.lastPottedWasRed = true; assert.equal(remainingPoints(frame), 34);
  frame.lastPottedWasRed = false; frame.phase = GamePhase.COLOURS;
  assert.equal(remainingPoints(frame), 27);
  frame.freeBallAvailable = true; assert.equal(remainingPoints(frame), 29);
  frame.freeBallAvailable = false;
  for (const type of [B.YELLOW, B.GREEN, B.BROWN, B.BLUE, B.PINK, B.BLACK]) {
    const before = remainingPoints(frame);
    frame.balls.find(b => b.type === type)!.isOnTable = false;
    assert.equal(remainingPoints(frame), before - ballValue(type));
  }
  assert.equal(remainingPoints(frame), 0);
});

test('two red-black combinations are one 16-point visit; penalties do not increase highest breaks', () => {
  const record = new FrameRecord(), frame = makeFrame();
  for (const ball of [B.RED, B.BLACK, B.RED, B.BLACK]) {
    record.recordShot(frame, shot({ ballsPotted: [ball], scorePoints: ballValue(ball) }));
  }
  record.recordShot(frame, shot({ foul: FoulType.CUE_POTTED, penaltyPoints: 7,
    ballsPotted: [B.RED], switchTurn: true }));
  assert.equal(record.visits.length, 1);
  assert.equal(record.visits[0].points, 16);
  assert.deepEqual(record.visits[0].tokens.map(t => t.kind === 'pot' ? t.ball : t.kind),
    [B.RED, B.BLACK, B.RED, B.BLACK, 'penalty', 'switch']);
  assert.deepEqual(record.highestBreaks, [16, 0]);
  frame.striker = 1;
  record.recordShot(frame, shot({ switchTurn: true }));
  frame.striker = 0;
  record.recordShot(frame, shot({ ballsPotted: [B.RED], scorePoints: 1 }));
  assert.equal(record.visits.length, 3);
  assert.deepEqual(record.highestBreaks, [16, 0]);
  const snapshot = record.snapshot();
  record.recordShot(frame, shot({ ballsPotted: [B.BLACK], scorePoints: 7 }));
  assert.equal(snapshot[2].points, 1); assert.equal(snapshot[2].tokens.length, 1);
});

test('free balls retain their appearance with their actual awarded break score', () => {
  const frame = makeFrame(), record = new FrameRecord();
  frame.nominatedFreeBall = frame.balls.find(b => b.type === B.BLUE)!.id;
  record.recordShot(frame, shot({ ballsPotted: [B.BLUE, B.RED], scorePoints: 2 }));
  assert.deepEqual(record.visits[0].tokens, [
    { kind: 'pot', ball: B.BLUE, freeBall: true }, { kind: 'pot', ball: B.RED, freeBall: false },
  ]);
  assert.equal(record.highestBreaks[0], 2);
});

test('frame-winning foul is saved in the summary, and acknowledgement cannot duplicate a win', () => {
  const game = new GameStateManager(), world = new PhysicsWorld();
  game.startMatch({ mode: GameMode.PASS_PLAY, difficulty: AIDifficulty.MEDIUM,
    totalFrames: 3, player1Name: '甲', player2Name: '乙' });
  const cue = new BallBody('cue', B.CUE, { x: 1, z: .8 }, world);
  new BallBody('black', B.BLACK, { x: 2, z: .8 }, world);
  game.initBallStates(world.getBalls()); game.match!.frame.phase = GamePhase.COLOURS;
  game.startShot(cue, world.getBalls()); cue.pot(); game.recordPot(cue);
  game.evaluateShot(world.getBalls(), cue);
  assert.equal(game.getState(), GameState.FRAME_OVER);
  assert.deepEqual(game.frameSummary!.scores, [0, 7]);
  assert.deepEqual(game.frameSummary!.highestBreaks, [0, 0]);
  assert.equal(game.frameSummary!.visits[0].tokens[0].kind, 'penalty');
  const summary = game.frameSummary!;
  game.evaluateShot(world.getBalls(), cue);
  assert.deepEqual(game.match!.framesWon, [0, 1]);
  assert.equal(game.continueFrame(), true);
  assert.equal(game.continueFrame(), false);
  assert.deepEqual(game.frameRecord.visits, []);
  assert.deepEqual(summary.scores, [0, 7]);
});

test('replay keeps the awarded penalty and creates a separate visit for the offender', () => {
  const game = new GameStateManager(), world = new PhysicsWorld();
  game.startMatch({ mode: GameMode.PASS_PLAY, difficulty: AIDifficulty.MEDIUM,
    totalFrames: 1, player1Name: '甲', player2Name: '乙' });
  const cue = new BallBody('cue', B.CUE, { x: 1, z: .8 }, world);
  new BallBody('red', B.RED, { x: 2, z: .8 }, world);
  game.initBallStates(world.getBalls()); game.startShot(cue, world.getBalls());
  game.evaluateShot(world.getBalls(), cue);
  game.replayShot(world.getBalls());
  assert.deepEqual(game.match!.frame.scores, [0, 4]);
  assert.equal(game.match!.frame.striker, 0);
  assert.equal(game.frameRecord.visits[0].tokens[0].kind, 'penalty');
  assert.deepEqual(game.frameRecord.visits[1].tokens, [{ kind: 'switch', to: 0, reason: '复位重打' }]);
  assert.deepEqual(game.frameRecord.highestBreaks, [0, 0]);
});
