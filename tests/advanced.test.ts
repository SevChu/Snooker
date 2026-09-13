import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BallBody } from '../src/physics/BallBody';
import { PhysicsWorld, type PhysicsEvent } from '../src/physics/PhysicsWorld';
import { applyCueSpin, applyCloth } from '../src/physics/SpinPhysics';
import { cuePose, assessCueAccess } from '../src/physics/CueMechanics';
import { SnookerDetector } from '../src/game/SnookerDetector';
import { FreeBallRule } from '../src/game/FreeBallRule';
import { RulesEngine, type ShotTracker } from '../src/game/RulesEngine';
import { GameStateManager } from '../src/game/GameState';
import { framesToWin } from '../src/game/MatchFormat';
import { JumpRule } from '../src/game/JumpRule';
import { BallOnCalculator } from '../src/game/BallOnCalculator';
import { SpottingLogic } from '../src/game/SpottingLogic';
import { AimController } from '../src/input/AimController';
import { CueElevation } from '../src/input/CueElevation';
import { predictShot } from '../src/physics/ShotPredictor';
import { BallType as B, GamePhase, GameMode, AIDifficulty, GameState, FoulType, type FrameState } from '../src/types';
import { BALL_RADIUS as R, PHYSICS_TIMESTEP as DT, GRAVITY, TABLE_WIDTH as W,
  YELLOW_SPOT, GREEN_SPOT, D_CENTER } from '../src/constants';

function make(w: PhysicsWorld, id: string, type: B, x: number, z = .8) {
  return new BallBody(id, type, { x, z }, w);
}
const near = (a: number, b: number, eps = 1e-8) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
function frame(balls: BallBody[], phase = GamePhase.REDS): FrameState {
  return { phase, lastPottedWasRed: false, striker: 0, scores: [0, 0], redsRemaining: 1,
    currentBreak: 0, consecutiveMisses: 0, balls: balls.map(b => b.getState()), preShotSnapshot: null };
}
function tracker(first: BallBody | null, pots: BallBody[] = []): ShotTracker {
  return { firstBallHit: first, allBallsContacted: new Set(), pottedBalls: pots, cueBallPotted: false,
    ballsOffTable: [], wasSnookered: false };
}
function setupGame() {
  const game = new GameStateManager();
  game.startMatch({ mode: GameMode.PASS_PLAY, difficulty: AIDifficulty.MEDIUM,
    totalFrames: 1, player1Name: '甲', player2Name: '乙' });
  return game;
}

test('match setup rejects invalid frame counts without replacing the current match', () => {
  const game = setupGame(), original = game.match;
  for (const totalFrames of [0, -1, 2, 8, 34, 9.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 2]) {
    assert.throws(() => game.startMatch({ mode: GameMode.PASS_PLAY, difficulty: AIDifficulty.MEDIUM,
      totalFrames, player1Name: '甲', player2Name: '乙' }), RangeError);
    assert.equal(game.match, original);
  }
  assert.equal(framesToWin(9), 5); assert.equal(framesToWin(35), 18);
});

test('custom best-of matches end exactly at the required wins, including the deciding frame', () => {
  for (const totalFrames of [1, 9, 35]) for (const decidingFrame of [false, true]) {
    const game = new GameStateManager(), needed = (totalFrames + 1) / 2;
    game.startMatch({ mode: GameMode.PASS_PLAY, difficulty: AIDifficulty.MEDIUM,
      totalFrames, player1Name: '甲', player2Name: '乙' });
    const winners = decidingFrame
      ? [...Array(needed - 1).fill(0), ...Array(needed).fill(1)] : Array(needed).fill(0);
    winners.forEach((winner, index) => {
      const w = new PhysicsWorld(), cue = make(w, 'cue', B.CUE, 1), black = make(w, 'black', B.BLACK, 2.5);
      game.initBallStates(w.getBalls());
      game.match!.frame.phase = GamePhase.COLOURS; game.match!.frame.striker = winner;
      game.startShot(cue, w.getBalls()); game.recordCollision(cue, black);
      black.pot(); game.recordPot(black); game.evaluateShot(w.getBalls(), cue);
      if (index === winners.length - 1) {
        assert.equal(game.getState(), GameState.GAME_OVER);
        assert.equal(game.match!.framesWon[winner], needed);
        assert.equal(game.match!.currentFrame, winners.length);
      } else {
        assert.equal(game.getState(), GameState.FRAME_OVER);
        assert.equal(game.match!.currentFrame, index + 1, 'wait for the result panel');
        assert.equal(game.frameSummary!.scores[winner], 7);
        assert.equal(game.frameSummary!.highestBreaks[winner], 7);
        assert.equal(game.continueFrame(), true);
        assert.equal(game.match!.currentFrame, index + 2);
        assert.equal(game.frameSummary, null);
        assert.equal(game.continueFrame(), false, 'double clicks cannot skip a frame');
      }
    });
  }
});

