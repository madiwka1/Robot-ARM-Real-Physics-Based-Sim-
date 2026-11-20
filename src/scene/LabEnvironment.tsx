import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { RoboticsPhysicsWorld } from '../physics/rapierWorld';
import { DEFAULT_SCENE_OBJECTS } from '../robotics/robotModel';
import type { SceneObjectSpec } from '../robotics/types';
import {
  createContactShadowTexture,
  createWorkbenchTexture,
  isSoftwareGl,
  ROBOT_MATERIALS,
} from './materials';

export const StudioEnvironmentRig: React.FC = () => {
  const { gl, scene } = useThree();

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const envTarget = pmrem.fromScene(room, 0.04);
    scene.environment = envTarget.texture;
    room.dispose();
    pmrem.dispose();

    return () => {
      envTarget.dispose();
    };
  }, [gl, scene]);

  return (
    <>
      <color attach="background" args={['#0d1015']} />
      <fog attach="fog" args={['#0d1015', 3.5, 9.5]} />

      {/* Warm Key Light with tight shadow frustum */}
      <directionalLight
        position={[1.6, 2.4, 1.5]}
        intensity={2.2}
        color="#fff4e4"
        castShadow={!isSoftwareGl}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-near={0.4}
        shadow-camera-far={6}
        shadow-camera-left={-1.15}
        shadow-camera-right={1.15}
        shadow-camera-top={1.15}
        shadow-camera-bottom={-1.15}
        shadow-bias={-0.0005}
        shadow-normalBias={0.02}
      />

      {/* Cool Sky / Dark Floor Hemisphere Fill */}
      <hemisphereLight args={['#b8d4f5', '#1b2029', 0.78]} />

      {/* Cool Rim Light from rear-left for crisp bevel separation */}
      <directionalLight position={[-1.4, 1.5, -1.3]} intensity={0.95} color="#93c5fd" />
    </>
  );
};

interface LabWorkbenchProps {
  showGrid: boolean;
}

