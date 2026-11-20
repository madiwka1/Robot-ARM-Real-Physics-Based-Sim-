import React, { useMemo } from 'react';
import * as THREE from 'three';
import { computeForwardKinematics } from '../robotics/kinematics';
import type { JointTuple, RobotModelConfig } from '../robotics/types';

/**
 * Procedural model for open-source hobby arms (SO-101, Koch): 3D-printed brackets between
 * serial-bus servos, drawn straight from forward kinematics so the visuals can never drift from
 * the physics/IK chain. Simplified look, real link lengths.
 */
interface ServoArmMeshProps {
  config: RobotModelConfig;
  jointAnglesDeg: JointTuple;
  gripperWidthMm: number;
  showGripper: boolean;
  showWorkspace: boolean;
  selectedNodeId: string | null;
  onSelectEndEffector: () => void;
  onSelectJoint: (jointId: string) => void;
}

const SERVO = { w: 0.024, h: 0.035, d: 0.045 }; // STS3215 / XL430-class servo body
const _up = new THREE.Vector3(0, 1, 0);

export const ServoArmMesh: React.FC<ServoArmMeshProps> = ({
  config,
  jointAnglesDeg,
  gripperWidthMm,
  showGripper,
  showWorkspace,
  selectedNodeId,
  onSelectEndEffector,
  onSelectJoint,
}) => {
  const fk = useMemo(() => computeForwardKinematics(jointAnglesDeg, config), [jointAnglesDeg, config]);
  const linkColor = config.linkColor ?? '#e2e8f0';

  // Bracket between consecutive chain frames (BASE, J1..J6, TCP), skipping zero-length links
  const links = useMemo(() => {
    const t = fk.jointTransforms;
    const out: Array<{ pos: THREE.Vector3; quat: THREE.Quaternion; len: number; key: string }> = [];
    for (let i = 1; i < t.length; i++) {
      const a = new THREE.Vector3(...t[i - 1].position);
      const b = new THREE.Vector3(...t[i].position);
      const len = a.distanceTo(b);
      if (len < 1e-4) continue;
      const dir = b.clone().sub(a).normalize();
      out.push({
        pos: a.clone().add(b).multiplyScalar(0.5),
        quat: new THREE.Quaternion().setFromUnitVectors(_up, dir),
        len,
        key: `${t[i - 1].id}-${t[i].id}`,
      });
    }
    return out;
  }, [fk]);

  const tcp = fk.jointTransforms[fk.jointTransforms.length - 1];
  const half = (gripperWidthMm / 1000) * 0.5 + 0.006;
  const eeSelected = selectedNodeId === 'TCP' || selectedNodeId === 'gripper';
  const shoulderY = config.joints[0].offsetFromParent[1] + config.joints[1].offsetFromParent[1];

  return (
    <group position={config.baseOffset}>
      {/* Base plate clamped to the bench */}
      <mesh position={[0, 0.006, 0]} castShadow receiveShadow onClick={(e) => { e.stopPropagation(); onSelectJoint('BASE'); }}>
        <cylinderGeometry args={[0.055, 0.06, 0.012, 32]} />
        <meshStandardMaterial color="#334155" roughness={0.6} metalness={0.2} />
      </mesh>

      {links.map((l) => (
        <mesh key={l.key} position={l.pos} quaternion={l.quat} castShadow receiveShadow>
          <boxGeometry args={[0.03, l.len, 0.026]} />
          <meshStandardMaterial color={linkColor} roughness={0.55} metalness={0.05} />
        </mesh>
      ))}

      {/* Servos at every actuated joint (locked J4 slot has none) */}
      {config.joints.map((j, i) => {
        if (j.minDeg === j.maxDeg) return null;
        const t = fk.jointTransforms[i + 1];
        const selected = selectedNodeId === j.id;
        return (
          <mesh
            key={j.id}
            position={t.position}
            quaternion={t.quaternion}
            castShadow
            onClick={(e) => {
              e.stopPropagation();
              onSelectJoint(j.id);
            }}
          >
            <boxGeometry args={[SERVO.d, SERVO.h, SERVO.w]} />
            <meshStandardMaterial
              color={selected ? '#f59e0b' : '#111827'}
              emissive={selected ? '#b45309' : '#000000'}
              emissiveIntensity={selected ? 0.4 : 0}
              roughness={0.45}
              metalness={0.1}
            />
          </mesh>
        );
      })}

      {/* Gripper jaws in the TCP frame, matching the physics finger colliders */}
      {showGripper && (
        <group
          position={tcp.position}
          quaternion={tcp.quaternion}
          onClick={(e) => {
            e.stopPropagation();
            onSelectEndEffector();
          }}
        >
          <mesh position={[0, -0.03, 0]} castShadow>
            <boxGeometry args={[0.05, 0.012, 0.03]} />
            <meshStandardMaterial color={eeSelected ? '#f59e0b' : linkColor} roughness={0.55} />
          </mesh>
          {[-half, half].map((x) => (
            <mesh key={x} position={[x, -0.004, 0]} castShadow>
              <boxGeometry args={[0.008, 0.052, 0.022]} />
              <meshStandardMaterial color="#475569" roughness={0.5} />
            </mesh>
          ))}
        </group>
      )}

      {showWorkspace && (
        <mesh position={[0, shoulderY, 0]}>
          <sphereGeometry args={[config.maxReachMeters, 28, 18]} />
          <meshBasicMaterial color="#38bdf8" wireframe transparent opacity={0.1} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
};
