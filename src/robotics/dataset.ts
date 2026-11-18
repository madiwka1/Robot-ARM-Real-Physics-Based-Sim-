import * as THREE from 'three';
import {
  computeForwardKinematics,
  quaternionToEulerDeg,
  solveInverseKinematics,
} from './kinematics';
import {
  AXIS6_ROBOT_CONFIG,
  DEFAULT_SCENE_OBJECTS,
  GRIPPER_DEFAULT_WIDTH_MM,
  HOME_JOINT_ANGLES_DEG,
} from './robotModel';
import type {
  ActionType,
  DemoFrame,
  DemoObjectSnapshot,
  Demonstration,
  JointTuple,
  QuatTuple,
  Vec3Tuple,
} from './types';

export const DEMO_STORAGE_KEY = 'axislab_robotics_demonstrations_v1';

export function createDemoFrame(params: {
  timestampMs: number;
  jointAnglesDeg: JointTuple;
  gripperWidthMm: number;
  isGrasping: boolean;
  graspedObjectId: string | null;
  objects: DemoObjectSnapshot[];
  action: ActionType;
}): DemoFrame {
  const fk = computeForwardKinematics(params.jointAnglesDeg, AXIS6_ROBOT_CONFIG);
  const eulerDeg = quaternionToEulerDeg(fk.tcpQuaternion);
  return {
    id: `frame_${Math.round(params.timestampMs)}_${Math.random().toString(36).slice(2, 7)}`,
    timestampMs: Math.round(params.timestampMs),
    jointAnglesDeg: [...params.jointAnglesDeg] as JointTuple,
    tcpPosition: [...fk.tcpPosition] as Vec3Tuple,
    tcpEulerDeg: [
      Number(eulerDeg[0].toFixed(2)),
      Number(eulerDeg[1].toFixed(2)),
      Number(eulerDeg[2].toFixed(2)),
    ],
    tcpQuaternion: [...fk.tcpQuaternion] as QuatTuple,
    gripperWidthMm: Number(params.gripperWidthMm.toFixed(1)),
    isGrasping: params.isGrasping,
    graspedObjectId: params.graspedObjectId,
    objects: params.objects.map((o) => ({
      id: o.id,
      position: [...o.position] as Vec3Tuple,
      quaternion: [...o.quaternion] as QuatTuple,
    })),
    action: params.action,
  };
}

export interface InterpolatedDemoState {
  jointAnglesDeg: JointTuple;
  gripperWidthMm: number;
  isGrasping: boolean;
  graspedObjectId: string | null;
  action: ActionType;
  frameIndex: number;
}

export function interpolateDemoAtTime(
  demo: Demonstration,
  timeMs: number,
): InterpolatedDemoState | null {
  const frames = demo.frames;
  if (frames.length === 0) return null;
  if (frames.length === 1 || timeMs <= frames[0].timestampMs) {
    const f = frames[0];
    return {
      jointAnglesDeg: [...f.jointAnglesDeg] as JointTuple,
      gripperWidthMm: f.gripperWidthMm,
      isGrasping: f.isGrasping,
      graspedObjectId: f.graspedObjectId,
      action: f.action,
      frameIndex: 0,
    };
  }
  const lastIdx = frames.length - 1;
  if (timeMs >= frames[lastIdx].timestampMs) {
    const f = frames[lastIdx];
    return {
      jointAnglesDeg: [...f.jointAnglesDeg] as JointTuple,
      gripperWidthMm: f.gripperWidthMm,
      isGrasping: f.isGrasping,
      graspedObjectId: f.graspedObjectId,
      action: f.action,
      frameIndex: lastIdx,
    };
  }

  // Find surrounding frames
  let idx = 0;
  for (let i = 0; i < lastIdx; i++) {
    if (frames[i + 1].timestampMs >= timeMs) {
      idx = i;
      break;
    }
  }
  const a = frames[idx];
  const b = frames[idx + 1];
  const span = Math.max(1, b.timestampMs - a.timestampMs);
  const t = THREE.MathUtils.clamp((timeMs - a.timestampMs) / span, 0, 1);

  const jointAnglesDeg: JointTuple = [
    THREE.MathUtils.lerp(a.jointAnglesDeg[0], b.jointAnglesDeg[0], t),
    THREE.MathUtils.lerp(a.jointAnglesDeg[1], b.jointAnglesDeg[1], t),
    THREE.MathUtils.lerp(a.jointAnglesDeg[2], b.jointAnglesDeg[2], t),
    THREE.MathUtils.lerp(a.jointAnglesDeg[3], b.jointAnglesDeg[3], t),
    THREE.MathUtils.lerp(a.jointAnglesDeg[4], b.jointAnglesDeg[4], t),
    THREE.MathUtils.lerp(a.jointAnglesDeg[5], b.jointAnglesDeg[5], t),
  ];

  const gripperWidthMm = THREE.MathUtils.lerp(a.gripperWidthMm, b.gripperWidthMm, t);
  const activeFrame = t < 0.5 ? a : b;

  return {
    jointAnglesDeg,
    gripperWidthMm,
    isGrasping: a.isGrasping && b.isGrasping ? true : activeFrame.isGrasping,
    graspedObjectId:
      a.graspedObjectId === b.graspedObjectId
        ? a.graspedObjectId
        : activeFrame.graspedObjectId,
    action: activeFrame.action,
    frameIndex: t < 0.5 ? idx : idx + 1,
  };
}

