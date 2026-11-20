import test from 'node:test';
import assert from 'node:assert/strict';
import { computeForwardKinematics, solveInverseKinematics } from './kinematics';
import { homeAnglesOf, ROBOT_MODELS } from './robotModel';
import { computeRobotTelemetry } from './telemetry';

test('every robot model has a sane home pose, reach, and IK', () => {
  for (const robot of ROBOT_MODELS) {
    const home = homeAnglesOf(robot);
    robot.joints.forEach((j, i) => assert.ok(home[i] >= j.minDeg && home[i] <= j.maxDeg, `${robot.id} ${j.id} home in limits`));
    const tcp = computeForwardKinematics(home, robot).tcpPosition;
    assert.ok(tcp[1] > 0.02, `${robot.id} home TCP above bench: ${tcp}`);
    // A point at 40% reach in front of the robot is solvable with the gripper pointing down.
    // (Further out, the 5-DOF hobby arms run out of wrist range (±95°) to keep the tool vertical,
    // like the real SO-101.)
    const fk = computeForwardKinematics(home, robot);
    const target: [number, number, number] = [0.4 * robot.maxReachMeters, 0.08, 0.04];
    const ik = solveInverseKinematics(target, fk.tcpQuaternion, home, robot, { maxIterations: 200 });
    assert.ok(ik.positionErrorMeters < 0.005, `${robot.id} IK error ${ik.positionErrorMeters}`);
  }
});

test('telemetry uses each robot\'s own actuators and bus voltage', () => {
  for (const robot of ROBOT_MODELS) {
    const home = homeAnglesOf(robot);
    const s = computeRobotTelemetry({
      timeSec: 0,
      jointAnglesDeg: home,
      prevJointAnglesDeg: home,
      prevTcpPosition: computeForwardKinematics(home, robot).tcpPosition,
      dtSec: 0.08,
      graspedMassKg: 0,
      robot,
    });
    assert.ok(Math.abs(s.busVoltage - robot.actuators.busVoltage) / robot.actuators.busVoltage < 0.05, `${robot.id} bus ${s.busVoltage}`);
    assert.ok(s.peakJointLoadPct < 100, `${robot.id} holds its own weight at home`);
    // Locked J4 slot (5-DOF arms) draws no power
    if (robot.joints[3].minDeg === robot.joints[3].maxDeg) assert.equal(s.joints[3].powerWatts, 0);
  }
});
