import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { TransformControls as ThreeTransformControls } from 'three/addons/controls/TransformControls.js';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { RoboticsPhysicsWorld } from '../physics/rapierWorld';
import type {
  ControlMode,
  GizmoMode,
  JointTuple,
  QuatTuple,
  Vec3Tuple,
} from '../robotics/types';
import { LabWorkbench, InteractivePhysicsObjects, StudioEnvironmentRig } from './LabEnvironment';
import { RobotArmMesh } from './RobotArmMesh';
import { isSoftwareGl } from './materials';

export type CameraPreset = 'perspective' | 'top' | 'front' | 'side';

const CAMERA_PRESETS: Record<
  CameraPreset,
  { pos: Vec3Tuple; target: Vec3Tuple }
> = {
  perspective: { pos: [1.05, 0.78, 1.05], target: [0.28, 0.22, -0.04] },
  top: { pos: [0.35, 1.45, 0.02], target: [0.35, 0.05, -0.04] },
  front: { pos: [1.35, 0.38, 0.0], target: [0.25, 0.25, 0.0] },
  side: { pos: [0.32, 0.42, 1.35], target: [0.32, 0.24, 0.0] },
};

interface SimulationLoopDriverProps {
  onStepFrame: (dt: number) => void;
  simulationRunning: boolean;
}

/**
 * Drives physics and playback stepping inside R3F.
 * On software WebGL (SwiftShader), uses a paced ~80ms timer with invalidate()
 * so headless Chromium never starves the main thread.
 */
const SimulationLoopDriver: React.FC<SimulationLoopDriverProps> = ({
  onStepFrame,
  simulationRunning,
}) => {
  const { invalidate, gl } = useThree();
  const stepRef = useRef(onStepFrame);
  stepRef.current = onStepFrame;

  useFrame((_, delta) => {
    if (!isSoftwareGl && simulationRunning) {
      stepRef.current(Math.min(delta, 0.05));
    }
  });

  useEffect(() => {
    if (!isSoftwareGl) return;
    let alive = true;
    let timerId = 0;

    const scheduleNext = () => {
      if (!alive) return;
      const context = gl.getContext() as WebGL2RenderingContext | null;
      if (context && typeof context.fenceSync === 'function') {
        const sync = context.fenceSync(context.SYNC_GPU_COMMANDS_COMPLETE, 0);
        context.flush();
        const poll = () => {
          if (!alive) {
            if (sync) context.deleteSync(sync);
            return;
          }
          const status = sync
            ? context.getSyncParameter(sync, context.SYNC_STATUS)
            : context.SIGNALED;
          if (status === context.UNSIGNALED) {
            timerId = window.setTimeout(poll, 10);
          } else {
            if (sync) context.deleteSync(sync);
            timerId = window.setTimeout(() => {
              if (!alive) return;
              if (simulationRunning) {
                stepRef.current(0.032);
              }
              invalidate();
              scheduleNext();
            }, 85);
          }
        };
        timerId = window.setTimeout(poll, 10);
      } else {
        timerId = window.setTimeout(() => {
          if (!alive) return;
          if (simulationRunning) {
            stepRef.current(0.032);
          }
          invalidate();
          scheduleNext();
        }, 90);
      }
    };

    invalidate();
    scheduleNext();

    return () => {
      alive = false;
      window.clearTimeout(timerId);
    };
  }, [gl, invalidate, simulationRunning]);

  return null;
};

interface CameraRigProps {
  cameraPreset: CameraPreset;
  presetTrigger: number;
  orbitEnabled: boolean;
  zoomEnabled: boolean;
  orbitRef: React.RefObject<OrbitControlsImpl | null>;
}