test('a colour nomination can be replaced before the shot, including after the final red', () => {
  for (const redsRemaining of [1, 0]) {
    const w = new PhysicsWorld(), cue = make(w, 'cue', B.CUE, 1);
    const yellow = make(w, 'yellow', B.YELLOW, 1.5), green = make(w, 'green', B.GREEN, 2);
    const absent = make(w, 'blue', B.BLUE, 2.5); absent.pot();
    const game = setupGame(); game.initBallStates(w.getBalls());
    const f = game.match!.frame, calculator = new BallOnCalculator();
    f.lastPottedWasRed = true; f.redsRemaining = redsRemaining; f.nominatedColour = B.YELLOW;
    assert.deepEqual(calculator.getColourChoices(f, w.getBalls()), [yellow, green]);
    assert.equal(f.nominatedColour, B.YELLOW, 'opening the chooser must preserve the old nomination');
    f.nominatedColour = B.GREEN;
    assert.equal(calculator.isLegalFirstContact(B.YELLOW, f), false);
    assert.equal(calculator.isLegalFirstContact(B.GREEN, f), true);
    game.startShot(cue, w.getBalls()); game.recordCollision(cue, green);
    assert.equal(game.evaluateShot(w.getBalls(), cue).foul, null);
    f.lastPottedWasRed = false;
    assert.deepEqual(calculator.getColourChoices(f, w.getBalls()), []);
    f.phase = GamePhase.COLOURS;
    assert.deepEqual(calculator.getColourChoices(f, w.getBalls()), []);
  }
});

test('yellow and green start and respot on the corrected sides of the D', () => {
  assert.ok(YELLOW_SPOT.z > D_CENTER.z);
  assert.ok(GREEN_SPOT.z < D_CENTER.z);
  const spotting = new SpottingLogic();
  assert.deepEqual(spotting.findRespotPosition(B.YELLOW, []), YELLOW_SPOT);
  assert.deepEqual(spotting.findRespotPosition(B.GREEN, []), GREEN_SPOT);
});

test('automatic elevation clears the rail immediately and lowers again when the cue moves away', () => {
  const w = new PhysicsWorld(), cue = make(w, 'cue', B.CUE, .12);
  const lift = new CueElevation(), direction = { x: 1, y: 0, z: 0 }, spin = { side: 0, vertical: 0 };
  let access = lift.assess(cue, w.getBalls(), direction, spin, 'hand');
  assert.ok(lift.value > 0); assert.equal(access.allowed, true);
  assert.equal(lift.value, access.minimumElevation);
  assert.equal(assessCueAccess(cue, w.getBalls(), direction, { ...spin, elevation: lift.value - .5 }).allowed, false);
  cue.respawn(2, .8);
  access = lift.assess(cue, w.getBalls(), direction, spin, 'hand');
  assert.equal(access.allowed, true); assert.equal(lift.value, 0);
});

test('automatic elevation follows ball obstructions, aiming direction, spin and bridge changes', () => {
  const w = new PhysicsWorld(), cue = make(w, 'cue', B.CUE, 2);
  make(w, 'red', B.RED, 1.8);
  const lift = new CueElevation(), spin = { side: 0, vertical: -.5 };
  const forward = { x: 1, y: 0, z: 0 }, backward = { x: -1, y: 0, z: 0 };
  let access = lift.assess(cue, w.getBalls(), forward, spin, 'hand');
  assert.equal(access.allowed, true); assert.ok(lift.value > 0);
  access = lift.assess(cue, w.getBalls(), backward, { side: 0, vertical: 0 }, 'hand');
  assert.equal(access.allowed, true); assert.equal(lift.value, 0);
  access = lift.assess(cue, w.getBalls(), backward, spin, 'spider');
  assert.equal(access.allowed, true); assert.ok(lift.value > 0);
  assert.equal(lift.value, access.minimumElevation);
});

