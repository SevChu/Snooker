import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameStateManager } from '../src/game/GameState';
import { RulesEngine } from '../src/game/RulesEngine';
import { remainingPoints } from '../src/game/RemainingPoints';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { BallBody } from '../src/physics/BallBody';
import { D_CENTER, COLOUR_SPOTS } from '../src/constants';
import { AIDifficulty, BallType as B, FoulType, GameMode, GamePhase, GameState } from '../src/types';

function setup(types: B[] = [B.YELLOW, B.GREEN, B.BROWN, B.BLUE, B.PINK, B.BLACK]) {
  const game = new GameStateManager(), world = new PhysicsWorld();
  game.startMatch({ mode: GameMode.PASS_PLAY, difficulty: AIDifficulty.MEDIUM,
    totalFrames: 1, player1Name: '甲', player2Name: '乙' });
  const cue = new BallBody('cue', B.CUE, { x: 1, z: .8 }, world);
  types.forEach((type, i) => new BallBody(type, type,
    { x: 2 + i * .12, z: i === 0 ? .8 : 1.2 }, world));
  const balls = world.getBalls(); game.initBallStates(balls);
  const frame = game.match!.frame; frame.phase = GamePhase.COLOURS; frame.redsRemaining = 0;
  return { game, world, cue, balls, frame };
}

test('concession requires strictly overscored position; tied, catchable and invalid players are rejected', () => {
  const { game, frame } = setup();
  for (const score of [0, 26, 27]) {
    frame.scores = [score, 0];
    assert.equal(game.getConcedingPlayer(), null);
    assert.equal(game.concedeFrame(1), false);
  }
  frame.scores = [28, 0];
  assert.equal(game.getConcedingPlayer(), 1);
  for (const player of [0, -1, 2, NaN, null as unknown as number]) assert.equal(game.concedeFrame(player), false);
  frame.freeBallAvailable = true; // A free yellow raises clearance from 27 to 29.
  assert.equal(game.getConcedingPlayer(), null);
  frame.freeBallAvailable = false;
  assert.equal(game.concedeFrame(1), true);
  assert.equal(game.frameSummary!.concededBy, 1);
});

test('concession only occurs between shots, including placement and pending foul/nomination decisions', () => {
  const { game, frame } = setup(); frame.scores = [28, 0];
  for (const state of [GameState.MENU, GameState.SHOOTING, GameState.SIMULATING,
    GameState.EVALUATING, GameState.BLACK_CHOICE, GameState.FRAME_OVER, GameState.GAME_OVER]) {
    game.setState(state);
    assert.equal(game.getConcedingPlayer(), null);
    assert.equal(game.concedeFrame(1), false);
  }
  for (const state of [GameState.AIMING, GameState.PLACING, GameState.MISS_CHOICE, GameState.FREE_BALL_SELECT]) {
    game.setState(state); assert.equal(game.getConcedingPlayer(), 1);
  }
});

test('either trailing PvP player may concede between shots, regardless of whose turn it is', () => {
  for (const loser of [0, 1]) for (const striker of [0, 1]) {
    const { game, frame } = setup(); frame.scores[1 - loser] = 28; frame.striker = striker;
    assert.equal(game.concedeFrame(loser), true);
    assert.equal(game.frameSummary!.winner, 1 - loser);
    assert.equal(game.frameSummary!.concededBy, loser);
    assert.equal(game.match!.framesWon[1 - loser], 1);
    assert.equal(game.concedeFrame(loser), false);
    assert.equal(game.match!.framesWon[1 - loser], 1);
  }
});

test('human vs AI cannot concede on behalf of the AI', () => {
  const { game, frame } = setup(); game.match!.mode = GameMode.VS_AI;
  frame.scores = [28, 0];
  assert.equal(game.getConcedingPlayer(), null); assert.equal(game.concedeFrame(1), false);
  frame.scores = [0, 28];
  assert.equal(game.getConcedingPlayer(), 0); assert.equal(game.concedeFrame(0), true);
  assert.equal(game.frameSummary!.winner, 1);
});

