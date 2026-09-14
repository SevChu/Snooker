import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BallBody } from '../src/physics/BallBody';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { GameStateManager } from '../src/game/GameState';
import { TouchingBall } from '../src/game/TouchingBall';
import { JumpRule } from '../src/game/JumpRule';
import { BALL_RADIUS as R } from '../src/constants';
import { BallType as B, GamePhase, GameMode, AIDifficulty, FoulType } from '../src/types';

function setup(type = B.RED, x = 1.5, gap = 0) {
  const world = new PhysicsWorld();
  const cue = new BallBody('cue', B.CUE, { x, z: .85 }, world);
  const object = new BallBody('touching', type, { x: x + 2 * R + gap, z: .85 }, world);
  const game = new GameStateManager();
  game.startMatch({ mode: GameMode.PASS_PLAY, difficulty: AIDifficulty.MEDIUM,
    totalFrames: 1, player1Name: '甲', player2Name: '乙' });
  if (type !== B.RED) new BallBody('red', B.RED, { x: 3, z: 1.3 }, world);
  game.initBallStates(world.getBalls());
  return { world, cue, object, game, frame: game.match!.frame };
}
function begin(h: ReturnType<typeof setup>, vx: number, vz = 0) {
  h.game.initBallStates(h.world.getBalls()); h.world.resetShot();
  h.game.startShot(h.cue, h.world.getBalls()); h.cue.setVelocity(vx, 0, vz);
}
function settle(h: ReturnType<typeof setup>, fps = 60) {
  for (let step = 0; step < fps * 30; step++) {
    h.world.step(1 / fps);
    for (const event of h.world.drainEvents()) {
      h.game.recordTouchingPush(event.touchingPushIds ?? []);
      if (event.kind === 'ball' && event.other) {
        if (event.ball === h.cue) h.game.recordCollision(h.cue, event.other, event.time);
        else if (event.other === h.cue) h.game.recordCollision(h.cue, event.ball, event.time);
      } else if (event.kind === 'pot') h.game.recordPot(event.ball);
      else if (event.kind === 'off') h.game.shotTracker!.ballsOffTable.push(event.ball);
    }
    if (h.world.allBallsAtRest(h.world.getBalls())) return;
  }
  assert.fail('shot failed to settle');
}
const result = (h: ReturnType<typeof setup>) => h.game.evaluateShot(h.world.getBalls(), h.cue);

test('touching red played away is legal, scores zero, switches turn, and is not a miss', () => {
  const h = setup(); begin(h, -.15); settle(h);
  assert.equal(h.game.shotTracker!.firstBallHit, null);
  const r = result(h);
  assert.equal(r.foul, null); assert.equal(r.isMiss, false); assert.equal(r.scorePoints, 0);
  assert.equal(r.firstBallHit, B.RED); assert.equal(h.frame.striker, 1);
  assert.deepEqual(h.frame.scores, [0, 0]);
});

test('tangent departure is legal, but a 0.1 mm gap does not count as touching', () => {
  const h = setup(), touching = new TouchingBall();
  assert.equal(touching.isPlayingAway(h.cue, h.object, { x: 0, z: 1 }), true);
  assert.equal(touching.isPlayingAway(h.cue, h.object, { x: .001, z: 1 }), false);
  begin(h, 0, .15); settle(h); assert.equal(result(h).foul, null);
  const gap = setup(B.RED, 1.5, .0001); begin(gap, -.15); settle(gap);
  assert.equal(result(gap).foul, FoulType.NO_CONTACT);
  gap.object.posX = gap.cue.posX; gap.object.posY = R + .1;
  assert.equal(touching.findTouchingBalls(gap.cue, gap.world.getBalls()).length, 0);
});

test('playing away from a non-target touching black still requires a red first', () => {
  const h = setup(B.BLACK); begin(h, -.15); settle(h);
  assert.equal(result(h).foul, FoulType.NO_CONTACT);
  assert.deepEqual(h.frame.scores, [0, 4]);
  const legal = setup(B.BLACK);
  legal.world.getBalls().find(b => b.type === B.RED)!.respawn(1.3, .85);
  begin(legal, -.7); settle(legal); assert.equal(result(legal).foul, null);
});

