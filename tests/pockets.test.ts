import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { BallBody } from '../src/physics/BallBody';
import { POCKETS, CUSHION_PATHS } from '../src/physics/TableGeometry';
import { TableRenderer } from '../src/render/TableRenderer';
import { BallType, GameMode, AIDifficulty } from '../src/types';
import { GameStateManager } from '../src/game/GameState';
import { BALL_RADIUS as R, TABLE_LENGTH as L, TABLE_WIDTH as W, PHYSICS_TIMESTEP as DT } from '../src/constants';

test('all six pockets commit one-way, sink visibly and emit exactly one pot at all speeds', () => {
  for (const speed of [.3, 1, 4, 8, 12]) for (const p of POCKETS) {
    const w = new PhysicsWorld();
    const dx = L / 2 - p.x, dz = W / 2 - p.z, len = Math.hypot(dx, dz);
    const b = new BallBody('cue', BallType.CUE, { x: p.x + dx / len * .1, z: p.z + dz / len * .1 }, w);
    b.setVelocity(-speed * dx / len, 0, -speed * dz / len);
    b.setAngularVelocity(b.velZ / R, 0, -b.velX / R);
    const events = []; let sawFalling = false, captured = false, previousY = R;
    for (let i = 0; i < 480; i++) {
      w.step(DT); events.push(...w.drainEvents());
      if (b.pocketIndex !== null) {
        captured = true; assert.ok(b.posY <= previousY + 1e-9);
        assert.ok(Math.hypot(b.posX - p.x, b.posZ - p.z) <= p.captureRadius + 1e-7);
        if (!b.isPotted && b.posY < R - .003) sawFalling = true;
      }
      if (captured) assert.notEqual(b.pocketIndex, null);
      previousY = b.posY;
    }
    assert.ok(b.isPotted && sawFalling, `pocket ${POCKETS.indexOf(p)}, speed ${speed}`);
    assert.equal(events.filter(e => e.kind === 'fall').length, 1);
    assert.equal(events.filter(e => e.kind === 'pot').length, 1);
    const afterCapture = events.slice(events.findIndex(e => e.kind === 'fall') + 1);
    assert.ok(afterCapture.every(e => e.kind === 'pot'));
    assert.equal(w.collisionBudgetExceeded, 0);
  }
});

test('a stationary ball beyond the lip falls instead of hanging forever', () => {
  const w = new PhysicsWorld(), p = POCKETS[4];
  const b = new BallBody('red', BallType.RED, { x: p.x, z: p.z + .02 }, w);
  w.step(.25);
  assert.ok(b.isPotted); assert.equal(w.drainEvents().filter(e => e.kind === 'pot').length, 1);
});

test('an airborne ball crossing above a pocket is not captured from its horizontal projection', () => {
  const w = new PhysicsWorld(), b = new BallBody('cue', BallType.CUE, { x: L / 2, z: .1 }, w);
  b.posY = .3; b.velZ = -4;
  for (let i = 0; i < 24; i++) w.step(DT);
  assert.equal(b.isPotted, false);
  assert.ok(w.drainEvents().every(e => e.kind !== 'fall' && e.kind !== 'pot'));
});

test('consecutive balls entering one pocket both sink without blocking each other', () => {
  const w = new PhysicsWorld(), p = POCKETS[4];
  const first = new BallBody('red1', BallType.RED, { x: p.x, z: .01 }, w);
  const second = new BallBody('red2', BallType.RED, { x: p.x, z: .09 }, w);
  first.velZ = second.velZ = -2;
  for (let i = 0; i < 120; i++) w.step(DT);
  assert.ok(first.isPotted && second.isPotted);
  assert.equal(w.drainEvents().filter(e => e.kind === 'pot').length, 2);
  assert.equal(w.collisionBudgetExceeded, 0);
});

test('a real red pot scores one point and retains the turn', () => {
  const w = new PhysicsWorld(), game = new GameStateManager();
  const cue = new BallBody('cue', BallType.CUE, { x: L / 2, z: .18 }, w);
  const red = new BallBody('red', BallType.RED, { x: L / 2, z: .08 }, w);
  new BallBody('black', BallType.BLACK, { x: 3, z: .9 }, w);
  game.startMatch({ mode: GameMode.PASS_PLAY, difficulty: AIDifficulty.MEDIUM,
    totalFrames: 1, player1Name: 'A', player2Name: 'B' });
  game.initBallStates(w.getBalls()); game.startShot(cue, w.getBalls()); cue.velZ = -1.5;
  for (let i = 0; i < 600; i++) {
    w.step(DT);
    for (const e of w.drainEvents()) {
      if (e.kind === 'ball' && e.other) game.recordCollision(cue, e.ball === cue ? e.other : e.ball, e.time);
      if (e.kind === 'pot') game.recordPot(e.ball);
    }
    if (w.allBallsAtRest(w.getBalls())) break;
  }
  assert.ok(red.isPotted); assert.equal(cue.isPotted, false);
  const result = game.evaluateShot(w.getBalls(), cue);
  assert.equal(result.foul, null); assert.equal(result.scorePoints, 1);
  assert.equal(game.match!.frame.striker, 0); assert.deepEqual(game.match!.frame.scores, [1, 0]);
});

test('wood and rubber tops do not overlap on any of the six rails', () => {
  const table = new TableRenderer(); table.group.updateMatrixWorld(true);
  const meshes = table.group.children.filter(o => o.name === 'WoodRail' || o.name === 'RubberBacking');
  const ray = new THREE.Raycaster();
  CUSHION_PATHS.forEach((points, index) => {
    const long = index < 4;
    const outside = (long ? points[0].z : points[0].x) < 0 ? -1 : 1;
    const a = points[16], b = points[17];
    for (const t of [.15, .4, .65, .85]) for (const offset of [.008, .02, .04, .08]) {
      const x = a.x + (b.x - a.x) * t + (long ? 0 : outside * offset);
      const z = a.z + (b.z - a.z) * t + (long ? outside * offset : 0);
      ray.set(new THREE.Vector3(x, .2, z), new THREE.Vector3(0, -1, 0));
      const tops = ray.intersectObjects(meshes).filter(hit => hit.face!.normal.y > .99);
      const materials = new Set(tops.map(hit => hit.object.name));
      assert.equal(materials.size, 1, `rail ${index}, offset ${offset}: ${[...materials]}`);
      assert.ok(materials.has(offset < .027 ? 'RubberBacking' : 'WoodRail'));
    }
  });
  table.group.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
});