test('manual elevation stays selected until auto is restored or a new shot starts', () => {
  const w = new PhysicsWorld(), cue = make(w, 'cue', B.CUE, .12);
  const lift = new CueElevation(), direction = { x: 1, y: 0, z: 0 }, spin = { side: 0, vertical: 0 };
  lift.setManual(50);
  assert.equal(lift.assess(cue, w.getBalls(), direction, spin, 'hand').allowed, true);
  assert.equal(lift.value, 50);
  lift.setManual(0);
  assert.equal(lift.assess(cue, w.getBalls(), direction, spin, 'hand').allowed, false);
  assert.equal(lift.value, 0);
  lift.automatic = true;
  assert.equal(lift.assess(cue, w.getBalls(), direction, spin, 'hand').allowed, true);
  assert.ok(lift.value > 0 && lift.value < 50);
  lift.setManual(50); lift.reset();
  assert.equal(lift.automatic, true);
  assert.equal(lift.assess(cue, w.getBalls(), direction, spin, 'hand').allowed, true);
  assert.ok(lift.value > 0 && lift.value < 50);
});

test('automatic elevation keeps an impossible bridge placement blocked', () => {
  const w = new PhysicsWorld(), cue = make(w, 'cue', B.CUE, .03);
  const lift = new CueElevation(), access = lift.assess(cue, w.getBalls(),
    { x: 1, y: 0, z: 0 }, { side: 0, vertical: 0 }, 'spider');
  assert.equal(access.allowed, false); assert.ok(access.minimumElevation > 80);
  assert.equal(lift.value, 80);
});

