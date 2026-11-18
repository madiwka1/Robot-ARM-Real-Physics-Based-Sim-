import React from 'react';
import {
  Circle,
  Copy,
  Pause,
  Play,
  Plus,
  Repeat,
  Square,
  Trash2,
} from 'lucide-react';
import type { SimulationTelemetrySample } from '../robotics/telemetry';
import type { ActionType, Demonstration } from '../robotics/types';
import { SimulationGraphs } from './SimulationGraphs';

const TASK_PRESETS = [
  'Bottle Flip',
  'Pick Object',
  'Move Object',
  'Place Object',
  'Sort to Tray',
];

const ACTION_OPTIONS: ActionType[] = [
  'Home',
  'Move Joint',
  'Move Linear',
  'Pick Object',
  'Close Gripper',
  'Move Object',
  'Bottle Flip',
  'Place Object',
  'Open Gripper',
  'Idle',
];

interface BottomTimelinePanelProps {
  demonstrations: Demonstration[];
  activeDemoId: string | null;
  isRecording: boolean;
  isPlaying: boolean;
  repeatPlayback: boolean;
  playbackSpeed: number;
  playbackTimeMs: number;
  taskType: string;
  demoNameInput: string;
  selectedFrameIndex: number | null;
  telemetrySamples: SimulationTelemetrySample[];
  bottleFlipCount: number;
  bottleUpright: boolean;
  onChangeTaskType: (task: string) => void;
  onChangeDemoNameInput: (name: string) => void;
  onSelectDemo: (id: string) => void;
  onDeleteDemo: (id: string) => void;
  onDuplicateDemo: (id: string) => void;
  onToggleRecord: () => void;
  onCaptureKeyframe: () => void;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onToggleRepeat: () => void;
  onChangeSpeed: (speed: number) => void;
  onScrubTime: (timeMs: number) => void;
  onSelectFrame: (index: number) => void;
  onUpdateFrameAction: (frameIndex: number, action: ActionType) => void;
  onDeleteFrame: (frameIndex: number) => void;
}

function formatMs(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}

