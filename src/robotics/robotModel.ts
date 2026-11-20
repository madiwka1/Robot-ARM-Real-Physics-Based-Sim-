import type { JointTuple, RobotModelConfig, SceneObjectSpec } from './types';

export const AXIS6_ROBOT_CONFIG: RobotModelConfig = {
  id: 'axis-6r-lab',
  name: 'Axis-6R Articulated Manipulator',
  style: 'axis6',
  actuators: {
    label: '48 V industrial servo drives',
    busVoltage: 48,
    controllerIdleWatts: 18.5,
    servoStandbyWatts: 2.4,
    copperLossWPerNm2: 0.045,
    ratedTorqueNm: [48, 56, 36, 16, 14, 8],
    downstreamMassKg: [6.8, 5.2, 3.1, 1.6, 1.1, 0.55],
  },
  baseOffset: [0, 0, 0],
  tcpOffsetFromJ6: [0, 0.115, 0],
  maxReachMeters: 0.92,
  minReachMeters: 0.16,
  joints: [
    {
      id: 'J1',
      name: 'Base Waist',
      role: 'Yaw',
      axis: [0, 1, 0],
      offsetFromParent: [0, 0.14, 0],
      minDeg: -175,
      maxDeg: 175,
      defaultDeg: 0,
      homeDeg: 0,
      maxSpeedDegPerSec: 180,
    },
    {
      id: 'J2',
      name: 'Shoulder',
      role: 'Pitch',
      axis: [0, 0, -1],
      offsetFromParent: [0, 0.16, 0],
      minDeg: -105,
      maxDeg: 115,
      defaultDeg: 0,
      homeDeg: 26,
      maxSpeedDegPerSec: 160,
    },
    {
      id: 'J3',
      name: 'Elbow',
      role: 'Pitch',
      axis: [0, 0, -1],
      offsetFromParent: [0, 0.36, 0],
      minDeg: -135,
      maxDeg: 145,
      defaultDeg: 0,
      homeDeg: 72,
      maxSpeedDegPerSec: 180,
    },
    {
      id: 'J4',
      name: 'Forearm',
      role: 'Roll',
      axis: [0, 1, 0],
      offsetFromParent: [0, 0.22, 0],
      minDeg: -180,
      maxDeg: 180,
      defaultDeg: 0,
      homeDeg: 0,
      maxSpeedDegPerSec: 240,
    },
    {
      id: 'J5',
      name: 'Wrist',
      role: 'Pitch',
      axis: [0, 0, -1],
      offsetFromParent: [0, 0.1, 0],
      minDeg: -125,
      maxDeg: 125,
      defaultDeg: 0,
      homeDeg: 82,
      maxSpeedDegPerSec: 220,
    },
    {
      id: 'J6',
      name: 'Tool Flange',
      role: 'Roll',
      axis: [0, 1, 0],
      offsetFromParent: [0, 0.09, 0],
      minDeg: -180,
      maxDeg: 180,
      defaultDeg: 0,
      homeDeg: 0,
      maxSpeedDegPerSec: 300,
    },
  ],
};

/**
 * Open-source 5-DOF hobby arms, mapped onto the 6-slot chain with J4 (forearm roll) locked at 0°
 * because these arms have none. Zero pose = arm straight up (like Axis-6R); link lengths follow
 * the published URDFs, joint ranges keep each joint's real span.
 */
const pitch = [0, 0, -1] as [number, number, number];
const yaw = [0, 1, 0] as [number, number, number];