test('concession preserves actual scores, breaks, pots and match totals, then advances only on acknowledgement', () => {
  const { game, cue, balls, frame } = setup(); game.match!.totalFrames = 3;
  const yellow = balls.find(b => b.type === B.YELLOW)!;
  game.startShot(cue, balls); game.recordCollision(cue, yellow); yellow.pot(); game.recordPot(yellow);
  game.evaluateShot(balls, cue);
  frame.scores = [31, 0];
  const visits = game.frameRecord.snapshot();
  assert.equal(game.concedeFrame(1), true);
  const summary = game.frameSummary!;
  assert.equal(game.getState(), GameState.FRAME_OVER);
  assert.equal(game.match!.currentFrame, 1);
  assert.deepEqual(summary.scores, [31, 0]);
  assert.deepEqual(summary.visits, visits); assert.deepEqual(summary.highestBreaks, [2, 0]);
  assert.deepEqual(summary.frameStatistics[0].pot, { successes: 1, attempts: 1 });
  assert.deepEqual(summary.frameStatistics[1].pot, { successes: 0, attempts: 0 });
  game.evaluateShot(balls, cue); assert.deepEqual(game.match!.framesWon, [1, 0]);
  assert.equal(game.continueFrame(), true); assert.equal(game.continueFrame(), false);
  assert.equal(game.match!.currentFrame, 2); assert.equal(game.frameRecord.statistics.players[0].pot.attempts, 0);
  game.initBallStates(balls); game.match!.frame.scores = [50, 0]; game.match!.frame.phase = GamePhase.COLOURS;
  assert.equal(game.concedeFrame(1), true);
  assert.equal(game.getState(), GameState.GAME_OVER); assert.equal(game.frameSummary!.matchComplete, true);
  assert.deepEqual(game.match!.framesWon, [2, 0]);
  assert.equal(game.frameSummary!.matchStatistics[0].pot.attempts, 1);
  assert.equal(game.continueFrame(), false); assert.equal(summary.matchStatistics[0].pot.attempts, 1);
});

test('conceding after a foul consumes replay options without recording an extra safety response', () => {
  const { game, cue, balls, frame } = setup(); frame.scores = [0, 27];
  game.startShot(cue, balls, { intent: 'safety', bridge: 'hand' }); game.evaluateShot(balls, cue);
  assert.equal(game.concedeFrame(0), true);
  assert.equal(game.replayShot(balls), false); game.requireOffenderToPlay();
  assert.equal(game.getState(), GameState.GAME_OVER);
  assert.deepEqual(game.frameSummary!.frameStatistics[0].safety, { attempts: 1, successes: 0 });
  assert.deepEqual(game.frameSummary!.frameStatistics[1].safety, { attempts: 0, successes: 0 });
});

for (const striker of [0, 1]) {
  for (const [a, b, allowed] of [
    [0, 0, true], [0, 23, true], [27, 0, true],
    [0, 24, false], [0, 27, false], [28, 0, false], [0, 40, false],
  ] as const) {
    test(`replay boundary: striker ${striker}, relative scores ${a}:${b}, allowed ${allowed}`, () => {
      const { game, cue, balls, frame } = setup();
      frame.striker = striker; frame.scores[striker] = a; frame.scores[1 - striker] = b;
      const original = cue.getState();
      game.startShot(cue, balls); cue.setPosition(1.1, .8);
      const result = game.evaluateShot(balls, cue);
      assert.equal(result.penaltyPoints, 4);
      assert.equal(result.isMiss, allowed); assert.equal(game.canReplayShot(), allowed);
      assert.equal(game.replayShot(balls), allowed);
      assert.equal(frame.scores[1 - striker], b + 4);
      assert.equal(frame.striker, allowed ? striker : 1 - striker);
      assert.equal(cue.posX, allowed ? original.position.x : 1.1);
      assert.equal(game.replayShot(balls), false, 'a decision can be used only once');
    });
  }
}