export function serializeDemoToJSON(demo: Demonstration): string {
  return JSON.stringify(
    {
      schema: 'axislab.demonstration.v1',
      robotModel: AXIS6_ROBOT_CONFIG.id,
      exportedAt: new Date().toISOString(),
      demonstration: demo,
    },
    null,
    2,
  );
}

function escapeCsvCell(value: string | number | boolean | null): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function serializeDemoToCSV(demo: Demonstration): string {
  const headers = [
    'timestamp_ms',
    'action',
    'j1_deg',
    'j2_deg',
    'j3_deg',
    'j4_deg',
    'j5_deg',
    'j6_deg',
    'ee_x_m',
    'ee_y_m',
    'ee_z_m',
    'ee_roll_deg',
    'ee_pitch_deg',
    'ee_yaw_deg',
    'gripper_width_mm',
    'gripper_is_grasping',
    'grasped_object_id',
    'objects_json',
  ];

  const rows = demo.frames.map((frame) => {
    const cells = [
      frame.timestampMs,
      frame.action,
      ...frame.jointAnglesDeg.map((a) => a.toFixed(3)),
      ...frame.tcpPosition.map((p) => p.toFixed(5)),
      ...frame.tcpEulerDeg.map((e) => e.toFixed(3)),
      frame.gripperWidthMm.toFixed(2),
      frame.isGrasping,
      frame.graspedObjectId ?? '',
      JSON.stringify(
        frame.objects.map((o) => ({
          id: o.id,
          pos: o.position.map((v) => Number(v.toFixed(4))),
        })),
      ),
    ];
    return cells.map(escapeCsvCell).join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

export function updateDemoTiming(demo: Demonstration): Demonstration {
  if (demo.frames.length === 0) {
    return { ...demo, durationMs: 0, updatedAt: new Date().toISOString() };
  }
  const sorted = [...demo.frames].sort((a, b) => a.timestampMs - b.timestampMs);
  const t0 = sorted[0].timestampMs;
  const normalized = sorted.map((f) => ({
    ...f,
    timestampMs: f.timestampMs - t0,
  }));
  const durationMs = normalized[normalized.length - 1].timestampMs;
  return {
    ...demo,
    frames: normalized,
    durationMs,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Generates a realistic, physically calibrated Pick & Place demonstration using the real IK solver
 * so the user can inspect, replay, modify, or export a working pick-and-place task right away.
 */
export function buildSamplePickAndPlaceDemo(): Demonstration {
  const homeFk = computeForwardKinematics(HOME_JOINT_ANGLES_DEG, AXIS6_ROBOT_CONFIG);
  const downQuat = homeFk.tcpQuaternion;

  const baseObjects: DemoObjectSnapshot[] = DEFAULT_SCENE_OBJECTS.map((obj) => ({
    id: obj.id,
    position: [...obj.initialPosition] as Vec3Tuple,
    quaternion: [...obj.initialQuaternion] as QuatTuple,
  }));

  const cubePos = DEFAULT_SCENE_OBJECTS.find((o) => o.id === 'cube_red')!.initialPosition;
  const binPos = DEFAULT_SCENE_OBJECTS.find((o) => o.id === 'bin_target')!.initialPosition;

  const waypoints: Array<{
    t: number;
    pos: Vec3Tuple | null;
    angles?: JointTuple;
    gripper: number;
    grasping: boolean;
    graspedId: string | null;
    action: ActionType;
  }> = [
    {
      t: 0,
      pos: null,
      angles: HOME_JOINT_ANGLES_DEG,
      gripper: GRIPPER_DEFAULT_WIDTH_MM,
      grasping: false,
      graspedId: null,
      action: 'Home',
    },
    {
      t: 900,
      pos: [cubePos[0], 0.19, cubePos[2]],
      gripper: 72,
      grasping: false,
      graspedId: null,
      action: 'Move Linear',
    },
    {
      t: 1700,
      pos: [cubePos[0], 0.036, cubePos[2]],
      gripper: 72,
      grasping: false,
      graspedId: null,
      action: 'Pick Object',
    },
    {
      t: 2300,
      pos: [cubePos[0], 0.036, cubePos[2]],
      gripper: 48,
      grasping: true,
      graspedId: 'cube_red',
      action: 'Close Gripper',
    },
    {
      t: 3100,
      pos: [cubePos[0], 0.24, cubePos[2]],
      gripper: 48,
      grasping: true,
      graspedId: 'cube_red',
      action: 'Move Object',
    },
    {
      t: 4300,
      pos: [binPos[0], 0.24, binPos[2]],
      gripper: 48,
      grasping: true,
      graspedId: 'cube_red',
      action: 'Move Object',
    },
    {
      t: 5100,
      pos: [binPos[0], 0.11, binPos[2]],
      gripper: 48,
      grasping: true,
      graspedId: 'cube_red',
      action: 'Place Object',
    },
    {
      t: 5700,
      pos: [binPos[0], 0.11, binPos[2]],
      gripper: 74,
      grasping: false,
      graspedId: null,
      action: 'Open Gripper',
    },
    {
      t: 6500,
      pos: [binPos[0], 0.24, binPos[2]],
      gripper: 74,
      grasping: false,
      graspedId: null,
      action: 'Move Linear',
    },
    {
      t: 7400,
      pos: null,
      angles: HOME_JOINT_ANGLES_DEG,
      gripper: GRIPPER_DEFAULT_WIDTH_MM,
      grasping: false,
      graspedId: null,
      action: 'Home',
    },
  ];

  let seed: JointTuple = [...HOME_JOINT_ANGLES_DEG] as JointTuple;
  const frames: DemoFrame[] = [];

  for (const wp of waypoints) {
    let angles: JointTuple;
    if (wp.angles) {
      angles = [...wp.angles] as JointTuple;
    } else if (wp.pos) {
      const ik = solveInverseKinematics(wp.pos, downQuat, seed, AXIS6_ROBOT_CONFIG, {
        maxIterations: 72,
      });
      angles = ik.anglesDeg;
    } else {
      angles = seed;
    }
    seed = angles;

    const fk = computeForwardKinematics(angles, AXIS6_ROBOT_CONFIG);
    const snapshotObjects = baseObjects.map((o) => {
      if (o.id === 'cube_red') {
        if (wp.grasping) {
          return {
            ...o,
            position: [...fk.tcpPosition] as Vec3Tuple,
            quaternion: [...fk.tcpQuaternion] as QuatTuple,
          };
        }
        if (wp.t >= 5700) {
          return {
            ...o,
            position: [binPos[0], 0.042, binPos[2]] as Vec3Tuple,
            quaternion: [0, 0, 0, 1] as QuatTuple,
          };
        }
      }
      return o;
    });

    frames.push(
      createDemoFrame({
        timestampMs: wp.t,
        jointAnglesDeg: angles,
        gripperWidthMm: wp.gripper,
        isGrasping: wp.grasping,
        graspedObjectId: wp.graspedId,
        objects: snapshotObjects,
        action: wp.action,
      }),
    );
  }

  return {
    id: 'demo_sample_pick_place',
    name: 'Pick & Place Red Cube',
    taskType: 'Pick Object',
    createdAt: '2026-11-17T12:00:00.000Z',
    updatedAt: '2026-11-17T12:00:00.000Z',
    durationMs: 7400,
    frames,
  };
}

/**
 * Generates a Bottle Flip Challenge demonstration: picks up the weighted bottle,
 * winds back, executes a fast wrist-pitch flick, and releases mid-arc.
 */
export function buildSampleBottleFlipDemo(): Demonstration {
  const homeFk = computeForwardKinematics(HOME_JOINT_ANGLES_DEG, AXIS6_ROBOT_CONFIG);
  const downQuat = homeFk.tcpQuaternion;

  const baseObjects: DemoObjectSnapshot[] = DEFAULT_SCENE_OBJECTS.map((obj) => ({
    id: obj.id,
    position: [...obj.initialPosition] as Vec3Tuple,
    quaternion: [...obj.initialQuaternion] as QuatTuple,
  }));

  const bottlePos = DEFAULT_SCENE_OBJECTS.find((o) => o.id === 'bottle_flip')!.initialPosition;
  const approachIk = solveInverseKinematics(
    [bottlePos[0], 0.22, bottlePos[2]],
    downQuat,
    HOME_JOINT_ANGLES_DEG,
    AXIS6_ROBOT_CONFIG,
    { maxIterations: 72 },
  );
  const graspIk = solveInverseKinematics(
    [bottlePos[0], 0.088, bottlePos[2]],
    downQuat,
    approachIk.anglesDeg,
    AXIS6_ROBOT_CONFIG,
    { maxIterations: 72 },
  );
  const windupAngles: JointTuple = [
    graspIk.anglesDeg[0],
    graspIk.anglesDeg[1] - 14,
    graspIk.anglesDeg[2] + 28,
    0,
    graspIk.anglesDeg[4] + 26,
    0,
  ];
  const flickMidAngles: JointTuple = [
    graspIk.anglesDeg[0],
    graspIk.anglesDeg[1] - 2,
    graspIk.anglesDeg[2] - 26,
    0,
    graspIk.anglesDeg[4] - 58,
    0,
  ];
  const followThroughAngles: JointTuple = [
    graspIk.anglesDeg[0],
    graspIk.anglesDeg[1] + 4,
    graspIk.anglesDeg[2] - 42,
    0,
    graspIk.anglesDeg[4] - 85,
    0,
  ];

  const keyframes: Array<{
    t: number;
    angles: JointTuple;
    gripper: number;
    grasping: boolean;
    graspedId: string | null;
    action: ActionType;
  }> = [
    {
      t: 0,
      angles: HOME_JOINT_ANGLES_DEG,
      gripper: GRIPPER_DEFAULT_WIDTH_MM,
      grasping: false,
      graspedId: null,
      action: 'Home',
    },
    {
      t: 750,
      angles: approachIk.anglesDeg,
      gripper: 74,
      grasping: false,
      graspedId: null,
      action: 'Move Linear',
    },
    {
      t: 1350,
      angles: graspIk.anglesDeg,
      gripper: 74,
      grasping: false,
      graspedId: null,
      action: 'Pick Object',
    },
    {
      t: 1750,
      angles: graspIk.anglesDeg,
      gripper: 44,
      grasping: true,
      graspedId: 'bottle_flip',
      action: 'Close Gripper',
    },
    {
      t: 2300,
      angles: windupAngles,
      gripper: 44,
      grasping: true,
      graspedId: 'bottle_flip',
      action: 'Move Object',
    },
    {
      t: 2520,
      angles: flickMidAngles,
      gripper: 44,
      grasping: true,
      graspedId: 'bottle_flip',
      action: 'Bottle Flip',
    },
    {
      t: 2590,
      angles: followThroughAngles,
      gripper: 76,
      grasping: false,
      graspedId: null,
      action: 'Open Gripper',
    },
    {
      t: 3800,
      angles: followThroughAngles,
      gripper: 76,
      grasping: false,
      graspedId: null,
      action: 'Idle',
    },
    {
      t: 4700,
      angles: HOME_JOINT_ANGLES_DEG,
      gripper: GRIPPER_DEFAULT_WIDTH_MM,
      grasping: false,
      graspedId: null,
      action: 'Home',
    },
  ];

  const frames = keyframes.map((kf) =>
    createDemoFrame({
      timestampMs: kf.t,
      jointAnglesDeg: kf.angles,
      gripperWidthMm: kf.gripper,
      isGrasping: kf.grasping,
      graspedObjectId: kf.graspedId,
      objects: baseObjects,
      action: kf.action,
    }),
  );

  return {
    id: 'demo_sample_bottle_flip',
    name: 'Bottle Flip Challenge',
    taskType: 'Bottle Flip',
    createdAt: '2026-11-17T22:00:00.000Z',
    updatedAt: '2026-11-17T22:00:00.000Z',
    durationMs: 4700,
    frames,
  };
}

const SEEDED_BOTTLE_KEY = 'axislab_seeded_bottle_v1';

export function loadDemonstrationsFromStorage(): Demonstration[] {
  const defaults = () => [buildSampleBottleFlipDemo(), buildSamplePickAndPlaceDemo()];
  if (typeof window === 'undefined' || !window.localStorage) {
    return defaults();
  }
  try {
    const raw = window.localStorage.getItem(DEMO_STORAGE_KEY);
    if (!raw) {
      const initial = defaults();
      window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(initial));
      window.localStorage.setItem(SEEDED_BOTTLE_KEY, '1');
      return initial;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      const initial = defaults();
      window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(initial));
      window.localStorage.setItem(SEEDED_BOTTLE_KEY, '1');
      return initial;
    }
    const demos = parsed as Demonstration[];
    if (
      !window.localStorage.getItem(SEEDED_BOTTLE_KEY) &&
      !demos.some((d) => d.id === 'demo_sample_bottle_flip')
    ) {
      const withBottle = [buildSampleBottleFlipDemo(), ...demos];
      window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(withBottle));
      window.localStorage.setItem(SEEDED_BOTTLE_KEY, '1');
      return withBottle;
    }
    return demos;
  } catch {
    return defaults();
  }
}

export function saveDemonstrationsToStorage(demos: Demonstration[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(demos));
  } catch {
    // Ignore storage quota errors cleanly
  }
}