test('airborne motion follows gravity without cloth drag or phantom planar collisions', () => {
  const w = new PhysicsWorld(), cue = make(w, 'cue', B.CUE, 1), red = make(w, 'red', B.RED, 1.1);
  cue.posY = .25; cue.velX = 1;
  for (let i = 0; i < 24; i++) w.step(DT);
  near(cue.posX, 1.1); near(cue.posY, .25 + GRAVITY * .1 ** 2 / 2);
  near(cue.velY, GRAVITY * .1); near(red.velX, 0);
  assert.ok(w.drainEvents().some(e => e.kind === 'over'));
  const velocity = cue.getVelocity(); applyCloth(cue, .2); assert.deepEqual(cue.getVelocity(), velocity);
});
test('raised cue applies a downward impulse then rebounds off slate into a real flight', () => {
  const w = new PhysicsWorld(), cue = make(w, 'cue', B.CUE, 1);
  cue.velX = 3; applyCueSpin(cue, { side: 0, vertical: 0, elevation: 60 }, { x: 1, y: 0, z: 0 });
  near(cue.velX, 1.5); near(cue.velY, -3 * Math.sin(Math.PI / 3));
  let peak = R;
  for (let i = 0; i < 480; i++) { w.step(DT); peak = Math.max(peak, cue.posY); }
  assert.ok(peak > R + .04); near(cue.posY, R); near(cue.velY, 0);
  assert.ok(w.drainEvents().filter(e => e.kind === 'slate').length >= 2);
  assert.equal(w.collisionBudgetExceeded, 0);
});
test('massé bends from raised-cue spin; opposite side offsets give mirrored trajectories', () => {
  const ends = [-1, 1].map(side => {
    const w = new PhysicsWorld(), cue = make(w, 'cue', B.CUE, 1, W / 2);
    cue.velX = 2; applyCueSpin(cue, { side: side * .6, vertical: -.5, elevation: 70 }, { x: 1, y: 0, z: 0 });
    for (let i = 0; i < 240; i++) w.step(DT);
    return cue.getPosition();
  });
  assert.ok(Math.abs(ends[0].z - W / 2) > .15);
  near(ends[0].x, ends[1].x); near(ends[0].z + ends[1].z, W);
});
test('three-dimensional cue contact remains on the sphere at all tip offsets and elevations', () => {
  for (const elevation of [0, 30, 60, 80]) for (const side of [-1, 0, 1]) {
    const pose = cuePose({ x: 1, y: R, z: .8 }, { x: .6, y: 0, z: .8 }, { side, vertical: -.7, elevation });
    near(Math.hypot(pose.contact.x - 1, pose.contact.y - R, pose.contact.z - .8), R);
    near(Math.hypot(pose.direction.x, pose.direction.y, pose.direction.z), 1);
  }
});
test('rail and nearby balls obstruct a level shaft but permit sufficient elevation', () => {
  const w = new PhysicsWorld(), cue = make(w, 'cue', B.CUE, .12);
  const direction = { x: 1, y: 0, z: 0 }, spin = { side: 0, vertical: 0 };
  const rail = assessCueAccess(cue, [cue], direction, spin);
  assert.equal(rail.allowed, false); assert.ok(rail.minimumElevation > 0 && rail.minimumElevation < 60);
  assert.ok(assessCueAccess(cue, [cue], direction, { ...spin, elevation: rail.minimumElevation + 1 }).allowed);
  cue.setPosition(1.8, .8); const blocker = make(w, 'blue', B.BLUE, 1.68);
  assert.equal(assessCueAccess(cue, [cue, blocker], direction, spin).allowed, false);
  assert.ok(assessCueAccess(cue, [cue, blocker], direction, { ...spin, elevation: 50 }).allowed);
});
test('mechanical rests require head clearance and a legal support location', () => {
  const w = new PhysicsWorld(), cue = make(w, 'cue', B.CUE, 1.8), d = { x: 1, y: 0, z: 0 };
  assert.equal(assessCueAccess(cue, [cue], d, { side: 0, vertical: 0 }, 'spider').allowed, false);
  assert.equal(assessCueAccess(cue, [cue], d, { side: 0, vertical: 0, elevation: 30 }, 'spider').allowed, true);
  cue.setPosition(.04, .8);
  assert.equal(assessCueAccess(cue, [cue], d, { side: 0, vertical: 0, elevation: 30 }, 'rest').allowed, false);
});
test('free-ball visibility requires both edges, not just the center line', () => {
  const w = new PhysicsWorld(), cue = make(w, 'cue', B.CUE, 1), red = make(w, 'red', B.RED, 2);
  const blue = make(w, 'blue', B.BLUE, 1.5, .86), detector = new SnookerDetector();
  assert.ok(detector.hasDirectLineOfSight(cue.getPosition(), red.getPosition(), w.getBalls(), cue.id, red.id));
  assert.ok(detector.isSnookered(cue, [B.RED], w.getBalls()));
  blue.type = B.RED; assert.equal(detector.isSnookered(cue, [B.RED], w.getBalls()), false);
});
test('one fully visible ball-on prevents free ball even if another is hidden', () => {
  const w = new PhysicsWorld(), cue = make(w, 'cue', B.CUE, 1);
  make(w, 'red', B.RED, 2); make(w, 'blue', B.BLUE, 1.5); make(w, 'red2', B.RED, 1.7, 1.2);
  assert.equal(new SnookerDetector().isSnookered(cue, [B.RED], w.getBalls()), false);
});
test('in-hand examines every legal D position rather than the selected snookered position', () => {
  const w = new PhysicsWorld(), cue = make(w, 'cue', B.CUE, .6, W / 2);
  make(w, 'red', B.RED, 2, W / 2); make(w, 'blue', B.BLUE, 1.4, W / 2);
  const rule = new FreeBallRule(), f = frame(w.getBalls());
  assert.equal(rule.checkFreeBall(cue, f, w.getBalls()), true);
  assert.equal(rule.checkFreeBall(cue, f, w.getBalls(), true), false);
  const game = setupGame(); game.initBallStates(w.getBalls()); game.match!.frame.freeBallAvailable = false;
  assert.equal(game.placeCueBall(.6, W / 2, w.getBalls()), true);
  assert.equal(game.getState(), GameState.AIMING);
});
test('in-hand still awards free ball if no point in D exposes both edges', () => {
  const w = new PhysicsWorld(), cue = make(w, 'cue', B.CUE, .6, W / 2);
  make(w, 'red', B.RED, 1.5, W / 2); make(w, 'blue', B.BLUE, 1.4, W / 2);
  assert.equal(new FreeBallRule().checkFreeBall(cue, frame(w.getBalls()), w.getBalls(), true), true);
});
test('free-ball nomination excludes the actual ball-on and scores/respots the substitute', () => {
  const w = new PhysicsWorld(), cue = make(w, 'cue', B.CUE, 1), red = make(w, 'red', B.RED, 2);
  const black = make(w, 'black', B.BLACK, 2.5), f = frame(w.getBalls());
  assert.deepEqual(new FreeBallRule().getNominatableBalls(w.getBalls(), [B.RED]), [black]);
  f.nominatedFreeBall = black.id;
  const result = new RulesEngine().evaluateShot(tracker(black, [black, red]), f, w.getBalls(), cue);
  assert.equal(result.foul, null); assert.equal(result.scorePoints, 2);
  assert.deepEqual(result.needsRespot, [B.BLACK]);
});
test('a free colour plus its actual ball-on scores only once', () => {
  const w = new PhysicsWorld(), cue = make(w, 'cue', B.CUE, 1), yellow = make(w, 'yellow', B.YELLOW, 2);
  const black = make(w, 'black', B.BLACK, 2.5), f = frame(w.getBalls(), GamePhase.COLOURS);
  f.nominatedFreeBall = black.id;
  const result = new RulesEngine().evaluateShot(tracker(black, [black, yellow]), f, w.getBalls(), cue);
  assert.equal(result.scorePoints, 2); assert.deepEqual(result.needsRespot, [B.BLACK]);
});
test('foul during colours respots removed colours and preserves their penalty value', () => {
  const w = new PhysicsWorld(), cue = make(w, 'cue', B.CUE, 1), yellow = make(w, 'yellow', B.YELLOW, 2);
  const black = make(w, 'black', B.BLACK, 2.5), f = frame(w.getBalls(), GamePhase.COLOURS);
  const t = tracker(yellow, [black]);
  const result = new RulesEngine().evaluateShot(t, f, w.getBalls(), cue);
  assert.equal(result.penaltyPoints, 7); assert.equal(result.scorePoints, 0); assert.deepEqual(result.needsRespot, [B.BLACK]);
});
test('free ball is assessed for the incoming red after a foul on a nominated colour', () => {
  const w = new PhysicsWorld(), cue = make(w, 'cue', B.CUE, 1);
  make(w, 'red', B.RED, 2); const blue = make(w, 'blue', B.BLUE, 1.5);
  const game = setupGame(); game.initBallStates(w.getBalls());
  game.match!.frame.lastPottedWasRed = true; game.match!.frame.nominatedColour = B.BLUE;
  game.startShot(cue, w.getBalls());
  const result = game.evaluateShot(w.getBalls(), cue);
  assert.equal(result.penaltyPoints, 5); assert.equal(result.freeBallAvailable, true);
  assert.equal(game.match!.frame.lastPottedWasRed, false); assert.equal(game.match!.frame.striker, 1);
  game.replayShot(w.getBalls());
  assert.equal(game.match!.frame.striker, 0); assert.equal(game.match!.frame.lastPottedWasRed, true);
  assert.deepEqual(game.match!.frame.scores, [0, 5]); assert.ok(blue.isOnTable);
});