test('a touching target satisfies first contact before later contact with a colour', () => {
  const h = setup(); new BallBody('black', B.BLACK, { x: 1.3, z: .85 }, h.world);
  begin(h, -.7); settle(h);
  assert.equal(h.game.shotTracker!.firstBallHit!.type, B.BLACK);
  assert.equal(result(h).foul, null);
});

test('colour nomination and re-nomination decide whether touching fulfils contact', () => {
  for (const nominateTouching of [true, false]) {
    const h = setup(B.YELLOW), green = new BallBody('green', B.GREEN, { x: 2, z: 1.3 }, h.world);
    h.frame.lastPottedWasRed = true; h.frame.nominatedColour = B.YELLOW;
    if (!nominateTouching) h.frame.nominatedColour = green.type;
    begin(h, -.15); settle(h);
    assert.equal(result(h).foul, nominateTouching ? null : FoulType.NO_CONTACT);
  }
  const h = setup(B.YELLOW); h.frame.lastPottedWasRed = true; h.frame.nominatedColour = B.GREEN;
  new BallBody('green', B.GREEN, { x: 1.3, z: .85 }, h.world);
  begin(h, -.7); settle(h); assert.equal(result(h).foul, null);
});

test('clearing colours allows play-away only from the actual ball on', () => {
  const h = setup(B.YELLOW); h.frame.phase = GamePhase.COLOURS;
  begin(h, -.15); settle(h); assert.equal(result(h).foul, null);
  const wrong = setup(B.GREEN); wrong.frame.phase = GamePhase.COLOURS;
  new BallBody('yellow', B.YELLOW, { x: 2, z: 1.3 }, wrong.world);
  begin(wrong, -.15); settle(wrong); assert.equal(result(wrong).foul, FoulType.NO_CONTACT);
});

test('push strokes award the greater of four, ball-on and ball concerned without scoring pots', () => {
  for (const [type, penalty] of [[B.RED, 4], [B.BLUE, 5], [B.BLACK, 7]] as const) {
    const h = setup(type);
    if (type !== B.RED) { h.frame.lastPottedWasRed = true; h.frame.nominatedColour = type; }
    begin(h, .4); settle(h); h.game.recordPot(h.object);
    const r = result(h);
    assert.equal(r.foul, FoulType.PUSH_STROKE); assert.equal(r.penaltyPoints, penalty);
    assert.equal(r.scorePoints, 0); assert.equal(r.isMiss, false); assert.deepEqual(h.frame.scores, [0, penalty]);
    if (type !== B.RED) assert.ok(r.needsRespot.includes(type));
  }
  const h = setup(B.BLACK); begin(h, .4); settle(h);
  assert.equal(result(h).penaltyPoints, 7);
});

test('multiple touching balls must all stay still during departure; untouched black adds no penalty', () => {
  for (const vx of [-.15, .4]) {
    const h = setup(); new BallBody('black', B.BLACK, { x: 1.5, z: .85 + 2 * R }, h.world);
    begin(h, vx); settle(h); const r = result(h);
    assert.equal(r.foul, vx < 0 ? null : FoulType.PUSH_STROKE);
    assert.equal(r.penaltyPoints, vx < 0 ? 0 : 4);
  }
});

test('a later cushion return may hit the originally touching ball, at low and high render FPS', () => {
  for (const fps of [15, 144]) {
    const h = setup(B.RED, .4); begin(h, -2); settle(h, fps);
    assert.equal(h.game.shotTracker!.firstBallHit, h.object);
    assert.equal(h.game.shotTracker!.touching!.pushedIds.size, 0);
    assert.equal(result(h).foul, null);
  }
});

