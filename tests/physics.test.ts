import { test } from 'node:test';
import './advanced.test';
import './pockets.test';
import assert from 'node:assert/strict';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { BallBody } from '../src/physics/BallBody';
import { applyCloth, applyCueSpin } from '../src/physics/SpinPhysics';
import { collideBalls, collideCushion } from '../src/physics/Contacts';
import { predictShot } from '../src/physics/ShotPredictor';
import { BallType } from '../src/types';
import { AimController } from '../src/input/AimController';
import {
  BALL_RADIUS as R, BALL_MASS as M, BALL_INERTIA as I, PHYSICS_TIMESTEP as DT,
  RESTITUTION_BALL as E, RESTITUTION_CUSHION, FRICTION_TABLE_SLIDING,
  FRICTION_ROLLING, GRAVITY, TABLE_LENGTH as L, TABLE_WIDTH as W,
  RED_TRIANGLE_APEX, COLOUR_SPOTS,
} from '../src/constants';

const near = (a: number, b: number, eps = 1e-8) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const energy = (b: BallBody) => M / 2 * (b.velX ** 2 + b.velY ** 2 + b.velZ ** 2)
  + I / 2 * (b.angularVelX ** 2 + b.angularVelY ** 2 + b.angularVelZ ** 2);
function ball(w = new PhysicsWorld(), id = 'cue', x = 1, z = 0.8): BallBody {
  return new BallBody(id, id === 'cue' ? BallType.CUE : BallType.RED, { x, z }, w);
}
function run(w: PhysicsWorld, seconds: number, fps = 60): void {
  for (let i = 0; i < Math.round(seconds * fps); i++) w.step(1 / fps);
}

