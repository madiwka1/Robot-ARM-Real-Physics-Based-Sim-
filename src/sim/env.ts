/**
 * Gymnasium-style training environment (reset/step/observation/reward) for any of the robot
 * models, modelled on MuJoCo's env workflow. Tasks only talk to this API, so the physics engine
 * behind it (Rapier today) can be swapped (e.g. for @mujoco/mujoco WASM) without touching
 * tasks/trainers. Runs headless in Node (tests) and in a Web Worker (training).
 */
import { RoboticsPhysicsWorld } from '../physics/rapierWorld';
import { clampJointAnglesDeg, computeForwardKinematics, solveInverseKinematics } from '../robotics/kinematics';
import {
  AXIS6_ROBOT_CONFIG,
  DEFAULT_SCENE_OBJECTS,
  GRIPPER_MAX_WIDTH_MM,
  homeAnglesOf,
} from '../robotics/robotModel';
import type { JointTuple, QuatTuple, RobotModelConfig, SceneObjectSpec, Vec3Tuple } from '../robotics/types';
import {
  BALANCE_BALL_ID,
  balanceBallSpec,
  balanceHomeAngles,
  ballStartPose,
  plateRadiusFor,
} from './balance';

/** Policy control period (20 Hz); physics runs 6 fixed substeps per control step. */
export const CONTROL_DT = 0.05;
const GRIPPER_SPEED_MM_S = 150;

/** Deterministic PRNG (mulberry32) so a seed reproduces an episode exactly. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal sample (Box-Muller). */
export function gaussian(rng: () => number): number {
  return Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
}

export interface DomainRandomization {
  /** Max horizontal offset of task objects at reset (m). */
  objectPosJitterM: number;
  /** Mass and friction multipliers drawn from [1 - x, 1 + x]. */
  massScale: number;
  frictionScale: number;
  /** Std-dev of Gaussian noise added to actions / observations. */
  actionNoise: number;
  obsNoise: number;
  /** Max initial joint offset from home (deg). */
  initialJointJitterDeg: number;
}

export const NO_RANDOMIZATION: DomainRandomization = {
  objectPosJitterM: 0,
  massScale: 0,
  frictionScale: 0,
  actionNoise: 0,
  obsNoise: 0,
  initialJointJitterDeg: 0,
};

export const DEFAULT_RANDOMIZATION: DomainRandomization = {
  objectPosJitterM: 0.03,
  massScale: 0.2,
  frictionScale: 0.2,
  actionNoise: 0.05,
  obsNoise: 0.005,
  initialJointJitterDeg: 3,
};

export type TaskId = 'reach' | 'pick_lift' | 'balance';

export interface TaskDefinition {
  id: TaskId;
  name: string;
  description: string;
  episodeSteps: number;
  /** End effector: parallel gripper (default) or the balance plate. */
  tool?: 'gripper' | 'plate';
  /** Place the goal / props for this episode; returns the goal point the policy observes. */
  reset(env: RobotArmEnv, rng: () => number): Vec3Tuple;
  /** Per-step reward and termination. */
  evaluate(env: RobotArmEnv): { reward: number; success: boolean; terminated: boolean };
  /** Task-specific observation (default: the generic arm observation). */
  observe?(env: RobotArmEnv): number[];
}

const dist = (a: Vec3Tuple, b: Vec3Tuple) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Wrist tilt rate at full balance action (deg/s): far below rated speed, like a careful controller. */
const BALANCE_TILT_RATE_DEG_S = 60;

