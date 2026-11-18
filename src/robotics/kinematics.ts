import * as THREE from 'three';
import { AXIS6_ROBOT_CONFIG } from './robotModel';
import type {
  ForwardKinematicsResult,
  InverseKinematicsResult,
  JointTuple,
  JointWorldTransform,
  QuatTuple,
  RobotModelConfig,
  Vec3Tuple,
} from './types';

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

export function degToRad(deg: number): number {
  return deg * DEG_TO_RAD;
}

export function radToDeg(rad: number): number {
  return rad * RAD_TO_DEG;
}

export function clampJointAnglesDeg(
  anglesDeg: JointTuple,
  config: RobotModelConfig = AXIS6_ROBOT_CONFIG,
): JointTuple {
  return [
    THREE.MathUtils.clamp(anglesDeg[0], config.joints[0].minDeg, config.joints[0].maxDeg),
    THREE.MathUtils.clamp(anglesDeg[1], config.joints[1].minDeg, config.joints[1].maxDeg),
    THREE.MathUtils.clamp(anglesDeg[2], config.joints[2].minDeg, config.joints[2].maxDeg),
    THREE.MathUtils.clamp(anglesDeg[3], config.joints[3].minDeg, config.joints[3].maxDeg),
    THREE.MathUtils.clamp(anglesDeg[4], config.joints[4].minDeg, config.joints[4].maxDeg),
    THREE.MathUtils.clamp(anglesDeg[5], config.joints[5].minDeg, config.joints[5].maxDeg),
  ];
}

export function computeForwardKinematics(
  anglesDeg: JointTuple,
  config: RobotModelConfig = AXIS6_ROBOT_CONFIG,
): ForwardKinematicsResult {
  const clamped = clampJointAnglesDeg(anglesDeg, config);
  const jointTransforms: JointWorldTransform[] = [];

  const accPos = new THREE.Vector3(...config.baseOffset);
  const accQuat = new THREE.Quaternion();
  const localVec = new THREE.Vector3();
  const axisVec = new THREE.Vector3();
  const stepQuat = new THREE.Quaternion();

  jointTransforms.push({
    id: 'BASE',
    position: [accPos.x, accPos.y, accPos.z],
    quaternion: [accQuat.x, accQuat.y, accQuat.z, accQuat.w],
  });

  for (let i = 0; i < 6; i++) {
    const spec = config.joints[i];
    localVec.set(
      spec.offsetFromParent[0],
      spec.offsetFromParent[1],
      spec.offsetFromParent[2],
    );
    localVec.applyQuaternion(accQuat);
    accPos.add(localVec);

    axisVec.set(spec.axis[0], spec.axis[1], spec.axis[2]).normalize();
    stepQuat.setFromAxisAngle(axisVec, clamped[i] * DEG_TO_RAD);
    accQuat.multiply(stepQuat).normalize();

    jointTransforms.push({
      id: spec.id,
      position: [accPos.x, accPos.y, accPos.z],
      quaternion: [accQuat.x, accQuat.y, accQuat.z, accQuat.w],
    });
  }

  // TCP offset from J6
  localVec.set(
    config.tcpOffsetFromJ6[0],
    config.tcpOffsetFromJ6[1],
    config.tcpOffsetFromJ6[2],
  );
  localVec.applyQuaternion(accQuat);
  accPos.add(localVec);

  const tcpPos: Vec3Tuple = [accPos.x, accPos.y, accPos.z];
  const tcpQuat: QuatTuple = [accQuat.x, accQuat.y, accQuat.z, accQuat.w];
  const tcpEuler = new THREE.Euler().setFromQuaternion(accQuat, 'XYZ');

  jointTransforms.push({
    id: 'TCP',
    position: tcpPos,
    quaternion: tcpQuat,
  });

  return {
    jointTransforms,
    tcpPosition: tcpPos,
    tcpQuaternion: tcpQuat,
    tcpEulerRad: [tcpEuler.x, tcpEuler.y, tcpEuler.z],
  };
}

/**
 * Computes orientation error vector (axis * angle) from currentQuat to targetQuat.
 */
function computeOrientationErrorVector(
  currentQuat: THREE.Quaternion,
  targetQuat: THREE.Quaternion,
  out: THREE.Vector3,
): number {
  const errQuat = targetQuat.clone().multiply(currentQuat.clone().invert()).normalize();
  if (errQuat.w < 0) {
    errQuat.set(-errQuat.x, -errQuat.y, -errQuat.z, -errQuat.w);
  }
  const wClamped = THREE.MathUtils.clamp(errQuat.w, -1, 1);
  const angle = 2 * Math.acos(wClamped);
  const s = Math.sqrt(Math.max(0, 1 - wClamped * wClamped));
  if (s < 1e-6 || angle < 1e-6) {
    out.set(0, 0, 0);
    return 0;
  }
  out.set((errQuat.x / s) * angle, (errQuat.y / s) * angle, (errQuat.z / s) * angle);
  return angle;
}

