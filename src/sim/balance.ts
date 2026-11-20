/**
 * Balance experiment: the arm holds a round plate (instead of the gripper) with a ball on it.
 * Shared by the training env and the live viewer so both build the exact same setup.
 */
import { PLATE_HALF_THICKNESS_M } from '../physics/rapierWorld';
import { computeForwardKinematics, solveInverseKinematics } from '../robotics/kinematics';
import { homeAnglesOf } from '../robotics/robotModel';
import type { JointTuple, QuatTuple, RobotModelConfig, SceneObjectSpec, Vec3Tuple } from '../robotics/types';

export const BALANCE_BALL_ID = 'balance_ball';
/** Rubber ball, Ø30 mm, 15 g. */
export const BALANCE_BALL_RADIUS_M = 0.015;

/** Tool pointing horizontally forward (+X) with its local -X (the plate normal) facing up. */
const TOOL_FORWARD_PLATE_UP: QuatTuple = [0, 0, -Math.SQRT1_2, Math.SQRT1_2];

/** Plate size scales with the robot: 16 cm for the hobby arms, ~22 cm for Axis-6R. */
export function plateRadiusFor(robot: RobotModelConfig): number {
  return Math.max(0.08, 0.12 * robot.maxReachMeters);
}

export function balanceBallSpec(): SceneObjectSpec {
  return {
    id: BALANCE_BALL_ID,
    name: 'Balance Ball (rubber Ø30 mm)',
    kind: 'sphere',
    color: '#facc15',
    graspable: false,
    dimensions: [BALANCE_BALL_RADIUS_M, BALANCE_BALL_RADIUS_M, BALANCE_BALL_RADIUS_M],
    mass: 0.015,
    initialPosition: [0, -1, 0], // placed by ballStartPose()
    initialQuaternion: [0, 0, 0, 1],
  };
}

/** Arm pose holding the plate level in front of the robot (solved once per robot by IK). */
export function balanceHomeAngles(robot: RobotModelConfig): JointTuple {
  const shoulderY = robot.joints[0].offsetFromParent[1] + robot.joints[1].offsetFromParent[1];
  const target: Vec3Tuple = [0.55 * robot.maxReachMeters, shoulderY + 0.12 * robot.maxReachMeters, 0];
  return solveInverseKinematics(target, TOOL_FORWARD_PLATE_UP, homeAnglesOf(robot), robot, {
    maxIterations: 300,
    orientationWeight: 1,
  }).anglesDeg;
}

/** Ball resting on the plate at in-plane offset (u, v) from its center (meters). */
export function ballStartPose(
  robot: RobotModelConfig,
  jointAnglesDeg: JointTuple,
  u: number,
  v: number,
): { position: Vec3Tuple; quaternion: QuatTuple } {
  const fk = computeForwardKinematics(jointAnglesDeg, robot);
  const [px, py, pz] = fk.tcpPosition;
  // Plate is ~level at the start pose (in-plane axes ~ world X/Z). Drop the ball from 4 mm so a
  // few degrees of initial tilt never starts it intersecting the plate.
  return {
    position: [px + u, py + PLATE_HALF_THICKNESS_M + BALANCE_BALL_RADIUS_M + 0.004, pz + v],
    quaternion: [0, 0, 0, 1],
  };
}