export const TASKS: Record<TaskId, TaskDefinition> = {
  reach: {
    id: 'reach',
    name: 'Reach Target',
    description:
      'Move the TCP to a random point above the bench. Reward = -distance; +bonus inside 5 cm (Gymnasium-Robotics Fetch threshold).',
    episodeSteps: 60,
    reset: (env, rng) => {
      // Goal box scaled to the robot's reach (designed for the 0.92 m Axis-6R)
      const s = env.robot.maxReachMeters / AXIS6_ROBOT_CONFIG.maxReachMeters;
      return [s * (0.3 + 0.3 * rng()), Math.max(0.04, s * (0.12 + 0.25 * rng())), s * (-0.25 + 0.5 * rng())];
    },
    evaluate(env) {
      const d = dist(env.tcpPosition, env.goal);
      const success = d < 0.05;
      return { reward: -d + (success ? 0.5 : 0), success, terminated: false };
    },
  },
  pick_lift: {
    id: 'pick_lift',
    name: 'Pick & Lift Cube',
    description:
      'Grasp the red cube and lift it 8 cm. Shaped reward: approach + grasp bonus + lift height. Harder; needs more iterations.',
    episodeSteps: 100,
    reset: (env) => env.objectPosition('cube_red'),
    evaluate(env) {
      const cube = env.objectPosition('cube_red');
      env.goal = cube; // goal tracks the cube, so the policy observes cube - TCP
      const grasped = env.graspedObjectId === 'cube_red';
      const lift = Math.max(0, cube[1] - 0.028);
      const success = grasped && lift > 0.08;
      // Knocked off the bench: end the episode (it would otherwise fall forever past the safety floor)
      if (cube[1] < -0.05) return { reward: -10, success: false, terminated: true };
      return {
        reward: -dist(env.tcpPosition, cube) + (grasped ? 0.3 : 0) + 4 * lift + (success ? 1 : 0),
        success,
        terminated: success,
      };
    },
  },
  balance: {
    id: 'balance',
    name: 'Balance Ball',
    tool: 'plate',
    description:
      'Keep a Ø30 mm rubber ball on a round plate by tilting the wrist (J5 fore/aft, J6 side to side, ±60°/s). The plate starts slightly tilted. Reward: +1 per step minus distance from center; ball rolling off ends the episode. Success = still on the plate after 10 s.',
    episodeSteps: 200,
    reset: (env) => env.objectPosition(BALANCE_BALL_ID),
    evaluate(env) {
      const ball = env.objectPosition(BALANCE_BALL_ID);
      env.goal = ball;
      const r = plateRadiusFor(env.robot);
      const d = Math.hypot(ball[0] - env.tcpPosition[0], ball[2] - env.tcpPosition[2]);
      if (d > r || ball[1] < env.tcpPosition[1] - 0.03) return { reward: -5, success: false, terminated: true };
      return { reward: 1 - 2 * (d / r) ** 2, success: env.stepCount >= this.episodeSteps, terminated: false };
    },
    observe(env) {
      // Ball position & velocity relative to the plate center, plus the wrist's tilt state
      const ball = env.objectPosition(BALANCE_BALL_ID);
      const vel = env.physics.getObjectVelocity(BALANCE_BALL_ID);
      return [
        ...ball.map((v, i) => (v - env.tcpPosition[i]) * 10),
        ...vel,
        (env.jointAnglesDeg[4] - env.startAngles[4]) / 30,
        (env.jointAnglesDeg[5] - env.startAngles[5]) / 30,
        env.jointVelDegS[4] / BALANCE_TILT_RATE_DEG_S,
        env.jointVelDegS[5] / BALANCE_TILT_RATE_DEG_S,
      ];
    },
  },
};

export interface StepResult {
  obs: number[];
  reward: number;
  terminated: boolean;
  truncated: boolean;
  info: { success: boolean; step: number };
}

/**
 * 'ee_delta' (default, like Gymnasium-Robotics Fetch): action (4) = TCP displacement x/y/z in
 *   [-1, 1] (x 0.5 m/s, scaled to the robot's reach) with the gripper kept pointing down, solved
 *   by DLS IK; then gripper.
 * 'joint_velocity': action (7) = J1-J6 velocities in [-1, 1] x rated speed; then gripper.
 * The balance task ignores both: action (2) = J5 / J6 tilt rates in [-1, 1] x 60°/s.
 * Gripper command in [-1, 1] maps to a 0-80 mm width target, servoed at 150 mm/s. In all modes
 * joint motion is capped at each joint's rated speed and position limits.
 */
export type ActionMode = 'ee_delta' | 'joint_velocity';
const EE_SPEED_M_S = 0.5;

/**
 * Generic observation (20): joint angles / 180, joint velocities / rated speed, TCP position (m),
 * goal - TCP (m), gripper width / 80, grasp flag. Balance uses its own 10-value observation.
 */
export class RobotArmEnv {
  readonly obsSize: number;
  readonly actionSize: number;