export const LabWorkbench: React.FC<LabWorkbenchProps> = ({ showGrid }) => {
  const { gl } = useThree();

  const benchTexture = useMemo(() => {
    const maxAniso = gl.capabilities.getMaxAnisotropy();
    return createWorkbenchTexture(maxAniso);
  }, [gl]);

  useEffect(() => {
    return () => {
      benchTexture.dispose();
    };
  }, [benchTexture]);

  const binSpec = DEFAULT_SCENE_OBJECTS.find((o) => o.id === 'bin_target')!;
  const [bx, , bz] = binSpec.initialPosition;
  const [bw, bh, bd] = binSpec.dimensions;
  const wallT = 0.01;
  const floorT = 0.008;

  return (
    <group>
      {/* Optical Breadboard Tabletop (top flush at y = 0.000) */}
      <mesh position={[0.32, -0.025, 0]} receiveShadow>
        <boxGeometry args={[1.7, 0.05, 1.24]} />
        <meshStandardMaterial
          map={benchTexture}
          color="#ffffff"
          roughness={0.55}
          metalness={0.48}
        />
      </mesh>

      {/* Aluminum Chamfered Trim Rails around Workbench */}
      <mesh position={[0.32, -0.025, 0.625]} material={ROBOT_MATERIALS.machinedAluminum} receiveShadow>
        <boxGeometry args={[1.72, 0.052, 0.014]} />
      </mesh>
      <mesh position={[0.32, -0.025, -0.625]} material={ROBOT_MATERIALS.machinedAluminum} receiveShadow>
        <boxGeometry args={[1.72, 0.052, 0.014]} />
      </mesh>
      <mesh position={[1.175, -0.025, 0]} material={ROBOT_MATERIALS.machinedAluminum} receiveShadow>
        <boxGeometry args={[0.014, 0.052, 1.26]} />
      </mesh>
      <mesh position={[-0.535, -0.025, 0]} material={ROBOT_MATERIALS.machinedAluminum} receiveShadow>
        <boxGeometry args={[0.014, 0.052, 1.26]} />
      </mesh>

      {/* 4 Steel Workbench Frame Legs */}
      {[
        [-0.45, -0.435, -0.54],
        [1.09, -0.435, -0.54],
        [-0.45, -0.435, 0.54],
        [1.09, -0.435, 0.54],
      ].map((pos, idx) => (
        <mesh
          key={idx}
          position={pos as [number, number, number]}
          material={ROBOT_MATERIALS.castIronDark}
        >
          <boxGeometry args={[0.055, 0.77, 0.055]} />
        </mesh>
      ))}

      {/* Dark Laboratory Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.3, -0.82, 0]} receiveShadow>
        <planeGeometry args={[16, 16]} />
        <meshStandardMaterial color="#0b0e13" roughness={0.92} metalness={0.08} />
      </mesh>

      {/* Optional Reference Grid on Bench */}
      {showGrid && (
        <gridHelper
          args={[1.2, 24, '#38bdf8', '#1e293b']}
          position={[0.32, 0.0012, 0]}
        />
      )}

      {/* Pick Origin Pad Visual Marker under cube_red */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.46, 0.001, 0.14]}>
        <ringGeometry args={[0.042, 0.052, 32]} />
        <meshBasicMaterial
          color="#f59e0b"
          transparent
          opacity={0.45}
          polygonOffset
          polygonOffsetFactor={-1}
        />
      </mesh>

      {/* Bottle Flip Zone Visual Marker under bottle_flip */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.5, 0.001, 0.28]}>
        <ringGeometry args={[0.038, 0.048, 32]} />
        <meshBasicMaterial
          color="#38bdf8"
          transparent
          opacity={0.45}
          polygonOffset
          polygonOffsetFactor={-1}
        />
      </mesh>

      {/* Composite 5-Part Open-Top Receiving Tray (bin_target) */}
      <group position={[bx, 0, bz]}>
        {/* Floor */}
        <mesh position={[0, floorT / 2, 0]} receiveShadow castShadow>
          <boxGeometry args={[bw, floorT, bd]} />
          <meshStandardMaterial color="#1e293b" roughness={0.62} metalness={0.45} />
        </mesh>
        {/* Target Pad inside Tray */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, floorT + 0.001, 0]}>
          <ringGeometry args={[0.036, 0.048, 28]} />
          <meshBasicMaterial
            color="#0ea5e9"
            transparent
            opacity={0.55}
            polygonOffset
            polygonOffsetFactor={-1}
          />
        </mesh>
        {/* +X Wall */}
        <mesh position={[bw / 2 - wallT / 2, bh / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[wallT, bh, bd]} />
          <meshStandardMaterial color="#334155" roughness={0.5} metalness={0.55} />
        </mesh>
        {/* -X Wall */}
        <mesh position={[-bw / 2 + wallT / 2, bh / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[wallT, bh, bd]} />
          <meshStandardMaterial color="#334155" roughness={0.5} metalness={0.55} />
        </mesh>
        {/* +Z Wall */}
        <mesh position={[0, bh / 2, bd / 2 - wallT / 2]} castShadow receiveShadow>
          <boxGeometry args={[bw, bh, wallT]} />
          <meshStandardMaterial color="#334155" roughness={0.5} metalness={0.55} />
        </mesh>
        {/* -Z Wall */}
        <mesh position={[0, bh / 2, -bd / 2 + wallT / 2]} castShadow receiveShadow>
          <boxGeometry args={[bw, bh, wallT]} />
          <meshStandardMaterial color="#334155" roughness={0.5} metalness={0.55} />
        </mesh>
        {/* Top Rim Accent */}
        <mesh position={[0, bh + 0.002, bd / 2 - wallT / 2]} material={ROBOT_MATERIALS.servoRingBlue}>
          <boxGeometry args={[bw + 0.002, 0.004, wallT + 0.002]} />
        </mesh>
        <mesh position={[0, bh + 0.002, -bd / 2 + wallT / 2]} material={ROBOT_MATERIALS.servoRingBlue}>
          <boxGeometry args={[bw + 0.002, 0.004, wallT + 0.002]} />
        </mesh>
      </group>
    </group>
  );
};

interface InteractivePhysicsObjectsProps {
  physicsWorld: RoboticsPhysicsWorld | null;
  /** Current scene (defaults + inventory items); containers are drawn by LabWorkbench. */
  specs: SceneObjectSpec[];
  selectedObjectId: string | null;
  onSelectObject: (id: string) => void;
  /** Mouse drag started/ended (the viewport disables orbiting while dragging). */
  onDragChange: (dragging: boolean) => void;
}