function event(kind: PhysicsEvent['kind'], cue: BallBody, other?: BallBody, x = cue.posX): PhysicsEvent {
  return { kind, ball: cue, other, time: 0, speed: 1, x, y: cue.posY, z: cue.posZ };
}
test('jump adjudication distinguishes overflight, simple lift and permitted post-contact flight', () => {
  const w = new PhysicsWorld(), cue = make(w, 'cue', B.CUE, 1), red = make(w, 'red', B.RED, 1.3);
  const blue = make(w, 'blue', B.BLUE, 1.5);
  const foul = new JumpRule(cue, w.getBalls()); foul.record(event('over', cue, red), cue);
  foul.record(event('slate', cue, undefined, 1.6), cue); assert.equal(foul.foul, true);
  const lift = new JumpRule(cue, w.getBalls()); lift.record(event('slate', cue), cue); assert.equal(lift.foul, false);
  const legal = new JumpRule(cue, w.getBalls()); legal.record(event('ball', cue, red), cue);
  legal.record(event('over', cue, blue), cue); legal.record(event('slate', cue, undefined, 1.6), cue);
  assert.equal(legal.foul, false);
  const nearSide = new JumpRule(cue, w.getBalls()); nearSide.record(event('over', cue, red), cue);
  nearSide.record(event('ball', cue, red), cue); nearSide.record(event('slate', cue, undefined, 1.2), cue);
  assert.equal(nearSide.foul, false);
});
test('jumping over an object before legal contact is penalized even if a red is later hit', () => {
  const w = new PhysicsWorld(), cue = make(w, 'cue', B.CUE, 1), red = make(w, 'red', B.RED, 2);
  const t = tracker(red); t.jumpShot = true;
  const result = new RulesEngine().evaluateShot(t, frame(w.getBalls()), w.getBalls(), cue);
  assert.equal(result.foul, FoulType.JUMP_SHOT); assert.equal(result.penaltyPoints, 4);
});
function inputHarness() {
  let angle = 0;
  const pressed = new Set<string>(), edges = new Set<string>();
  const input = { dragDeltaX: 0, scrollDelta: 0, isDragging: false, justClicked: false,
    isKeyPressed: (key: string) => pressed.has(key), isKeyJustPressed: (key: string) => edges.has(key) };
  const aim = new AimController(input as any, { rotateAim: (d: number) => angle += d } as any);
  aim.enable(); return { aim, input, pressed, edges, angle: () => angle };
}
test('fine mouse aim uses smaller increments and retains delta from the release frame', () => {
  const normal = inputHarness(), fine = inputHarness(); fine.aim.fineMode = true;
  for (const h of [normal, fine]) { h.input.dragDeltaX = 10; h.aim.update(1 / 60); }
  near(normal.angle(), -.015); near(fine.angle(), -.0008);
});
test('arrow tapping is precise and held rotation is invariant to rendering FPS', () => {
  for (const fps of [15, 30, 60, 144]) {
    const h = inputHarness(); h.aim.fineMode = true; h.pressed.add('ArrowRight'); h.edges.add('ArrowRight');
    h.aim.update(1 / fps); h.edges.clear();
    for (let i = 1; i < fps; i++) h.aim.update(1 / fps);
    near(h.angle() * 180 / Math.PI, .002 + .75);
  }
  const h = inputHarness(); h.aim.nudge(.005); h.aim.update(1 / 60); near(h.angle() * 180 / Math.PI, .005);
});