test('a foul which removes reds can cross the replay threshold even with a shrinking deficit', () => {
  const { game, cue, balls, frame } = setup([B.RED, B.BLACK]);
  frame.phase = GamePhase.REDS; frame.redsRemaining = 1; frame.scores = [15, 0];
  assert.equal(remainingPoints(frame), 15);
  game.startShot(cue, balls);
  const red = balls.find(b => b.type === B.RED)!; red.pot(); game.recordPot(red);
  const result = game.evaluateShot(balls, cue);
  assert.deepEqual(frame.scores, [15, 4]); assert.equal(remainingPoints(frame), 7);
  assert.equal(result.replayBlockedByScore, true); assert.equal(game.replayShot(balls), false);
  assert.equal(red.isPotted, true);
});

test('accepting the foul or requiring play from the position left consumes the replacement choice', () => {
  for (const accept of [true, false]) {
    const { game, cue, balls, frame } = setup();
    game.startShot(cue, balls); game.evaluateShot(balls, cue);
    assert.equal(game.canReplayShot(), true);
    if (accept) game.acceptFoul(); else game.requireOffenderToPlay();
    assert.equal(game.replayShot(balls), false);
    assert.equal(frame.striker, accept ? 1 : 0);
    assert.equal(frame.consecutiveMisses, 0);
  }
});

test('a non-Miss foul never permits replay and overscore still permits play from the position left', () => {
  const { game, cue, balls, frame } = setup();
  frame.scores = [0, 50]; game.startShot(cue, balls);
  game.recordCollision(cue, balls.find(b => b.type === B.YELLOW)!); cue.pot(); game.recordPot(cue);
  const result = game.evaluateShot(balls, cue);
  assert.equal(result.isMiss, false); assert.equal(game.replayShot(balls), false);
  game.requireOffenderToPlay(); assert.equal(frame.striker, 0);
  assert.equal(game.getState(), GameState.PLACING); assert.deepEqual(frame.scores, [0, 54]);
});

for (const starter of [0, 1]) {
  for (const ending of ['pot', 'foul'] as const) {
    test(`tied final black: choose player ${starter}, safety continues, ${ending} decides the frame`, () => {
      const { game, cue, balls, frame } = setup([B.BLACK]);
      const black = balls.find(b => b.type === B.BLACK)!; frame.scores = [0, 7];
      game.startShot(cue, balls); game.recordCollision(cue, black); black.pot(); game.recordPot(black);
      game.evaluateShot(balls, cue);
      assert.equal(game.frameSummary, null); assert.deepEqual(frame.scores, [7, 7]);
      assert.equal(game.getState(), GameState.BLACK_CHOICE);
      assert.ok(frame.blackChoicePlayer === 0 || frame.blackChoicePlayer === 1);
      assert.equal(frame.respottedBlack, true); assert.equal(frame.currentBreak, 0);
      assert.equal(black.posX, COLOUR_SPOTS[B.BLACK].x);
      assert.equal(black.posZ, COLOUR_SPOTS[B.BLACK].z);
      assert.equal(game.placeCueBall(D_CENTER.x - .1, D_CENTER.z, balls), false);
      assert.equal(game.chooseBlackStarter(3), false);
      assert.equal(game.chooseBlackStarter(starter), true);
      assert.equal(game.chooseBlackStarter(1 - starter), false);
      assert.equal(frame.striker, starter); assert.equal(game.getState(), GameState.PLACING);
      assert.equal(game.placeCueBall(2, .8, balls), false);
      assert.equal(game.placeCueBall(D_CENTER.x - .1, D_CENTER.z, balls), true);
      game.startShot(cue, balls); game.recordCollision(cue, black); game.evaluateShot(balls, cue);
      assert.equal(game.frameSummary, null); assert.equal(frame.striker, 1 - starter);
      game.startShot(cue, balls);
      if (ending === 'pot') { game.recordCollision(cue, black); black.pot(); game.recordPot(black); }
      const result = game.evaluateShot(balls, cue);
      assert.equal(game.getState(), GameState.GAME_OVER);
      assert.equal(game.frameSummary!.winner, ending === 'pot' ? 1 - starter : starter);
      assert.equal(result.isMiss, false); assert.equal(game.replayShot(balls), false);
      game.requireOffenderToPlay(); assert.equal(game.getState(), GameState.GAME_OVER);
      assert.equal(game.match!.framesWon.reduce((a, b) => a + b), 1);
      assert.deepEqual(game.frameSummary!.highestBreaks, [7, ending === 'pot' && starter === 0 ? 7 : 0]);
    });
  }
}