export const SO101_ROBOT_CONFIG: RobotModelConfig = {
  id: 'so-101',
  name: 'SO-101 (LeRobot)',
  source: 'TheRobotStudio/SO-ARM100 · so101_new_calib.urdf',
  style: 'servo-printed',
  linkColor: '#f1f5f9',
  actuators: {
    label: '12 V Feetech STS3215 serial-bus servos',
    busVoltage: 12,
    controllerIdleWatts: 0.6,
    servoStandbyWatts: 0.12,
    copperLossWPerNm2: 3.8,
    ratedTorqueNm: [1.5, 1.5, 1.5, 1, 1.5, 1.5],
    downstreamMassKg: [0.62, 0.48, 0.31, 0, 0.16, 0.09],
  },
  baseOffset: [0, 0, 0],
  tcpOffsetFromJ6: [0, 0.0981, 0],
  maxReachMeters: 0.4,
  minReachMeters: 0.06,
  joints: [
    { id: 'J1', name: 'Shoulder Pan', role: 'Yaw', axis: yaw, offsetFromParent: [0, 0.0624, 0], minDeg: -110, maxDeg: 110, defaultDeg: 0, homeDeg: 0, maxSpeedDegPerSec: 225 },
    { id: 'J2', name: 'Shoulder Lift', role: 'Pitch', axis: pitch, offsetFromParent: [0, 0.0542, 0], minDeg: -100, maxDeg: 100, defaultDeg: 0, homeDeg: 25, maxSpeedDegPerSec: 225 },
    { id: 'J3', name: 'Elbow Flex', role: 'Pitch', axis: pitch, offsetFromParent: [0, 0.1126, 0], minDeg: -97, maxDeg: 97, defaultDeg: 0, homeDeg: 75, maxSpeedDegPerSec: 225 },
    { id: 'J4', name: '(none — locked)', role: 'Locked', axis: yaw, offsetFromParent: [0, 0.1349, 0], minDeg: 0, maxDeg: 0, defaultDeg: 0, homeDeg: 0, maxSpeedDegPerSec: 1 },
    { id: 'J5', name: 'Wrist Flex', role: 'Pitch', axis: pitch, offsetFromParent: [0, 0, 0], minDeg: -95, maxDeg: 95, defaultDeg: 0, homeDeg: 80, maxSpeedDegPerSec: 225 },
    { id: 'J6', name: 'Wrist Roll', role: 'Roll', axis: yaw, offsetFromParent: [0, 0.0611, 0], minDeg: -157, maxDeg: 163, defaultDeg: 0, homeDeg: 0, maxSpeedDegPerSec: 225 },
  ],
};

export const KOCH_V11_ROBOT_CONFIG: RobotModelConfig = {
  id: 'koch-v1.1',
  name: 'Koch v1.1',
  source: 'jess-moss/koch-v1-1 · ManiSkill follower_arm_v1.1.urdf',
  style: 'servo-printed',
  linkColor: '#1f2937',
  actuators: {
    label: '12 V Dynamixel XL430 / XL330 servos',
    busVoltage: 12,
    controllerIdleWatts: 0.5,
    servoStandbyWatts: 0.1,
    copperLossWPerNm2: 4.5,
    ratedTorqueNm: [1.4, 1.4, 1.4, 1, 0.6, 0.6],
    downstreamMassKg: [0.5, 0.38, 0.25, 0, 0.12, 0.07],
  },
  baseOffset: [0, 0, 0],
  tcpOffsetFromJ6: [0, 0.065, 0],
  maxReachMeters: 0.3,
  minReachMeters: 0.05,
  joints: [
    { id: 'J1', name: 'Base Yaw', role: 'Yaw', axis: yaw, offsetFromParent: [0, 0.041, 0], minDeg: -180, maxDeg: 180, defaultDeg: 0, homeDeg: 0, maxSpeedDegPerSec: 240 },
    { id: 'J2', name: 'Shoulder', role: 'Pitch', axis: pitch, offsetFromParent: [0, 0.0154, 0], minDeg: -30, maxDeg: 96, defaultDeg: 0, homeDeg: 25, maxSpeedDegPerSec: 240 },
    { id: 'J3', name: 'Elbow', role: 'Pitch', axis: pitch, offsetFromParent: [0, 0.1084, 0], minDeg: -30, maxDeg: 145, defaultDeg: 0, homeDeg: 75, maxSpeedDegPerSec: 240 },
    { id: 'J4', name: '(none — locked)', role: 'Locked', axis: yaw, offsetFromParent: [0, 0.1005, 0], minDeg: 0, maxDeg: 0, defaultDeg: 0, homeDeg: 0, maxSpeedDegPerSec: 1 },
    { id: 'J5', name: 'Wrist Flex', role: 'Pitch', axis: pitch, offsetFromParent: [0, 0, 0], minDeg: -86, maxDeg: 123, defaultDeg: 0, homeDeg: 80, maxSpeedDegPerSec: 240 },
    { id: 'J6', name: 'Wrist Roll', role: 'Roll', axis: yaw, offsetFromParent: [0, 0.0448, 0], minDeg: -180, maxDeg: 180, defaultDeg: 0, homeDeg: 0, maxSpeedDegPerSec: 240 },
  ],
};