test('head-on impulse agrees with equal-mass restitution and conserves momentum', () => {
  const a = ball(), b = ball(); a.velX = 3;
  const before = energy(a) + energy(b);
  collideBalls(a, b, 1, 0);
  near(a.velX, 3 * (1 - E) / 2); near(b.velX, 3 * (1 + E) / 2);
  near(a.velX + b.velX, 3); assert.ok(energy(a) + energy(b) <= before);
});
test('oblique spinning impacts conserve planar momentum without energy gain', () => {
  for (let i = 0; i < 100; i++) {
    const a = ball(), b = ball();
    a.setVelocity(1 + i / 20, 0, Math.sin(i) * 2);
    b.setVelocity(-0.3, 0, Math.cos(i));
    a.setAngularVelocity(20, i * 3 - 150, -45);
    b.setAngularVelocity(0, 100 - i * 2, 10);
    const px = a.velX + b.velX, pz = a.velZ + b.velZ, before = energy(a) + energy(b);
    collideBalls(a, b, 1, 0);
    near(a.velX + b.velX, px); near(a.velZ + b.velZ, pz);
    assert.ok(energy(a) + energy(b) <= before + 1e-10);
  }
});
test('center strike slides then reaches the analytical 5/7 rolling speed', () => {
  const b = ball(); b.velX = 1;
  const transition = 2 / (7 * FRICTION_TABLE_SLIDING * Math.abs(GRAVITY));
  applyCloth(b, transition);
  near(b.velX, 5 / 7); near(b.velX + R * b.angularVelZ, 0);
});
test('rolling deceleration and stopping distance match cloth model', () => {
  const w = new PhysicsWorld(), b = ball(w); b.velX = 0.3; b.angularVelZ = -0.3 / R;
  const expected = 0.3 ** 2 / (2 * FRICTION_ROLLING * Math.abs(GRAVITY));
  run(w, 4);
  near(b.posX - 1, expected, 2e-6); assert.ok(b.isAtRest());
});
test('backspin survives a zero linear speed and develops draw', () => {
  const b = ball(); b.angularVelZ = 40;
  assert.equal(b.isAtRest(), false);
  applyCloth(b, 0.03);
  assert.ok(b.velX < -0.05 && b.angularVelZ > 0);
});
test('topspin and backspin naturally follow and draw after a close full-ball hit', () => {
  for (const vertical of [-1, 1]) {
    const w = new PhysicsWorld(), cue = ball(w), target = ball(w, 'red', 1.15, 0.8);
    cue.velX = 2; applyCueSpin(cue, { side: 0, vertical }, { x: 1, y: 0, z: 0 });
    run(w, 0.3);
    assert.ok(target.velX > 1);
    assert.ok(cue.velX * vertical > 0.2, `${vertical}: ${cue.velX}`);
  }
});
test('a level side-spin shot does not acquire an invented curved trajectory', () => {
  const w = new PhysicsWorld(), b = ball(w); b.velX = 0.8;
  applyCueSpin(b, { side: 1, vertical: 0 }, { x: 1, y: 0, z: 0 });
  run(w, 1); near(b.posZ, 0.8); near(b.velZ, 0);
});
test('cloth dissipates total energy even with overspin and lateral slip', () => {
  const b = ball(); b.setVelocity(0.3, 0, -0.2); b.setAngularVelocity(50, 80, -100);
  for (let i = 0; i < 1000; i++) {
    const before = energy(b); applyCloth(b, DT);
    assert.ok(energy(b) <= before + 1e-10);
  }
});
test('cushion normal restitution and spin friction dissipate energy', () => {
  for (const spin of [-100, 0, 100]) {
    const b = ball(); b.setVelocity(0.7, 0, -2); b.angularVelY = spin;
    const before = energy(b); collideCushion(b, 0, 1);
    near(b.velZ, 2 * RESTITUTION_CUSHION);
    assert.ok(energy(b) <= before + 1e-10);
  }
});
test('opposite sidespin changes the cushion exit in opposite directions', () => {
  const left = ball(), right = ball();
  left.velZ = right.velZ = -1; left.angularVelY = -50; right.angularVelY = 50;
  collideCushion(left, 0, 1); collideCushion(right, 0, 1);
  assert.ok(left.velX * right.velX < 0); near(left.velX, -right.velX);
});
test('CCD catches a high-speed grazing hit missed by endpoint overlap', () => {
  const w = new PhysicsWorld(), a = ball(w), b = ball(w, 'red', 1.025, 0.8 + 2 * R - 0.0001);
  a.velX = 12; w.step(DT);
  assert.ok(w.drainEvents().some(e => e.kind === 'ball'));
  assert.ok(Math.hypot(b.velX, b.velZ) > 0);
  assert.equal(w.collisionBudgetExceeded, 0);
});
test('CCD catches two fast balls approaching one another', () => {
  const w = new PhysicsWorld(), a = ball(w), b = ball(w, 'red', 1.08, 0.8);
  a.velX = 12; b.velX = -12; w.step(DT);
  assert.ok(a.velX < 0 && b.velX > 0);
});
test('touching chain transfers impulse without persistent penetration', () => {
  const w = new PhysicsWorld();
  const balls = Array.from({ length: 8 }, (_, i) => ball(w, `b${i}`, 0.8 + 2 * R * i, 0.8));
  balls[0].velX = 4; run(w, 0.1);
  assert.ok(balls[7].velX > 2);
  for (let i = 1; i < balls.length; i++) assert.ok(balls[i].posX - balls[i - 1].posX >= 2 * R - 1e-7);
  assert.equal(w.collisionBudgetExceeded, 0);
});
test('all six pockets capture centered rolling shots after physical descent', () => {
  const shots = [
    [0.2, 0.2, -1, -1], [L - 0.2, 0.2, 1, -1],
    [0.2, W - 0.2, -1, 1], [L - 0.2, W - 0.2, 1, 1],
    [L / 2, 0.2, 0, -1], [L / 2, W - 0.2, 0, 1],
  ];
  for (const speed of [0.5, 1.5, 2, 8, 12]) for (const [x, z, dx, dz] of shots) {
    const w = new PhysicsWorld(), b = ball(w, 'cue', x, z), length = Math.hypot(dx, dz);
    b.setVelocity(speed * dx / length, 0, speed * dz / length);
    b.setAngularVelocity(b.velZ / R, 0, -b.velX / R);
    run(w, 1); assert.ok(b.isPotted, `${speed}: ${x}, ${z}`);
    assert.equal(w.drainEvents().filter(e => e.kind === 'pot').length, 1);
  }
});
test('side-pocket jaw rejects an off-center shot instead of swallowing it', () => {
  const w = new PhysicsWorld(), b = ball(w, 'cue', L / 2 + 0.052, 0.15);
  b.velZ = -1; run(w, 0.2);
  assert.equal(b.isPotted, false); assert.ok(w.drainEvents().some(e => e.kind === 'cushion'));
});
test('cushion contact protects a ball frozen against the rail', () => {
  const w = new PhysicsWorld(), a = ball(w, 'cue', 0.8, R + 0.065), b = ball(w, 'red', 0.8, R);
  a.velZ = -4; run(w, 0.2);
  assert.ok(a.posZ >= R - 1e-7 && b.posZ >= R - 1e-7);
  assert.equal(w.collisionBudgetExceeded, 0);
});
test('physics and orientation are invariant across 15, 30, 60 and 144 FPS', () => {
  const states = [15, 30, 60, 144].map(fps => {
    const w = new PhysicsWorld(), a = ball(w), b = ball(w, 'red', 1.35, 0.82);
    a.velX = 3; applyCueSpin(a, { side: 0.5, vertical: -0.4 }, { x: 1, y: 0, z: 0 });
    run(w, 2, fps);
    return [a.getState(), b.getState(), a.orientation];
  });
  for (const state of states.slice(1)) assert.deepEqual(state, states[0]);
});
test('collision events preserve time order independent of ball registration order', () => {
  const w = new PhysicsWorld(), far = ball(w, 'far', 1.17, 0.8), nearBall = ball(w, 'near', 1.06, 0.8);
  const cue = ball(w); cue.velX = 8; w.step(1 / 30);
  const events = w.drainEvents();
  assert.equal(events[0].kind, 'ball');
  assert.ok(events[0].ball === nearBall || events[0].other === nearBall);
  assert.ok(events.every((e, i) => i === 0 || e.time >= events[i - 1].time));
  assert.ok(far.velX > 0);
});
test('a collision is retained when its target pots during the same frame', () => {
  const w = new PhysicsWorld(), cue = ball(w, 'cue', L / 2, 0.1), target = ball(w, 'red', L / 2, 0.04);
  cue.velZ = -1.5; w.step(0.25);
  const events = w.drainEvents();
  const contact = events.findIndex(e => e.kind === 'ball');
  const pot = events.findIndex(e => e.kind === 'pot' && e.ball === target);
  assert.ok(contact >= 0 && pot > contact);
});
test('prediction leaves the live world unchanged and agrees with actual cue path', () => {
  const w = new PhysicsWorld(), cue = ball(w); ball(w, 'red', 1.25, 0.82);
  const balls = w.getBalls(), before = balls.map(b => b.getState());
  const spin = { side: 0.2, vertical: -0.5 }, direction = { x: 1, y: 0, z: 0 };
  const preview = predictShot(cue, balls, direction, spin, 2);
  assert.deepEqual(balls.map(b => b.getState()), before);
  assert.ok(preview.contact && preview.cueAfter.length > 5 && preview.target.length > 5);
  cue.velX = 2; applyCueSpin(cue, spin, direction);
  let postTicks = 0;
  for (let i = 0; i < 960; i++) {
    w.step(DT);
    if (w.drainEvents().some(e => (e.kind === 'ball' || e.kind === 'cushion') && (e.ball === cue || e.other === cue))) {
      if (postTicks === 0) postTicks = 1;
    }
    if (postTicks > 0 && postTicks++ >= 216) break;
  }
  const endpoint = preview.cueAfter.at(-1)!;
  near(endpoint.x, cue.posX, 0.01); near(endpoint.z, cue.posZ, 0.01);
});
test('shoot button and space retain selected power until the shot is read', () => {
  for (const space of [false, true]) {
    const input = { isDragging: false, scrollDelta: 0, justClicked: !space,
      isKeyPressed: () => false,
      isKeyJustPressed: (key: string) => space && key === 'Space' };
    const camera = { getAimAngle: () => 0, getAimDirection: () => ({ x: 1, y: 0, z: 0 }) };
    const aim = new AimController(input as any, camera as any);
    aim.enable(); aim.setPower(0.8);
    if (!space) aim.requestShot();
    const selected = aim.getActualPower(); assert.ok(aim.update(1 / 60));
    near(aim.getActualPower(), selected);
  }
});

