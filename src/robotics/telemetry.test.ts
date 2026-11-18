import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { HOME_JOINT_ANGLES_DEG, ZERO_JOINT_ANGLES_DEG } from './robotModel';
import {
  computeBottleTiltDeg,
  computeRobotTelemetry,
  isBottleUprightOnBench,
} from './telemetry';
import type { QuatTuple } from './types';

test('Power telemetry increases when arm holds payload horizontally vs vertical zero pose', () => {
  const zeroTelem = computeRobotTelemetry({
    timeSec: 1,
    jointAnglesDeg: ZERO_JOINT_ANGLES_DEG,
    prevJointAnglesDeg: ZERO_JOINT_ANGLES_DEG,
    prevTcpPosition: [0, 1.185, 0],
    dtSec: 0.05,
    graspedMassKg: 0,
  });

  const extendedTelem = computeRobotTelemetry({
    timeSec: 2,
    jointAnglesDeg: HOME_JOINT_ANGLES_DEG,
    prevJointAnglesDeg: HOME_JOINT_ANGLES_DEG,
    prevTcpPosition: [0.475, 0.374, 0],
    dtSec: 0.05,
    graspedMassKg: 0.54,
  });

  assert.ok(extendedTelem.totalPowerWatts > zeroTelem.totalPowerWatts);
  assert.ok(extendedTelem.busCurrentAmps > zeroTelem.busCurrentAmps);
  assert.ok(extendedTelem.busVoltage <= 48.0 && extendedTelem.busVoltage > 45.0);
});

test('Power telemetry spikes appropriately during high-velocity joint motion', () => {
  const moving = computeRobotTelemetry({
    timeSec: 3,
    jointAnglesDeg: [10, 35, 72, 0, 60, 0],
    prevJointAnglesDeg: [0, 26, 72, 0, 82, 0],
    prevTcpPosition: [0.475, 0.374, 0],
    dtSec: 0.05,
    graspedMassKg: 0.4,
  });

  assert.ok(moving.totalPowerWatts > 60);
  assert.ok(moving.tcpSpeedMps > 0.1);
  assert.ok(moving.joints[1].velocityDegPerSec > 100);
});

test('Bottle tilt and upright detection accurately classify upright vs fallen bottle', () => {
  const uprightQuat: QuatTuple = [0, 0, 0, 1];
  assert.ok(Math.abs(computeBottleTiltDeg(uprightQuat)) < 0.01);
  assert.equal(isBottleUprightOnBench([0.38, 0.062, 0.3], uprightQuat, 0.01), true);

  const qSide = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(1, 0, 0),
    Math.PI / 2,
  );
  const sideTuple: QuatTuple = [qSide.x, qSide.y, qSide.z, qSide.w];
  assert.ok(Math.abs(computeBottleTiltDeg(sideTuple) - 90) < 0.1);
  assert.equal(isBottleUprightOnBench([0.38, 0.025, 0.3], sideTuple, 0.01), false);
});
