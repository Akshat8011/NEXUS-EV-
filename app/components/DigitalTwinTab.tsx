"use client";
import React from 'react';

interface DigitalTwinTabProps {
  sim: any;
  weather: any;
  degradation: any;
  maddpgSchedule: any;
}

const Row = ({ label, simVal, twinVal, unit, diff }: { label: string; simVal: string; twinVal: string; unit: string; diff?: number }) => {
  const driftColor = diff !== undefined ? (Math.abs(diff) < 5 ? 'text-green-400' : Math.abs(diff) < 15 ? 'text-yellow-400' : 'text-red-400') : 'text-gray-400';
  return (
    <tr className="border-b border-gray-700 hover:bg-input hover:bg-opacity-50">
      <td className="py-2 px-3 text-xs text-gray-300">{label}</td>
      <td className="py-2 px-3 text-xs font-mono text-white text-center">{simVal} {unit}</td>
      <td className="py-2 px-3 text-xs font-mono text-accent text-center">{twinVal} {unit}</td>
      <td className={`py-2 px-3 text-xs text-center font-bold ${driftColor}`}>
        {diff !== undefined ? (Math.abs(diff) < 0.1 ? '✓' : `${diff > 0 ? '+' : ''}${diff.toFixed(1)}%`) : '—'}
      </td>
    </tr>
  );
};

