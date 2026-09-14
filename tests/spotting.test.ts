import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpottingLogic } from '../src/game/SpottingLogic';
import { GameStateManager } from '../src/game/GameState';
import { TouchingBall } from '../src/game/TouchingBall';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { BallBody } from '../src/physics/BallBody';
import { BALL_RADIUS as R, COLOUR_SPOTS as SPOTS, RESPAWN_PRIORITY,
  TABLE_LENGTH, TOUCHING_BALL_TOLERANCE } from '../src/constants';
import { BallType as B, GameMode, AIDifficulty } from '../src/types';

const rule = new SpottingLogic();
const colours = RESPAWN_PRIORITY.map(type => type as B);
const spot = (type: B) => SPOTS[type as keyof typeof SPOTS];
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
function add(w: PhysicsWorld, id: string, p: { x: number; z: number }, type = B.RED) {
  return new BallBody(id, type, p, w);
}
function occupiedSpots() {
  const w = new PhysicsWorld();
  colours.forEach(type => add(w, `occupant-${type}`, spot(type)));
  return w;
}
function clear(p: { x: number; z: number }, balls: BallBody[]) {
  assert.ok(p.x >= R && p.x <= TABLE_LENGTH - R);
  for (const b of balls.filter(b => b.isOnTable && !b.isPotted)) {
    assert.ok(Math.hypot(p.x - b.posX, p.z - b.posZ) > 2 * R + TOUCHING_BALL_TOLERANCE);
  }
}

for (const colour of colours) {
  test(`${colour}: every vacancy combination uses own spot or highest available spot`, () => {
    for (let mask = 0; mask < 64; mask++) {
      const w = new PhysicsWorld();
      colours.forEach((type, i) => { if (mask & (1 << i)) add(w, type, spot(type)); });
      const available = colours.filter((_, i) => !(mask & (1 << i)));
      if (!available.length) continue;
      const expected = available.includes(colour) ? colour : available[0];
      assert.deepEqual(rule.findRespotPosition(colour, w.getBalls()), spot(expected));
    }
  });
  test(`${colour}: all spots occupied uses the nearest non-touching point toward top cushion`, () => {
    const w = occupiedSpots(), before = w.getBalls().map(b => b.getState());
    const p = rule.findRespotPosition(colour, w.getBalls());
    near(p.z, spot(colour).z);
    near(p.x, spot(colour).x + 2 * R + 2 * TOUCHING_BALL_TOLERANCE);
    clear(p, w.getBalls()); assert.deepEqual(w.getBalls().map(b => b.getState()), before);
  });
}

test('a touching spot is occupied, but a genuine small clearance is available', () => {
  const w = new PhysicsWorld();
  const b = add(w, 'blocker', SPOTS.blue);
  b.posX = SPOTS.blue.x + 2 * R;
  assert.equal(rule.isSpotAvailable(SPOTS.blue, w.getBalls()), false);
  b.posX += .0001;
  assert.equal(rule.isSpotAvailable(SPOTS.blue, w.getBalls()), true);
  const cue = add(w, 'cue', SPOTS.blue, B.CUE);
  assert.deepEqual(new TouchingBall().findTouchingBalls(cue, w.getBalls()), []);
});

test('potted and forced-off balls do not occupy spots, while the cue ball does', () => {
  const w = new PhysicsWorld(), cue = add(w, 'cue', SPOTS.blue, B.CUE);
  assert.deepEqual(rule.findRespotPosition(B.BLUE, w.getBalls()), SPOTS.black);
  cue.pot(); assert.deepEqual(rule.findRespotPosition(B.BLUE, w.getBalls()), SPOTS.blue);
  cue.respawn(SPOTS.blue.x, SPOTS.blue.z); cue.isOnTable = false;
  assert.deepEqual(rule.findRespotPosition(B.BLUE, w.getBalls()), SPOTS.blue);
});

test('line search finds a narrow gap that a ball-sized sampling step skips', () => {
  const w = occupiedSpots();
  add(w, 'next', { x: SPOTS.black.x + 4 * R + 4 * TOUCHING_BALL_TOLERANCE + .001, z: SPOTS.black.z });
  const p = rule.findRespotPosition(B.BLACK, w.getBalls());
  near(p.x, SPOTS.black.x + 2 * R + 2 * TOUCHING_BALL_TOLERANCE);
  clear(p, w.getBalls());
});