/**
 * Solves a 6x6 linear system A * x = b using Gaussian elimination with partial pivoting.
 */
function solveLinear6x6(A: number[][], b: number[]): number[] {
  const n = 6;
  const M = A.map((row, idx) => [...row, b[idx]]);

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let maxAbs = Math.abs(M[col][col]);
    for (let r = col + 1; r < n; r++) {
      const val = Math.abs(M[r][col]);
      if (val > maxAbs) {
        maxAbs = val;
        pivotRow = r;
      }
    }
    if (pivotRow !== col) {
      const tmp = M[col];
      M[col] = M[pivotRow];
      M[pivotRow] = tmp;
    }
    const pivot = M[col][col];
    if (Math.abs(pivot) < 1e-10) {
      continue;
    }
    for (let j = col; j <= n; j++) {
      M[col][j] /= pivot;
    }
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col];
      if (factor === 0) continue;
      for (let j = col; j <= n; j++) {
        M[r][j] -= factor * M[col][j];
      }
    }
  }

  return M.map((row) => (Number.isFinite(row[n]) ? row[n] : 0));
}

export interface SolveIKOptions {
  maxIterations?: number;
  positionToleranceM?: number;
  orientationToleranceRad?: number;
  damping?: number;
  orientationWeight?: number;
  minTcpHeightM?: number;
}

/**
 * Damped Least-Squares (Levenberg-Marquardt) 6-DOF Inverse Kinematics solver.
 * Solves both TCP 3D position and 3D orientation while respecting joint limits.
 */
