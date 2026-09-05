"use client";
import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LineChart, Line, Legend } from 'recharts';
import { DailyEstimation } from '../../lib/dailyPlanner';

interface DailyPlannerTabProps {
  estimation: DailyEstimation | null;
  isLoading: boolean;
  onRefresh: () => void;
}

const ACTION_BG: Record<string, string> = {
  'Drive (Commute)':    'bg-yellow-500',
  'Solar Charge':       'bg-green-500',
  'Night Charge':       'bg-blue-600',
  'V2G Export':         'bg-red-500',
  'V2H (Outage)':       'bg-orange-500',
  'Pre-Outage Charge':  'bg-cyan-500',
  'Grid Charge':        'bg-purple-500',
  'Solar (Home)':       'bg-yellow-300',
  'Outage (No Power)':  'bg-gray-600',
  'Idle':               'bg-gray-600',
};

const PRIORITY_COLOR = { high: 'border-red-500', medium: 'border-yellow-500', low: 'border-blue-400' };
const PRIORITY_BG = { high: 'bg-red-900 bg-opacity-30', medium: 'bg-yellow-900 bg-opacity-20', low: 'bg-blue-900 bg-opacity-20' };

export default function DailyPlannerTab({ estimation, isLoading, onRefresh }: DailyPlannerTabProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-accent animate-pulse text-lg">Generating daily plan...</div>
      </div>
    );
  }

  if (!estimation) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="text-gray-400">No daily estimation yet. Weather data is required.</div>
        <button onClick={onRefresh} className="bg-accent text-root font-bold px-6 py-2 rounded hover:bg-ev">Generate Plan</button>
      </div>
    );
  }

  const { hourlyPlan, summary, recommendations, cityName, date } = estimation;

  const socData = hourlyPlan.map(h => ({
    hour: `${h.hour}h`,
    soc: h.estimatedSoc,
    solar: h.solarKw,
    isOutage: h.isOutage ? 1 : 0,
  }));

  const financialData = hourlyPlan.filter(h => h.costRs > 0 || h.earningRs > 0).map(h => ({
    hour: `${h.hour}h`,
    cost: -h.costRs,
    earning: h.earningRs,
  }));

  return (
    <div className="p-4 overflow-y-auto h-full custom-scrollbar space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
        <div>
          <h2 className="text-accent font-bold text-lg">Daily Smart Energy Plan</h2>
          <div className="text-xs text-gray-400">{cityName} · {date}</div>
        </div>
        <button onClick={onRefresh} className="bg-input hover:bg-accent hover:text-root text-white font-bold px-4 py-1.5 rounded text-sm transition-colors">
          ↻ Refresh Plan
        </button>
      </div>

      {/* Outage Warnings */}
      {summary.outageWarnings.length > 0 && (
        <div className="space-y-2">
          {summary.outageWarnings.map((w, i) => (
            <div key={i} className="bg-red-900 bg-opacity-40 border border-red-500 rounded p-3 text-sm font-bold text-red-300">
              {w}
            </div>
          ))}
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-input rounded p-3 text-center">
          <div className="text-xs text-gray-400 mb-1">Net Day Estimate</div>
          <div className={`text-xl font-bold ${summary.netRs >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {summary.netRs >= 0 ? '+' : ''}₹{summary.netRs.toFixed(2)}
          </div>
        </div>
        <div className="bg-input rounded p-3 text-center">
          <div className="text-xs text-gray-400 mb-1">Solar Harvest</div>
          <div className="text-xl font-bold text-yellow-400">{summary.totalSolarKwh} kWh</div>
        </div>
        <div className="bg-input rounded p-3 text-center">
          <div className="text-xs text-gray-400 mb-1">Peak SoC</div>
          <div className="text-xl font-bold text-green-400">{summary.peakSoc.toFixed(0)}%</div>
          <div className="text-[10px] text-gray-500">at {summary.peakSocHour}:00</div>
        </div>
        <div className="bg-input rounded p-3 text-center">
          <div className="text-xs text-gray-400 mb-1">Lowest SoC</div>
          <div className={`text-xl font-bold ${summary.lowestSoc < 20 ? 'text-red-400' : 'text-white'}`}>{summary.lowestSoc.toFixed(0)}%</div>
          <div className="text-[10px] text-gray-500">at {summary.lowestSocHour}:00</div>
        </div>
      </div>

      {/* AI Recommendations */}
      <div>
        <h3 className="text-sm font-bold text-accent mb-2 border-b border-gray-700 pb-1">💡 Smart Recommendations</h3>
        <div className="space-y-2">
          {recommendations.map((r, i) => (
            <div key={i} className={`border-l-4 rounded p-3 ${PRIORITY_COLOR[r.priority]} ${PRIORITY_BG[r.priority]}`}>
              <div className="text-sm font-bold">{r.icon} {r.title}</div>
              <div className="text-xs text-gray-300 mt-0.5">{r.detail}</div>
            </div>
          ))}
        </div>
      </div>

      {/* EV SoC forecast chart */}
      <div className="bg-white rounded p-3 h-52">
        <div className="text-xs font-bold text-center text-black mb-1">Estimated EV SoC Throughout the Day (%)</div>
        <ResponsiveContainer width="100%" height="90%">
          <LineChart data={socData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="hour" tick={{ fontSize: 9 }} />
            <YAxis domain={[0, 100]} />
            <Tooltip />
            <Legend iconType="plainline" wrapperStyle={{ fontSize: 10 }} />
            <Line type="monotone" dataKey="soc" stroke="#A3BE8C" name="EV SoC %" dot={false} strokeWidth={2} isAnimationActive={false} />
            <Line type="monotone" dataKey="solar" stroke="#EBCB8B" name="Solar kW" dot={false} strokeWidth={1.5} strokeDasharray="4 4" isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Financial chart */}
      {financialData.length > 0 && (
        <div className="bg-white rounded p-3 h-44">
          <div className="text-xs font-bold text-center text-black mb-1">Hourly Cost / Earnings (₹)</div>
          <ResponsiveContainer width="100%" height="90%">
            <BarChart data={financialData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="hour" tick={{ fontSize: 9 }} />
              <YAxis />
              <Tooltip />
              <Legend iconType="square" wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="earning" name="Earnings ₹" fill="#A3BE8C" />
              <Bar dataKey="cost" name="Cost ₹" fill="#BF616A" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 24-hour action timeline */}
      <div>
        <h3 className="text-sm font-bold text-accent mb-2 border-b border-gray-700 pb-1">⏱️ 24-Hour Action Timeline</h3>
        <div className="grid grid-cols-6 md:grid-cols-12 gap-1">
          {hourlyPlan.map(h => (
            <div key={h.hour} className="text-center">
              <div className="text-[9px] text-gray-400 mb-0.5">{h.hour}:00</div>
              <div
                className={`h-8 rounded text-[8px] flex items-center justify-center font-bold text-white ${ACTION_BG[h.action] || 'bg-gray-600'} ${h.isOutage ? 'ring-2 ring-red-500' : ''}`}
                title={`${h.hour}:00 — ${h.action} | SoC: ${h.estimatedSoc}%`}
              >
                {h.action.split(' ')[0].substring(0, 4)}
              </div>
              <div className="text-[8px] text-gray-500 mt-0.5">{h.estimatedSoc.toFixed(0)}%</div>
            </div>
          ))}
        </div>
        {/* Legend */}
        <div className="flex flex-wrap gap-2 mt-2">
          {Object.entries(ACTION_BG).slice(0,7).map(([action, cls]) => (
            <div key={action} className="flex items-center gap-1 text-[10px]">
              <div className={`w-3 h-3 rounded ${cls}`}></div>
              <span className="text-gray-400">{action}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