test('line search accounts for off-axis blockers and overlapping blocked intervals', () => {
  const w = occupiedSpots(), z = SPOTS.blue.z;
  add(w, 'off-axis', { x: SPOTS.blue.x + .075, z: z + .03 });
  add(w, 'chain', { x: SPOTS.blue.x + .14, z });
  const p = rule.findRespotPosition(B.BLUE, w.getBalls());
  near(p.x, SPOTS.blue.x + .14 + 2 * R + 2 * TOUCHING_BALL_TOLERANCE);
  clear(p, w.getBalls());
  const reverse = rule.findRespotPosition(B.BLUE, [...w.getBalls()].reverse());
  assert.deepEqual(reverse, p);
});

for (const colour of [B.PINK, B.BLACK]) {
  test(`${colour}: when top-cushion line is full, use the nearest point on the baulk side`, () => {
    const w = new PhysicsWorld(), original = spot(colour);
    for (let x = original.x, i = 0; x <= TABLE_LENGTH - R; x += 2 * R, i++) {
      add(w, `row-${i}`, { x, z: original.z });
    }
    for (const type of colours) {
      if (rule.isSpotAvailable(spot(type), w.getBalls())) add(w, `spot-${type}`, spot(type));
    }
    const p = rule.findRespotPosition(colour, w.getBalls());
    near(p.x, original.x - 2 * R - 2 * TOUCHING_BALL_TOLERANCE);
    near(p.z, original.z); clear(p, w.getBalls());
  });
}

test('simultaneous returns preserve vacant own spots before allocating substitute spots', () => {
  const w = occupiedSpots();
  w.getBalls().find(b => b.id === 'occupant-yellow')!.pot();
  const yellow = add(w, 'yellow', SPOTS.yellow, B.YELLOW); yellow.pot();
  const pink = add(w, 'pink', SPOTS.pink, B.PINK); pink.pot();
  rule.respotColours([B.PINK, B.YELLOW], w.getBalls());
  near(yellow.posX, SPOTS.yellow.x); near(yellow.posZ, SPOTS.yellow.z);
  assert.ok(pink.posX > SPOTS.pink.x); near(pink.posZ, SPOTS.pink.z);
});

test('a multi-colour foul restores high value first regardless of pot order and preserves penalty', () => {
  for (const order of [[B.YELLOW, B.BLUE], [B.BLUE, B.YELLOW]]) {
    const w = occupiedSpots();
    w.getBalls().find(b => b.id === 'occupant-black')!.pot();
    w.getBalls().find(b => b.id === 'occupant-pink')!.pot();
    const cue = add(w, 'cue', { x: 1, z: .2 }, B.CUE);
    const yellow = add(w, 'yellow', { x: 1.5, z: .2 }, B.YELLOW);
    const blue = add(w, 'blue', { x: 2, z: .2 }, B.BLUE);
    const game = new GameStateManager();
    game.startMatch({ mode: GameMode.PASS_PLAY, difficulty: AIDifficulty.MEDIUM,
      totalFrames: 1, player1Name: '甲', player2Name: '乙' });
    game.initBallStates(w.getBalls()); game.startShot(cue, w.getBalls());
    for (const type of order) {
      const ball = type === B.BLUE ? blue : yellow; ball.pot(); game.recordPot(ball);
    }
    const blockers = w.getBalls().filter(b => b.type === B.RED).map(b => b.getState());
    const result = game.evaluateShot(w.getBalls(), cue);
    assert.equal(result.penaltyPoints, 5); assert.deepEqual(game.match!.frame.scores, [0, 5]);
    near(blue.posX, SPOTS.black.x); near(blue.posZ, SPOTS.black.z);
    near(yellow.posX, SPOTS.pink.x); near(yellow.posZ, SPOTS.pink.z);
    assert.deepEqual(w.getBalls().filter(b => b.type === B.RED).map(b => b.getState()), blockers);
    assert.equal(rule.respotColours(order, w.getBalls()).length, 0);
  }
});