  readonly task: TaskDefinition;
  readonly physics: RoboticsPhysicsWorld;
  readonly randomization: DomainRandomization;
  readonly startAngles: JointTuple;
  private readonly toolDownQuat: QuatTuple;

  jointAnglesDeg: JointTuple;
  jointVelDegS: number[] = [0, 0, 0, 0, 0, 0];
  gripperWidthMm = GRIPPER_MAX_WIDTH_MM;
  gripperTargetMm = GRIPPER_MAX_WIDTH_MM;
  graspedObjectId: string | null = null;
  tcpPosition: Vec3Tuple = [0, 0, 0];
  tcpQuaternion: QuatTuple = [0, 0, 0, 1];
  goal: Vec3Tuple = [0, 0, 0];
  stepCount = 0;
  private rng = makeRng(0);

  constructor(
    taskId: TaskId,
    randomization: DomainRandomization = NO_RANDOMIZATION,
    readonly actionMode: ActionMode = 'ee_delta',
    readonly robot: RobotModelConfig = AXIS6_ROBOT_CONFIG,
  ) {
    this.task = TASKS[taskId];
    this.randomization = randomization;
    this.physics = new RoboticsPhysicsWorld(DEFAULT_SCENE_OBJECTS);
    this.toolDownQuat = computeForwardKinematics(homeAnglesOf(robot), robot).tcpQuaternion;
    if (this.task.tool === 'plate') {
      this.physics.setPlateTool(plateRadiusFor(robot));
      this.physics.addObject(balanceBallSpec());
      this.startAngles = balanceHomeAngles(robot);
      this.actionSize = 2;
      this.obsSize = 10;
    } else {
      this.startAngles = homeAnglesOf(robot);
      this.actionSize = actionMode === 'ee_delta' ? 4 : 7;
      this.obsSize = 20;
    }
    this.jointAnglesDeg = [...this.startAngles] as JointTuple;
  }

  reset(seed: number): number[] {
    const dr = this.randomization;
    this.rng = makeRng(seed);
    const u = () => 2 * this.rng() - 1; // uniform [-1, 1]

    // Start pose (+ DR jitter); the balance plate also starts slightly tilted (±4°) as the disturbance
    const start = this.startAngles.map((q) => q + u() * dr.initialJointJitterDeg);
    if (this.task.tool === 'plate') {
      start[4] += u() * 4;
      start[5] += u() * 4;
    }
    this.jointAnglesDeg = clampJointAnglesDeg(start as JointTuple, this.robot);
    const r = plateRadiusFor(this.robot);
    const ballPose = ballStartPose(this.robot, this.jointAnglesDeg, u() * 0.25 * r, u() * 0.25 * r);

    // Hobby arms can't reach the Axis-6R layout: bring the task cube within reach
    const smallArm = this.robot.maxReachMeters < 0.6;
    this.physics.resetObjects((spec: SceneObjectSpec) => {
      if (spec.id === BALANCE_BALL_ID) return ballPose;
      let [x, y, z] = spec.initialPosition;
      if (smallArm && spec.id === 'cube_red') [x, z] = [0.5 * this.robot.maxReachMeters, 0.1 * this.robot.maxReachMeters];
      if (spec.graspable && dr.objectPosJitterM > 0) {
        x += u() * dr.objectPosJitterM;
        z += u() * dr.objectPosJitterM;
      }
      return { position: [x, y, z], quaternion: spec.initialQuaternion };
    });
    for (const spec of [...DEFAULT_SCENE_OBJECTS, balanceBallSpec()]) {
      if (spec.kind === 'container') continue;
      this.physics.setObjectMaterialScale(spec.id, 1 + u() * dr.massScale, 1 + u() * dr.frictionScale);
    }

    this.jointVelDegS = [0, 0, 0, 0, 0, 0];
    this.gripperWidthMm = this.gripperTargetMm = GRIPPER_MAX_WIDTH_MM;
    this.graspedObjectId = null;
    this.stepCount = 0;
    this.updateKinematics();
    // Jump the tool to the start pose (no sweep through props), then let things settle one step
    this.physics.updateGripperPose(this.tcpPosition, this.tcpQuaternion, this.gripperWidthMm, true);
    this.physics.step(CONTROL_DT);

    this.goal = this.task.reset(this, this.rng);
    return this.observe();
  }

