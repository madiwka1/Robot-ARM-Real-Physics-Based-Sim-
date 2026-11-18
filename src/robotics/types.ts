export type JointTuple = [number, number, number, number, number, number];
export type Vec3Tuple = [number, number, number];
export type QuatTuple = [number, number, number, number]; // [x, y, z, w]

export type ControlMode = 'joint' | 'ik';
export type GizmoMode = 'translate' | 'rotate';

export type JointAxisName = 'J1' | 'J2' | 'J3' | 'J4' | 'J5' | 'J6';

export interface JointSpec {
  id: JointAxisName;
  name: string;
  role: string;
  axis: Vec3Tuple;
  offsetFromParent: Vec3Tuple;
  minDeg: number;
  maxDeg: number;
  defaultDeg: number;
  homeDeg: number;
  maxSpeedDegPerSec: number;
}

export interface RobotModelConfig {
  id: string;
  name: string;
  baseOffset: Vec3Tuple;
  tcpOffsetFromJ6: Vec3Tuple;
  maxReachMeters: number;
  minReachMeters: number;
  joints: [JointSpec, JointSpec, JointSpec, JointSpec, JointSpec, JointSpec];
}

export interface JointWorldTransform {
  id: JointAxisName | 'BASE' | 'TCP';
  position: Vec3Tuple;
  quaternion: QuatTuple;
}

export interface ForwardKinematicsResult {
  jointTransforms: JointWorldTransform[]; // [BASE, J1, J2, J3, J4, J5, J6, TCP]
  tcpPosition: Vec3Tuple;
  tcpQuaternion: QuatTuple;
  tcpEulerRad: Vec3Tuple; // XYZ Euler in radians
}

export interface InverseKinematicsResult {
  anglesDeg: JointTuple;
  converged: boolean;
  positionErrorMeters: number;
  orientationErrorRad: number;
  iterations: number;
}

export interface GripperState {
  widthMm: number; // 0 (fully closed) to 80 (fully open)
  targetWidthMm: number;
  isGrasping: boolean;
  graspedObjectId: string | null;
}

export type SceneObjectKind = 'cube' | 'cylinder' | 'sphere' | 'bottle' | 'container';

export interface SceneObjectSpec {
  id: string;
  name: string;
  kind: SceneObjectKind;
  color: string;
  graspable: boolean;
  dimensions: Vec3Tuple; // cube: [w,h,d], cylinder: [radius,height,radius], sphere: [r,r,r], container: [w,h,d]
  mass: number;
  initialPosition: Vec3Tuple;
  initialQuaternion: QuatTuple;
}

export interface SceneObjectRuntimeState {
  id: string;
  name: string;
  kind: SceneObjectKind;
  position: Vec3Tuple;
  quaternion: QuatTuple;
  isGrasped: boolean;
}

export type ActionType =
  | 'Move Joint'
  | 'Move Linear'
  | 'Open Gripper'
  | 'Close Gripper'
  | 'Pick Object'
  | 'Move Object'
  | 'Place Object'
  | 'Bottle Flip'
  | 'Home'
  | 'Idle';

export interface DemoObjectSnapshot {
  id: string;
  position: Vec3Tuple;
  quaternion: QuatTuple;
}

export interface DemoFrame {
  id: string;
  timestampMs: number;
  jointAnglesDeg: JointTuple;
  tcpPosition: Vec3Tuple;
  tcpEulerDeg: Vec3Tuple;
  tcpQuaternion: QuatTuple;
  gripperWidthMm: number;
  isGrasping: boolean;
  graspedObjectId: string | null;
  objects: DemoObjectSnapshot[];
  action: ActionType;
}

export interface Demonstration {
  id: string;
  name: string;
  taskType: string;
  createdAt: string;
  updatedAt: string;
  durationMs: number;
  frames: DemoFrame[];
}

export type BridgeConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface RobotBridgeTelemetry {
  jointAnglesDeg?: JointTuple;
  gripperWidthMm?: number;
  timestampMs: number;
}

export interface RobotHardwareBridge {
  readonly protocol: 'ros2-rosbridge' | 'websocket-json';
  readonly state: BridgeConnectionState;
  connect(endpointUrl: string): Promise<void>;
  disconnect(): void;
  sendJointCommand(anglesDeg: JointTuple): void;
  sendGripperCommand(widthMm: number): void;
  onTelemetry(listener: (telemetry: RobotBridgeTelemetry) => void): () => void;
}