export const BottomTimelinePanel: React.FC<BottomTimelinePanelProps> = ({
  demonstrations,
  activeDemoId,
  isRecording,
  isPlaying,
  repeatPlayback,
  playbackSpeed,
  playbackTimeMs,
  taskType,
  demoNameInput,
  selectedFrameIndex,
  telemetrySamples,
  bottleFlipCount,
  bottleUpright,
  onChangeTaskType,
  onChangeDemoNameInput,
  onSelectDemo,
  onDeleteDemo,
  onDuplicateDemo,
  onToggleRecord,
  onCaptureKeyframe,
  onPlay,
  onPause,
  onStop,
  onToggleRepeat,
  onChangeSpeed,
  onScrubTime,
  onSelectFrame,
  onUpdateFrameAction,
  onDeleteFrame,
}) => {
  const activeDemo =
    demonstrations.find((d) => d.id === activeDemoId) ?? null;
  const totalMs = Math.max(100, activeDemo?.durationMs ?? 1000);
  const inspectedFrame =
    activeDemo &&
    selectedFrameIndex !== null &&
    activeDemo.frames[selectedFrameIndex]
      ? activeDemo.frames[selectedFrameIndex]
      : null;

  return (
    <section
      aria-label="Training Timeline and Demonstrations"
      className="flex h-52 shrink-0 border-t border-white/10 bg-[#12161d]"
    >
      {/* Left: Saved Demonstrations List */}
      <div className="flex w-[276px] shrink-0 flex-col border-r border-white/10">
        <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
          <h2 className="text-xs font-semibold tracking-wide text-slate-200">
            Demonstrations ({demonstrations.length})
          </h2>
          <span className="text-[11px] text-slate-500">Saved locally</span>
        </div>

        <div className="flex-1 overflow-y-auto p-1.5 space-y-1 ide-scroll">
          {demonstrations.length === 0 ? (
            <p className="px-2 py-4 text-xs text-slate-500">
              No demonstrations recorded yet. Press Record to capture a task.
            </p>
          ) : (
            demonstrations.map((demo) => {
              const isActive = demo.id === activeDemoId;
              return (
                <div
                  key={demo.id}
                  className={`group flex items-center justify-between gap-1.5 rounded px-2 py-1 text-xs transition-colors ${
                    isActive
                      ? 'bg-amber-500/15 text-amber-200 border border-amber-500/30'
                      : 'text-slate-300 hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectDemo(demo.id)}
                    className="flex-1 min-w-0 text-left cursor-pointer"
                  >
                    <div className="font-medium truncate">{demo.name}</div>
                    <div className="text-[10.5px] text-slate-400 font-mono-tabular truncate">
                      {demo.taskType} · {demo.frames.length} steps ·{' '}
                      {formatMs(demo.durationMs)}
                    </div>
                  </button>

                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      aria-label={`Duplicate ${demo.name}`}
                      onClick={() => onDuplicateDemo(demo.id)}
                      className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-slate-200 cursor-pointer"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${demo.name}`}
                      onClick={() => onDeleteDemo(demo.id)}
                      className="rounded p-1 text-slate-400 hover:bg-red-500/20 hover:text-red-300 cursor-pointer"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Center: Training Recorder + Timeline + Playback */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Top Control Row */}
        <div className="flex items-center justify-between gap-1.5 border-b border-white/10 px-2.5 py-1.5 overflow-x-auto ide-scroll">
          {/* Task Setup & Recording */}
          <div className="flex items-center gap-1.5 shrink-0">
            <select
              aria-label="Task Type"
              value={taskType}
              onChange={(e) => onChangeTaskType(e.target.value)}
              disabled={isRecording}
              className="rounded border border-white/10 bg-[#0d1015] px-1.5 py-1 text-[11px] text-slate-200 focus:border-amber-500 focus:outline-none"
            >
              {TASK_PRESETS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            <input
              aria-label="Demonstration Name"
              type="text"
              placeholder="Demonstration name..."
              value={demoNameInput}
              onChange={(e) => onChangeDemoNameInput(e.target.value)}
              disabled={isRecording}
              className="w-28 rounded border border-white/10 bg-[#0d1015] px-2 py-1 text-[11px] text-slate-200 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
            />

            <button
              type="button"
              onClick={onToggleRecord}
              className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                isRecording
                  ? 'bg-red-600 text-white hover:bg-red-500'
                  : 'border border-white/10 bg-[#1a202b] text-slate-200 hover:bg-[#232b3a]'
              }`}
            >
              {isRecording ? (
                <>
                  <Square className="h-3 w-3 fill-current" />
                  <span>Stop</span>
                </>
              ) : (
                <>
                  <Circle className="h-3 w-3 text-red-400 fill-red-400" />
                  <span>Record</span>
                </>
              )}
            </button>

            {isRecording && (
              <button
                type="button"
                onClick={onCaptureKeyframe}
                className="flex items-center gap-1 rounded bg-amber-500 px-2 py-1 text-[11px] font-medium text-slate-950 hover:bg-amber-400 whitespace-nowrap cursor-pointer"
              >
                <Plus className="h-3 w-3" />
                <span>Keyframe</span>
              </button>
            )}
          </div>

          {/* Playback Controls */}
          <div className="flex items-center gap-1 shrink-0">
            {isPlaying ? (
              <button
                type="button"
                onClick={onPause}
                aria-label="Pause Demonstration"
                className="flex items-center gap-1 rounded bg-sky-500 px-2 py-1 text-[11px] font-medium text-slate-950 hover:bg-sky-400 whitespace-nowrap cursor-pointer"
              >
                <Pause className="h-3 w-3" />
                <span>Pause</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onPlay}
                disabled={!activeDemo || isRecording}
                aria-label="Play or Resume Demonstration"
                className="flex items-center gap-1 rounded bg-amber-500 px-2 py-1 text-[11px] font-medium text-slate-950 hover:bg-amber-400 whitespace-nowrap cursor-pointer disabled:opacity-40"
              >
                <Play className="h-3 w-3" />
                <span>{playbackTimeMs > 0 ? 'Resume' : 'Play'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onStop}
              disabled={!activeDemo}
              aria-label="Stop Playback"
              className="rounded border border-white/10 bg-[#1a202b] px-2 py-1 text-[11px] text-slate-200 hover:bg-[#232b3a] whitespace-nowrap cursor-pointer disabled:opacity-40"
            >
              Stop
            </button>

            <button
              type="button"
              onClick={onToggleRepeat}
              aria-pressed={repeatPlayback}
              aria-label="Toggle Repeat Loop"
              className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                repeatPlayback
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-400/40'
                  : 'border border-white/10 bg-[#1a202b] text-slate-300 hover:bg-[#232b3a]'
              }`}
            >
              <Repeat className="h-3 w-3" />
              <span>Repeat</span>
            </button>

            <select
              aria-label="Playback Speed"
              value={playbackSpeed}
              onChange={(e) => onChangeSpeed(parseFloat(e.target.value))}
              className="rounded border border-white/10 bg-[#0d1015] px-1.5 py-1 font-mono-tabular text-[11px] text-slate-200"
            >
              <option value={0.5}>0.5x</option>
              <option value={1}>1.0x</option>
              <option value={1.5}>1.5x</option>
              <option value={2}>2.0x</option>
            </select>

            <span className="ml-1 font-mono-tabular text-[11px] text-slate-300 whitespace-nowrap">
              {formatMs(playbackTimeMs)} / {formatMs(activeDemo?.durationMs ?? 0)}
            </span>
          </div>
        </div>

        {/* Timeline Scrubber & Keyframes */}
        <div className="flex-1 flex flex-col justify-between p-3 gap-2 overflow-hidden">
          {activeDemo ? (
            <>
              <div className="space-y-2">
                <input
                  aria-label="Demonstration Timeline Scrubber"
                  type="range"
                  min={0}
                  max={totalMs}
                  step={10}
                  value={Math.min(playbackTimeMs, totalMs)}
                  onChange={(e) => onScrubTime(parseFloat(e.target.value))}
                  disabled={isRecording}
                  className="robotics-slider w-full"
                />

                {/* Keyframe Action Sequence Strip */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 ide-scroll">
                  {activeDemo.frames.map((frame, index) => {
                    const isSelected = selectedFrameIndex === index;
                    const isNearCurrent =
                      Math.abs(frame.timestampMs - playbackTimeMs) < 120;
                    return (
                      <button
                        key={frame.id}
                        type="button"
                        onClick={() => {
                          onSelectFrame(index);
                          onScrubTime(frame.timestampMs);
                        }}
                        className={`shrink-0 rounded border px-2 py-1 text-left text-[11px] transition-colors cursor-pointer ${
                          isSelected
                            ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                            : isNearCurrent
                              ? 'border-sky-400/50 bg-sky-500/15 text-sky-200'
                              : 'border-white/10 bg-[#1a202b] text-slate-300 hover:bg-[#232b3a]'
                        }`}
                      >
                        <div className="font-medium whitespace-nowrap">
                          {frame.action}
                        </div>
                        <div className="font-mono-tabular text-[10px] text-slate-400">
                          {formatMs(frame.timestampMs)} ·{' '}
                          {frame.isGrasping ? 'Grasp' : `${frame.gripperWidthMm.toFixed(0)}mm`}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Selected Keyframe Modifier */}
              {inspectedFrame && selectedFrameIndex !== null && (
                <div className="flex items-center justify-between rounded border border-white/10 bg-[#0d1015] px-2.5 py-1 text-xs">
                  <div className="flex items-center gap-3 font-mono-tabular text-[11px] text-slate-300 truncate">
                    <span>Step {selectedFrameIndex + 1}</span>
                    <span>
                      TCP ({inspectedFrame.tcpPosition.map((v) => v.toFixed(2)).join(', ')})
                    </span>
                    <span>
                      Gripper {inspectedFrame.gripperWidthMm.toFixed(0)}mm
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      aria-label="Keyframe Action Label"
                      value={inspectedFrame.action}
                      onChange={(e) =>
                        onUpdateFrameAction(
                          selectedFrameIndex,
                          e.target.value as ActionType,
                        )
                      }
                      className="rounded border border-white/10 bg-[#141820] px-1.5 py-0.5 text-[11px] text-slate-200"
                    >
                      {ACTION_OPTIONS.map((act) => (
                        <option key={act} value={act}>
                          {act}
                        </option>
                      ))}
                    </select>
                    {activeDemo.frames.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onDeleteFrame(selectedFrameIndex)}
                        aria-label="Delete Selected Keyframe"
                        className="rounded px-1.5 py-0.5 text-[11px] text-red-400 hover:bg-red-500/15 cursor-pointer"
                      >
                        Remove Step
                      </button>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-slate-500">
              Select a demonstration on the left or press Record to begin training.
            </div>
          )}
        </div>
      </div>

      {/* Right: Live Simulation Telemetry Graphs */}
      <SimulationGraphs
        samples={telemetrySamples}
        bottleFlipCount={bottleFlipCount}
        bottleUpright={bottleUpright}
      />
    </section>
  );
};
