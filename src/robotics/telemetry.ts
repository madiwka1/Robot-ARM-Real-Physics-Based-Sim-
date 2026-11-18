import * as THREE from 'three';
import { computeForwardKinematics } from './kinematics';
import { AXIS6_ROBOT_CONFIG } from './robotModel';
import type { JointTuple, QuatTuple, Vec3Tuple } from './types';

export interface JointTelemetry {
  id: string;
  angleDeg: number;
  velocityDegPerSec: number;
  torqueNm: number;
  loadPct: number;
  powerWatts: number;
}

export interface SimulationTelemetrySample {
  timeSec: number;
  totalPowerWatts: number;
  busVoltage: number;
  busCurrentAmps: number;
  peakJointLoadPct: number;
  tcpPosition: Vec3Tuple;
  tcpSpeedMps: number;
  bottleHeightM: number;
  bottleTiltDeg: number;
  joints: [
    JointTelemetry,
    JointTelemetry,
    JointTelemetry,
    JointTelemetry,
    JointTelemetry,
    JointTelemetry,
  ];
}

// Rated joint continuous torque capacities (Nm) and link masses (kg)
const JOINT_RATED_TORQUE_NM = [48, 56, 36, 16, 14, 8] as const;
const DOWNSTREAM_MASS_KG = [6.8, 5.2, 3.1, 1.6, 1.1, 0.55] as const;
const GRAVITY = 9.81;
const IDLE_CONTROLLER_WATTS = 18.5;

/**
 * Computes physically grounded per-joint holding/dynamic torque and electrical power draw
 * based on joint world geometry (gravity moment arms), angular velocity, and grasped payload.
 */
export function computeRobotTelemetry(params: {
  timeSec: number;
  jointAnglesDeg: JointTuple;
  prevJointAnglesDeg: JointTuple;
  prevTcpPosition: Vec3Tuple;
  dtSec: number;
  graspedMassKg: number;
  bottlePosition?: Vec3Tuple;
  bottleQuaternion?: QuatTuple;
}): SimulationTelemetrySample {
  const dt = Math.max(0.008, params.dtSec);
  const fk = computeForwardKinematics(params.jointAnglesDeg, AXIS6_ROBOT_CONFIG);

  const tcpPos = fk.tcpPosition;
  const dxTcp = tcpPos[0] - params.prevTcpPosition[0];
  const dyTcp = tcpPos[1] - params.prevTcpPosition[1];
  const dzTcp = tcpPos[2] - params.prevTcpPosition[2];
  const tcpSpeedMps = Math.sqrt(dxTcp * dxTcp + dyTcp * dyTcp + dzTcp * dzTcp) / dt;

  const jointResults: JointTelemetry[] = [];
  let totalMotorWatts = 0;
  let peakLoad = 0;

  for (let i = 0; i < 6; i++) {
    const spec = AXIS6_ROBOT_CONFIG.joints[i];
    const jointWorld = fk.jointTransforms[i + 1]; // 0 is BASE
    const velDeg =
      (params.jointAnglesDeg[i] - params.prevJointAnglesDeg[i]) / dt;
    const velRad = (velDeg * Math.PI) / 180;

    // Horizontal radial lever arm from joint pivot to TCP (effective gravity moment arm)
    const rx = tcpPos[0] - jointWorld.position[0];
    const rz = tcpPos[2] - jointWorld.position[2];
    const horizontalMomentArm = Math.sqrt(rx * rx + rz * rz);

    // Pitch joints (axis Z) bear gravity torque; Yaw/Roll joints bear inertial + friction load
    const isPitchJoint = Math.abs(spec.axis[2]) > 0.5;
    const effectiveMass = DOWNSTREAM_MASS_KG[i] + params.graspedMassKg;
    const gravityTorque = isPitchJoint
      ? effectiveMass * GRAVITY * horizontalMomentArm * 0.65
      : effectiveMass * GRAVITY * 0.04;

    const dynamicTorque = Math.abs(velRad) * (1.2 + effectiveMass * 0.35);
    const totalTorqueNm = gravityTorque + dynamicTorque;
    const rated = JOINT_RATED_TORQUE_NM[i];
    const loadPct = Math.min(100, (totalTorqueNm / rated) * 100);
    if (loadPct > peakLoad) peakLoad = loadPct;

    // Electrical power = copper holding loss (k * tau^2) + mechanical shaft power (tau * omega / eff) + servo idle
    const mechanicalWatts = Math.abs(totalTorqueNm * velRad) / 0.82;
    const holdingCopperWatts = 0.045 * totalTorqueNm * totalTorqueNm;
    const servoStandbyWatts = 2.4;
    const powerWatts = servoStandbyWatts + holdingCopperWatts + mechanicalWatts;

    totalMotorWatts += powerWatts;
    jointResults.push({
      id: spec.id,
      angleDeg: params.jointAnglesDeg[i],
      velocityDegPerSec: velDeg,
      torqueNm: totalTorqueNm,
      loadPct,
      powerWatts,
    });
  }

  const totalPowerWatts = IDLE_CONTROLLER_WATTS + totalMotorWatts;
  const busVoltage = Math.max(46.2, 48.0 - totalPowerWatts * 0.0032);
  const busCurrentAmps = totalPowerWatts / busVoltage;

  let bottleHeightM = 0.062;
  let bottleTiltDeg = 0;
  if (params.bottlePosition && params.bottleQuaternion) {
    bottleHeightM = params.bottlePosition[1];
    bottleTiltDeg = computeBottleTiltDeg(params.bottleQuaternion);
  }

  return {
    timeSec: params.timeSec,
    totalPowerWatts,
    busVoltage,
    busCurrentAmps,
    peakJointLoadPct: peakLoad,
    tcpPosition: tcpPos,
    tcpSpeedMps,
    bottleHeightM,
    bottleTiltDeg,
    joints: jointResults as SimulationTelemetrySample['joints'],
  };
}

const _upVec = new THREE.Vector3(0, 1, 0);
const _bottleQuat = new THREE.Quaternion();
const _bottleUp = new THREE.Vector3();

/**
 * Computes bottle tilt angle in degrees relative to world +Y upright (0 deg = upright, 90 deg = lying flat, 180 deg = inverted).
 */
export function computeBottleTiltDeg(quaternion: QuatTuple): number {
  _bottleQuat.set(quaternion[0], quaternion[1], quaternion[2], quaternion[3]).normalize();
  _bottleUp.copy(_upVec).applyQuaternion(_bottleQuat);
  const dot = THREE.MathUtils.clamp(_bottleUp.y, -1, 1);
  return (Math.acos(dot) * 180) / Math.PI;
}

export function isBottleUprightOnBench(
  position: Vec3Tuple,
  quaternion: QuatTuple,
  linearSpeedMps: number,
): boolean {
  const tiltDeg = computeBottleTiltDeg(quaternion);
  return (
    position[1] >= 0.045 &&
    position[1] <= 0.095 &&
    tiltDeg <= 14 &&
    linearSpeedMps < 0.06
  );
}