test('full 22-ball breaks settle without energy growth, escaping or overlapping', () => {
  for (const angle of [-0.07, 0, 0.07]) {
    const w = new PhysicsWorld(), cue = ball(w, 'cue', 2.1, W / 2);
    for (const [name, position] of Object.entries(COLOUR_SPOTS)) ball(w, name, position.x, position.z);
    const d = R * 2.01;
    for (let row = 0; row < 5; row++) for (let col = 0; col <= row; col++) {
      ball(w, `red-${row}-${col}`, RED_TRIANGLE_APEX.x + row * d * Math.sqrt(3) / 2,
        RED_TRIANGLE_APEX.z + (col - row / 2) * d);
    }
    cue.setVelocity(8 * Math.cos(angle), 0, 8 * Math.sin(angle));
    applyCueSpin(cue, { side: 0.5, vertical: -0.5 }, { x: Math.cos(angle), y: 0, z: Math.sin(angle) });
    const mechanicalEnergy = () => w.getBalls().filter(b => b.isOnTable).reduce((sum, b) => sum + energy(b) + M * Math.abs(GRAVITY) * (b.posY + R), 0);
    let previousEnergy = mechanicalEnergy();
    for (let step = 0; step < 60 * 240; step++) {
      w.step(DT);
      const currentEnergy = mechanicalEnergy();
      assert.ok(currentEnergy <= previousEnergy + 1e-5, 'energy gain: ' + (currentEnergy - previousEnergy) + ' step ' + step);
      previousEnergy = currentEnergy;
      if (step % 30 === 0) {
        for (const b of w.getBalls().filter(b => b.isOnTable)) {
          assert.ok(Number.isFinite(b.posX + b.posZ + b.velX + b.velZ));
          assert.ok(b.posX > -0.1 && b.posX < L + 0.1 && b.posZ > -0.1 && b.posZ < W + 0.1);
        }
        w.drainEvents(); for (const b of w.getBalls()) b.clearCollisions();
      }
      if (w.allBallsAtRest(w.getBalls())) break;
    }
    assert.ok(w.allBallsAtRest(w.getBalls()), `break ${angle} never settled`);
    assert.equal(w.collisionBudgetExceeded, 0);
    const active = w.getBalls().filter(b => b.isOnTable);
    for (let i = 0; i < active.length; i++) for (let j = i + 1; j < active.length; j++) {
      assert.ok(Math.hypot(active[i].posX - active[j].posX, active[i].posZ - active[j].posZ) >= 2 * R - 1e-6);
    }
  }
});

test('swept pocket and jaw geometry contains a sweep of hard shots', () => {
  for (let i = 0; i < 72; i++) {
    const w = new PhysicsWorld(), b = ball(w, 'cue', L / 2 - 0.1, W / 2);
    const angle = i * Math.PI / 36;
    b.setVelocity(12 * Math.cos(angle), 0, 12 * Math.sin(angle));
    run(w, 4, 30);
    const events = w.drainEvents();
    assert.ok(b.isPotted || events.some(e => e.kind === 'off') ||
      (b.isOnTable && b.posX > -0.16 && b.posX < L + 0.16 && b.posZ > -0.16 && b.posZ < W + 0.16), `unreported escape at ${angle}`);
    assert.equal(w.collisionBudgetExceeded, 0);
  }
});
