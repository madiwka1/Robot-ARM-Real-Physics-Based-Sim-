import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { BridgeConnectionState } from '../robotics/types';

interface HardwareBridgeModalProps {
  open: boolean;
  bridgeState: BridgeConnectionState;
  protocol: 'ros2-rosbridge' | 'websocket-json';
  errorMessage: string | null;
  onClose: () => void;
  onConnect: (url: string, protocol: 'ros2-rosbridge' | 'websocket-json') => void;
  onDisconnect: () => void;
}

export const HardwareBridgeModal: React.FC<HardwareBridgeModalProps> = ({
  open,
  bridgeState,
  protocol,
  errorMessage,
  onClose,
  onConnect,
  onDisconnect,
}) => {
  const [url, setUrl] = useState('ws://localhost:9090');
  const [selectedProtocol, setSelectedProtocol] = useState<
    'ros2-rosbridge' | 'websocket-json'
  >(protocol);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Robot Hardware Bridge Configuration"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    >
      <div className="w-full max-w-md rounded-lg border border-white/15 bg-[#141820] p-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <h2 className="text-sm font-semibold text-slate-100">
            Hardware Bridge (ROS 2 / WebSocket)
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Bridge Modal"
            className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-3 text-xs">
          <p className="leading-relaxed text-slate-400">
            Stream live joint commands (<code className="font-mono-tabular text-slate-200">/joint_group_position_controller/commands</code>) and gripper targets to physical robot controllers via <code className="font-mono-tabular text-slate-200">rosbridge_suite</code> or a custom WebSocket server.
          </p>

          <label className="block space-y-1">
            <span className="block font-medium text-slate-300">Protocol</span>
            <select
              value={selectedProtocol}
              onChange={(e) =>
                setSelectedProtocol(
                  e.target.value as 'ros2-rosbridge' | 'websocket-json',
                )
              }
              className="w-full rounded border border-white/10 bg-[#0d1015] px-3 py-2 text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
            >
              <option value="ros2-rosbridge">ROS 2 rosbridge_suite JSON</option>
              <option value="websocket-json">Generic WebSocket JSON</option>
            </select>
          </label>

          <label className="block space-y-1">
            <span className="block font-medium text-slate-300">
              WebSocket Endpoint URL
            </span>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="ws://localhost:9090"
              className="w-full rounded border border-white/10 bg-[#0d1015] px-3 py-2 font-mono-tabular text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
            />
          </label>

          <div className="flex items-center justify-between rounded border border-white/10 bg-[#0d1015] px-3 py-2">
            <span className="text-slate-400">Bridge State</span>
            <span className="font-mono-tabular font-medium capitalize text-slate-200">
              {bridgeState}
            </span>
          </div>

          {errorMessage && (
            <p className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {errorMessage}
            </p>
          )}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-white/10 bg-[#1a202b] px-4 py-2 text-xs font-medium text-slate-200 hover:bg-[#232b3a] cursor-pointer"
          >
            Close
          </button>
          {bridgeState === 'connected' ? (
            <button
              type="button"
              onClick={onDisconnect}
              className="rounded bg-red-600 px-4 py-2 text-xs font-medium text-white hover:bg-red-500 cursor-pointer"
            >
              Disconnect
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onConnect(url, selectedProtocol)}
              className="rounded bg-amber-500 px-4 py-2 text-xs font-medium text-slate-950 hover:bg-amber-400 cursor-pointer"
            >
              Connect Bridge
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
