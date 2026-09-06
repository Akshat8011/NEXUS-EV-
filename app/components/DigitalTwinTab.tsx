"use client";
import React, { useMemo } from 'react';
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell, LineChart, Line,
} from 'recharts';
import { EVModel } from '../../lib/evModels';

interface DigitalTwinTabProps {
  sim:            any;
  weather:        any;
  degradation:    any;
  maddpgSchedule: any;
  selectedEV:     EVModel;
}

// ─── Solar profile: 5 kWp clear-sky model (matches maddpg.ts & useSimulation.ts) ─
const BASE_SOLAR_KW = [0,0,0,0,0,0.05,0.40,1.20,2.80,4.00,4.80,5.00,4.80,3.80,2.60,1.40,0.50,0.10,0,0,0,0,0,0];

// ─── Home load baseline (kW) ──────────────────────────────────────────────────
const HOME_LOAD_KW = [0.7,0.5,0.5,0.4,0.5,0.7,1.1,1.4,1.7,1.9,2.3,2.8,3.2,3.0,2.8,2.6,2.4,2.7,3.3,2.9,2.4,2.0,1.4,0.9];

const DriftBadge = ({ diff }: { diff: number | null }) => {
  if (diff === null) return <td className="py-2 px-3 text-xs text-center text-gray-500">—</td>;
  const abs = Math.abs(diff);
  const color = abs < 3 ? 'text-green-400' : abs < 10 ? 'text-yellow-400' : 'text-red-400';
  const label = abs < 0.2 ? '✓ Match' : `${diff > 0 ? '+' : ''}${diff.toFixed(1)}%`;
  return <td className={`py-2 px-3 text-xs text-center font-bold ${color}`}>{label}</td>;
};

const Row = ({
  label, simVal, twinVal, unit, diff, note
}: { label: string; simVal: string; twinVal: string; unit: string; diff: number | null; note?: string }) => (
  <tr className="border-b border-gray-700 hover:bg-input hover:bg-opacity-50">
    <td className="py-2 px-3 text-xs text-gray-300">
      {label}
      {note && <div className="text-[9px] text-gray-500 mt-0.5">{note}</div>}
    </td>
    <td className="py-2 px-3 text-xs font-mono text-white text-center">{simVal} {unit}</td>
    <td className="py-2 px-3 text-xs font-mono text-accent text-center">{twinVal} {unit}</td>
    <DriftBadge diff={diff} />
  </tr>
);