test('a potted red after lawful touching departure scores normally and retains the visit', () => {
  const h = setup(), red = new BallBody('pot-red', B.RED, { x: 1.2, z: .85 }, h.world);
  begin(h, -.15); settle(h); red.pot(); h.game.recordPot(red);
  const r = result(h); assert.equal(r.foul, null); assert.equal(r.scorePoints, 1);
  assert.equal(r.switchTurn, false); assert.deepEqual(h.frame.scores, [1, 0]);
});

test('touching exemption never cancels a scratch or illegal colour pot', () => {
  const h = setup(); begin(h, -.15); settle(h); h.game.recordPot(h.cue);
  assert.equal(result(h).foul, FoulType.CUE_POTTED);
  const wrong = setup(), black = new BallBody('black', B.BLACK, { x: 2.5, z: .85 }, wrong.world);
  begin(wrong, -.15); settle(wrong); black.pot(); wrong.game.recordPot(black);
  const r = result(wrong); assert.equal(r.foul, FoulType.WRONG_POT); assert.equal(r.penaltyPoints, 7);
});

test('touching nominated free ball counts as the ball on; touching a red alone cannot replace it', () => {
  const h = setup(B.BLACK); h.frame.nominatedFreeBall = h.object.id;
  // Leave the actual red fully visible after playing away from the nominated black.
  h.world.getBalls().find(b => b.type === B.RED)!.respawn(1, 1.3);
  begin(h, -.15); settle(h); assert.equal(result(h).foul, null);
  const push = setup(B.BLACK); push.frame.nominatedFreeBall = push.object.id;
  begin(push, .4); settle(push); assert.equal(result(push).penaltyPoints, 4);
  const wrong = setup(); const black = new BallBody('black', B.BLACK, { x: 2.5, z: .85 }, wrong.world);
  wrong.frame.nominatedFreeBall = black.id;
  begin(wrong, -.15); settle(wrong); assert.equal(result(wrong).foul, FoulType.NO_CONTACT);
});

test('a tiny non-impact correction is not a push, and replay recalculates touching from restored balls', () => {
  const h = setup(); begin(h, -.15); h.object.posZ += 1e-8; settle(h);
  assert.equal(result(h).foul, null);
  assert.equal(h.game.replayShot(h.world.getBalls()), false, 'a legal shot cannot be replaced');
  const miss = setup(B.BLACK);
  miss.world.getBalls().find(b => b.type === B.RED)!.respawn(1, 1.3);
  begin(miss, -.15); settle(miss);
  assert.equal(result(miss).isMiss, true);
  assert.equal(miss.game.replayShot(miss.world.getBalls()), true);
  begin(miss, -.15);
  assert.ok(miss.game.shotTracker!.touching!.balls.some(b => b.id === miss.object.id));
  settle(miss); assert.equal(result(miss).foul, FoulType.NO_CONTACT);
});

test('touching does not create a legal-contact exception for jumping over an object ball', () => {
  const h = setup(), jump = new JumpRule(h.cue, h.world.getBalls());
  jump.record({ kind: 'over', ball: h.cue, other: h.object, speed: 0, time: .1, x: 1.55, y: .1, z: .85 }, h.cue);
  jump.record({ kind: 'slate', ball: h.cue, speed: 0, time: .2, x: 1.7, y: R, z: .85 }, h.cue);
  begin(h, -.15); settle(h); h.game.shotTracker!.jumpShot = jump.foul;
  assert.equal(result(h).foul, FoulType.JUMP_SHOT);
});

test('after a touching push the opponent may require the offender to play from the remaining position', () => {
  const h = setup(); begin(h, .4); settle(h); result(h);
  const positions = h.world.getBalls().map(b => b.getPosition());
  assert.equal(h.frame.striker, 1); assert.deepEqual(h.frame.scores, [0, 4]);
  h.frame.freeBallAvailable = true;
  h.game.requireOffenderToPlay();
  assert.equal(h.frame.striker, 0); assert.deepEqual(h.frame.scores, [0, 4]);
  assert.equal(h.frame.freeBallAvailable, false);
  assert.deepEqual(h.world.getBalls().map(b => b.getPosition()), positions);
});
