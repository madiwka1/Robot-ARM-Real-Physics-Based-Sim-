import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSampleBottleFlipDemo,
  buildSamplePickAndPlaceDemo,
  createDemoFrame,
  interpolateDemoAtTime,
  interpolateObjectsAtTime,
  serializeDemoToCSV,
  serializeDemoToJSON,
  updateDemoTiming,
} from './dataset';
import { AXIS6_ROBOT_CONFIG, HOME_JOINT_ANGLES_DEG } from './robotModel';

test('Sample Pick & Place demo builds valid frames and reaches cube and bin', () => {
  const demo = buildSamplePickAndPlaceDemo();
  assert.equal(demo.frames.length, 10);
  assert.equal(demo.durationMs, 7400);

  const graspFrame = demo.frames.find((f) => f.action === 'Close Gripper');
  assert.ok(graspFrame);
  assert.equal(graspFrame.isGrasping, true);
  assert.equal(graspFrame.graspedObjectId, 'cube_red');
  // TCP should be close to red cube at [0.46, 0.036, 0.14]
  assert.ok(Math.abs(graspFrame.tcpPosition[0] - 0.46) < 0.01);
  assert.ok(Math.abs(graspFrame.tcpPosition[2] - 0.14) < 0.01);
});

test('Sample Bottle Flip demo grasps bottle_flip, executes flick, and releases mid-arc', () => {
  const demo = buildSampleBottleFlipDemo();
  assert.equal(demo.id, 'demo_sample_bottle_flip');
  assert.equal(demo.durationMs, demo.frames[demo.frames.length - 1].timestampMs);
  // Realism: no joint may exceed its rated speed between keyframes (1 ms rounding slack)
  for (let k = 1; k < demo.frames.length; k++) {
    const a = demo.frames[k - 1], b = demo.frames[k];
    const dtSec = (b.timestampMs - a.timestampMs + 1) / 1000;
    AXIS6_ROBOT_CONFIG.joints.forEach((j, i) => {
      const speed = Math.abs(b.jointAnglesDeg[i] - a.jointAnglesDeg[i]) / dtSec;
      assert.ok(speed <= j.maxSpeedDegPerSec, `${j.id} ${speed.toFixed(0)} deg/s into ${b.action}`);
    });
  }
  const flipFrame = demo.frames.find((f) => f.action === 'Bottle Flip');
  const releaseFrame = demo.frames.find((f) => f.action === 'Open Gripper');
  assert.ok(flipFrame && releaseFrame);
  assert.equal(flipFrame.isGrasping, true);
  assert.equal(flipFrame.graspedObjectId, 'bottle_flip');
  assert.equal(releaseFrame.isGrasping, false);
  assert.equal(releaseFrame.graspedObjectId, null);
  assert.ok(releaseFrame.timestampMs > flipFrame.timestampMs);
});

test('interpolateObjectsAtTime lerps recorded prop poses between frames', () => {
  const frame = (t: number, x: number) =>
    createDemoFrame({
      timestampMs: t,
      jointAnglesDeg: HOME_JOINT_ANGLES_DEG,
      gripperWidthMm: 60,
      isGrasping: false,
      graspedObjectId: null,
      objects: [{ id: 'ball', position: [x, 0.1, 0], quaternion: [0, 0, 0, 1] }],
      action: 'Idle',
    });
  const demo = { ...buildSamplePickAndPlaceDemo(), frames: [frame(0, 0), frame(100, 1)], durationMs: 100 };
  assert.ok(Math.abs(interpolateObjectsAtTime(demo, 25)[0].position[0] - 0.25) < 1e-9);
  assert.equal(interpolateObjectsAtTime(demo, 500)[0].position[0], 1);
  assert.deepEqual(interpolateObjectsAtTime(demo, 50)[0].quaternion, [0, 0, 0, 1]);
});

test('interpolateDemoAtTime interpolates smoothly between frames', () => {
  const demo = buildSamplePickAndPlaceDemo();
  const mid = interpolateDemoAtTime(demo, 450);
  assert.ok(mid);
  assert.ok(mid.jointAnglesDeg[1] !== HOME_JOINT_ANGLES_DEG[1]);
  assert.ok(mid.gripperWidthMm >= 48 && mid.gripperWidthMm <= 74);
});

test('serializeDemoToCSV produces expected columns and row count', () => {
  const demo = buildSamplePickAndPlaceDemo();
  const csv = serializeDemoToCSV(demo);
  const lines = csv.trim().split('\n');
  assert.equal(lines.length, demo.frames.length + 1);
  assert.ok(lines[0].startsWith('timestamp_ms,action,j1_deg,j2_deg'));
  assert.ok(lines[0].includes('objects_json'));
});

test('serializeDemoToJSON produces valid JSON with schema metadata', () => {
  const demo = buildSamplePickAndPlaceDemo();
  const json = serializeDemoToJSON(demo);
  const parsed = JSON.parse(json);
  assert.equal(parsed.schema, 'axislab.demonstration.v1');
  assert.equal(parsed.demonstration.frames.length, demo.frames.length);
});

test('updateDemoTiming normalizes timestamps starting at zero', () => {
  const f1 = createDemoFrame({
    timestampMs: 1500,
    jointAnglesDeg: HOME_JOINT_ANGLES_DEG,
    gripperWidthMm: 60,
    isGrasping: false,
    graspedObjectId: null,
    objects: [],
    action: 'Home',
  });
  const f2 = createDemoFrame({
    timestampMs: 2750,
    jointAnglesDeg: HOME_JOINT_ANGLES_DEG,
    gripperWidthMm: 30,
    isGrasping: false,
    graspedObjectId: null,
    objects: [],
    action: 'Close Gripper',
  });
  const updated = updateDemoTiming({
    id: 'test',
    name: 'Test',
    taskType: 'Pick Object',
    createdAt: '',
    updatedAt: '',
    durationMs: 0,
    frames: [f2, f1],
  });
  assert.equal(updated.frames[0].timestampMs, 0);
  assert.equal(updated.frames[1].timestampMs, 1250);
  assert.equal(updated.durationMs, 1250);
});
