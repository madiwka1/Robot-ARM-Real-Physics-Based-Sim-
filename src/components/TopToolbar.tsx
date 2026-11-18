import React from 'react';
import {
  Circle,
  Download,
  FileSpreadsheet,
  Link2,
  MessageSquare,
  Pause,
  Play,
  RotateCcw,
  Square,
  User,
  Zap,
} from 'lucide-react';
import {
  AVATAR_COLOR_OPTIONS,
  getInitials,
  type UserProfile,
} from '../data/platformStore';
import type { BridgeConnectionState } from '../robotics/types';

interface TopToolbarProps {
  simulationRunning: boolean;
  isRecording: boolean;
  isPlayingDemo: boolean;
  hasActiveDemo: boolean;
  bridgeState: BridgeConnectionState;
  powerWatts: number;
  busCurrentAmps: number;
  peakLoadPct: number;
  profile: UserProfile | null;
  onReturnToLanding: () => void;
  onToggleSimulation: () => void;
  onResetLab: () => void;
  onToggleRecord: () => void;
  onTogglePlayDemo: () => void;
  onExportJSON: () => void;
  onExportCSV: () => void;
  onOpenBridgeModal: () => void;
  onOpenFeedbackModal: () => void;
  onOpenProfileOrAuth: () => void;
}