const CameraRig: React.FC<CameraRigProps> = ({
  cameraPreset,
  presetTrigger,
  orbitEnabled,
  zoomEnabled,
  orbitRef,
}) => {
  const { camera, invalidate } = useThree();
  const desiredPos = useRef(new THREE.Vector3(...CAMERA_PRESETS.perspective.pos));
  const desiredTarget = useRef(new THREE.Vector3(...CAMERA_PRESETS.perspective.target));
  const animating = useRef(false);

  useEffect(() => {
    const preset = CAMERA_PRESETS[cameraPreset];
    desiredPos.current.set(...preset.pos);
    desiredTarget.current.set(...preset.target);
    animating.current = true;
    invalidate();
  }, [cameraPreset, presetTrigger, invalidate]);

  useFrame((_, delta) => {
    if (!animating.current || !orbitRef.current) return;
    const dt = Math.min(delta, 0.05);
    const alpha = 1 - Math.exp(-8 * dt);
    camera.position.lerp(desiredPos.current, alpha);
    orbitRef.current.target.lerp(desiredTarget.current, alpha);
    orbitRef.current.update();

    if (
      camera.position.distanceTo(desiredPos.current) < 0.008 &&
      orbitRef.current.target.distanceTo(desiredTarget.current) < 0.008
    ) {
      camera.position.copy(desiredPos.current);
      orbitRef.current.target.copy(desiredTarget.current);
      orbitRef.current.update();
      animating.current = false;
    } else if (isSoftwareGl) {
      invalidate();
    }
  });

  return (
    <OrbitControls
      ref={orbitRef}
      makeDefault
      enabled={orbitEnabled}
      enableZoom={zoomEnabled}
      enableDamping={!isSoftwareGl}
      dampingFactor={0.08}
      minDistance={0.35}
      maxDistance={4.0}
      maxPolarAngle={Math.PI * 0.49}
      target={CAMERA_PRESETS.perspective.target}
      onStart={() => {
        animating.current = false;
      }}
      onChange={() => {
        if (isSoftwareGl) invalidate();
      }}
    />
  );
};

interface IkGizmoControllerProps {
  enabled: boolean;
  gizmoMode: GizmoMode;
  targetPosition: Vec3Tuple;
  targetQuaternion: QuatTuple;
  onTargetDrag: (pos: Vec3Tuple, quat: QuatTuple) => void;
  onDraggingChange: (dragging: boolean) => void;
}

const IkGizmoController: React.FC<IkGizmoControllerProps> = ({
  enabled,
  gizmoMode,
  targetPosition,
  targetQuaternion,
  onTargetDrag,
  onDraggingChange,
}) => {
  const [targetObj, setTargetObj] = useState<THREE.Group | null>(null);
  const targetMarkerRef = useRef<THREE.Group | null>(null);
  const isDragging = useRef(false);
  const { camera, gl, scene, invalidate } = useThree();

  const onTargetDragRef = useRef(onTargetDrag);
  onTargetDragRef.current = onTargetDrag;
  const onDraggingChangeRef = useRef(onDraggingChange);
  onDraggingChangeRef.current = onDraggingChange;

  const attachRef = useCallback((node: THREE.Group | null) => {
    targetMarkerRef.current = node;
    setTargetObj(node);
  }, []);

  // Mount native Three.js TransformControls and add its helper to the scene
  const controlsRef = useRef<ThreeTransformControls | null>(null);

  useEffect(() => {
    if (!enabled || !targetObj) return;
    const controls = new ThreeTransformControls(camera, gl.domElement);
    controls.setSize(0.85);
    controls.setMode(gizmoMode);
    controls.attach(targetObj);
    const helper = controls.getHelper();
    scene.add(helper);
    controlsRef.current = controls;

    const handleDraggingChanged = (event: { value: unknown }) => {
      const dragging = Boolean(event.value);
      isDragging.current = dragging;
      onDraggingChangeRef.current(dragging);
    };

    const handleObjectChange = () => {
      if (!targetMarkerRef.current) return;
      const p = targetMarkerRef.current.position;
      const q = targetMarkerRef.current.quaternion;
      onTargetDragRef.current([p.x, p.y, p.z], [q.x, q.y, q.z, q.w]);
      if (isSoftwareGl) invalidate();
    };

    controls.addEventListener('dragging-changed', handleDraggingChanged);
    controls.addEventListener('objectChange', handleObjectChange);
    if (isSoftwareGl) invalidate();

    return () => {
      controls.removeEventListener('dragging-changed', handleDraggingChanged);
      controls.removeEventListener('objectChange', handleObjectChange);
      controls.detach();
      scene.remove(helper);
      controls.dispose();
      controlsRef.current = null;
    };
  }, [enabled, targetObj, camera, gl, scene, invalidate]);

  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.setMode(gizmoMode);
      if (isSoftwareGl) invalidate();
    }
  }, [gizmoMode, invalidate]);

  // Keep gizmo anchor synced with IK target when not actively dragging
  useEffect(() => {
    if (!targetMarkerRef.current || isDragging.current) return;
    targetMarkerRef.current.position.set(...targetPosition);
    targetMarkerRef.current.quaternion.set(...targetQuaternion);
    if (isSoftwareGl) invalidate();
  }, [targetPosition, targetQuaternion, invalidate]);

  if (!enabled) return null;

  return (
    <group
      ref={attachRef}
      position={targetPosition}
      quaternion={targetQuaternion}
    >
      <mesh>
        <sphereGeometry args={[0.014, 14, 14]} />
        <meshBasicMaterial color="#f59e0b" transparent opacity={0.85} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.024, 0.03, 24]} />
        <meshBasicMaterial color="#f59e0b" side={THREE.DoubleSide} transparent opacity={0.75} />
      </mesh>
    </group>
  );
};