export default function DigitalTwinTab({ sim, weather, degradation, maddpgSchedule }: DigitalTwinTabProps) {
  const temp = weather?.current?.main?.temp ?? 25;
  const clouds = weather?.current?.clouds?.all ?? 50;
  const hour = Math.floor(sim.timeStep / 60);

  // Digital twin computes expected solar from weather
  const solarBase = [0,0,0,0,0,0.1,0.8,2.0,4.5,6.0,8.0,10.0,9.5,8.0,6.0,4.0,2.0,0.5,0,0,0,0,0,0][hour] || 0;
  const twinSolar = solarBase * (1 - (clouds/100)*0.8) * (1 - Math.max(0,(temp-25)*0.004)) * 0.5;
  const simSolar = sim.powerLabels.solar || 0;
  const solarDrift = twinSolar > 0 ? ((simSolar - twinSolar) / twinSolar) * 100 : 0;

  const twinHomeLoad = [0.8,0.6,0.5,0.5,0.6,0.8,1.2,1.5,1.8,2.0,2.5,3.0,3.5,3.2,3.0,2.8,2.5,2.8,3.5,3.0,2.5,2.0,1.5,1.0][hour] || 1.0;
  const simHomeLoad = sim.powerLabels.house || 0;
  const loadDrift = twinHomeLoad > 0 ? ((simHomeLoad - twinHomeLoad) / twinHomeLoad) * 100 : 0;

  const twinCapacity = degradation.capacityKwh;
  const simCapacity = 79.0;
  const capacityDrift = ((simCapacity - twinCapacity) / 79.0) * 100;

  const fidelityPoints = [
    Math.max(0, 100 - Math.abs(solarDrift)),
    Math.max(0, 100 - Math.abs(loadDrift)),
    Math.max(0, 100 - capacityDrift * 5),
  ];
  const fidelityScore = Math.round(fidelityPoints.reduce((a,b) => a+b, 0) / fidelityPoints.length);
  const fidelityColor = fidelityScore > 85 ? '#A3BE8C' : fidelityScore > 70 ? '#EBCB8B' : '#BF616A';

  // Event log
  const events = [];
  if (Math.abs(solarDrift) > 15) events.push({ time: `${hour}:00`, msg: `Solar output deviated ${solarDrift.toFixed(1)}% from weather model`, level: 'warn' });
  if (Math.abs(loadDrift) > 20) events.push({ time: `${hour}:00`, msg: `Home load deviated ${loadDrift.toFixed(1)}% from baseline profile`, level: 'warn' });
  if (degradation.soh < 85) events.push({ time: 'Persistent', msg: `Battery SoH ${degradation.soh.toFixed(1)}% — capacity degraded vs original 79 kWh`, level: 'info' });
  if (sim.gridIsDown) events.push({ time: `${hour}:00`, msg: 'Grid failure detected — V2H mode activated in digital twin', level: 'critical' });
  if (maddpgSchedule?.conflictsResolved > 0) events.push({ time: 'Today', msg: `MADDPG resolved ${maddpgSchedule.conflictsResolved} agent conflicts`, level: 'info' });
  if (events.length === 0) events.push({ time: 'Now', msg: 'All systems nominal — twin fidelity high', level: 'ok' });

  const EVENT_COLORS = { ok: 'text-green-400', info: 'text-blue-400', warn: 'text-yellow-400', critical: 'text-red-400' };

  return (
    <div className="p-4 overflow-y-auto h-full custom-scrollbar space-y-6">
      <div>
        <h2 className="text-accent font-bold text-lg mb-1">🔮 Digital Twin — Real-Time HEMS</h2>
        <p className="text-xs text-gray-400">The digital twin continuously mirrors the physical home energy system. It compares simulated state against the weather-calibrated physical model to detect drift and maintain synchronization.</p>
      </div>

      {/* Fidelity Score */}
      <div className="bg-frame rounded p-5 border border-gray-600 text-center">
        <div className="text-xs text-gray-400 mb-2">TWIN FIDELITY SCORE</div>
        <div className="text-6xl font-black mb-1" style={{ color: fidelityColor }}>{fidelityScore}%</div>
        <div className="text-sm" style={{ color: fidelityColor }}>
          {fidelityScore > 85 ? '✓ High Fidelity — Synchronized' : fidelityScore > 70 ? '⚠ Moderate Drift Detected' : '✗ Low Fidelity — Resync Needed'}
        </div>
        <div className="flex justify-center gap-4 mt-3 text-xs text-gray-400">
          <span>Solar: {Math.max(0,100-Math.abs(solarDrift)).toFixed(0)}%</span>
          <span>Load: {Math.max(0,100-Math.abs(loadDrift)).toFixed(0)}%</span>
          <span>Battery: {Math.max(0,100-capacityDrift*5).toFixed(0)}%</span>
        </div>
      </div>

      {/* State Comparison Table */}
      <div>
        <h3 className="font-bold text-sm mb-2 text-accent border-b border-gray-700 pb-1">Real-Time State Comparison</h3>
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
              <Row label="Solar Output" simVal={simSolar.toFixed(2)} twinVal={twinSolar.toFixed(2)} unit="kW" diff={solarDrift} />
              <Row label="Home Load" simVal={simHomeLoad.toFixed(2)} twinVal={twinHomeLoad.toFixed(2)} unit="kW" diff={loadDrift} />
              <Row label="EV Battery Capacity" simVal="79.00" twinVal={twinCapacity.toFixed(2)} unit="kWh" diff={-capacityDrift} />
              <Row label="EV SoC" simVal={sim.evSoc.toFixed(1)} twinVal={sim.evSoc.toFixed(1)} unit="%" diff={0} />
              <Row label="Home Battery SoC" simVal={sim.homeBatterySoc.toFixed(1)} twinVal={sim.homeBatterySoc.toFixed(1)} unit="%" diff={0} />
              <Row label="Ambient Temperature" simVal="—" twinVal={temp.toFixed(1)} unit="°C" />
              <Row label="Cloud Cover" simVal="—" twinVal={`${clouds}`} unit="%" />
              <Row label="Battery SoH" simVal="100.0" twinVal={degradation.soh.toFixed(1)} unit="%" diff={-(100-degradation.soh)} />
            </tbody>
          </table>
        </div>
      </div>

      {/* Digital Twin Architecture */}
      <div>
        <h3 className="font-bold text-sm mb-2 text-accent border-b border-gray-700 pb-1">Twin Architecture</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-input rounded p-3 border border-gray-600">
            <div className="text-xs font-bold text-accent mb-1">📡 Data Inputs</div>
            <ul className="text-xs text-gray-300 space-y-1">
              <li>• OpenWeatherMap (real-time)</li>
              <li>• 5-day forecast</li>
              <li>• User V2G settings</li>
              <li>• Grid outage schedule</li>
              <li>• Battery degradation state</li>
            </ul>
          </div>
          <div className="bg-input rounded p-3 border border-gray-600">
            <div className="text-xs font-bold text-accent mb-1">🧠 Processing Layer</div>
            <ul className="text-xs text-gray-300 space-y-1">
              <li>• Solar irradiance model</li>
              <li>• MADDPG policy engine</li>
              <li>• Degradation kinetics</li>
              <li>• TOU tariff optimizer</li>
              <li>• Fidelity drift detector</li>
            </ul>
          </div>
          <div className="bg-input rounded p-3 border border-gray-600">
            <div className="text-xs font-bold text-accent mb-1">⚡ Physical Sync</div>
            <ul className="text-xs text-gray-300 space-y-1">
              <li>• 111ms tick rate (sim)</li>
              <li>• Real-time weather fetch</li>
              <li>• Charge schedule push</li>
              <li>• Outage auto-response</li>
              <li>• SOH continuous update</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Event Log */}
      <div>
        <h3 className="font-bold text-sm mb-2 text-accent border-b border-gray-700 pb-1">📝 Synchronization Event Log</h3>
        <div className="bg-root rounded border border-gray-600 divide-y divide-gray-700 text-xs max-h-48 overflow-y-auto custom-scrollbar">
          {events.map((e, i) => (
            <div key={i} className="flex gap-3 p-2">
              <span className="text-gray-500 w-20 shrink-0">{e.time}</span>
              <span className={EVENT_COLORS[e.level as keyof typeof EVENT_COLORS]}>{e.msg}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
