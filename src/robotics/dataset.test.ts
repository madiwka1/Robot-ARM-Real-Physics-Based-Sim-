import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSampleBottleFlipDemo,
  buildSamplePickAndPlaceDemo,
  createDemoFrame,
  interpolateDemoAtTime,
  serializeDemoToCSV,
  serializeDemoToJSON,
  updateDemoTiming,
} from './dataset';
import { HOME_JOINT_ANGLES_DEG } from './robotModel';

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
  assert.equal(demo.durationMs, 4700);
  const flipFrame = demo.frames.find((f) => f.action === 'Bottle Flip');
  const releaseFrame = demo.frames.find((f) => f.action === 'Open Gripper');
  assert.ok(flipFrame && releaseFrame);
  assert.equal(flipFrame.isGrasping, true);
  assert.equal(flipFrame.graspedObjectId, 'bottle_flip');
  assert.equal(releaseFrame.isGrasping, false);
  assert.equal(releaseFrame.graspedObjectId, null);
  assert.ok(releaseFrame.timestampMs > flipFrame.timestampMs);
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
