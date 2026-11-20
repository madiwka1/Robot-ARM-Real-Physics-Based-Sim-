import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureRapierInitialized, PHYSICS_SUBSTEP_SEC, RoboticsPhysicsWorld } from './rapierWorld';
import { buildSampleBottleFlipDemo, interpolateDemoAtTime } from '../robotics/dataset';
import { computeForwardKinematics } from '../robotics/kinematics';
import { AXIS6_ROBOT_CONFIG } from '../robotics/robotModel';
import { isBottleUprightOnBench } from '../robotics/telemetry';
import type { QuatTuple, Vec3Tuple } from '../robotics/types';

const DOWN: QuatTuple = [0, 0, 1, 0]; // gripper pointing at the bench

test('resting props sit on the bench without sinking', async () => {
  await ensureRapierInitialized();
  const w = new RoboticsPhysicsWorld();
  for (let i = 0; i < 120; i++) w.step(1 / 60);
  const restY: Record<string, number> = {
    cube_red: 0.028,
    cube_blue: 0.026,
    cyl_amber: 0.036,
    ball_teal: 0.028,
    bottle_flip: 0.062,
  };
  for (const o of w.getObjectStates()) {
    if (o.id in restY) assert.ok(Math.abs(o.position[1] - restY[o.id]) < 5e-4, `${o.id} y=${o.position[1]}`);
  }
  w.dispose();
});

test('throw release velocity does not depend on frame rate', async () => {
  await ensureRapierInitialized();
  for (const dt of [1 / 60, 1 / 12]) {
    const w = new RoboticsPhysicsWorld();
    const tcp: Vec3Tuple = [0.5, 0.098, 0.28];
    w.evaluateGrasp(tcp, DOWN, 48, 48, 'bottle_flip');
    w.updateGripperPose(tcp, DOWN, 48);
    w.step(dt);
    // Carry the bottle sideways at 1.5 m/s for one frame, then open the jaws
    const moved: Vec3Tuple = [0.5 + 1.5 * dt, 0.098, 0.28];
    w.updateGripperPose(moved, DOWN, 48);
    w.step(dt);
    w.evaluateGrasp(moved, DOWN, 48, 80, null);
    const speed = w.getBottleTelemetry()!.linearSpeed;
    assert.ok(Math.abs(speed - 1.5) < 0.05, `dt=${dt} speed=${speed}`);
    w.dispose();
  }
});

test('objects can be added and removed at runtime', async () => {
  await ensureRapierInitialized();
  const w = new RoboticsPhysicsWorld();
  w.addObject({
    id: 'extra_cube', name: 'Extra', kind: 'cube', color: '#fff', graspable: true,
    dimensions: [0.04, 0.04, 0.04], mass: 0.08, initialPosition: [0.3, 0.1, 0.3], initialQuaternion: [0, 0, 0, 1],
  });
  for (let i = 0; i < 60; i++) w.step(1 / 60);
  const extra = w.getObjectStates().find((o) => o.id === 'extra_cube');
  assert.ok(extra && Math.abs(extra.position[1] - 0.02) < 5e-4, `fell onto bench: ${extra?.position}`);
  w.removeObject('extra_cube');
  w.removeObject('cube_red');
  assert.ok(!w.getObjectStates().some((o) => o.id === 'extra_cube' || o.id === 'cube_red'));
  w.step(1 / 60); // world still steps cleanly
  w.dispose();
});

test('mouse drag moves a prop, pushes it along the bench and throws it on release', async () => {
  await ensureRapierInitialized();
  const w = new RoboticsPhysicsWorld();
  const pos = (id: string) => w.getObjectStates().find((o) => o.id === id)!.position;
  assert.ok(w.beginDrag('cube_red'));
  assert.equal(w.beginDrag('cube_blue'), false, 'one drag at a time');
  for (let i = 0; i < 30; i++) {
    w.dragTo(0.46 + i * 0.01, 0.0); // sweep +x at 0.6 m/s
    w.step(1 / 60);
  }
  const [x, y, z] = pos('cube_red');
  assert.ok(Math.abs(x - 0.75) < 0.01 && Math.abs(z) < 0.01, `followed cursor: ${x},${z}`);
  assert.ok(Math.abs(y - 0.048) < 0.002, `hovers 2 cm above bench: ${y}`);
  // Grasp must ignore the dragged prop
  assert.equal(w.evaluateGrasp([x, 0.06, z], DOWN, 60, 0).isGrasping, false);
  w.endDrag();
  w.step(1 / 60);
  const speed = w.getObjectStates() && pos('cube_red')[0] - x;
  assert.ok(speed > 0.005, `kept moving after release (thrown): dx=${speed}`);
  for (let i = 0; i < 120; i++) w.step(1 / 60);
  assert.ok(Math.abs(pos('cube_red')[1] - 0.028) < 0.002, 'landed on the bench');
  w.dispose();
});

test('closed jaws cannot grasp an object they do not enclose', async () => {
  await ensureRapierInitialized();
  const w = new RoboticsPhysicsWorld();
  const cubeTop: Vec3Tuple = [0.46, 0.06, 0.14]; // red cube (56 mm) centered under the pinch
  // Jaws already shut to 10 mm, then closed further: must not attach the 56 mm cube
  assert.equal(w.evaluateGrasp(cubeTop, DOWN, 10, 0).isGrasping, false);
  // Closing onto it from open (jaw gap ~ cube width): grasps
  assert.equal(w.evaluateGrasp(cubeTop, DOWN, 60, 0).graspedObjectId, 'cube_red');
  w.dispose();
});

test('seeded Bottle Flip demo tosses the bottle and it lands upright', async () => {
  await ensureRapierInitialized();
  const w = new RoboticsPhysicsWorld();
  const demo = buildSampleBottleFlipDemo();
  // Same fixed-clock playback as App.tsx: one demo sample per physics step
  let released = false, releaseSpin = 0, maxFlightSpin = 0, airborneRad = 0;
  for (let t = 0; t <= demo.durationMs + 1500; t += PHYSICS_SUBSTEP_SEC * 1000) {
    const f = interpolateDemoAtTime(demo, Math.min(t, demo.durationMs))!;
    const fk = computeForwardKinematics(f.jointAnglesDeg, AXIS6_ROBOT_CONFIG);
    const g = w.evaluateGrasp(fk.tcpPosition, fk.tcpQuaternion, f.gripperWidthMm, f.gripperWidthMm,
      f.isGrasping ? f.graspedObjectId : null);
    w.updateGripperPose(fk.tcpPosition, fk.tcpQuaternion, g.effectiveWidthMm);
    w.step(PHYSICS_SUBSTEP_SEC);
    const b = w.getBottleTelemetry()!;
    if (!b.isGrasped && t > 2000 && b.position[1] > 0.07) {
      if (!released) { released = true; releaseSpin = b.angularSpeed; }
      maxFlightSpin = Math.max(maxFlightSpin, b.angularSpeed);
      airborneRad += b.angularSpeed * PHYSICS_SUBSTEP_SEC;
    }
  }
  const b = w.getBottleTelemetry()!;
  assert.ok(released, 'bottle was never released');
  assert.ok(airborneRad > (300 * Math.PI) / 180, `only ${(airborneRad * 180 / Math.PI).toFixed(0)} deg in the air`);
  assert.ok(maxFlightSpin < releaseSpin + 0.25, 'bottle was hit by the gripper after release');
  assert.ok(isBottleUprightOnBench(b.position, b.quaternion, b.linearSpeed), `landed at ${b.position} tilt`);
  w.dispose();
});