export const InteractivePhysicsObjects: React.FC<InteractivePhysicsObjectsProps> = ({
  physicsWorld,
  specs,
  selectedObjectId,
  onSelectObject,
  onDragChange,
}) => {
  const dynamicSpecs = useMemo(() => specs.filter((o) => o.kind !== 'container'), [specs]);

  // Mouse drag: ray from the cursor onto the bench plane (y = 0) drives the prop's position
  const { camera, gl } = useThree();
  // Default OrbitControls (makeDefault): switched off synchronously on pointer-down, because the
  // viewport's React state update would only land on the next render and the camera would orbit
  const controls = useThree((s) => s.controls) as { enabled: boolean } | null;
  const draggingRef = useRef(false);
  const drag = useMemo(
    () => ({ raycaster: new THREE.Raycaster(), plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit: new THREE.Vector3(), ndc: new THREE.Vector2() }),
    [],
  );
  useEffect(() => {
    const el = gl.domElement;
    const move = (e: PointerEvent) => {
      if (!draggingRef.current || !physicsWorld) return;
      const rect = el.getBoundingClientRect();
      drag.ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      drag.raycaster.setFromCamera(drag.ndc, camera);
      if (drag.raycaster.ray.intersectPlane(drag.plane, drag.hit)) physicsWorld.dragTo(drag.hit.x, drag.hit.z);
    };
    const up = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      physicsWorld?.endDrag();
      el.style.cursor = 'auto';
      if (controls) controls.enabled = true;
      onDragChange(false);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [camera, gl, physicsWorld, drag, onDragChange, controls]);

  const meshRefs = useRef<Record<string, THREE.Group | null>>({});
  const shadowRefs = useRef<Record<string, THREE.Mesh | null>>({});
  const contactShadowTex = useMemo(() => createContactShadowTexture(), []);

  useEffect(() => {
    return () => {
      contactShadowTex.dispose();
    };
  }, [contactShadowTex]);

  // Imperatively sync Rapier transforms into Three.js meshes at frame rate (0 React allocations)
  useFrame(() => {
    if (!physicsWorld) return;
    const states = physicsWorld.getObjectStates();
    for (let i = 0; i < states.length; i++) {
      const s = states[i];
      const grp = meshRefs.current[s.id];
      if (grp) {
        grp.position.set(s.position[0], s.position[1], s.position[2]);
        grp.quaternion.set(s.quaternion[0], s.quaternion[1], s.quaternion[2], s.quaternion[3]);
      }
      const sh = shadowRefs.current[s.id];
      if (sh) {
        sh.position.set(s.position[0], 0.0015, s.position[2]);
        const heightScale = Math.max(0.4, 1 - s.position[1] * 1.6);
        sh.scale.setScalar(heightScale);
        (sh.material as THREE.MeshBasicMaterial).opacity = Math.max(0.08, 0.45 * heightScale);
      }
    }
  });

  const renderCompositeProp = (spec: SceneObjectSpec) => {
    const isSelected = selectedObjectId === spec.id;
    const emissive = isSelected ? '#f59e0b' : '#000000';
    const emissiveIntensity = isSelected ? 0.25 : 0;

    if (spec.kind === 'cube') {
      const [w, h, d] = spec.dimensions;
      return (
        <>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[w, h, d]} />
            <meshStandardMaterial
              color={spec.color}
              roughness={0.32}
              metalness={0.18}
              emissive={emissive}
              emissiveIntensity={emissiveIntensity}
            />
          </mesh>
          {/* Precision metallic alignment band */}
          <mesh material={ROBOT_MATERIALS.machinedAluminum}>
            <boxGeometry args={[w + 0.002, h * 0.18, d + 0.002]} />
          </mesh>
          {/* Top fiducial cap */}
          <mesh position={[0, h / 2 + 0.001, 0]}>
            <cylinderGeometry args={[w * 0.22, w * 0.22, 0.002, 16]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.4} metalness={0.2} />
          </mesh>
        </>
      );
    }

    if (spec.kind === 'cylinder') {
      const [r, h] = spec.dimensions;
      return (
        <>
          <mesh castShadow receiveShadow>
            <cylinderGeometry args={[r, r, h, 28]} />
            <meshStandardMaterial
              color={spec.color}
              roughness={0.26}
              metalness={0.78}
              emissive={emissive}
              emissiveIntensity={emissiveIntensity}
            />
          </mesh>
          {h > 0.04 && (
            <>
              <mesh position={[0, h * 0.25, 0]} material={ROBOT_MATERIALS.castIronDark}>
                <cylinderGeometry args={[r + 0.001, r + 0.001, 0.008, 28]} />
              </mesh>
              <mesh position={[0, -h * 0.25, 0]} material={ROBOT_MATERIALS.castIronDark}>
                <cylinderGeometry args={[r + 0.001, r + 0.001, 0.008, 28]} />
              </mesh>
            </>
          )}
        </>
      );
    }

    if (spec.kind === 'bottle') {
      const r = spec.dimensions[0];
      return (
        <>
          {/* Weighted water ballast bottom */}
          <mesh position={[0, -0.041, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[r, r * 0.94, 0.044, 24]} />
            <meshStandardMaterial
              color="#0369a1"
              roughness={0.2}
              metalness={0.15}
              emissive={emissive}
              emissiveIntensity={emissiveIntensity}
            />
          </mesh>
          {/* Upper translucent PET barrel */}
          <mesh position={[0, 0.002, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[r, r, 0.042, 24]} />
            <meshStandardMaterial
              color="#bae6fd"
              roughness={0.18}
              metalness={0.08}
              transparent
              opacity={0.78}
              emissive={emissive}
              emissiveIntensity={emissiveIntensity}
            />
          </mesh>
          {/* Grip label collar */}
          <mesh position={[0, -0.005, 0]}>
            <cylinderGeometry args={[r + 0.0008, r + 0.0008, 0.02, 24]} />
            <meshStandardMaterial color="#0284c7" roughness={0.45} metalness={0.2} />
          </mesh>
          {/* Tapered bottle shoulder */}
          <mesh position={[0, 0.035, 0]} castShadow>
            <cylinderGeometry args={[r * 0.45, r, 0.024, 24]} />
            <meshStandardMaterial
              color="#bae6fd"
              roughness={0.2}
              metalness={0.08}
              transparent
              opacity={0.82}
            />
          </mesh>
          {/* Neck & high-contrast screw cap */}
          <mesh position={[0, 0.05, 0]}>
            <cylinderGeometry args={[r * 0.44, r * 0.44, 0.008, 20]} />
            <meshStandardMaterial color="#e2e8f0" roughness={0.35} metalness={0.1} />
          </mesh>
          <mesh position={[0, 0.058, 0]} castShadow>
            <cylinderGeometry args={[r * 0.5, r * 0.5, 0.012, 20]} />
            <meshStandardMaterial color="#f97316" roughness={0.32} metalness={0.15} />
          </mesh>
        </>
      );
    }

    // Sphere with equatorial machined collar
    const r = spec.dimensions[0];
    return (
      <>
        <mesh castShadow receiveShadow>
          <sphereGeometry args={[r, 28, 20]} />
          <meshStandardMaterial
            color={spec.color}
            roughness={0.24}
            metalness={0.22}
            emissive={emissive}
            emissiveIntensity={emissiveIntensity}
          />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} material={ROBOT_MATERIALS.chromeShaft}>
          <torusGeometry args={[r * 0.99, 0.0025, 8, 28]} />
        </mesh>
      </>
    );
  };

  return (
    <group>
      {dynamicSpecs.map((spec) => (
        <React.Fragment key={spec.id}>
          <group
            ref={(el) => {
              meshRefs.current[spec.id] = el;
            }}
            position={spec.initialPosition}
            quaternion={spec.initialQuaternion}
            onClick={(e) => {
              e.stopPropagation();
              onSelectObject(spec.id);
            }}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.stopPropagation();
              onSelectObject(spec.id);
              if (physicsWorld?.beginDrag(spec.id)) {
                if (controls) controls.enabled = false;
                draggingRef.current = true;
                gl.domElement.style.cursor = 'grabbing';
                onDragChange(true);
              }
            }}
            onPointerOver={(e) => {
              e.stopPropagation();
              if (!draggingRef.current) gl.domElement.style.cursor = 'grab';
            }}
            onPointerOut={() => {
              if (!draggingRef.current) gl.domElement.style.cursor = 'auto';
            }}
          >
            {renderCompositeProp(spec)}
          </group>

          {/* Soft Contact Shadow Grounding Disc */}
          <mesh
            ref={(el) => {
              shadowRefs.current[spec.id] = el;
            }}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[spec.initialPosition[0], 0.0015, spec.initialPosition[2]]}
          >
            <planeGeometry args={[0.11, 0.11]} />
            <meshBasicMaterial
              map={contactShadowTex}
              transparent
              opacity={0.42}
              depthWrite={false}
            />
          </mesh>
        </React.Fragment>
      ))}
    </group>
  );
};