  step(action: ArrayLike<number>): StepResult {
    const dr = this.randomization;
    const joints = this.robot.joints;
    const a = (i: number) =>
      Math.max(-1, Math.min(1, (action[i] ?? 0) + (dr.actionNoise ? gaussian(this.rng) * dr.actionNoise : 0)));

    // Desired joint motion this control step
    const prev = this.jointAnglesDeg;
    let desired: number[];
    if (this.task.tool === 'plate') {
      desired = [...prev];
      desired[4] += a(0) * BALANCE_TILT_RATE_DEG_S * CONTROL_DT;
      desired[5] += a(1) * BALANCE_TILT_RATE_DEG_S * CONTROL_DT;
    } else if (this.actionMode === 'ee_delta') {
      const d = EE_SPEED_M_S * (this.robot.maxReachMeters / AXIS6_ROBOT_CONFIG.maxReachMeters) * CONTROL_DT;
      const target: Vec3Tuple = [
        this.tcpPosition[0] + a(0) * d,
        this.tcpPosition[1] + a(1) * d,
        this.tcpPosition[2] + a(2) * d,
      ];
      desired = solveInverseKinematics(target, this.toolDownQuat, prev, this.robot, { maxIterations: 12 }).anglesDeg;
    } else {
      desired = prev.map((q, i) => q + a(i) * joints[i].maxSpeedDegPerSec * CONTROL_DT);
    }
    // Actuators: capped at each joint's rated speed and position limits
    this.jointAnglesDeg = clampJointAnglesDeg(
      desired.map((q, i) => {
        const maxStep = joints[i].maxSpeedDegPerSec * CONTROL_DT;
        return prev[i] + Math.max(-maxStep, Math.min(maxStep, q - prev[i]));
      }) as JointTuple,
      this.robot,
    );
    this.jointVelDegS = this.jointAnglesDeg.map((q, i) => (q - prev[i]) / CONTROL_DT);

    // Gripper width servo toward the commanded target (last action component; unused by the plate)
    if (this.task.tool !== 'plate') this.gripperTargetMm = ((a(this.actionSize - 1) + 1) / 2) * GRIPPER_MAX_WIDTH_MM;
    const maxDelta = GRIPPER_SPEED_MM_S * CONTROL_DT;
    const diff = this.gripperTargetMm - this.gripperWidthMm;
    const steppedWidth = this.gripperWidthMm + Math.max(-maxDelta, Math.min(maxDelta, diff));

    this.updateKinematics();
    const grasp = this.physics.evaluateGrasp(this.tcpPosition, this.tcpQuaternion, steppedWidth, this.gripperTargetMm);
    this.gripperWidthMm = grasp.effectiveWidthMm;
    this.graspedObjectId = grasp.graspedObjectId;
    this.physics.updateGripperPose(this.tcpPosition, this.tcpQuaternion, this.gripperWidthMm);
    this.physics.step(CONTROL_DT);
    this.stepCount++;

    const { reward, success, terminated } = this.task.evaluate(this);
    return {
      obs: this.observe(),
      reward,
      terminated,
      truncated: !terminated && this.stepCount >= this.task.episodeSteps,
      info: { success, step: this.stepCount },
    };
  }

  objectPosition(id: string): Vec3Tuple {
    return this.physics.getObjectStates().find((o) => o.id === id)?.position ?? [0, 0, 0];
  }

  dispose(): void {
    this.physics.dispose();
  }

  private updateKinematics(): void {
    const fk = computeForwardKinematics(this.jointAnglesDeg, this.robot);
    this.tcpPosition = fk.tcpPosition;
    this.tcpQuaternion = fk.tcpQuaternion;
  }

  private observe(): number[] {
    const n = this.randomization.obsNoise;
    const obs = this.task.observe
      ? this.task.observe(this)
      : [
          ...this.jointAnglesDeg.map((q) => q / 180),
          ...this.jointVelDegS.map((v, i) => v / this.robot.joints[i].maxSpeedDegPerSec),
          ...this.tcpPosition,
          ...this.goal.map((g, i) => g - this.tcpPosition[i]),
          this.gripperWidthMm / GRIPPER_MAX_WIDTH_MM,
          this.graspedObjectId ? 1 : 0,
        ];
    return n ? obs.map((v) => v + gaussian(this.rng) * n) : obs;
  }
}
