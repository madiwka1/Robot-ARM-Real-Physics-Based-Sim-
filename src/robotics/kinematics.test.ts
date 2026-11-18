import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AXIS6_ROBOT_CONFIG,
  HOME_JOINT_ANGLES_DEG,
  ZERO_JOINT_ANGLES_DEG,
} from './robotModel';
import {
  clampJointAnglesDeg,
  computeForwardKinematics,
  eulerDegToQuaternion,
  solveInverseKinematics,
} from './kinematics';
import type { JointTuple, Vec3Tuple } from './types';

test('FK at zero pose reaches vertical stack height 1.185m', () => {
  const fk = computeForwardKinematics(ZERO_JOINT_ANGLES_DEG);
  assert.equal(fk.jointTransforms.length, 8);
  assert.ok(Math.abs(fk.tcpPosition[0]) < 1e-6);
  assert.ok(Math.abs(fk.tcpPosition[1] - 1.185) < 1e-5);
  assert.ok(Math.abs(fk.tcpPosition[2]) < 1e-6);
});

test('FK at home pose positions TCP above workbench in front of base', () => {
  const fk = computeForwardKinematics(HOME_JOINT_ANGLES_DEG);
  assert.ok(fk.tcpPosition[0] > 0.35 && fk.tcpPosition[0] < 0.65);
  assert.ok(fk.tcpPosition[1] > 0.25 && fk.tcpPosition[1] < 0.55);
  assert.ok(Math.abs(fk.tcpPosition[2]) < 1e-5);
});

test('IK round-trip converges accurately for reachable workbench pick poses', () => {
  const seed = HOME_JOINT_ANGLES_DEG;
  const seedFk = computeForwardKinematics(seed);

  const targets: Vec3Tuple[] = [
    [0.46, 0.14, 0.14],
    [0.54, 0.12, -0.02],
    [0.38, 0.16, -0.18],
    [0.42, 0.22, -0.34],
  ];

  for (const target of targets) {
    const ik = solveInverseKinematics(target, seedFk.tcpQuaternion, seed);
    assert.ok(
      ik.positionErrorMeters < 0.004,
      `Expected pos error < 4mm for target ${target.join(',')}, got ${ik.positionErrorMeters}`,
    );
    assert.ok(
      ik.orientationErrorRad < 0.03,
      `Expected rot error < 0.03rad for target ${target.join(',')}, got ${ik.orientationErrorRad}`,
    );
    // Joint limits strictly respected
    for (let i = 0; i < 6; i++) {
      assert.ok(
        ik.anglesDeg[i] >= AXIS6_ROBOT_CONFIG.joints[i].minDeg &&
          ik.anglesDeg[i] <= AXIS6_ROBOT_CONFIG.joints[i].maxDeg,
      );
    }
  }
});

test('IK handles rotated gripper orientation cleanly', () => {
  const seedFk = computeForwardKinematics(HOME_JOINT_ANGLES_DEG);
  const rotatedQuat = eulerDegToQuaternion([180, 45, 0]);
  const ik = solveInverseKinematics([0.45, 0.18, 0.1], rotatedQuat, HOME_JOINT_ANGLES_DEG, AXIS6_ROBOT_CONFIG, {
    maxIterations: 80,
  });
  assert.ok(ik.positionErrorMeters < 0.005);
  assert.ok(ik.orientationErrorRad < 0.05);
});

test('IK never produces NaN for out-of-reach targets', () => {
  const seedFk = computeForwardKinematics(HOME_JOINT_ANGLES_DEG);
  const ik = solveInverseKinematics([3.5, 2.0, -2.5], seedFk.tcpQuaternion, HOME_JOINT_ANGLES_DEG);
  for (const angle of ik.anglesDeg) {
    assert.ok(Number.isFinite(angle));
  }
});

test('clampJointAnglesDeg enforces min and max joint limits', () => {
  const extreme: JointTuple = [-500, 500, -500, 500, -500, 500];
  const clamped = clampJointAnglesDeg(extreme);
  assert.deepEqual(clamped, [-175, 115, -135, 180, -125, 180]);
});