test('a tiny aiming click cannot accidentally fire a stroke', () => {
  const h = inputHarness(); h.input.justClicked = true; h.input.dragDeltaX = 1;
  assert.equal(h.aim.update(1 / 60), false); near(h.angle(), -.0015);
});
test('a raised-shot preview follows the same airborne trajectory as the live solver', () => {
  const w = new PhysicsWorld(), cue = make(w, 'cue', B.CUE, 1);
  const spin = { side: .6, vertical: -.5, elevation: 70 }, direction = { x: 1, y: 0, z: 0 };
  const preview = predictShot(cue, [cue], direction, spin, 1.5), before = cue.getState();
  assert.ok(Math.max(...preview.approach.map(p => p.y)) > R + .015);
  assert.equal(preview.contact, null); near(before.position.x, 1);
  cue.velX = 1.5; applyCueSpin(cue, spin, direction);
  for (let i = 0; i < 960; i++) { w.step(DT); if (w.allBallsAtRest([cue])) break; }
  const end = preview.approach.at(-1)!;
  near(end.x, cue.posX); near(end.y, cue.posY); near(end.z, cue.posZ);
});
test('a free ball used as the effective snookering ball is a foul', () => {
  const w = new PhysicsWorld(), cue = make(w, 'cue', B.CUE, 1);
  make(w, 'red', B.RED, 2); const blue = make(w, 'blue', B.BLUE, 1.5);
  const f = frame(w.getBalls()); f.nominatedFreeBall = blue.id;
  const result = new RulesEngine().evaluateShot(tracker(blue), f, w.getBalls(), cue);
  assert.equal(result.foul, FoulType.FREE_BALL_SNOOKER); assert.equal(result.penaltyPoints, 4);
});
test('a points deficit does not end a colours frame while snookers are still possible', () => {
  const w = new PhysicsWorld(), cue = make(w, 'cue', B.CUE, 1), pink = make(w, 'pink', B.PINK, 2);
  make(w, 'black', B.BLACK, 2.5);
  const game = setupGame(); game.initBallStates(w.getBalls());
  game.match!.frame.phase = GamePhase.COLOURS; game.match!.frame.scores = [0, 40];
  game.startShot(cue, w.getBalls()); game.recordCollision(cue, pink);
  game.evaluateShot(w.getBalls(), cue); assert.equal(game.getState(), GameState.AIMING);
});
test('a foul on the final black ends the frame unless the scores become tied', () => {
  for (const scores of [[0, 0], [7, 0]] as [number, number][]) {
    const w = new PhysicsWorld(), cue = make(w, 'cue', B.CUE, 1), black = make(w, 'black', B.BLACK, 2.5);
    const game = setupGame(); game.initBallStates(w.getBalls());
    game.match!.frame.phase = GamePhase.COLOURS; game.match!.frame.scores = scores;
    game.startShot(cue, w.getBalls()); const result = game.evaluateShot(w.getBalls(), cue);
    assert.equal(result.penaltyPoints, 7);
    if (scores[0] === 7) {
      assert.equal(game.getState(), GameState.PLACING); assert.equal(result.cueBallInHand, true);
      assert.ok(black.isOnTable); assert.deepEqual(game.match!.frame.scores, [7, 7]);
    } else assert.equal(game.getState(), GameState.GAME_OVER);
  }
});