export const ROBOT_MODELS: RobotModelConfig[] = [AXIS6_ROBOT_CONFIG, SO101_ROBOT_CONFIG, KOCH_V11_ROBOT_CONFIG];

export function getRobotModel(id: string): RobotModelConfig {
  return ROBOT_MODELS.find((r) => r.id === id) ?? AXIS6_ROBOT_CONFIG;
}

export function homeAnglesOf(config: RobotModelConfig): JointTuple {
  return config.joints.map((j) => j.homeDeg) as JointTuple;
}

export const HOME_JOINT_ANGLES_DEG: JointTuple = [
  AXIS6_ROBOT_CONFIG.joints[0].homeDeg,
  AXIS6_ROBOT_CONFIG.joints[1].homeDeg,
  AXIS6_ROBOT_CONFIG.joints[2].homeDeg,
  AXIS6_ROBOT_CONFIG.joints[3].homeDeg,
  AXIS6_ROBOT_CONFIG.joints[4].homeDeg,
  AXIS6_ROBOT_CONFIG.joints[5].homeDeg,
];

export const ZERO_JOINT_ANGLES_DEG: JointTuple = [0, 0, 0, 0, 0, 0];

export const GRIPPER_MIN_WIDTH_MM = 0;
export const GRIPPER_MAX_WIDTH_MM = 80;
export const GRIPPER_DEFAULT_WIDTH_MM = 68;

export const DEFAULT_SCENE_OBJECTS: SceneObjectSpec[] = [
  {
    id: 'cube_red',
    name: 'Red Calibration Cube',
    kind: 'cube',
    color: '#dc2626',
    graspable: true,
    dimensions: [0.056, 0.056, 0.056],
    mass: 0.35,
    initialPosition: [0.46, 0.03, 0.14],
    initialQuaternion: [0, 0, 0, 1],
  },
  {
    id: 'cube_blue',
    name: 'Cobalt Test Block',
    kind: 'cube',
    color: '#2563eb',
    graspable: true,
    dimensions: [0.052, 0.052, 0.052],
    mass: 0.32,
    initialPosition: [0.54, 0.028, -0.02],
    initialQuaternion: [0, 0.2588, 0, 0.9659],
  },
  {
    id: 'cyl_amber',
    name: 'Machined Brass Cylinder',
    kind: 'cylinder',
    color: '#d97706',
    graspable: true,
    dimensions: [0.026, 0.072, 0.026],
    mass: 0.42,
    initialPosition: [0.38, 0.038, -0.18],
    initialQuaternion: [0, 0, 0, 1],
  },
  {
    id: 'ball_teal',
    name: 'Polymer Inspection Sphere',
    kind: 'sphere',
    color: '#0d9488',
    graspable: true,
    dimensions: [0.028, 0.028, 0.028],
    mass: 0.22,
    initialPosition: [0.33, 0.03, 0.24],
    initialQuaternion: [0, 0, 0, 1],
  },
  {
    id: 'bottle_flip',
    name: 'Flip Practice Bottle',
    kind: 'bottle',
    color: '#0284c7',
    graspable: true,
    dimensions: [0.024, 0.128, 0.024],
    mass: 0.54,
    initialPosition: [0.5, 0.065, 0.28],
    initialQuaternion: [0, 0, 0, 1],
  },
  {
    id: 'bin_target',
    name: 'Receiving Tray',
    kind: 'container',
    color: '#334155',
    graspable: false,
    dimensions: [0.22, 0.055, 0.22],
    mass: 0,
    initialPosition: [0.42, 0.0275, -0.34],
    initialQuaternion: [0, 0, 0, 1],
  },
];