test('2024 free-ball exemption covers black and one other colour, but not black and red', () => {
  for (const target of [B.RED, B.YELLOW, B.GREEN, B.BROWN, B.BLUE, B.PINK]) {
    const { game, cue, balls, frame } = setup([target, B.BLACK]);
    const black = balls.find(b => b.type === B.BLACK)!;
    black.setPosition(1.5, .8); frame.nominatedFreeBall = black.id;
    if (target === B.RED) { frame.phase = GamePhase.REDS; frame.redsRemaining = 1; }
    const result = new RulesEngine().evaluateShot({ firstBallHit: black,
      allBallsContacted: new Set([black.id]), pottedBalls: [], cueBallPotted: false,
      ballsOffTable: [], wasSnookered: false }, frame, balls, cue);
    assert.equal(result.foul, target === B.RED ? FoulType.FREE_BALL_SNOOKER : null);
  }
});

test('free-ball nomination requires an entitlement and excludes cue, actual ball-on and removed balls', () => {
  const { game, balls, frame } = setup();
  assert.equal(game.nominateFreeBall(B.BLACK, balls), false);
  frame.freeBallAvailable = true; game.setState(GameState.FREE_BALL_SELECT);
  balls.find(b => b.type === B.BLUE)!.pot();
  for (const id of ['cue', B.YELLOW, B.BLUE, 'missing']) assert.equal(game.nominateFreeBall(id, balls), false);
  assert.equal(game.nominateFreeBall(B.BLACK, balls), true);
  assert.equal(frame.nominatedFreeBall, B.BLACK); assert.equal(frame.freeBallAvailable, false);
  assert.equal(game.nominateFreeBall(B.GREEN, balls), false);
});

test('a nominated free red respots, scores one and permits a colour before the next red', () => {
  const { game, cue, balls, frame } = setup([B.RED, B.BLACK]);
  frame.phase = GamePhase.REDS; frame.redsRemaining = 1;
  frame.freeBallAvailable = true; game.setState(GameState.FREE_BALL_SELECT);
  assert.equal(game.nominateFreeBall(B.BLACK, balls), true);
  const black = balls.find(b => b.type === B.BLACK)!;
  game.startShot(cue, balls); game.recordCollision(cue, black); black.pot(); game.recordPot(black);
  const result = game.evaluateShot(balls, cue);
  assert.equal(result.scorePoints, 1); assert.equal(result.foul, null);
  assert.equal(black.isOnTable, true); assert.equal(frame.lastPottedWasRed, true);
  assert.equal(frame.redsRemaining, 1); assert.equal(frame.striker, 0);
  assert.equal(frame.nominatedFreeBall, null);
});

test('overscore does not suppress free ball and requiring the offender cancels that entitlement', () => {
  const { game, cue, balls, frame } = setup([B.RED, B.BLUE]);
  frame.phase = GamePhase.REDS; frame.redsRemaining = 1; frame.scores = [0, 50];
  const blue = balls.find(b => b.type === B.BLUE)!; blue.setPosition(1.5, .8);
  game.startShot(cue, balls); const result = game.evaluateShot(balls, cue);
  assert.equal(result.freeBallAvailable, true); assert.equal(game.getState(), GameState.FREE_BALL_SELECT);
  assert.equal(game.canReplayShot(), false);
  game.requireOffenderToPlay(); assert.equal(frame.freeBallAvailable, false);
  assert.equal(frame.nominatedFreeBall, null); assert.equal(frame.striker, 0);
});