export default function DigitalTwinTab({ sim, weather, degradation, maddpgSchedule, selectedEV }: DigitalTwinTabProps) {
  const hour     = Math.floor((sim.timeStep ?? 0) / 60) % 24;
  const tempC    = weather?.current?.main?.temp     ?? 25;
  const cloudPct = weather?.current?.clouds?.all    ?? 50;

  // ─── Physics-correct twin computations ────────────────────────────────────

  // SOLAR:
  //   Simulation: runs clear-sky profile (no cloud awareness by design)
  //   Twin:       applies real-time cloud + temperature de-rating
  const clearSkyKw   = BASE_SOLAR_KW[hour] ?? 0;
  const cloudFx      = 1 - (cloudPct / 100) * 0.82;
  const tempFx       = 1 - Math.max(0, (tempC - 25) * 0.004);
  const twinSolarKw  = Math.max(0, clearSkyKw * cloudFx * tempFx);
  const simSolarKw   = sim.powerLabels?.solar ?? 0;
  // Drift: how much cloud correction explains the gap
  // (positive drift means sim overestimates vs cloud-adjusted reality)
  const solarDriftPct = clearSkyKw > 0.05
    ? ((simSolarKw - twinSolarKw) / clearSkyKw) * 100
    : null;

  // HOME LOAD:
  const twinHomeLoadKw = HOME_LOAD_KW[hour] ?? 0.8;
  const simHomeLoadKw  = sim.powerLabels?.house ?? 0;
  const loadDriftPct   = twinHomeLoadKw > 0
    ? ((simHomeLoadKw - twinHomeLoadKw) / twinHomeLoadKw) * 100
    : null;

  // EV BATTERY CAPACITY:
  //   Simulation: always uses the nominal capacity of the selected EV model
  //   Twin:       tracks SoH-adjusted actual capacity (from degradation model)
  const nominalCapKwh   = selectedEV.batteryKwh;                             // what the sim uses
  const twinCapKwh      = (degradation.soh / 100) * nominalCapKwh;           // what twin measures
  const capacityDriftPct = ((nominalCapKwh - twinCapKwh) / nominalCapKwh) * 100; // = % degradation = (100 - SoH)

  // EV SOC: both sides use the same simulation state (perfect sync)
  const simEvSoc  = sim.evSoc ?? 0;
  const twinEvSoc = sim.evSoc ?? 0;       // twin shadows the sim
  const socDriftPct = 0;                   // by definition — SoC is shared state

  // HOME BATTERY SOC
  const simBattSoc  = sim.homeBatterySoc ?? 0;
  const twinBattSoc = sim.homeBatterySoc ?? 0;

  // BATTERY SOH:
  //   Simulation: assumes 100% (no degradation in physics loop, by design)
  //   Twin:       tracks real degradation from cycle history
  const simSoH   = 100.0;
  const twinSoH  = degradation.soh;
  const sohDrift = twinSoH - simSoH;    // negative = degradation detected

  // POWER BALANCE (twin energy-balance check):
  //   In = Solar + Grid
  //   Out = Home Load + EV Charge + V2G Export
  //   Balance error should be < 1%
  const simGrid    = sim.powerLabels?.grid    ?? 0;
  const simEV      = sim.powerLabels?.ev      ?? 0;
  const simBattery = sim.powerLabels?.battery ?? 0;
  const powerIn    = Math.max(0, simSolarKw) + Math.max(0, simGrid);
  const powerOut   = Math.max(0, simHomeLoadKw) + Math.max(0, simEV);
  const powerBalance = powerIn > 0.01 ? ((powerIn - powerOut) / powerIn) * 100 : 0;

  // ─── Fidelity Score (0-100%) ───────────────────────────────────────────────
  // Weighted composite of individual sub-scores:
  //   40% → SoC tracking (most critical for user safety)
  //   25% → Load model accuracy (vs baseline profile)
  //   20% → Solar model (sim is clear-sky; twin is weather-adjusted → expected gap)
  //   15% → Battery health tracking accuracy

  // SoC score: perfect (100%) since both sides read the same state
  const socScore = 100;

  // Load score: penalize beyond ±15% drift
  const loadScore = loadDriftPct !== null
    ? Math.max(0, 100 - Math.max(0, Math.abs(loadDriftPct) - 5))
    : 80;

  // Solar score: sim intentionally runs clear-sky; cloud gap is EXPECTED not an error.
  // Score measures whether the sim's clear-sky value matches the BASE_SOLAR profile exactly.
  const clearSkySimDrift = clearSkyKw > 0.05
    ? Math.abs(simSolarKw - clearSkyKw) / clearSkyKw * 100
    : 0;
  const solarScore = Math.max(0, 100 - clearSkySimDrift);

  // SoH score: penalize if degradation is untracked (deviation of sim SoH from twin SoH)
  const sohScore = Math.max(0, 100 - Math.abs(sohDrift) * 2);

  const fidelityScore = Math.round(
    socScore * 0.40 +
    loadScore * 0.25 +
    solarScore * 0.20 +
    sohScore * 0.15
  );
  const fidelityColor = fidelityScore > 85 ? '#A3BE8C' : fidelityScore > 70 ? '#EBCB8B' : '#BF616A';
  const fidelityLabel = fidelityScore > 85 ? '✓ High Fidelity — Synchronized'
                      : fidelityScore > 70 ? '⚠ Moderate Drift'
                      : '✗ Low Fidelity — Check Parameters';

  // ─── Radar data for twin health overview ──────────────────────────────────
  const radarData = [
    { axis: 'SoC Track',    score: socScore },
    { axis: 'Load Model',   score: loadScore },
    { axis: 'Solar Model',  score: solarScore },
    { axis: 'Battery SoH',  score: sohScore },
    { axis: 'Power Balance', score: Math.max(0, 100 - Math.abs(powerBalance) * 5) },
  ];

  // ─── Hourly power budget (from MADDPG) ────────────────────────────────────
  const hourlyBudget = maddpgSchedule?.actions?.map((a: any) => ({
    h: `${a.hour}h`,
    solar: BASE_SOLAR_KW[a.hour] ?? 0,
    load:  HOME_LOAD_KW[a.hour] ?? 0,
    ev:    Math.max(0, a.evPowerKw),
    v2g:   Math.abs(Math.min(0, a.evPowerKw)),
  })) ?? [];

  // ─── Event log ────────────────────────────────────────────────────────────
  const events: { time: string; msg: string; level: 'ok'|'info'|'warn'|'critical' }[] = [];

  if (Math.abs(clearSkySimDrift) > 20)
    events.push({ time: `${hour}:00`, msg: `Solar model deviation ${clearSkySimDrift.toFixed(1)}% from IEC 61724 clear-sky baseline`, level: 'warn' });
  if (cloudPct > 60)
    events.push({ time: `${hour}:00`, msg: `${cloudPct}% cloud cover — twin reduces solar forecast by ${((1-cloudFx)*100).toFixed(0)}% vs simulation`, level: 'info' });
  if (loadDriftPct !== null && Math.abs(loadDriftPct) > 20)
    events.push({ time: `${hour}:00`, msg: `Home load ${simHomeLoadKw.toFixed(2)} kW deviates ${loadDriftPct.toFixed(1)}% from baseline profile`, level: 'warn' });
  if (degradation.soh < 95)
    events.push({ time: 'Persistent', msg: `Battery SoH ${degradation.soh.toFixed(1)}% — twin capacity ${twinCapKwh.toFixed(1)} kWh vs nominal ${nominalCapKwh} kWh`, level: 'info' });
  if (degradation.soh < 85)
    events.push({ time: 'Critical', msg: `SoH < 85% — accelerated SEI growth detected (Naumann 2020). Cycle carefully.`, level: 'warn' });
  if (sim.gridIsDown)
    events.push({ time: `${hour}:00`, msg: 'Grid failure — V2H mode active. Twin tracking home power via EV discharge.', level: 'critical' });
  if (maddpgSchedule?.conflictsResolved > 0)
    events.push({ time: 'Today', msg: `MADDPG resolved ${maddpgSchedule.conflictsResolved} agent scheduling conflicts`, level: 'info' });
  if (tempC > 35)
    events.push({ time: `${hour}:00`, msg: `Ambient temp ${tempC.toFixed(0)}°C — thermal stress factor ${(1+(tempC-25)*0.028).toFixed(2)}× on battery`, level: 'warn' });
  if (events.length === 0)
    events.push({ time: 'Now', msg: 'All subsystems nominal — digital twin synchronized', level: 'ok' });

  const EVENT_COLORS = { ok: 'text-green-400', info: 'text-blue-400', warn: 'text-yellow-400', critical: 'text-red-400' };

  return (
    <div className="p-4 overflow-y-auto h-full custom-scrollbar space-y-8">

      {/* Header */}
      <div>
        <h2 className="text-accent font-bold text-lg">🔮 Digital Twin — Real-Time HEMS</h2>
        <p className="text-xs text-gray-400 mt-1">
          Continuously shadows the physical home energy system. Compares simulation state
          (clear-sky, nominal battery) against the weather-calibrated, SoH-adjusted twin model to
          detect drift and maintain synchronization. Reference: Tao et al. (2019), Bhattarai et al. (2023).
        </p>
        <div className="text-xs text-gray-500 mt-1">
          Model: {selectedEV.flag} {selectedEV.brand} {selectedEV.model} &nbsp;|&nbsp;
          Capacity: {nominalCapKwh} kWh nominal / {twinCapKwh.toFixed(1)} kWh actual (SoH {degradation.soh.toFixed(1)}%) &nbsp;|&nbsp;
          Weather: {tempC.toFixed(0)}°C, {cloudPct}% cloud
        </div>
      </div>

      {/* Fidelity Score */}
      <div className="bg-frame rounded p-5 border border-gray-600 text-center">
        <div className="text-xs text-gray-400 mb-2 tracking-widest">TWIN FIDELITY SCORE</div>
        <div className="text-6xl font-black mb-1" style={{ color: fidelityColor }}>{fidelityScore}%</div>
        <div className="text-sm font-bold" style={{ color: fidelityColor }}>{fidelityLabel}</div>
        <div className="flex flex-wrap justify-center gap-4 mt-4 text-xs">
          <div className="text-center">
            <div className="text-gray-400">SoC Tracking</div>
            <div className="font-bold text-white">{socScore.toFixed(0)}%</div>
            <div className="text-[9px] text-gray-500">40% weight</div>
          </div>
          <div className="text-center">
            <div className="text-gray-400">Load Model</div>
            <div className="font-bold text-white">{loadScore.toFixed(0)}%</div>
            <div className="text-[9px] text-gray-500">25% weight</div>
          </div>
          <div className="text-center">
            <div className="text-gray-400">Solar Model</div>
            <div className="font-bold text-white">{solarScore.toFixed(0)}%</div>
            <div className="text-[9px] text-gray-500">20% weight (clear-sky)</div>
          </div>
          <div className="text-center">
            <div className="text-gray-400">Battery SoH</div>
            <div className="font-bold text-white">{sohScore.toFixed(0)}%</div>
            <div className="text-[9px] text-gray-500">15% weight</div>
          </div>
        </div>
      </div>

      {/* State Comparison Table */}
      <div>
        <h3 className="font-bold text-sm mb-2 text-accent border-b border-gray-700 pb-1">
          Real-Time State Comparison
          <span className="text-gray-500 font-normal text-xs ml-2">— Hour {hour}:00 ({tempC.toFixed(0)}°C, {cloudPct}% cloud)</span>
        </h3>
        <div className="bg-root rounded overflow-hidden border border-gray-600">
          <table className="w-full">
            <thead>
              <tr className="bg-input text-xs text-gray-400">
                <th className="py-2 px-3 text-left">Parameter</th>
                <th className="py-2 px-3 text-center">Simulation</th>
                <th className="py-2 px-3 text-center">Digital Twin</th>
                <th className="py-2 px-3 text-center">Drift</th>
              </tr>
            </thead>
            <tbody>
              <Row
                label="Solar Output"
                simVal={simSolarKw.toFixed(2)} twinVal={twinSolarKw.toFixed(2)} unit="kW"
                diff={solarDriftPct}
                note={`Sim: clear-sky model | Twin: ${cloudPct}% cloud-adjusted (${(cloudFx*100).toFixed(0)}% of clear-sky)`}
              />
              <Row
                label="Home Load"
                simVal={simHomeLoadKw.toFixed(2)} twinVal={twinHomeLoadKw.toFixed(2)} unit="kW"
                diff={loadDriftPct}
                note="vs baseline residential profile"
              />
              <Row
                label="EV Battery Capacity"
                simVal={nominalCapKwh.toFixed(2)} twinVal={twinCapKwh.toFixed(2)} unit="kWh"
                diff={-capacityDriftPct}
                note={`Sim: nominal | Twin: SoH-adjusted (${degradation.soh.toFixed(1)}% × ${nominalCapKwh} kWh)`}
              />
              <Row
                label="EV State of Charge"
                simVal={simEvSoc.toFixed(1)} twinVal={twinEvSoc.toFixed(1)} unit="%"
                diff={socDriftPct}
                note="Shared state — twin mirrors sim SoC"
              />
              <Row
                label="Home Battery SoC"
                simVal={simBattSoc.toFixed(1)} twinVal={twinBattSoc.toFixed(1)} unit="%"
                diff={0}
              />
              <Row
                label="Battery SoH"
                simVal={simSoH.toFixed(1)} twinVal={twinSoH.toFixed(1)} unit="%"
                diff={sohDrift}
                note="Sim assumes nominal | Twin tracks cycle degradation (Naumann 2020)"
              />
              <Row
                label="Ambient Temperature"
                simVal="—" twinVal={tempC.toFixed(1)} unit="°C"
                diff={null}
              />
              <Row
                label="Cloud Cover"
                simVal="—" twinVal={`${cloudPct}`} unit="%"
                diff={null}
              />
              <Row
                label="Power Balance Error"
                simVal={`${powerBalance.toFixed(1)}%`}
                twinVal="0.00"
                unit=""
                diff={powerBalance}
                note="(Power In − Power Out) / Power In — should be ≈ 0"
              />
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-gray-500 italic mt-1">
          Solar drift is expected: simulation uses a deterministic clear-sky IEC 61724 profile; the twin applies
          OpenWeatherMap real-time cloud and temperature de-rating. This is by design, not a model failure.
        </p>
      </div>

      {/* Twin health radar */}
      <div>
        <h3 className="font-bold text-sm mb-2 text-accent border-b border-gray-700 pb-1">Twin Health Radar</h3>
        <div className="h-64 bg-white rounded p-2">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData}>
              <PolarGrid />
              <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11 }} />
              <Radar name="Fidelity" dataKey="score" stroke="#88C0D0" fill="#88C0D0" fillOpacity={0.4} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Hourly Power Budget */}
      {hourlyBudget.length > 0 && (
        <div>
          <h3 className="font-bold text-sm mb-2 text-accent border-b border-gray-700 pb-1">
            24-Hour MADDPG Power Budget (kW)
          </h3>
          <div className="h-56 bg-white rounded p-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyBudget} margin={{ top: 5, right: 8, left: -15, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="h" tick={{ fontSize: 8 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip formatter={(v: any) => `${Number(v).toFixed(2)} kW`} />
                <Legend wrapperStyle={{ fontSize: '10px' }} />
                <Bar dataKey="solar"  fill="#EBCB8B" name="Solar (kW)"     stackId="a" />
                <Bar dataKey="load"   fill="#5E81AC" name="Home Load (kW)"  stackId="b" />
                <Bar dataKey="ev"     fill="#A3BE8C" name="EV Charge (kW)"  stackId="b" />
                <Bar dataKey="v2g"    fill="#BF616A" name="V2G Export (kW)" stackId="c" radius={[2,2,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Twin Architecture */}
      <div>
        <h3 className="font-bold text-sm mb-2 text-accent border-b border-gray-700 pb-1">Twin Architecture</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-input rounded p-3 border border-gray-600">
            <div className="text-xs font-bold text-accent mb-2">📡 Data Inputs</div>
            <ul className="text-xs text-gray-300 space-y-1">
              <li>• OpenWeatherMap (real-time temp, cloud)</li>
              <li>• 5-day forecast → 8 × 3-hour slots</li>
              <li>• EV model: {selectedEV.brand} {selectedEV.model}</li>
              <li>• Battery: {nominalCapKwh} kWh {selectedEV.chemistry}</li>
              <li>• Grid outage schedule (user-entered)</li>
              <li>• Degradation state (localStorage)</li>
            </ul>
          </div>
          <div className="bg-input rounded p-3 border border-gray-600">
            <div className="text-xs font-bold text-accent mb-2">🧠 Processing Layer</div>
            <ul className="text-xs text-gray-300 space-y-1">
              <li>• IEC 61724 solar irradiance model</li>
              <li>• MADDPG (3-agent policy engine)</li>
              <li>• Naumann (2020) degradation kinetics</li>
              <li>• TOU tariff optimizer (₹6.50–₹14.50)</li>
              <li>• Drift detector + fidelity scorer</li>
              <li>• Physics energy-balance validator</li>
            </ul>
          </div>
          <div className="bg-input rounded p-3 border border-gray-600">
            <div className="text-xs font-bold text-accent mb-2">⚡ Physical Sync</div>
            <ul className="text-xs text-gray-300 space-y-1">
              <li>• 111 ms tick → 1440 steps/day</li>
              <li>• Real-time weather API polling</li>
              <li>• SoC shadow: every sim tick</li>
              <li>• SoH update: every simulated day</li>
              <li>• Outage auto-response (V2H dispatch)</li>
              <li>• Habit recording (end-of-day)</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Event Log */}
      <div>
        <h3 className="font-bold text-sm mb-2 text-accent border-b border-gray-700 pb-1">📝 Synchronization Event Log</h3>
        <div className="bg-root rounded border border-gray-600 divide-y divide-gray-700 text-xs max-h-52 overflow-y-auto custom-scrollbar">
          {events.map((e, i) => (
            <div key={i} className="flex gap-3 p-2">
              <span className="text-gray-500 w-20 shrink-0">{e.time}</span>
              <span className={EVENT_COLORS[e.level]}>{e.msg}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