export function solveInverseKinematics(
  targetPosition: Vec3Tuple,
  targetQuaternion: QuatTuple,
  seedAnglesDeg: JointTuple,
  config: RobotModelConfig = AXIS6_ROBOT_CONFIG,
  options: SolveIKOptions = {},
): InverseKinematicsResult {
  const maxIterations = options.maxIterations ?? 48;
  const posTol = options.positionToleranceM ?? 0.0012;
  const rotTol = options.orientationToleranceRad ?? 0.015;
  const baseDamping = options.damping ?? 0.06;
  const rotWeight = options.orientationWeight ?? 0.42;
  const minTcpY = options.minTcpHeightM ?? 0.012;

  const clampedTargetPos: Vec3Tuple = [
    targetPosition[0],
    Math.max(minTcpY, targetPosition[1]),
    targetPosition[2],
  ];

  // Clamp radial distance from shoulder center to avoid extreme singularities
  const shoulderCenterY =
    config.baseOffset[1] + config.joints[0].offsetFromParent[1] + config.joints[1].offsetFromParent[1];
  const dx = clampedTargetPos[0] - config.baseOffset[0];
  const dy = clampedTargetPos[1] - shoulderCenterY;
  const dz = clampedTargetPos[2] - config.baseOffset[2];
  const distFromShoulder = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const maxArmReach = config.maxReachMeters;
  if (distFromShoulder > maxArmReach && distFromShoulder > 1e-6) {
    const scale = maxArmReach / distFromShoulder;
    clampedTargetPos[0] = config.baseOffset[0] + dx * scale;
    clampedTargetPos[1] = Math.max(minTcpY, shoulderCenterY + dy * scale);
    clampedTargetPos[2] = config.baseOffset[2] + dz * scale;
  }

  const targetPosVec = new THREE.Vector3(...clampedTargetPos);
  const targetQuat = new THREE.Quaternion(...targetQuaternion).normalize();

  let currentAngles: JointTuple = clampJointAnglesDeg(seedAnglesDeg, config);
  const epsDeg = 0.05;
  const epsRad = epsDeg * DEG_TO_RAD;

  const curQuat = new THREE.Quaternion();
  const pertQuat = new THREE.Quaternion();
  const rotErrVec = new THREE.Vector3();
  const dRotVec = new THREE.Vector3();

  let finalPosErr = 0;
  let finalRotErr = 0;
  let iter = 0;

  for (iter = 0; iter < maxIterations; iter++) {
    const fk = computeForwardKinematics(currentAngles, config);
    const curPos = new THREE.Vector3(...fk.tcpPosition);
    curQuat.set(...fk.tcpQuaternion);

    const posErrVec = targetPosVec.clone().sub(curPos);
    finalPosErr = posErrVec.length();
    finalRotErr = computeOrientationErrorVector(curQuat, targetQuat, rotErrVec);

    if (finalPosErr <= posTol && finalRotErr <= rotTol) {
      break;
    }

    // 6-element task error vector [dx, dy, dz, rx, ry, rz]
    const err6 = [
      posErrVec.x,
      posErrVec.y,
      posErrVec.z,
      rotErrVec.x * rotWeight,
      rotErrVec.y * rotWeight,
      rotErrVec.z * rotWeight,
    ];

    // Build 6x6 Jacobian numerically (fast, exact with arbitrary offsets & axes)
    const J: number[][] = Array.from({ length: 6 }, () => [0, 0, 0, 0, 0, 0]);
    for (let j = 0; j < 6; j++) {
      const perturbed: JointTuple = [...currentAngles];
      perturbed[j] += epsDeg;
      const pFk = computeForwardKinematics(perturbed, config);

      J[0][j] = (pFk.tcpPosition[0] - fk.tcpPosition[0]) / epsRad;
      J[1][j] = (pFk.tcpPosition[1] - fk.tcpPosition[1]) / epsRad;
      J[2][j] = (pFk.tcpPosition[2] - fk.tcpPosition[2]) / epsRad;

      pertQuat.set(...pFk.tcpQuaternion);
      computeOrientationErrorVector(curQuat, pertQuat, dRotVec);
      J[3][j] = (dRotVec.x * rotWeight) / epsRad;
      J[4][j] = (dRotVec.y * rotWeight) / epsRad;
      J[5][j] = (dRotVec.z * rotWeight) / epsRad;
    }

    // Compute (J^T * J + lambda^2 * I) * dq = J^T * err
    const lambda = baseDamping + Math.min(0.12, finalPosErr * 0.15);
    const lambdaSq = lambda * lambda;

    const JTJ: number[][] = Array.from({ length: 6 }, () => [0, 0, 0, 0, 0, 0]);
    const JTe: number[] = [0, 0, 0, 0, 0, 0];

    for (let r = 0; r < 6; r++) {
      let sumErr = 0;
      for (let k = 0; k < 6; k++) {
        sumErr += J[k][r] * err6[k];
      }
      JTe[r] = sumErr;

      for (let c = 0; c < 6; c++) {
        let sum = 0;
        for (let k = 0; k < 6; k++) {
          sum += J[k][r] * J[k][c];
        }
        if (r === c) sum += lambdaSq;
        JTJ[r][c] = sum;
      }
    }

    const dqRad = solveLinear6x6(JTJ, JTe);

    // Step with gentle max step clamping for numerical stability
    const maxStepDeg = 18;
    const nextAngles: JointTuple = [...currentAngles];
    for (let j = 0; j < 6; j++) {
      const stepDeg = THREE.MathUtils.clamp(dqRad[j] * RAD_TO_DEG, -maxStepDeg, maxStepDeg);
      nextAngles[j] += stepDeg;
    }
    currentAngles = clampJointAnglesDeg(nextAngles, config);
  }

  const finalFk = computeForwardKinematics(currentAngles, config);
  const finalPos = new THREE.Vector3(...finalFk.tcpPosition);
  curQuat.set(...finalFk.tcpQuaternion);
  finalPosErr = targetPosVec.distanceTo(finalPos);
  finalRotErr = computeOrientationErrorVector(curQuat, targetQuat, rotErrVec);

  return {
    anglesDeg: currentAngles,
    converged: finalPosErr <= posTol * 2.5 && finalRotErr <= rotTol * 2.5,
    positionErrorMeters: finalPosErr,
    orientationErrorRad: finalRotErr,
    iterations: iter,
  };
}

export function eulerDegToQuaternion(eulerDeg: Vec3Tuple): QuatTuple {
  const euler = new THREE.Euler(
    eulerDeg[0] * DEG_TO_RAD,
    eulerDeg[1] * DEG_TO_RAD,
    eulerDeg[2] * DEG_TO_RAD,
    'XYZ',
  );
  const q = new THREE.Quaternion().setFromEuler(euler);
  return [q.x, q.y, q.z, q.w];
}

export function quaternionToEulerDeg(quat: QuatTuple): Vec3Tuple {
  const q = new THREE.Quaternion(...quat).normalize();
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  return [e.x * RAD_TO_DEG, e.y * RAD_TO_DEG, e.z * RAD_TO_DEG];
}
