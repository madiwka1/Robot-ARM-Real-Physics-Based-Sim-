import React, { useMemo, useState } from 'react';
import type { SimulationTelemetrySample } from '../robotics/telemetry';

type GraphChannel = 'power' | 'joints' | 'motion';

interface SimulationGraphsProps {
  samples: SimulationTelemetrySample[];
  bottleFlipCount: number;
  bottleUpright: boolean;
}

const CHART_W = 420;
const CHART_H = 104;
const PAD_L = 34;
const PAD_R = 8;
const PAD_T = 8;
const PAD_B = 14;

function buildPolyline(
  values: number[],
  minVal: number,
  maxVal: number,
): string {
  if (values.length === 0) return '';
  const plotW = CHART_W - PAD_L - PAD_R;
  const plotH = CHART_H - PAD_T - PAD_B;
  const span = Math.max(1e-5, maxVal - minVal);
  if (values.length === 1) {
    const norm = Math.max(0, Math.min(1, (values[0] - minVal) / span));
    const y = PAD_T + (1 - norm) * plotH;
    return `${PAD_L.toFixed(1)},${y.toFixed(1)} ${(PAD_L + plotW).toFixed(1)},${y.toFixed(1)}`;
  }
  const count = values.length - 1;

  return values
    .map((val, idx) => {
      const x = PAD_L + (idx / count) * plotW;
      const norm = Math.max(0, Math.min(1, (val - minVal) / span));
      const y = PAD_T + (1 - norm) * plotH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

function buildAreaPolygon(
  values: number[],
  minVal: number,
  maxVal: number,
): string {
  if (values.length === 0) return '';
  const line = buildPolyline(values, minVal, maxVal);
  const plotW = CHART_W - PAD_L - PAD_R;
  const bottomY = CHART_H - PAD_B;
  const lastX = PAD_L + plotW;
  return `${PAD_L.toFixed(1)},${bottomY.toFixed(1)} ${line} ${lastX.toFixed(1)},${bottomY.toFixed(1)}`;
}

export const SimulationGraphs: React.FC<SimulationGraphsProps> = ({
  samples,
  bottleFlipCount,
  bottleUpright,
}) => {
  const [channel, setChannel] = useState<GraphChannel>('power');
  const latest = samples[samples.length - 1] ?? null;

  const powerSeries = useMemo(() => {
    const vals = samples.map((s) => s.totalPowerWatts);
    const maxW = Math.max(120, ...vals, 100);
    return {
      vals,
      maxW: Math.ceil(maxW / 20) * 20,
      line: buildPolyline(vals, 0, Math.ceil(maxW / 20) * 20),
      area: buildAreaPolygon(vals, 0, Math.ceil(maxW / 20) * 20),
    };
  }, [samples]);

  const jointSeries = useMemo(() => {
    const colors = ['#f59e0b', '#38bdf8', '#22c55e', '#a78bfa'];
    const indices = [0, 1, 2, 4]; // J1, J2, J3, J5 primary joints
    return indices.map((jIdx, i) => ({
      label: `J${jIdx + 1}`,
      color: colors[i],
      line: buildPolyline(
        samples.map((s) => s.joints[jIdx].angleDeg),
        -180,
        180,
      ),
      current: latest ? latest.joints[jIdx].angleDeg : 0,
    }));
  }, [samples, latest]);

  const motionSeries = useMemo(() => {
    const heightCm = samples.map((s) => s.bottleHeightM * 100);
    const tiltDeg = samples.map((s) => s.bottleTiltDeg);
    return {
      heightLine: buildPolyline(heightCm, 0, 50),
      tiltLine: buildPolyline(tiltDeg, 0, 180),
    };
  }, [samples]);

  return (
    <div
      aria-label="Simulation Telemetry Graphs"
      className="flex w-[400px] xl:w-[440px] shrink-0 flex-col border-l border-white/10 bg-[#12161d]"
    >
      {/* Header & Channel Switcher */}
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
        <div className="flex items-center gap-1 rounded bg-[#0d1015] p-0.5 border border-white/10">
          {(
            [
              { id: 'power', label: 'Power (W)' },
              { id: 'joints', label: 'Joints (°)' },
              { id: 'motion', label: 'Bottle Flip' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setChannel(tab.id)}
              className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                channel === tab.id
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 font-mono-tabular text-[11px]">
          <span className="text-slate-400">
            Flips:{' '}
            <strong className="text-sky-300 font-semibold">
              {bottleFlipCount}
            </strong>
          </span>
          <span
            className={bottleUpright ? 'text-emerald-400' : 'text-amber-400'}
          >
            {bottleUpright ? 'Upright' : 'Tilted'}
          </span>
        </div>
      </div>

      {/* Live Numeric Readout Strip */}
      <div className="flex items-center justify-between border-b border-white/5 bg-[#0f1319] px-3 py-1 font-mono-tabular text-[11px]">
        {channel === 'power' && (
          <>
            <span className="text-amber-300">
              Total: {latest ? latest.totalPowerWatts.toFixed(1) : '0.0'} W
            </span>
            <span className="text-slate-300">
              Bus: {latest ? latest.busVoltage.toFixed(1) : '48.0'} V ·{' '}
              {latest ? latest.busCurrentAmps.toFixed(2) : '0.00'} A
            </span>
            <span className="text-slate-400">
              Peak Load: {latest ? latest.peakJointLoadPct.toFixed(0) : '0'}%
            </span>
          </>
        )}
        {channel === 'joints' && (
          <div className="flex w-full items-center justify-between">
            {jointSeries.map((js) => (
              <span key={js.label} style={{ color: js.color }}>
                {js.label}: {js.current.toFixed(1)}°
              </span>
            ))}
          </div>
        )}
        {channel === 'motion' && (
          <>
            <span className="text-sky-300">
              Bottle Y: {latest ? (latest.bottleHeightM * 100).toFixed(1) : '6.5'} cm
            </span>
            <span className="text-amber-300">
              Tilt: {latest ? latest.bottleTiltDeg.toFixed(1) : '0.0'}°
            </span>
            <span className="text-slate-300">
              TCP: {latest ? latest.tcpSpeedMps.toFixed(2) : '0.00'} m/s
            </span>
          </>
        )}
      </div>

      {/* SVG Time-Series Oscilloscope */}
      <div className="flex-1 px-2 py-1.5 min-h-0">
        <svg
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          className="h-full w-full rounded border border-white/5 bg-[#0b0e13]"
          preserveAspectRatio="none"
        >
          {/* Horizontal grid guidelines */}
          {[0.25, 0.5, 0.75].map((frac) => {
            const y = PAD_T + frac * (CHART_H - PAD_T - PAD_B);
            return (
              <line
                key={frac}
                x1={PAD_L}
                y1={y}
                x2={CHART_W - PAD_R}
                y2={y}
                stroke="rgba(148,163,184,0.12)"
                strokeDasharray="3 3"
                strokeWidth="1"
              />
            );
          })}

          {channel === 'power' && (
            <>
              <text
                x={4}
                y={14}
                fill="#64748b"
                fontSize="9"
                fontFamily="IBM Plex Mono, monospace"
              >
                {powerSeries.maxW}W
              </text>
              <text
                x={4}
                y={CHART_H - PAD_B}
                fill="#64748b"
                fontSize="9"
                fontFamily="IBM Plex Mono, monospace"
              >
                0W
              </text>
              {powerSeries.area && (
                <polygon
                  points={powerSeries.area}
                  fill="rgba(245, 158, 11, 0.16)"
                />
              )}
              {powerSeries.line && (
                <polyline
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="1.8"
                  points={powerSeries.line}
                />
              )}
            </>
          )}

          {channel === 'joints' && (
            <>
              <text
                x={2}
                y={14}
                fill="#64748b"
                fontSize="9"
                fontFamily="IBM Plex Mono, monospace"
              >
                +180°
              </text>
              <text
                x={2}
                y={CHART_H - PAD_B}
                fill="#64748b"
                fontSize="9"
                fontFamily="IBM Plex Mono, monospace"
              >
                -180°
              </text>
              {jointSeries.map((js) =>
                js.line ? (
                  <polyline
                    key={js.label}
                    fill="none"
                    stroke={js.color}
                    strokeWidth="1.5"
                    points={js.line}
                  />
                ) : null,
              )}
            </>
          )}

          {channel === 'motion' && (
            <>
              <text
                x={2}
                y={14}
                fill="#64748b"
                fontSize="9"
                fontFamily="IBM Plex Mono, monospace"
              >
                50cm
              </text>
              <text
                x={2}
                y={CHART_H - PAD_B}
                fill="#64748b"
                fontSize="9"
                fontFamily="IBM Plex Mono, monospace"
              >
                0
              </text>
              {motionSeries.heightLine && (
                <polyline
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="1.8"
                  points={motionSeries.heightLine}
                />
              )}
              {motionSeries.tiltLine && (
                <polyline
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="1.5"
                  strokeDasharray="4 2"
                  points={motionSeries.tiltLine}
                />
              )}
            </>
          )}
        </svg>
      </div>
    </div>
  );
};
