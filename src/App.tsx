import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AuthModal } from './components/AuthModal';
import { BottomTimelinePanel } from './components/BottomTimelinePanel';
import { FeedbackModal } from './components/FeedbackModal';
import { HardwareBridgeModal } from './components/HardwareBridgeModal';
import { LandingPage } from './components/LandingPage';
import { LeftSidebar } from './components/LeftSidebar';
import { ProfileModal } from './components/ProfileModal';
import { RightSidebar } from './components/RightSidebar';
import { TopToolbar } from './components/TopToolbar';
import {
  getProfile,
  getSession,
  hydrateSupabaseSession,
  signOutUser,
  subscribeToSupabaseAuth,
  type UserProfile,
  type UserSession,
} from './data/platformStore';
import { ensureRapierInitialized, RoboticsPhysicsWorld } from './physics/rapierWorld';
import { WebSocketRobotBridge } from './robotics/bridge';
import {
  createDemoFrame,
  loadDemonstrationsFromStorage,
  saveDemonstrationsToStorage,
  serializeDemoToCSV,
  serializeDemoToJSON,
  interpolateDemoAtTime,
  updateDemoTiming,
} from './robotics/dataset';
import {
  clampJointAnglesDeg,
  computeForwardKinematics,
  eulerDegToQuaternion,
  quaternionToEulerDeg,
  solveInverseKinematics,
} from './robotics/kinematics';
import {
  AXIS6_ROBOT_CONFIG,
  DEFAULT_SCENE_OBJECTS,
  GRIPPER_DEFAULT_WIDTH_MM,
  GRIPPER_MAX_WIDTH_MM,
  GRIPPER_MIN_WIDTH_MM,
  HOME_JOINT_ANGLES_DEG,
  ZERO_JOINT_ANGLES_DEG,
} from './robotics/robotModel';
import {
  computeRobotTelemetry,
  isBottleUprightOnBench,
  type SimulationTelemetrySample,
} from './robotics/telemetry';
import type {
  ActionType,
  BridgeConnectionState,
  ControlMode,
  DemoFrame,
  Demonstration,
  GizmoMode,
  GripperState,
  JointTuple,
  QuatTuple,
  SceneObjectRuntimeState,
  Vec3Tuple,
} from './robotics/types';
import { RoboticsViewport, type CameraPreset } from './scene/RoboticsViewport';

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function App() {
  // User account & Supabase session state
  const [session, setSession] = useState<UserSession | null>(() => getSession());
  const [profile, setProfile] = useState<UserProfile | null>(() => {
    const s = getSession();
    return s ? getProfile(s.userId) : null;
  });
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);

  // Hydrate live Supabase Auth session (if configured) and support ?autostart=1 scroll anchor
  useEffect(() => {
    let active = true;
    hydrateSupabaseSession().then((hydrated) => {
      if (!active || !hydrated) return;
      setSession(hydrated.session);
      setProfile(hydrated.profile);
      setControlMode(hydrated.profile.defaultControlMode);
      setShowJointAxes(hydrated.profile.showJointAxesDefault);
    });
    const unsubscribe = subscribeToSupabaseAuth((payload) => {
      if (!active || !payload) return;
      setSession(payload.session);
      setProfile(payload.profile);
      setControlMode(payload.profile.defaultControlMode);
      setShowJointAxes(payload.profile.showJointAxesDefault);
    });

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1') {
        requestAnimationFrame(() => {
          document.getElementById('simulator')?.scrollIntoView({ behavior: 'auto' });
        });
      }
    }

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  // Physics world lifecycle (booted for the embedded 3D workbench)
  const physicsRef = useRef<RoboticsPhysicsWorld | null>(null);
  const [physicsReady, setPhysicsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    ensureRapierInitialized().then(() => {
      if (cancelled) return;
      if (!physicsRef.current) {
        const world = new RoboticsPhysicsWorld(DEFAULT_SCENE_OBJECTS);
        physicsRef.current = world;
        setObjectStates(world.getObjectStates());
      }
      setPhysicsReady(true);
    });
    return () => {
      cancelled = true;
      if (physicsRef.current) {
        physicsRef.current.dispose();
        physicsRef.current = null;
        setPhysicsReady(false);
      }
    };
  }, []);

  // Robot state
  const [jointAnglesDeg, setJointAnglesDeg] = useState<JointTuple>(
    HOME_JOINT_ANGLES_DEG,
  );
  const jointAnglesRef = useRef<JointTuple>(HOME_JOINT_ANGLES_DEG);

  const initialFk = useMemo(
    () => computeForwardKinematics(HOME_JOINT_ANGLES_DEG, AXIS6_ROBOT_CONFIG),
    [],
  );

  const [controlMode, setControlMode] = useState<ControlMode>(
    () => profile?.defaultControlMode ?? 'joint',
  );
  const [gizmoMode, setGizmoMode] = useState<GizmoMode>('translate');

  const [ikTargetPos, setIkTargetPos] = useState<Vec3Tuple>(initialFk.tcpPosition);
  const [ikTargetQuat, setIkTargetQuat] = useState<QuatTuple>(
    initialFk.tcpQuaternion,
  );
  const [ikErrorMm, setIkErrorMm] = useState(0);
  const [ikConverged, setIkConverged] = useState(true);

  const [gripper, setGripper] = useState<GripperState>({
    widthMm: GRIPPER_DEFAULT_WIDTH_MM,
    targetWidthMm: GRIPPER_DEFAULT_WIDTH_MM,
    isGrasping: false,
    graspedObjectId: null,
  });
  const gripperRef = useRef<GripperState>(gripper);

  // Scene & UI overlays
  const [simulationRunning, setSimulationRunning] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>('TCP');
  const [showJointAxes, setShowJointAxes] = useState(
    () => profile?.showJointAxesDefault ?? true,
  );
  const [showWorkspace, setShowWorkspace] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('perspective');
  const [presetTrigger, setPresetTrigger] = useState(0);
  const [objectStates, setObjectStates] = useState<SceneObjectRuntimeState[]>([]);

  // Power, joint load, and bottle flip telemetry
  const initialTelemetry = useMemo(() => {
    const bottleSpec = DEFAULT_SCENE_OBJECTS.find((o) => o.id === 'bottle_flip');
    return computeRobotTelemetry({
      timeSec: 0,
      jointAnglesDeg: HOME_JOINT_ANGLES_DEG,
      prevJointAnglesDeg: HOME_JOINT_ANGLES_DEG,
      prevTcpPosition: initialFk.tcpPosition,
      dtSec: 0.08,
      graspedMassKg: 0,
      bottlePosition: bottleSpec?.initialPosition,
      bottleQuaternion: bottleSpec?.initialQuaternion,
    });
  }, [initialFk.tcpPosition]);

  const simTimeRef = useRef(0);
  const prevJointAnglesRef = useRef<JointTuple>(HOME_JOINT_ANGLES_DEG);
  const prevTcpPosRef = useRef<Vec3Tuple>(initialFk.tcpPosition);
  const telemetryBufferRef = useRef<SimulationTelemetrySample[]>([initialTelemetry]);
  const [telemetrySamples, setTelemetrySamples] = useState<SimulationTelemetrySample[]>([
    initialTelemetry,
  ]);
  const [latestTelemetry, setLatestTelemetry] =
    useState<SimulationTelemetrySample>(initialTelemetry);
  const bottleFlipArmedRef = useRef(false);
  const [bottleFlipCount, setBottleFlipCount] = useState(0);
  const [bottleUpright, setBottleUpright] = useState(true);

  // Training & Demonstrations
  const [demonstrations, setDemonstrations] = useState<Demonstration[]>(() =>
    loadDemonstrationsFromStorage(),
  );
  const [activeDemoId, setActiveDemoId] = useState<string | null>(() => {
    const initial = loadDemonstrationsFromStorage();
    return initial[0]?.id ?? null;
  });
  const [taskType, setTaskType] = useState('Pick Object');
  const [demoNameInput, setDemoNameInput] = useState('Custom Pick Task');
  const [isRecording, setIsRecording] = useState(false);
  const recordingFramesRef = useRef<DemoFrame[]>([]);
  const recordingStartMsRef = useRef<number>(0);
  const lastSampledRef = useRef<{
    timeMs: number;
    angles: JointTuple;
    width: number;
    grasping: boolean;
  } | null>(null);

  const [isPlayingDemo, setIsPlayingDemo] = useState(false);
  const [repeatPlayback, setRepeatPlayback] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [playbackTimeMs, setPlaybackTimeMs] = useState(0);
  const playbackTimeRef = useRef(0);
  const [selectedFrameIndex, setSelectedFrameIndex] = useState<number | null>(null);

  // Hardware bridge state
  const bridgeRef = useRef<WebSocketRobotBridge | null>(null);
  const [bridgeModalOpen, setBridgeModalOpen] = useState(false);
  const [bridgeState, setBridgeState] =
    useState<BridgeConnectionState>('disconnected');
  const [bridgeProtocol, setBridgeProtocol] = useState<
    'ros2-rosbridge' | 'websocket-json'
  >('ros2-rosbridge');
  const [bridgeError, setBridgeError] = useState<string | null>(null);

  // Persist demonstrations to localStorage on change
  useEffect(() => {
    saveDemonstrationsToStorage(demonstrations);
  }, [demonstrations]);

  // Compute live FK for UI readouts
  const actualFk = useMemo(
    () => computeForwardKinematics(jointAnglesDeg, AXIS6_ROBOT_CONFIG),
    [jointAnglesDeg],
  );
  const actualEulerDeg = useMemo(
    () => quaternionToEulerDeg(actualFk.tcpQuaternion),
    [actualFk.tcpQuaternion],
  );
  const ikTargetEulerDeg = useMemo(
    () => quaternionToEulerDeg(ikTargetQuat),
    [ikTargetQuat],
  );

  // Keyboard shortcuts for Direct Manipulation gizmo (G = Translate, R = Rotate)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.key === 'g' || e.key === 'G') setGizmoMode('translate');
      if (e.key === 'r' || e.key === 'R') setGizmoMode('rotate');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const applyJointAngles = useCallback(
    (nextAngles: JointTuple, syncIkTarget = true) => {
      const clamped = clampJointAnglesDeg(nextAngles, AXIS6_ROBOT_CONFIG);
      jointAnglesRef.current = clamped;
      setJointAnglesDeg(clamped);

      if (syncIkTarget) {
        const fk = computeForwardKinematics(clamped, AXIS6_ROBOT_CONFIG);
        setIkTargetPos(fk.tcpPosition);
        setIkTargetQuat(fk.tcpQuaternion);
        setIkErrorMm(0);
        setIkConverged(true);
      }

      if (bridgeRef.current?.state === 'connected') {
        bridgeRef.current.sendJointCommand(clamped);
      }
    },
    [],
  );

  const handleChangeJointAngle = useCallback(
    (jointIndex: number, angleDeg: number) => {
      if (isPlayingDemo) setIsPlayingDemo(false);
      const next: JointTuple = [...jointAnglesRef.current] as JointTuple;
      next[jointIndex] = angleDeg;
      applyJointAngles(next, true);
    },
    [applyJointAngles, isPlayingDemo],
  );

  const handleHomeArm = useCallback(() => {
    setIsPlayingDemo(false);
    applyJointAngles(HOME_JOINT_ANGLES_DEG, true);
  }, [applyJointAngles]);

  const handleZeroArm = useCallback(() => {
    setIsPlayingDemo(false);
    applyJointAngles(ZERO_JOINT_ANGLES_DEG, true);
  }, [applyJointAngles]);

  const solveAndApplyIk = useCallback(
    (targetPos: Vec3Tuple, targetQuat: QuatTuple) => {
      setIkTargetPos(targetPos);
      setIkTargetQuat(targetQuat);
      const result = solveInverseKinematics(
        targetPos,
        targetQuat,
        jointAnglesRef.current,
        AXIS6_ROBOT_CONFIG,
      );
      setIkErrorMm(result.positionErrorMeters * 1000);
      setIkConverged(result.converged);
      applyJointAngles(result.anglesDeg, false);
    },
    [applyJointAngles],
  );

  const handleChangeControlMode = useCallback(
    (mode: ControlMode) => {
      setControlMode(mode);
      if (mode === 'ik') {
        const fk = computeForwardKinematics(
          jointAnglesRef.current,
          AXIS6_ROBOT_CONFIG,
        );
        setIkTargetPos(fk.tcpPosition);
        setIkTargetQuat(fk.tcpQuaternion);
        setIkErrorMm(0);
        setIkConverged(true);
        setSelectedNodeId('TCP');
      }
    },
    [],
  );

  const handleChangeIkTargetPos = useCallback(
    (axisIndex: 0 | 1 | 2, valueMeters: number) => {
      const nextPos: Vec3Tuple = [...ikTargetPos] as Vec3Tuple;
      nextPos[axisIndex] = valueMeters;
      solveAndApplyIk(nextPos, ikTargetQuat);
    },
    [ikTargetPos, ikTargetQuat, solveAndApplyIk],
  );

  const handleChangeIkTargetEuler = useCallback(
    (axisIndex: 0 | 1 | 2, valueDeg: number) => {
      const nextEuler: Vec3Tuple = [...ikTargetEulerDeg] as Vec3Tuple;
      nextEuler[axisIndex] = valueDeg;
      const nextQuat = eulerDegToQuaternion(nextEuler);
      solveAndApplyIk(ikTargetPos, nextQuat);
    },
    [ikTargetPos, ikTargetEulerDeg, solveAndApplyIk],
  );

  const handleChangeGripperWidth = useCallback((widthMm: number) => {
    const clamped = Math.max(
      GRIPPER_MIN_WIDTH_MM,
      Math.min(GRIPPER_MAX_WIDTH_MM, widthMm),
    );
    const updated: GripperState = {
      ...gripperRef.current,
      targetWidthMm: clamped,
    };
    gripperRef.current = updated;
    setGripper(updated);
    if (bridgeRef.current?.state === 'connected') {
      bridgeRef.current.sendGripperCommand(clamped);
    }
  }, []);

  const handleOpenGripper = useCallback(() => {
    handleChangeGripperWidth(74);
  }, [handleChangeGripperWidth]);

  const handleCloseGripper = useCallback(() => {
    handleChangeGripperWidth(28);
  }, [handleChangeGripperWidth]);

  const handleApproachObject = useCallback(
    (objectId: string) => {
      const runtimeObj = physicsRef.current
        ?.getObjectStates()
        .find((s) => s.id === objectId);
      const spec = DEFAULT_SCENE_OBJECTS.find((o) => o.id === objectId);
      const pos = runtimeObj?.position ?? spec?.initialPosition;
      if (!pos) return;

      setControlMode('ik');
      setSelectedNodeId('TCP');
      const downQuat = computeForwardKinematics(
        HOME_JOINT_ANGLES_DEG,
        AXIS6_ROBOT_CONFIG,
      ).tcpQuaternion;
      const hoverY = spec?.kind === 'container' ? 0.16 : pos[1] + 0.12;
      solveAndApplyIk([pos[0], hoverY, pos[2]], downQuat);
    },
    [solveAndApplyIk],
  );

  const handleResetLab = useCallback(() => {
    setIsPlayingDemo(false);
    playbackTimeRef.current = 0;
    setPlaybackTimeMs(0);
    bottleFlipArmedRef.current = false;
    setBottleUpright(true);

    if (physicsRef.current) {
      physicsRef.current.resetObjects();
      setObjectStates(physicsRef.current.getObjectStates());
    }
    const resetGripper: GripperState = {
      widthMm: GRIPPER_DEFAULT_WIDTH_MM,
      targetWidthMm: GRIPPER_DEFAULT_WIDTH_MM,
      isGrasping: false,
      graspedObjectId: null,
    };
    gripperRef.current = resetGripper;
    setGripper(resetGripper);
    applyJointAngles(HOME_JOINT_ANGLES_DEG, true);
  }, [applyJointAngles]);

  // Recording actions
  const recordSnapshotFrame = useCallback((action: ActionType) => {
    const now = performance.now();
    const timestampMs = Math.max(0, now - recordingStartMsRef.current);
    const objects = physicsRef.current
      ? physicsRef.current.getObjectSnapshots()
      : [];
    const g = gripperRef.current;
    const frame = createDemoFrame({
      timestampMs,
      jointAnglesDeg: jointAnglesRef.current,
      gripperWidthMm: g.widthMm,
      isGrasping: g.isGrasping,
      graspedObjectId: g.graspedObjectId,
      objects,
      action,
    });
    recordingFramesRef.current.push(frame);
    lastSampledRef.current = {
      timeMs: timestampMs,
      angles: [...jointAnglesRef.current] as JointTuple,
      width: g.widthMm,
      grasping: g.isGrasping,
    };
  }, []);

  const handleToggleRecord = useCallback(() => {
    if (!isRecording) {
      setIsPlayingDemo(false);
      recordingFramesRef.current = [];
      recordingStartMsRef.current = performance.now();
      lastSampledRef.current = null;
      recordSnapshotFrame('Home');
      setIsRecording(true);
    } else {
      recordSnapshotFrame(
        gripperRef.current.isGrasping ? 'Pick Object' : 'Move Linear',
      );
      setIsRecording(false);

      const newDemo = updateDemoTiming({
        id: `demo_${Date.now()}`,
        name: demoNameInput.trim() || `${taskType} Demo`,
        taskType,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        durationMs: 0,
        frames: recordingFramesRef.current,
      });

      setDemonstrations((prev) => [newDemo, ...prev]);
      setActiveDemoId(newDemo.id);
      setSelectedFrameIndex(0);
      playbackTimeRef.current = 0;
      setPlaybackTimeMs(0);
    }
  }, [isRecording, demoNameInput, taskType, recordSnapshotFrame]);

  const handleCaptureKeyframe = useCallback(() => {
    if (!isRecording) return;
    const g = gripperRef.current;
    const action: ActionType = g.isGrasping
      ? 'Move Object'
      : (taskType as ActionType);
    recordSnapshotFrame(action);
  }, [isRecording, taskType, recordSnapshotFrame]);

  // Playback actions
  const activeDemo = useMemo(
    () => demonstrations.find((d) => d.id === activeDemoId) ?? null,
    [demonstrations, activeDemoId],
  );

  const applyDemoAtTime = useCallback(
    (demo: Demonstration, timeMs: number, dtSec = 0.016) => {
      const interp = interpolateDemoAtTime(demo, timeMs);
      if (!interp) return;

      jointAnglesRef.current = interp.jointAnglesDeg;
      setJointAnglesDeg(interp.jointAnglesDeg);

      const fk = computeForwardKinematics(
        interp.jointAnglesDeg,
        AXIS6_ROBOT_CONFIG,
      );
      setIkTargetPos(fk.tcpPosition);
      setIkTargetQuat(fk.tcpQuaternion);

      let isGrasping = interp.isGrasping;
      let graspedObjectId = interp.graspedObjectId;
      let effectiveWidth = interp.gripperWidthMm;

      if (physicsRef.current) {
        const graspRes = physicsRef.current.evaluateGrasp(
          fk.tcpPosition,
          fk.tcpQuaternion,
          interp.gripperWidthMm,
          interp.gripperWidthMm,
          interp.isGrasping ? interp.graspedObjectId : null,
        );
        isGrasping = graspRes.isGrasping;
        graspedObjectId = graspRes.graspedObjectId;
        effectiveWidth = graspRes.effectiveWidthMm;
        physicsRef.current.updateGripperPose(
          fk.tcpPosition,
          fk.tcpQuaternion,
          effectiveWidth,
          dtSec,
        );
      }

      const nextGripper: GripperState = {
        widthMm: effectiveWidth,
        targetWidthMm: interp.gripperWidthMm,
        isGrasping,
        graspedObjectId,
      };
      gripperRef.current = nextGripper;
      setGripper(nextGripper);
    },
    [],
  );

  const handlePlayDemo = useCallback(() => {
    if (!activeDemo || isRecording) return;
    if (playbackTimeRef.current >= activeDemo.durationMs - 20) {
      if (physicsRef.current) physicsRef.current.resetObjects();
      bottleFlipArmedRef.current = false;
      setBottleUpright(true);
      playbackTimeRef.current = 0;
      setPlaybackTimeMs(0);
    } else if (playbackTimeRef.current === 0 && physicsRef.current) {
      physicsRef.current.resetObjects();
      bottleFlipArmedRef.current = false;
      setBottleUpright(true);
    }
    setIsPlayingDemo(true);
  }, [activeDemo, isRecording]);

  const handlePauseDemo = useCallback(() => {
    setIsPlayingDemo(false);
  }, []);

  const handleStopDemo = useCallback(() => {
    setIsPlayingDemo(false);
    playbackTimeRef.current = 0;
    setPlaybackTimeMs(0);
    bottleFlipArmedRef.current = false;
    setBottleUpright(true);
    if (physicsRef.current) {
      physicsRef.current.resetObjects();
      setObjectStates(physicsRef.current.getObjectStates());
    }
    if (activeDemo) {
      applyDemoAtTime(activeDemo, 0);
    }
  }, [activeDemo, applyDemoAtTime]);

  const handleScrubTime = useCallback(
    (timeMs: number) => {
      if (!activeDemo || isRecording) return;
      setIsPlayingDemo(false);
      playbackTimeRef.current = timeMs;
      setPlaybackTimeMs(timeMs);
      applyDemoAtTime(activeDemo, timeMs);
    },
    [activeDemo, isRecording, applyDemoAtTime],
  );

  // Frame loop step (called from R3F SimulationLoopDriver)
  const uiSyncTimerRef = useRef(0);

  const handleStepFrame = useCallback(
    (dt: number) => {
      const physics = physicsRef.current;
      if (!physics) return;

      // 1. Playback advancement
      if (isPlayingDemo && activeDemo) {
        let nextTime = playbackTimeRef.current + dt * 1000 * playbackSpeed;
        if (nextTime >= activeDemo.durationMs) {
          if (repeatPlayback) {
            physics.resetObjects();
            bottleFlipArmedRef.current = false;
            nextTime = 0;
          } else {
            nextTime = activeDemo.durationMs;
            setIsPlayingDemo(false);
          }
        }
        playbackTimeRef.current = nextTime;
        setPlaybackTimeMs(nextTime);
        applyDemoAtTime(activeDemo, nextTime, dt * playbackSpeed);
      } else {
        // 2. Smooth gripper servo + collision-aware grasp evaluation
        const g = gripperRef.current;
        const maxDelta = 150 * dt;
        const diff = g.targetWidthMm - g.widthMm;
        const steppedWidth =
          Math.abs(diff) <= maxDelta
            ? g.targetWidthMm
            : g.widthMm + Math.sign(diff) * maxDelta;

        const fk = computeForwardKinematics(
          jointAnglesRef.current,
          AXIS6_ROBOT_CONFIG,
        );
        const graspRes = physics.evaluateGrasp(
          fk.tcpPosition,
          fk.tcpQuaternion,
          steppedWidth,
          g.targetWidthMm,
        );
        physics.updateGripperPose(
          fk.tcpPosition,
          fk.tcpQuaternion,
          graspRes.effectiveWidthMm,
          dt,
        );

        if (
          Math.abs(graspRes.effectiveWidthMm - g.widthMm) > 0.25 ||
          graspRes.isGrasping !== g.isGrasping ||
          graspRes.graspedObjectId !== g.graspedObjectId
        ) {
          const updated: GripperState = {
            ...g,
            widthMm: graspRes.effectiveWidthMm,
            isGrasping: graspRes.isGrasping,
            graspedObjectId: graspRes.graspedObjectId,
          };
          gripperRef.current = updated;
          setGripper(updated);
        }
      }

      // 3. Step Rapier rigid body physics (sub-stepped for stability on slower frames)
      let remaining = dt;
      while (remaining > 0.0001) {
        const subDt = Math.min(remaining, 0.033);
        physics.step(subDt);
        remaining -= subDt;
      }

      // 4. Track bottle flip airborne launch and upright landing
      simTimeRef.current += dt;
      const bottle = physics.getBottleTelemetry();
      const uprightNow = bottle
        ? isBottleUprightOnBench(bottle.position, bottle.quaternion, bottle.linearSpeed)
        : true;
      if (bottle) {
        if (
          (!bottle.isGrasped && bottle.position[1] > 0.115) ||
          bottle.angularSpeed > 2.2
        ) {
          bottleFlipArmedRef.current = true;
        } else if (bottleFlipArmedRef.current && uprightNow) {
          bottleFlipArmedRef.current = false;
          setBottleFlipCount((c) => c + 1);
        }
      }

      // 5. Auto-sample recording frames when significant motion/action occurs
      if (isRecording) {
        const elapsed = Math.max(0, performance.now() - recordingStartMsRef.current);
        const last = lastSampledRef.current;
        const curAngles = jointAnglesRef.current;
        const curG = gripperRef.current;

        if (!last || elapsed - last.timeMs >= 140) {
          const maxAngleDelta = last
            ? Math.max(...curAngles.map((a, i) => Math.abs(a - last.angles[i])))
            : 999;
          const widthDelta = last ? Math.abs(curG.widthMm - last.width) : 999;
          const graspChanged = last ? curG.isGrasping !== last.grasping : true;

          if (graspChanged || widthDelta > 4 || maxAngleDelta > 3.5) {
            let action: ActionType =
              controlMode === 'ik' ? 'Move Linear' : 'Move Joint';
            if (graspChanged) {
              action = curG.isGrasping ? 'Close Gripper' : 'Open Gripper';
            } else if (curG.isGrasping) {
              action = 'Move Object';
            }
            recordSnapshotFrame(action);
          }
        }
      }

      // 6. Throttled telemetry & sidebar state sync (~12Hz)
      uiSyncTimerRef.current += dt;
      if (uiSyncTimerRef.current >= 0.08) {
        const sampleDt = uiSyncTimerRef.current;
        uiSyncTimerRef.current = 0;

        const graspedSpec = gripperRef.current.graspedObjectId
          ? DEFAULT_SCENE_OBJECTS.find(
              (o) => o.id === gripperRef.current.graspedObjectId,
            )
          : null;

        const sample = computeRobotTelemetry({
          timeSec: simTimeRef.current,
          jointAnglesDeg: jointAnglesRef.current,
          prevJointAnglesDeg: prevJointAnglesRef.current,
          prevTcpPosition: prevTcpPosRef.current,
          dtSec: sampleDt,
          graspedMassKg: graspedSpec?.mass ?? 0,
          bottlePosition: bottle?.position,
          bottleQuaternion: bottle?.quaternion,
        });
        prevJointAnglesRef.current = [...jointAnglesRef.current] as JointTuple;
        prevTcpPosRef.current = sample.tcpPosition;

        const nextBuf = [...telemetryBufferRef.current, sample];
        if (nextBuf.length > 90) {
          nextBuf.splice(0, nextBuf.length - 90);
        }
        telemetryBufferRef.current = nextBuf;
        setTelemetrySamples(nextBuf);
        setLatestTelemetry(sample);
        setBottleUpright(uprightNow);
        setObjectStates(physics.getObjectStates());
      }
    },
    [
      isPlayingDemo,
      activeDemo,
      playbackSpeed,
      repeatPlayback,
      applyDemoAtTime,
      isRecording,
      controlMode,
      recordSnapshotFrame,
    ],
  );

  // Demonstration list operations
  const handleSelectDemo = useCallback(
    (id: string) => {
      setIsPlayingDemo(false);
      setActiveDemoId(id);
      setSelectedFrameIndex(0);
      playbackTimeRef.current = 0;
      setPlaybackTimeMs(0);
      bottleFlipArmedRef.current = false;
      setBottleUpright(true);
      const found = demonstrations.find((d) => d.id === id);
      if (found) {
        if (physicsRef.current) physicsRef.current.resetObjects();
        applyDemoAtTime(found, 0);
      }
    },
    [demonstrations, applyDemoAtTime],
  );

  const handleDeleteDemo = useCallback(
    (id: string) => {
      setDemonstrations((prev) => {
        const next = prev.filter((d) => d.id !== id);
        if (activeDemoId === id) {
          setIsPlayingDemo(false);
          setActiveDemoId(next[0]?.id ?? null);
          setSelectedFrameIndex(null);
        }
        return next;
      });
    },
    [activeDemoId],
  );

  const handleDuplicateDemo = useCallback(
    (id: string) => {
      const src = demonstrations.find((d) => d.id === id);
      if (!src) return;
      const copy: Demonstration = {
        ...src,
        id: `demo_${Date.now()}`,
        name: `${src.name} (Copy)`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        frames: src.frames.map((f) => ({
          ...f,
          id: `${f.id}_c`,
          jointAnglesDeg: [...f.jointAnglesDeg] as JointTuple,
          tcpPosition: [...f.tcpPosition] as Vec3Tuple,
          tcpEulerDeg: [...f.tcpEulerDeg] as Vec3Tuple,
          tcpQuaternion: [...f.tcpQuaternion] as QuatTuple,
          objects: f.objects.map((o) => ({
            id: o.id,
            position: [...o.position] as Vec3Tuple,
            quaternion: [...o.quaternion] as QuatTuple,
          })),
        })),
      };
      setDemonstrations((prev) => [copy, ...prev]);
      setActiveDemoId(copy.id);
    },
    [demonstrations],
  );

  const handleUpdateFrameAction = useCallback(
    (frameIndex: number, action: ActionType) => {
      if (!activeDemoId) return;
      setDemonstrations((prev) =>
        prev.map((d) => {
          if (d.id !== activeDemoId) return d;
          const frames = d.frames.map((f, idx) =>
            idx === frameIndex ? { ...f, action } : f,
          );
          return { ...d, frames, updatedAt: new Date().toISOString() };
        }),
      );
    },
    [activeDemoId],
  );

  const handleDeleteFrame = useCallback(
    (frameIndex: number) => {
      if (!activeDemoId) return;
      setDemonstrations((prev) =>
        prev.map((d) => {
          if (d.id !== activeDemoId || d.frames.length <= 1) return d;
          const remaining = d.frames.filter((_, idx) => idx !== frameIndex);
          return updateDemoTiming({ ...d, frames: remaining });
        }),
      );
      setSelectedFrameIndex((prev) =>
        prev !== null ? Math.max(0, prev - 1) : null,
      );
    },
    [activeDemoId],
  );

  // Export handlers
  const handleExportJSON = useCallback(() => {
    if (!activeDemo) return;
    const slug = activeDemo.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    downloadTextFile(
      `${slug}_dataset.json`,
      serializeDemoToJSON(activeDemo),
      'application/json',
    );
  }, [activeDemo]);

  const handleExportCSV = useCallback(() => {
    if (!activeDemo) return;
    const slug = activeDemo.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    downloadTextFile(
      `${slug}_dataset.csv`,
      serializeDemoToCSV(activeDemo),
      'text/csv;charset=utf-8',
    );
  }, [activeDemo]);

  // Hardware Bridge handlers
  const handleConnectBridge = useCallback(
    async (url: string, protocol: 'ros2-rosbridge' | 'websocket-json') => {
      setBridgeError(null);
      setBridgeProtocol(protocol);
      setBridgeState('connecting');
      const bridge = new WebSocketRobotBridge(protocol);
      bridgeRef.current = bridge;
      try {
        await bridge.connect(url);
        setBridgeState('connected');
      } catch (err) {
        setBridgeState('error');
        setBridgeError(
          err instanceof Error
            ? err.message
            : 'Connection failed. Ensure rosbridge_server is running.',
        );
      }
    },
    [],
  );

  const handleDisconnectBridge = useCallback(() => {
    bridgeRef.current?.disconnect();
    setBridgeState('disconnected');
    setBridgeError(null);
  }, []);

  const graspedObjectName = useMemo(() => {
    if (!gripper.graspedObjectId) return null;
    return (
      DEFAULT_SCENE_OBJECTS.find((o) => o.id === gripper.graspedObjectId)
        ?.name ?? gripper.graspedObjectId
    );
  }, [gripper.graspedObjectId]);

  const handleAuthSuccess = useCallback(
    (nextSession: UserSession, nextProfile: UserProfile) => {
      setSession(nextSession);
      setProfile(nextProfile);
      setControlMode(nextProfile.defaultControlMode);
      setShowJointAxes(nextProfile.showJointAxesDefault);
    },
    [],
  );

  const handleProfileSaved = useCallback((updated: UserProfile) => {
    setProfile(updated);
    setControlMode(updated.defaultControlMode);
    setShowJointAxes(updated.showJointAxesDefault);
  }, []);

  const handleSignOut = useCallback(() => {
    void signOutUser();
    setSession(null);
    setProfile(null);
  }, []);

  const simulatorWorkbench = (
    <div
      className="flex h-[780px] w-full flex-col overflow-hidden rounded-lg border border-white/10 bg-[#0d1015] text-[#e6eaf0] shadow-2xl"
      data-sim-ready={physicsReady ? 'true' : 'false'}
      data-control-mode={controlMode}
      data-grasping={gripper.isGrasping ? 'true' : 'false'}
      data-bottle-flips={bottleFlipCount}
    >
      <TopToolbar
        simulationRunning={simulationRunning}
        isRecording={isRecording}
        isPlayingDemo={isPlayingDemo}
        hasActiveDemo={Boolean(activeDemo)}
        bridgeState={bridgeState}
        powerWatts={latestTelemetry.totalPowerWatts}
        busCurrentAmps={latestTelemetry.busCurrentAmps}
        peakLoadPct={latestTelemetry.peakJointLoadPct}
        profile={profile}
        onToggleSimulation={() => setSimulationRunning((v) => !v)}
        onResetLab={handleResetLab}
        onToggleRecord={handleToggleRecord}
        onTogglePlayDemo={() =>
          isPlayingDemo ? handlePauseDemo() : handlePlayDemo()
        }
        onExportJSON={handleExportJSON}
        onExportCSV={handleExportCSV}
        onOpenBridgeModal={() => setBridgeModalOpen(true)}
        onOpenFeedbackModal={() => setFeedbackModalOpen(true)}
        onOpenProfileOrAuth={() =>
          profile ? setProfileModalOpen(true) : setAuthModalOpen(true)
        }
      />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <LeftSidebar
          selectedNodeId={selectedNodeId}
          objectStates={objectStates}
          showJointAxes={showJointAxes}
          showWorkspace={showWorkspace}
          showGrid={showGrid}
          cameraPreset={cameraPreset}
          onSelectNode={setSelectedNodeId}
          onSelectEndEffector={() => handleChangeControlMode('ik')}
          onApproachObject={handleApproachObject}
          onToggleJointAxes={() => setShowJointAxes((v) => !v)}
          onToggleWorkspace={() => setShowWorkspace((v) => !v)}
          onToggleGrid={() => setShowGrid((v) => !v)}
          onSelectCameraPreset={(preset) => {
            setCameraPreset(preset);
            setPresetTrigger((n) => n + 1);
          }}
        />

        <main className="relative flex-1 min-w-0 h-full">
          <RoboticsViewport
            physicsWorld={physicsRef.current}
            jointAnglesDeg={jointAnglesDeg}
            gripperWidthMm={gripper.widthMm}
            isGrasping={gripper.isGrasping}
            controlMode={controlMode}
            gizmoMode={gizmoMode}
            ikTargetPosition={ikTargetPos}
            ikTargetQuaternion={ikTargetQuat}
            selectedNodeId={selectedNodeId}
            showJointAxes={showJointAxes}
            showWorkspace={showWorkspace}
            showGrid={showGrid}
            simulationRunning={simulationRunning}
            cameraPreset={cameraPreset}
            presetTrigger={presetTrigger}
            onStepFrame={handleStepFrame}
            onIkTargetDrag={solveAndApplyIk}
            onSelectEndEffector={() => handleChangeControlMode('ik')}
            onSelectNode={setSelectedNodeId}
          />
        </main>

        <RightSidebar
          controlMode={controlMode}
          gizmoMode={gizmoMode}
          jointAnglesDeg={jointAnglesDeg}
          jointTelemetry={latestTelemetry.joints}
          actualTcpPosition={actualFk.tcpPosition}
          actualTcpEulerDeg={actualEulerDeg}
          ikTargetPosition={ikTargetPos}
          ikTargetEulerDeg={ikTargetEulerDeg}
          ikPositionErrorMm={ikErrorMm}
          ikConverged={ikConverged}
          gripper={gripper}
          graspedObjectName={graspedObjectName}
          onChangeControlMode={handleChangeControlMode}
          onChangeGizmoMode={setGizmoMode}
          onChangeJointAngle={handleChangeJointAngle}
          onHomeArm={handleHomeArm}
          onZeroArm={handleZeroArm}
          onChangeIkTargetPos={handleChangeIkTargetPos}
          onChangeIkTargetEuler={handleChangeIkTargetEuler}
          onChangeGripperWidth={handleChangeGripperWidth}
          onOpenGripper={handleOpenGripper}
          onCloseGripper={handleCloseGripper}
        />
      </div>

      <BottomTimelinePanel
        demonstrations={demonstrations}
        activeDemoId={activeDemoId}
        isRecording={isRecording}
        isPlaying={isPlayingDemo}
        repeatPlayback={repeatPlayback}
        playbackSpeed={playbackSpeed}
        playbackTimeMs={playbackTimeMs}
        taskType={taskType}
        demoNameInput={demoNameInput}
        selectedFrameIndex={selectedFrameIndex}
        telemetrySamples={telemetrySamples}
        bottleFlipCount={bottleFlipCount}
        bottleUpright={bottleUpright}
        onChangeTaskType={setTaskType}
        onChangeDemoNameInput={setDemoNameInput}
        onSelectDemo={handleSelectDemo}
        onDeleteDemo={handleDeleteDemo}
        onDuplicateDemo={handleDuplicateDemo}
        onToggleRecord={handleToggleRecord}
        onCaptureKeyframe={handleCaptureKeyframe}
        onPlay={handlePlayDemo}
        onPause={handlePauseDemo}
        onStop={handleStopDemo}
        onToggleRepeat={() => setRepeatPlayback((v) => !v)}
        onChangeSpeed={setPlaybackSpeed}
        onScrubTime={handleScrubTime}
        onSelectFrame={setSelectedFrameIndex}
        onUpdateFrameAction={handleUpdateFrameAction}
        onDeleteFrame={handleDeleteFrame}
      />
    </div>
  );

  return (
    <>
      <LandingPage
        session={session}
        profile={profile}
        simulatorSection={simulatorWorkbench}
        onAuthSuccess={handleAuthSuccess}
        onSignOut={handleSignOut}
        onOpenProfileModal={() => setProfileModalOpen(true)}
        onOpenFeedbackModal={() => setFeedbackModalOpen(true)}
      />

      <HardwareBridgeModal
        open={bridgeModalOpen}
        bridgeState={bridgeState}
        protocol={bridgeProtocol}
        errorMessage={bridgeError}
        onClose={() => setBridgeModalOpen(false)}
        onConnect={handleConnectBridge}
        onDisconnect={handleDisconnectBridge}
      />

      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onAuthSuccess={handleAuthSuccess}
      />

      <ProfileModal
        open={profileModalOpen}
        profile={profile}
        onClose={() => setProfileModalOpen(false)}
        onProfileSaved={handleProfileSaved}
        onSignOut={handleSignOut}
      />

      <FeedbackModal
        open={feedbackModalOpen}
        userId={session?.userId ?? null}
        userEmail={session?.email ?? ''}
        appView="landing"
        onClose={() => setFeedbackModalOpen(false)}
      />
    </>
  );
}
