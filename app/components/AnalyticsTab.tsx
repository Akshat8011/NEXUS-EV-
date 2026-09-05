"use client";
import React, { useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine, Cell
} from 'recharts';
import { DegradationState, generateDegradationCurve } from '../../lib/degradation';
import { MADDPGSchedule } from '../../lib/maddpg';
import { EVModel, CHEMISTRY_INFO } from '../../lib/evModels';

interface AnalyticsTabProps {
  degradation: DegradationState;
  habits: any[];
  habitAnalytics: any;
  maddpgSchedule: MADDPGSchedule | null;
  weatherTemp: number;
  selectedEV?: EVModel;
}

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h2 className="text-accent font-bold text-base border-b border-gray-600 pb-1 mb-3">{children}</h2>
);

const StatCard = ({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) => (
  <div className="bg-input rounded p-3 text-center">
    <div className="text-xs text-gray-400 mb-1">{label}</div>
    <div className={`text-xl font-bold ${color || 'text-white'}`}>{value}</div>
    {sub && <div className="text-[10px] text-gray-400 mt-0.5">{sub}</div>}
  </div>
);

export default function AnalyticsTab({ degradation, habits, habitAnalytics, maddpgSchedule, weatherTemp, selectedEV }: AnalyticsTabProps) {
  const batteryKwh = selectedEV?.batteryKwh ?? 79;
  const degradationFactor = selectedEV?.degradationFactor ?? 1.0;
  const chemistry = selectedEV?.chemistry ?? 'NMC';
  const chemInfo = CHEMISTRY_INFO[chemistry];

  const degradationCurve = useMemo(() =>
    generateDegradationCurve(degradation.soh, weatherTemp, 70, 300000, batteryKwh),
    [degradation.soh, weatherTemp, batteryKwh]
  );

  const sohColor = degradation.soh > 90 ? '#A3BE8C' : degradation.soh > 80 ? '#EBCB8B' : '#BF616A';

  const agentData = maddpgSchedule?.actions.map(a => ({
    hour: `${a.hour}h`,
    evReward: a.agentRewards.ev,
    homeReward: a.agentRewards.home,
    gridReward: a.agentRewards.grid,
    evPower: a.evPowerKw,
  })) || [];

  const habitChartData = habits.slice(-14).map((h, i) => ({
    session: `S${i + 1}`,
    startSoc: h.chargingStartSoc,
    endSoc: h.chargingEndSoc,
    km: h.estimatedKm,
    costRs: h.costRs,
    earningsRs: h.earningsRs,
  }));

  // Charging time heatmap simulation (hours users typically start charging)
  const chargingHeatmap = Array.from({ length: 24 }, (_, h) => {
    const freq = habits.filter(hb => {
      const startHour = new Date(hb.date).getHours();
      return startHour === h;
    }).length;
    return { hour: `${h}:00`, frequency: freq };
  });

  return (
    <div className="p-4 overflow-y-auto h-full custom-scrollbar space-y-8">

      {/* === BATTERY DEGRADATION === */}
      <section>
        <SectionTitle>🔋 Battery Degradation & Life Cycles</SectionTitle>

        {/* EV Model Info Card */}
        {selectedEV && (
          <div className="bg-input rounded p-3 mb-4 border border-gray-600 flex flex-wrap gap-4 items-start">
            <div>
              <div className="text-xs text-gray-400">Selected EV</div>
              <div className="font-bold text-white">{selectedEV.flag} {selectedEV.brand} {selectedEV.model} ({selectedEV.year})</div>
            </div>
            <div>
              <div className="text-xs text-gray-400">Battery Chemistry</div>
              <div className="font-bold" style={{ color: chemInfo?.color }}>{chemInfo?.label}</div>
              <div className="text-[10px] text-gray-400 max-w-xs">{chemInfo?.note}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400">Degradation Profile</div>
              <div className="font-bold text-white">{degradationFactor < 0.85 ? '🟢 Excellent (LFP)' : degradationFactor < 1.0 ? '🟡 Good' : degradationFactor < 1.1 ? '🟠 Standard' : '🔴 Higher Risk'}</div>
              <div className="text-[10px] text-gray-400">{degradationFactor}× vs baseline</div>
            </div>
            <div>
              <div className="text-xs text-gray-400">Warranty</div>
              <div className="font-bold text-white">{selectedEV.warrantyYears} yrs / {(selectedEV.warrantyKm/1000).toFixed(0)}k km</div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <StatCard label="State of Health" value={`${degradation.soh.toFixed(1)}%`} sub="100% = new battery" color={sohColor} />
          <StatCard label="Full Equiv. Cycles" value={degradation.fec.toFixed(1)} sub="FEC completed" />
          <StatCard label="Usable Capacity" value={`${degradation.capacityKwh.toFixed(1)} kWh`} sub={`of ${batteryKwh} kWh original`} />
          <StatCard
            label="Est. Lifetime Remaining"
            value={`${(degradation.estimatedLifetimeKm/1000).toFixed(0)}k km`}
            sub="until SoH < 80%"
            color={degradation.estimatedLifetimeKm > 150000 ? '#A3BE8C' : '#BF616A'}
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
          <StatCard label="Temp Stress Factor" value={`${degradation.temperatureStress.toFixed(2)}×`} sub="1.0 = ideal" color={degradation.temperatureStress > 1.3 ? '#BF616A' : '#A3BE8C'} />
          <StatCard label="Calendar Age" value={`${degradation.calendarDays} days`} sub="since first use" />
          <StatCard label="Degradation Rate" value={`${degradation.degradationRate.toFixed(3)}%`} sub="per 1000 FEC" />
        </div>

        <div className="bg-white rounded p-3 h-52">
          <div className="text-xs font-bold text-center text-black mb-1">Battery SoH vs Lifetime Distance (Research Model)</div>
          <ResponsiveContainer width="100%" height="90%">
            <LineChart data={degradationCurve} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="km" tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <YAxis domain={[60, 100]} ticks={[60,70,80,90,100]} />
              <Tooltip formatter={(v: any, n) => [`${Number(v).toFixed(1)}${n === 'soh' ? '%' : ' kWh'}`, n === 'soh' ? 'State of Health' : 'Capacity']} labelFormatter={v => `${(Number(v)/1000).toFixed(0)}k km`} />
              <Legend />
              <ReferenceLine y={80} stroke="#BF616A" strokeDasharray="6 3" label={{ value: 'End of Life (80%)', position: 'right', fontSize: 10, fill: '#BF616A' }} />
              <Line type="monotone" dataKey="soh" stroke="#A3BE8C" name="soh" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="capacityKwh" stroke="#5E81AC" name="capacityKwh" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Cycle history table */}
        {degradation.cycleHistory.length > 0 && (
          <div className="mt-3">
            <div className="text-xs font-bold mb-2 text-gray-300">Recent Charge Sessions</div>
            <div className="bg-input rounded overflow-hidden text-xs border border-gray-600">
              <div className="flex bg-root font-bold p-2 border-b border-gray-500">
                <div className="w-10">#</div>
                <div className="w-16">SoC Start</div>
                <div className="w-14">SoC End</div>
                <div className="w-12">DoD</div>
                <div className="w-12">Temp</div>
                <div className="w-14">FEC Added</div>
                <div className="flex-1">Stress</div>
              </div>
              <div className="max-h-32 overflow-y-auto custom-scrollbar">
                {[...degradation.cycleHistory].reverse().map((c, i) => (
                  <div key={i} className="flex p-2 border-b border-gray-700">
                    <div className="w-10">{c.session}</div>
                    <div className="w-16">{c.socStart.toFixed(0)}%</div>
                    <div className="w-14">{c.socEnd.toFixed(0)}%</div>
                    <div className="w-12">{c.dod.toFixed(0)}%</div>
                    <div className="w-12">{c.temp.toFixed(0)}°C</div>
                    <div className="w-14">{c.fecAdded.toFixed(3)}</div>
                    <div className={`flex-1 ${c.stressMultiplier > 1.5 ? 'text-red-400' : c.stressMultiplier > 1.0 ? 'text-yellow-400' : 'text-green-400'}`}>{c.stressMultiplier.toFixed(2)}×</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* === MADDPG AGENT ANALYTICS === */}
      <section>
        <SectionTitle>🤖 MADDPG Multi-Agent Optimization</SectionTitle>
        {maddpgSchedule ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <StatCard label="Total Reward" value={maddpgSchedule.overallReward.toFixed(1)} sub="Agent performance score" color="#88C0D0" />
              <StatCard label="V2G Sessions" value={`${maddpgSchedule.v2gSessions}`} sub="today's schedule" />
              <StatCard label="Conflicts Resolved" value={`${maddpgSchedule.conflictsResolved}`} sub="by policy arbiter" />
              <StatCard label="Solar Harvested" value={`${maddpgSchedule.solarEnergyKwh} kWh`} sub="estimated today" color="#EBCB8B" />
            </div>

            <div className="bg-white rounded p-3 h-52 mb-4">
              <div className="text-xs font-bold text-center text-black mb-1">Agent Rewards per Hour (Multi-Agent Policy)</div>
              <ResponsiveContainer width="100%" height="90%">
                <BarChart data={agentData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="hour" tick={{ fontSize: 9 }} />
                  <YAxis />
                  <Tooltip />
                  <Legend iconType="square" wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="evReward" name="EV Agent" fill="#A3BE8C" stackId="a" />
                  <Bar dataKey="homeReward" name="Home Agent" fill="#88C0D0" stackId="a" />
                  <Bar dataKey="gridReward" name="Grid Agent" fill="#EBCB8B" stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded p-3 h-44">
              <div className="text-xs font-bold text-center text-black mb-1">EV Power Schedule — MADDPG Output (kW)</div>
              <ResponsiveContainer width="100%" height="90%">
                <BarChart data={agentData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="hour" tick={{ fontSize: 9 }} />
                  <YAxis />
                  <ReferenceLine y={0} stroke="#333" />
                  <Tooltip formatter={(v: any) => [`${Number(v).toFixed(1)} kW`, 'EV Power']} />
                  <Bar dataKey="evPower" name="EV Power (kW)" radius={2}>
                    {agentData.map((entry, i) => (
                      <Cell key={i} fill={entry.evPower > 0 ? '#A3BE8C' : entry.evPower < 0 ? '#BF616A' : '#4C566A'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-4">
              <div className="text-xs font-bold mb-2 text-gray-300">24-Hour MADDPG Recommendations</div>
              <div className="bg-input rounded text-xs max-h-40 overflow-y-auto custom-scrollbar">
                {maddpgSchedule.actions.map((a, i) => (
                  <div key={i} className="flex items-center p-2 border-b border-gray-700">
                    <span className="w-10 text-accent font-bold">{a.hour}:00</span>
                    <span className={`w-28 font-semibold ${
                      a.evAction === 'discharge_v2g' ? 'text-red-400' :
                      a.evAction === 'charge' ? 'text-green-400' :
                      a.evAction === 'drive' ? 'text-yellow-400' : 'text-gray-400'
                    }`}>{a.evAction.toUpperCase()}</span>
                    <span className="flex-1 text-gray-300">{a.recommendation}</span>
                    <span className="text-gray-500 w-16 text-right">R={a.agentRewards.ev.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="text-center text-gray-400 py-8">Run a simulation to generate MADDPG schedule.</div>
        )}
      </section>

      {/* === USER HABIT ANALYTICS === */}
      <section>
        <SectionTitle>📊 User Driving & Charging Habits</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <StatCard label="Sessions Recorded" value={`${habitAnalytics.sessions}`} />
          <StatCard label="Total Distance" value={`${(habitAnalytics.totalKm).toFixed(0)} km`} />
          <StatCard label="Cost per km" value={`₹${habitAnalytics.costPerKm.toFixed(2)}`} />
          <StatCard label="V2G Earnings" value={`₹${habitAnalytics.totalEarningsRs.toFixed(0)}`} color="#A3BE8C" />
        </div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <StatCard label="Avg Plug-In SoC" value={`${habitAnalytics.avgChargingStartSoc.toFixed(0)}%`} sub="when you plug in" />
          <StatCard label="Avg Unplug SoC" value={`${habitAnalytics.avgChargingEndSoc.toFixed(0)}%`} sub="when you leave" />
        </div>

        {habitChartData.length > 0 ? (
          <div className="bg-white rounded p-3 h-48">
            <div className="text-xs font-bold text-center text-black mb-1">SoC at Plug-In vs Plug-Out (per Session)</div>
            <ResponsiveContainer width="100%" height="90%">
              <BarChart data={habitChartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="session" tick={{ fontSize: 9 }} />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Legend iconType="square" wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="startSoc" name="Plug-In SoC %" fill="#BF616A" />
                <Bar dataKey="endSoc" name="Plug-Out SoC %" fill="#A3BE8C" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-center text-gray-400 py-6 border border-dashed border-gray-600 rounded">
            Run simulations to build up your habit profile over time.
          </div>
        )}
      </section>
    </div>
  );
}