export const TopToolbar: React.FC<TopToolbarProps> = ({
  simulationRunning,
  isRecording,
  isPlayingDemo,
  hasActiveDemo,
  bridgeState,
  powerWatts,
  busCurrentAmps,
  peakLoadPct,
  profile,
  onReturnToLanding,
  onToggleSimulation,
  onResetLab,
  onToggleRecord,
  onTogglePlayDemo,
  onExportJSON,
  onExportCSV,
  onOpenBridgeModal,
  onOpenFeedbackModal,
  onOpenProfileOrAuth,
}) => {
  const loadColor =
    peakLoadPct > 80
      ? 'bg-red-500'
      : peakLoadPct > 55
        ? 'bg-amber-400'
        : 'bg-emerald-400';

  const avatarColorMeta =
    AVATAR_COLOR_OPTIONS.find((c) => c.id === (profile?.avatarColor ?? 'amber')) ??
    AVATAR_COLOR_OPTIONS[0];

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-[#12161d] px-4">
      {/* Brand Title (returns to landing page) */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          type="button"
          onClick={onReturnToLanding}
          aria-label="Back to AxisLab 6 Home"
          className="text-sm font-semibold tracking-tight text-slate-100 hover:text-amber-400 transition-colors whitespace-nowrap cursor-pointer"
        >
          AxisLab 6
        </button>
      </div>

      {/* Primary Toolbar Actions */}
      <div className="flex items-center gap-1.5 overflow-x-auto">
        {/* Simulation Run / Pause */}
        <button
          type="button"
          onClick={onToggleSimulation}
          aria-label={simulationRunning ? 'Pause Simulation' : 'Start Simulation'}
          className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            simulationRunning
              ? 'bg-slate-800 text-slate-100 hover:bg-slate-700 border border-white/10'
              : 'bg-amber-500 text-slate-950 hover:bg-amber-400'
          }`}
        >
          {simulationRunning ? (
            <>
              <Pause className="h-3.5 w-3.5" />
              <span>Sim Active</span>
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5" />
              <span>Resume Sim</span>
            </>
          )}
        </button>

        {/* Reset Scene */}
        <button
          type="button"
          onClick={onResetLab}
          aria-label="Reset Lab"
          className="flex items-center gap-1.5 rounded border border-white/10 bg-[#1a202b] px-2.5 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-[#232b3a] whitespace-nowrap shrink-0 cursor-pointer"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>Reset</span>
        </button>

        <div className="mx-0.5 h-5 w-px bg-white/10 shrink-0" />

        {/* Record / Stop */}
        <button
          type="button"
          onClick={onToggleRecord}
          aria-label={isRecording ? 'Stop Recording' : 'Record Demonstration'}
          className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            isRecording
              ? 'bg-red-600 text-white hover:bg-red-500'
              : 'border border-white/10 bg-[#1a202b] text-slate-200 hover:bg-[#232b3a]'
          }`}
        >
          {isRecording ? (
            <>
              <Square className="h-3.5 w-3.5 fill-current" />
              <span>Stop Rec</span>
            </>
          ) : (
            <>
              <Circle className="h-3.5 w-3.5 text-red-400 fill-red-400" />
              <span>Record</span>
            </>
          )}
        </button>

        {/* Play / Pause Demonstration */}
        <button
          type="button"
          onClick={onTogglePlayDemo}
          disabled={!hasActiveDemo || isRecording}
          aria-label={isPlayingDemo ? 'Pause Playback' : 'Play Demonstration'}
          className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
            isPlayingDemo
              ? 'bg-sky-500 text-slate-950 hover:bg-sky-400'
              : 'bg-amber-500 text-slate-950 hover:bg-amber-400'
          }`}
        >
          {isPlayingDemo ? (
            <>
              <Pause className="h-3.5 w-3.5" />
              <span>Pause</span>
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5" />
              <span>Play Demo</span>
            </>
          )}
        </button>

        <div className="mx-0.5 h-5 w-px bg-white/10 shrink-0" />

        {/* Export JSON & CSV */}
        <button
          type="button"
          onClick={onExportJSON}
          disabled={!hasActiveDemo}
          aria-label="Export JSON"
          className="flex items-center gap-1 rounded border border-white/10 bg-[#1a202b] px-2.5 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-[#232b3a] whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40"
        >
          <Download className="h-3.5 w-3.5 text-slate-400" />
          <span>JSON</span>
        </button>
        <button
          type="button"
          onClick={onExportCSV}
          disabled={!hasActiveDemo}
          aria-label="Export CSV"
          className="flex items-center gap-1 rounded border border-white/10 bg-[#1a202b] px-2.5 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-[#232b3a] whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40"
        >
          <FileSpreadsheet className="h-3.5 w-3.5 text-slate-400" />
          <span>CSV</span>
        </button>
      </div>

      {/* Power Indicator, Bridge, Feedback & Account/Profile */}
      <div className="flex items-center gap-2 shrink-0">
        <div
          aria-label="System Power Indicator"
          className="flex items-center gap-2 rounded border border-white/10 bg-[#0d1015] px-2.5 py-1"
        >
          <Zap className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          <div className="flex items-center gap-1.5 font-mono-tabular text-xs">
            <span className="text-slate-100 font-medium">
              {powerWatts.toFixed(1)} W
            </span>
            <span className="text-slate-500">·</span>
            <span className="text-slate-400">{busCurrentAmps.toFixed(2)} A</span>
          </div>
          <div className="h-1.5 w-8 overflow-hidden rounded-xs bg-slate-800">
            <div
              className={`h-full transition-all duration-150 ${loadColor}`}
              style={{ width: `${Math.min(100, Math.max(6, peakLoadPct))}%` }}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenBridgeModal}
          aria-label="Configure Hardware Bridge"
          className="flex items-center gap-1.5 rounded border border-white/10 bg-[#1a202b] px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-[#232b3a] whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Link2 className="h-3.5 w-3.5 text-sky-400" />
          <span>{bridgeState === 'connected' ? 'ROS 2' : 'Bridge'}</span>
        </button>

        <button
          type="button"
          onClick={onOpenFeedbackModal}
          aria-label="Open Feedback Menu"
          className="flex items-center gap-1.5 rounded border border-white/10 bg-[#1a202b] px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-[#232b3a] whitespace-nowrap shrink-0 cursor-pointer"
        >
          <MessageSquare className="h-3.5 w-3.5 text-amber-400" />
          <span>Feedback</span>
        </button>

        <button
          type="button"
          onClick={onOpenProfileOrAuth}
          aria-label={profile ? 'Customize Profile' : 'Register or Sign In'}
          className="flex items-center gap-1.5 rounded border border-white/10 bg-[#1a202b] px-2.5 py-1 text-xs font-medium text-slate-200 transition-colors hover:bg-[#232b3a] whitespace-nowrap shrink-0 cursor-pointer"
        >
          {profile ? (
            <>
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-sm text-[10px] font-bold ${avatarColorMeta.bgClass} ${avatarColorMeta.textClass}`}
              >
                {getInitials(profile.displayName, profile.email)}
              </span>
              <span className="max-w-[92px] truncate">{profile.displayName}</span>
            </>
          ) : (
            <>
              <User className="h-3.5 w-3.5 text-slate-300" />
              <span>Register</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
};