export interface RoboticsViewportProps {
  physicsWorld: RoboticsPhysicsWorld | null;
  jointAnglesDeg: JointTuple;
  gripperWidthMm: number;
  isGrasping: boolean;
  controlMode: ControlMode;
  gizmoMode: GizmoMode;
  ikTargetPosition: Vec3Tuple;
  ikTargetQuaternion: QuatTuple;
  selectedNodeId: string | null;
  showJointAxes: boolean;
  showWorkspace: boolean;
  showGrid: boolean;
  simulationRunning: boolean;
  cameraPreset: CameraPreset;
  presetTrigger: number;
  onStepFrame: (dt: number) => void;
  onIkTargetDrag: (pos: Vec3Tuple, quat: QuatTuple) => void;
  onSelectEndEffector: () => void;
  onSelectNode: (nodeId: string) => void;
}

export const RoboticsViewport: React.FC<RoboticsViewportProps> = ({
  physicsWorld,
  jointAnglesDeg,
  gripperWidthMm,
  isGrasping,
  controlMode,
  gizmoMode,
  ikTargetPosition,
  ikTargetQuaternion,
  selectedNodeId,
  showJointAxes,
  showWorkspace,
  showGrid,
  simulationRunning,
  cameraPreset,
  presetTrigger,
  onStepFrame,
  onIkTargetDrag,
  onSelectEndEffector,
  onSelectNode,
}) => {
  const orbitRef = useRef<OrbitControlsImpl | null>(null);
  const [gizmoDragging, setGizmoDragging] = useState(false);
  const [viewportWheelActive, setViewportWheelActive] = useState(false);
  const [contextLost, setContextLost] = useState(false);

  const handleCreated = useCallback(
    ({ gl }: { gl: THREE.WebGLRenderer }) => {
      gl.outputColorSpace = THREE.SRGBColorSpace;
      gl.toneMapping = THREE.ACESFilmicToneMapping;
      gl.toneMappingExposure = 1.1;

      const canvas = gl.domElement;
      canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        setContextLost(true);
      });
      canvas.addEventListener('webglcontextrestored', () => {
        setContextLost(false);
      });
    },
    [],
  );

  if (contextLost) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#0d1015] text-sm text-slate-300">
        WebGL context interrupted. Reloading graphics context...
      </div>
    );
  }

  return (
    <div
      className="relative h-full w-full select-none bg-[#0d1015]"
      data-testid="robotics-viewport"
      onPointerDown={() => setViewportWheelActive(true)}
      onPointerLeave={() => setViewportWheelActive(false)}
    >
      <Canvas
        dpr={isSoftwareGl ? 1 : [1, 2]}
        shadows={!isSoftwareGl}
        frameloop={isSoftwareGl ? 'demand' : 'always'}
        camera={{
          fov: 44,
          near: 0.04,
          far: 30,
          position: CAMERA_PRESETS.perspective.pos,
        }}
        gl={{
          antialias: !isSoftwareGl,
          powerPreference: 'high-performance',
          preserveDrawingBuffer: true,
        }}
        onCreated={handleCreated}
      >
        <StudioEnvironmentRig />
        <SimulationLoopDriver
          onStepFrame={onStepFrame}
          simulationRunning={simulationRunning}
        />
        <CameraRig
          cameraPreset={cameraPreset}
          presetTrigger={presetTrigger}
          orbitEnabled={!gizmoDragging}
          zoomEnabled={viewportWheelActive}
          orbitRef={orbitRef}
        />

        <LabWorkbench showGrid={showGrid} />

        <RobotArmMesh
          jointAnglesDeg={jointAnglesDeg}
          gripperWidthMm={gripperWidthMm}
          isGrasping={isGrasping}
          selectedNodeId={selectedNodeId}
          showJointAxes={showJointAxes}
          showWorkspace={showWorkspace}
          onSelectEndEffector={onSelectEndEffector}
          onSelectJoint={onSelectNode}
        />

        <InteractivePhysicsObjects
          physicsWorld={physicsWorld}
          selectedObjectId={selectedNodeId}
          onSelectObject={onSelectNode}
        />

        <IkGizmoController
          enabled={controlMode === 'ik'}
          gizmoMode={gizmoMode}
          targetPosition={ikTargetPosition}
          targetQuaternion={ikTargetQuaternion}
          onTargetDrag={onIkTargetDrag}
          onDraggingChange={setGizmoDragging}
        />
      </Canvas>
    </div>
  );
};
