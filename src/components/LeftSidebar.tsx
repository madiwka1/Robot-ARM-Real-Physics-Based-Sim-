import React from 'react';
import {
  Box,
  Camera,
  ChevronDown,
  ChevronRight,
  Crosshair,
  Eye,
  EyeOff,
  Layers,
} from 'lucide-react';
import { AXIS6_ROBOT_CONFIG, DEFAULT_SCENE_OBJECTS } from '../robotics/robotModel';
import type { SceneObjectRuntimeState } from '../robotics/types';
import type { CameraPreset } from '../scene/RoboticsViewport';

interface LeftSidebarProps {
  selectedNodeId: string | null;
  objectStates: SceneObjectRuntimeState[];
  showJointAxes: boolean;
  showWorkspace: boolean;
  showGrid: boolean;
  cameraPreset: CameraPreset;
  onSelectNode: (id: string) => void;
  onSelectEndEffector: () => void;
  onApproachObject: (objectId: string) => void;
  onToggleJointAxes: () => void;
  onToggleWorkspace: () => void;
  onToggleGrid: () => void;
  onSelectCameraPreset: (preset: CameraPreset) => void;
}

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  selectedNodeId,
  objectStates,
  showJointAxes,
  showWorkspace,
  showGrid,
  cameraPreset,
  onSelectNode,
  onSelectEndEffector,
  onApproachObject,
  onToggleJointAxes,
  onToggleWorkspace,
  onToggleGrid,
  onSelectCameraPreset,
}) => {
  const [robotExpanded, setRobotExpanded] = React.useState(true);
  const [objectsExpanded, setObjectsExpanded] = React.useState(true);

  const selectedObjectSpec = DEFAULT_SCENE_OBJECTS.find(
    (o) => o.id === selectedNodeId,
  );
  const selectedObjectRuntime = objectStates.find(
    (o) => o.id === selectedNodeId,
  );

  return (
    <aside
      aria-label="Scene Hierarchy and Environment"
      className="flex h-full w-64 shrink-0 flex-col border-r border-white/10 bg-[#12161d] overflow-y-auto ide-scroll"
    >
      {/* Scene Hierarchy */}
      <div className="border-b border-white/10 p-2.5">
        <div className="mb-1.5 flex items-center justify-between">
          <h2 className="text-xs font-semibold tracking-wide text-slate-300">
            Scene Hierarchy
          </h2>
          <Layers className="h-3.5 w-3.5 text-slate-500" />
        </div>

        {/* Robot Arm Tree */}
        <div className="space-y-0.5">
          <button
            type="button"
            onClick={() => setRobotExpanded((v) => !v)}
            className="flex w-full items-center gap-1.5 rounded px-1.5 py-0.5 text-left text-xs font-medium text-slate-200 hover:bg-white/5 cursor-pointer"
          >
            {robotExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
            )}
            <span>{AXIS6_ROBOT_CONFIG.name}</span>
          </button>

          {robotExpanded && (
            <div className="ml-3.5 space-y-0 border-l border-white/10 pl-2">
              <button
                type="button"
                onClick={() => onSelectNode('BASE')}
                className={`flex w-full items-center justify-between rounded px-2 py-0.5 text-xs cursor-pointer ${
                  selectedNodeId === 'BASE'
                    ? 'bg-amber-500/15 text-amber-300'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                }`}
              >
                <span>Base Pedestal</span>
                <span className="font-mono-tabular text-[11px] text-slate-500">
                  Fixed
                </span>
              </button>

              {AXIS6_ROBOT_CONFIG.joints.map((joint) => (
                <button
                  key={joint.id}
                  type="button"
                  onClick={() => onSelectNode(joint.id)}
                  className={`flex w-full items-center justify-between rounded px-2 py-0.5 text-xs cursor-pointer ${
                    selectedNodeId === joint.id
                      ? 'bg-amber-500/15 text-amber-300'
                      : 'text-slate-300 hover:bg-white/5'
                  }`}
                >
                  <span>
                    {joint.id} · {joint.name}
                  </span>
                  <span className="text-[11px] text-slate-500">{joint.role}</span>
                </button>
              ))}

              <button
                type="button"
                onClick={onSelectEndEffector}
                className={`flex w-full items-center justify-between rounded px-2 py-0.5 text-xs font-medium cursor-pointer ${
                  selectedNodeId === 'TCP' || selectedNodeId === 'gripper'
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'text-sky-300 hover:bg-white/5'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <Crosshair className="h-3 w-3" />
                  <span>End Effector (TCP)</span>
                </span>
                <span className="text-[11px] text-slate-400">IK</span>
              </button>
            </div>
          )}
        </div>

        {/* Scene Objects Tree */}
        <div className="mt-2 space-y-0.5">
          <button
            type="button"
            onClick={() => setObjectsExpanded((v) => !v)}
            className="flex w-full items-center gap-1.5 rounded px-1.5 py-0.5 text-left text-xs font-medium text-slate-200 hover:bg-white/5 cursor-pointer"
          >
            {objectsExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
            )}
            <span>Workbench Objects</span>
          </button>

          {objectsExpanded && (
            <div className="ml-3.5 space-y-0 border-l border-white/10 pl-2">
              {DEFAULT_SCENE_OBJECTS.map((obj) => {
                const runtime = objectStates.find((s) => s.id === obj.id);
                const isSelected = selectedNodeId === obj.id;
                return (
                  <button
                    key={obj.id}
                    type="button"
                    onClick={() => onSelectNode(obj.id)}
                    className={`flex w-full items-center justify-between rounded px-2 py-0.5 text-left text-xs cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500/15 text-amber-300'
                        : 'text-slate-300 hover:bg-white/5'
                    }`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-xs"
                        style={{ backgroundColor: obj.color }}
                      />
                      <span className="truncate">{obj.name}</span>
                    </span>
                    {runtime?.isGrasped && (
                      <span className="text-[11px] text-emerald-400 shrink-0 ml-1">
                        Held
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Selected Object Inspector */}
      {selectedObjectSpec && (
        <div className="border-b border-white/10 p-2.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-200">
              {selectedObjectSpec.name}
            </h3>
            <Box className="h-3.5 w-3.5 text-slate-500" />
          </div>
          {selectedObjectRuntime ? (
            <div className="grid grid-cols-3 gap-1 font-mono-tabular text-[11px] text-slate-300">
              <div className="rounded bg-[#1a202b] px-1.5 py-0.5">
                <span className="text-slate-500">X </span>
                {selectedObjectRuntime.position[0].toFixed(3)}
              </div>
              <div className="rounded bg-[#1a202b] px-1.5 py-0.5">
                <span className="text-slate-500">Y </span>
                {selectedObjectRuntime.position[1].toFixed(3)}
              </div>
              <div className="rounded bg-[#1a202b] px-1.5 py-0.5">
                <span className="text-slate-500">Z </span>
                {selectedObjectRuntime.position[2].toFixed(3)}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1 font-mono-tabular text-[11px] text-slate-300">
              <div className="rounded bg-[#1a202b] px-1.5 py-0.5">
                <span className="text-slate-500">X </span>
                {selectedObjectSpec.initialPosition[0].toFixed(3)}
              </div>
              <div className="rounded bg-[#1a202b] px-1.5 py-0.5">
                <span className="text-slate-500">Y </span>
                {selectedObjectSpec.initialPosition[1].toFixed(3)}
              </div>
              <div className="rounded bg-[#1a202b] px-1.5 py-0.5">
                <span className="text-slate-500">Z </span>
                {selectedObjectSpec.initialPosition[2].toFixed(3)}
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => onApproachObject(selectedObjectSpec.id)}
            className="w-full rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-500/20 cursor-pointer"
          >
            {selectedObjectSpec.kind === 'container'
              ? 'Move Above Tray (IK)'
              : 'Align Gripper Above (IK)'}
          </button>
        </div>
      )}

      {/* Viewport Guides */}
      <div className="border-b border-white/10 p-2.5 space-y-1">
        <h2 className="text-xs font-semibold tracking-wide text-slate-300">
          Viewport Overlays
        </h2>
        <div className="space-y-0.5">
          <button
            type="button"
            onClick={onToggleJointAxes}
            aria-pressed={showJointAxes}
            className="flex w-full items-center justify-between rounded px-2 py-1 text-xs text-slate-300 hover:bg-white/5 cursor-pointer"
          >
            <span>Joint Coordinate Axes</span>
            {showJointAxes ? (
              <Eye className="h-3.5 w-3.5 text-amber-400" />
            ) : (
              <EyeOff className="h-3.5 w-3.5 text-slate-500" />
            )}
          </button>

          <button
            type="button"
            onClick={onToggleWorkspace}
            aria-pressed={showWorkspace}
            className="flex w-full items-center justify-between rounded px-2 py-1 text-xs text-slate-300 hover:bg-white/5 cursor-pointer"
          >
            <span>Workspace Envelope</span>
            {showWorkspace ? (
              <Eye className="h-3.5 w-3.5 text-sky-400" />
            ) : (
              <EyeOff className="h-3.5 w-3.5 text-slate-500" />
            )}
          </button>

          <button
            type="button"
            onClick={onToggleGrid}
            aria-pressed={showGrid}
            className="flex w-full items-center justify-between rounded px-2 py-1 text-xs text-slate-300 hover:bg-white/5 cursor-pointer"
          >
            <span>Reference Grid</span>
            {showGrid ? (
              <Eye className="h-3.5 w-3.5 text-sky-400" />
            ) : (
              <EyeOff className="h-3.5 w-3.5 text-slate-500" />
            )}
          </button>
        </div>
      </div>

      {/* Camera Views */}
      <div className="p-2.5 space-y-1.5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold tracking-wide text-slate-300">
            Camera View
          </h2>
          <Camera className="h-3.5 w-3.5 text-slate-500" />
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {(['perspective', 'top', 'front', 'side'] as CameraPreset[]).map(
            (preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => onSelectCameraPreset(preset)}
                className={`rounded px-2 py-1 text-xs font-medium capitalize transition-colors cursor-pointer ${
                  cameraPreset === preset
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-400/30'
                    : 'bg-[#1a202b] text-slate-300 border border-white/5 hover:bg-[#232b3a]'
                }`}
              >
                {preset}
              </button>
            ),
          )}
        </div>
      </div>
    </aside>
  );
};
