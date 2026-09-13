'use client';
import { DailyBill, HourlyLog } from '../../hooks/useSimulation';
import { MADDPGSchedule, HourlyAction, OutageWindow } from '../../lib/maddpg';
import { useState } from 'react';

const fmt1 = (n: number) => n.toFixed(1);
const fmt3 = (n: number) => n.toFixed(3);

function hourLabel(h: number) {
  const ap = h < 12 ? 'AM' : 'PM';
  const hh = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const nextH = h + 1;
  const ap2 = nextH < 12 ? 'AM' : 'PM';
  const hh2 = nextH === 24 ? 12 : nextH > 12 ? nextH - 12 : nextH;
  return `${hh}:00 ${ap} – ${hh2}:00 ${ap2}`;
}

function touLabel(rate: number) {
  if (rate >= 12) return { label: 'PEAK', cls: 'text-red-400 bg-red-900/30' };
  if (rate <= 5)  return { label: 'SOLAR', cls: 'text-yellow-400 bg-yellow-900/30' };
  return { label: 'OFF-PEAK', cls: 'text-blue-400 bg-blue-900/30' };
}

function modeIcon(mode: string) {
  if (mode.includes('Solar'))   return '☀️';
  if (mode.includes('V2H') || mode.includes('EMERGENCY')) return '🔋⚡';
  if (mode.includes('V2G'))     return '💹';
  if (mode.includes('Night'))   return '🌙';
  if (mode.includes('Commute') || mode.includes('Driving')) return '🚗';
  if (mode.includes('Errand'))  return '🚘';
  if (mode.includes('Office'))  return '🏢';
  if (mode.includes('BLACKOUT')) return '🚨';
  return '💡';
}

function Badge({ children, cls }: { children: React.ReactNode; cls: string }) {
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${cls}`}>{children}</span>;
}

function HourRow({ log, predicted, isExpanded, onToggle, isOutageScheduled }: {
  log: HourlyLog;
  predicted: HourlyAction | undefined;
  isExpanded: boolean;
  onToggle: () => void;
  isOutageScheduled: boolean;
}) {
  const tou = touLabel(log.buyRateRs);
  const netFinancial = log.gridEarnRs - log.gridCostRs + log.solarSavedRs;
  const isProfit = netFinancial >= 0;
  const predAction = predicted?.evAction ?? 'idle';
  const outageMismatch = log.isOutage && !isOutageScheduled;

  const rowBg = log.isOutage
    ? 'bg-red-950/40 border-red-800/40'
    : isExpanded
    ? 'bg-slate-800/80 border-slate-600'
    : 'bg-slate-900/60 border-slate-800 hover:bg-slate-800/50';

  return (
    <>
      <tr className={`cursor-pointer border-b transition-colors ${rowBg}`} onClick={onToggle}>
        <td className="px-2 py-2 text-[11px] font-mono text-slate-300 whitespace-nowrap">
          <span className="mr-1 text-[9px]">{isExpanded ? '▼' : '▶'}</span>{hourLabel(log.hour)}
        </td>
        <td className="px-2 py-2 text-center text-sm" title={log.weatherLabel}>
          {log.weatherEmoji}{log.isOutage && <span className="ml-0.5 text-red-400 text-[9px]">⚡</span>}
        </td>
        <td className="px-2 py-2 text-[10px] text-slate-300 max-w-[110px] truncate" title={log.mode}>
          {modeIcon(log.mode)} {log.mode}
        </td>
        <td className="px-2 py-2 text-center">
          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${tou.cls}`}>{tou.label}</span>
        </td>
        <td className="px-2 py-2 text-right font-mono text-[11px] text-yellow-400">{log.solarKwh > 0.001 ? fmt3(log.solarKwh) : '–'}</td>
        <td className="px-2 py-2 text-right font-mono text-[11px] text-red-400">{log.gridImportKwh > 0.001 ? fmt3(log.gridImportKwh) : '–'}</td>
        <td className="px-2 py-2 text-right font-mono text-[11px] text-emerald-400">{log.gridExportKwh > 0.001 ? fmt3(log.gridExportKwh) : '–'}</td>
        <td className="px-2 py-2 text-right font-mono text-[11px] text-slate-300">{fmt3(log.homeLoadKwh)}</td>
        <td className="px-2 py-2 text-right font-mono text-[11px]">
          {log.evChargeKwh > 0.001 ? <span className="text-cyan-400">+{fmt3(log.evChargeKwh)}</span>
           : log.evDischargeKwh > 0.001 ? <span className="text-orange-400">−{fmt3(log.evDischargeKwh)}</span>
           : <span className="text-slate-600">–</span>}
        </td>
        <td className="px-2 py-2 text-right font-mono text-[11px]">
          {log.battChargeKwh > 0.001 ? <span className="text-blue-400">+{fmt3(log.battChargeKwh)}</span>
           : log.battDischargeKwh > 0.001 ? <span className="text-purple-400">−{fmt3(log.battDischargeKwh)}</span>
           : <span className="text-slate-600">–</span>}
        </td>
        <td className="px-2 py-2 text-right font-mono text-[11px] text-slate-300">{fmt1(log.evSocEnd)}%</td>
        <td className={`px-2 py-2 text-right font-mono text-[11px] font-bold ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
          {isProfit ? '+' : ''}₹{Math.abs(netFinancial).toFixed(3)}
        </td>
      </tr>

      {isExpanded && (
        <tr className="bg-slate-800/90 border-b border-slate-700">
          <td colSpan={12} className="px-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-[11px] font-mono">

              {/* Actual Detail */}
              <div>
                <h5 className="text-xs font-bold text-cyan-400 mb-2 uppercase border-b border-slate-700 pb-1">⚡ Actual Detail</h5>
                <div className="space-y-1">
                  <div className="flex justify-between"><span className="text-slate-400">Weather:</span><span>{log.weatherEmoji} {log.weatherLabel}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Mode:</span><span>{modeIcon(log.mode)} {log.mode}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">TOU Buy:</span><span className="text-red-300">₹{log.buyRateRs}/kWh</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">TOU Sell:</span><span className="text-emerald-300">₹{log.sellRateRs}/kWh</span></div>
                  {log.isOutage && <div className="text-red-400 font-bold">🚨 GRID OUTAGE ACTIVE THIS HOUR</div>}
                  <div className="border-t border-slate-700 my-1"/>
                  <div className="flex justify-between"><span className="text-slate-400">🏠 Home Load:</span><span>{fmt3(log.homeLoadKwh)} kWh</span></div>
                  <div className="flex justify-between"><span className="text-yellow-400">☀️ Solar:</span><span className="text-yellow-300">{fmt3(log.solarKwh)} kWh</span></div>
                  <div className="flex justify-between"><span className="text-red-400">🔌 Grid In:</span><span className="text-red-300">{fmt3(log.gridImportKwh)} kWh</span></div>
                  <div className="flex justify-between"><span className="text-emerald-400">📤 Grid Out:</span><span className="text-emerald-300">{fmt3(log.gridExportKwh)} kWh</span></div>
                  {log.evChargeKwh > 0.001 && <div className="flex justify-between"><span className="text-cyan-400">🔋 EV Charged:</span><span className="text-cyan-300">+{fmt3(log.evChargeKwh)} kWh</span></div>}
                  {log.evDischargeKwh > 0.001 && <div className="flex justify-between"><span className="text-orange-400">🔋 EV Discharged:</span><span className="text-orange-300">−{fmt3(log.evDischargeKwh)} kWh</span></div>}
                  {log.battChargeKwh > 0.001 && <div className="flex justify-between"><span className="text-blue-400">🪫 Batt Charged:</span><span className="text-blue-300">+{fmt3(log.battChargeKwh)} kWh</span></div>}
                  {log.battDischargeKwh > 0.001 && <div className="flex justify-between"><span className="text-purple-400">🪫 Batt Discharged:</span><span className="text-purple-300">−{fmt3(log.battDischargeKwh)} kWh</span></div>}
                  {log.kmDriven > 0 && <div className="flex justify-between"><span className="text-slate-400">🚗 km Driven:</span><span>{fmt1(log.kmDriven)} km</span></div>}
                  <div className="flex justify-between"><span className="text-slate-400">EV SOC End:</span><span>{fmt1(log.evSocEnd)}%</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Home Batt End:</span><span>{fmt1(log.homeBattSocEnd)}%</span></div>
                  <div className="border-t border-slate-700 my-1"/>
                  <div className="flex justify-between"><span className="text-red-400">Grid Cost:</span><span>₹{log.gridCostRs.toFixed(3)}</span></div>
                  <div className="flex justify-between"><span className="text-emerald-400">Grid Earn:</span><span>₹{log.gridEarnRs.toFixed(3)}</span></div>
                  <div className="flex justify-between"><span className="text-yellow-400">Solar Saved:</span><span>₹{log.solarSavedRs.toFixed(3)}</span></div>
                  <div className={`flex justify-between font-bold border-t border-slate-600 pt-1 ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                    <span>Net This Hour:</span><span>{isProfit ? '+' : ''}₹{netFinancial.toFixed(3)}</span>
                  </div>
                </div>
              </div>

              {/* MADDPG Prediction */}
              <div>
                <h5 className="text-xs font-bold text-purple-400 mb-2 uppercase border-b border-slate-700 pb-1">🤖 MADDPG Predicted</h5>
                {predicted ? (
                  <div className="space-y-1">
                    <div className="flex justify-between"><span className="text-slate-400">EV Action:</span><span className="text-purple-300">{predicted.evAction}</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">EV Power:</span><span className="text-purple-300">{predicted.evPowerKw > 0 ? '+' : ''}{predicted.evPowerKw.toFixed(2)} kW</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">Home Action:</span><span className="text-purple-300">{predicted.homeAction}</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">Grid Action:</span><span className="text-purple-300">{predicted.gridAction}</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">Confidence:</span><span className="text-purple-300">{(predicted.confidence * 100).toFixed(0)}%</span></div>
                    <div className="border-t border-slate-700 my-1"/>
                    <div className="text-slate-500 text-[10px]">Agent Rewards:</div>
                    <div className="flex justify-between"><span className="text-slate-400">↳ EV:</span><span className="text-green-300">{predicted.agentRewards.ev.toFixed(2)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">↳ Home:</span><span className="text-green-300">{predicted.agentRewards.home.toFixed(2)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">↳ Grid:</span><span className="text-green-300">{predicted.agentRewards.grid.toFixed(2)}</span></div>
                    <div className="border-t border-slate-700 mt-1 pt-1 text-slate-400 italic text-[10px]">
                      💬 &quot;{predicted.recommendation}&quot;
                    </div>
                  </div>
                ) : (
                  <div className="text-slate-600 italic">No MADDPG data for this hour.</div>
                )}
              </div>

              {/* Comparison */}
              <div>
                <h5 className="text-xs font-bold text-amber-400 mb-2 uppercase border-b border-slate-700 pb-1">📊 Actual vs Predicted</h5>
                <div className="space-y-1.5">
                  <div className="flex flex-wrap gap-1 mb-2">
                    {predAction === 'charge' && log.evChargeKwh > 0.05
                      ? <Badge cls="bg-emerald-900/50 text-emerald-400">✅ EV Charged as planned</Badge>
                      : predAction === 'discharge_v2g' && log.evDischargeKwh > 0.05
                      ? <Badge cls="bg-emerald-900/50 text-emerald-400">✅ V2G executed</Badge>
                      : predAction === 'discharge_v2h' && log.evDischargeKwh > 0.05
                      ? <Badge cls="bg-emerald-900/50 text-emerald-400">✅ V2H executed</Badge>
                      : predAction === 'idle' && log.evChargeKwh < 0.05 && log.evDischargeKwh < 0.05
                      ? <Badge cls="bg-emerald-900/50 text-emerald-400">✅ EV idle as planned</Badge>
                      : <Badge cls="bg-amber-900/50 text-amber-400">⚠️ EV deviated from plan</Badge>
                    }
                    {outageMismatch && <Badge cls="bg-red-900/50 text-red-400">🚨 Unplanned outage</Badge>}
                    {log.isOutage && isOutageScheduled && <Badge cls="bg-blue-900/50 text-blue-400">✅ Scheduled outage</Badge>}
                    {log.solarKwh > 0.1 && <Badge cls="bg-yellow-900/50 text-yellow-400">☀️ Solar active</Badge>}
                    {log.kmDriven > 0 && <Badge cls="bg-slate-700 text-slate-300">🚗 EV on road</Badge>}
                  </div>

                  {predicted && (
                    <div className="space-y-1">
                      <div className="text-[10px] text-slate-500 uppercase mb-1">Energy Comparison</div>
                      {[
                        { label: 'Grid Import', actual: log.gridImportKwh, pred: Math.max(0, predicted.evPowerKw) },
                        { label: 'Solar Gen', actual: log.solarKwh, pred: 0 },
                        { label: 'EV kWh', actual: log.evChargeKwh - log.evDischargeKwh, pred: predicted.evPowerKw },
                      ].map(row => {
                        const diff = row.actual - row.pred;
                        return (
                          <div key={row.label} className="flex items-center gap-1 text-[10px]">
                            <span className="w-16 text-slate-400 shrink-0">{row.label}</span>
                            <span className="w-10 text-right text-slate-200">{row.actual.toFixed(2)}</span>
                            <span className="text-slate-600 text-[8px]">vs</span>
                            <span className="w-10 text-slate-500">{row.pred.toFixed(2)}</span>
                            <div className="flex-1 h-1 bg-slate-700 rounded overflow-hidden">
                              <div className={`h-full ${Math.abs(diff) < 0.1 ? 'bg-emerald-500' : diff < 0 ? 'bg-blue-500' : 'bg-red-500'}`}
                                style={{ width: `${Math.min(100, Math.abs(diff / (Math.abs(row.pred) + 0.01)) * 100)}%` }} />
                            </div>
                            <span className={`w-14 text-right font-bold ${Math.abs(diff) < 0.05 ? 'text-slate-400' : diff > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                              {diff > 0 ? '+' : ''}{diff.toFixed(2)}
                            </span>
                          </div>
                        );
                      })}
                      <div className="border-t border-slate-700 mt-2 pt-1">
                        <div className="flex justify-between"><span className="text-slate-400">Hour Net:</span><span className={isProfit ? 'text-emerald-400' : 'text-red-400'}>{isProfit ? '+' : ''}₹{netFinancial.toFixed(3)}</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">MADDPG Reward:</span><span className="text-purple-300">{(predicted.agentRewards.ev + predicted.agentRewards.home + predicted.agentRewards.grid).toFixed(2)}</span></div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function DailyBillsTab({
  bills,
  maddpgSchedule,
  outages = [],
}: {
  bills: DailyBill[];
  maddpgSchedule: MADDPGSchedule | null;
  outages?: OutageWindow[];
}) {
  const [selectedDay, setSelectedDay] = useState<number>(bills.length > 0 ? bills[bills.length - 1].day : 1);
  const [expandedHours, setExpandedHours] = useState<Set<number>>(new Set());
  const [expandAll, setExpandAll] = useState(false);

  const toggleHour = (h: number) => {
    setExpandedHours(prev => { const n = new Set(prev); n.has(h) ? n.delete(h) : n.add(h); return n; });
  };

  if (bills.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-400">
        <svg className="w-16 h-16 mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-lg">No daily bills yet.</p>
        <p className="text-sm mt-2">Run the simulation to end of Day 1 to see your first detailed bill.</p>
      </div>
    );
  }

  const bill = bills.find(b => b.day === selectedDay) || bills[bills.length - 1];
  const hours = bill.hourlyLog || [];
  const mActions = maddpgSchedule?.actions ?? [];
  const totalNetRs = bill.v2gEarningsRs + bill.v2hSavedCostRs + bill.solarSavedCostRs - bill.totalGridCostRs;
  const isProfit = totalNetRs >= 0;

  return (
    <div className="flex flex-col lg:flex-row h-full overflow-hidden">
      {/* Sidebar */}
      <div className="w-full lg:w-[175px] shrink-0 border-r border-slate-700 overflow-y-auto bg-slate-900">
        <div className="px-3 py-2 border-b border-slate-700">
          <h3 className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">Daily Bills</h3>
        </div>
        {bills.map(b => (
          <button key={b.day} onClick={() => { setSelectedDay(b.day); setExpandedHours(new Set()); setExpandAll(false); }}
            className={`w-full text-left px-3 py-2.5 border-b border-slate-800 transition-colors ${selectedDay === b.day ? 'bg-slate-700 border-l-2 border-l-cyan-400' : 'hover:bg-slate-800'}`}>
            <div className="flex items-center gap-1.5">
              <span>{b.weatherEmoji || '🌡️'}</span>
              <span className="font-bold text-sm text-cyan-300">Day {b.day}</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5 truncate">{b.weatherCondition}</div>
            <div className={`text-xs font-bold mt-0.5 ${b.netCostRs <= 0 ? 'text-emerald-400' : 'text-red-400'}`}>₹{b.netCostRs.toFixed(2)}</div>
            {b.outageOccurred && <div className="text-[9px] text-red-400">⚡ Outage</div>}
            <div className="text-[9px] text-slate-600">{b.hourlyLog?.length ?? 0} hrs logged</div>
          </button>
        ))}
      </div>

      {/* Main */}
      <div className="flex-1 overflow-y-auto bg-slate-950">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-slate-900 border-b border-slate-700 px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xl font-black text-slate-100">Day {bill.day}</span>
            <span className="text-slate-400 text-sm">{bill.weatherEmoji} {bill.weatherCondition}</span>
            {bill.outageOccurred && <span className="px-2 py-0.5 bg-red-900/60 text-red-400 text-xs font-bold rounded-full border border-red-700">⚡ Outage</span>}
            <div className="flex gap-4 ml-auto text-[11px] font-mono">
              <div className="text-center"><div className="text-slate-500">Solar</div><div className="text-yellow-400 font-bold">{bill.solarGeneratedKwh} kWh</div></div>
              <div className="text-center"><div className="text-slate-500">Grid In</div><div className="text-red-400 font-bold">{bill.totalGridKwh} kWh</div></div>
              <div className="text-center"><div className="text-slate-500">V2G+V2H</div><div className="text-orange-400 font-bold">{(bill.v2gExportKwh + bill.v2hUsedKwh).toFixed(2)} kWh</div></div>
              <div className="text-center"><div className="text-slate-500">km</div><div className="text-slate-200 font-bold">{bill.totalKmDriven}</div></div>
              <div className="text-center"><div className="text-slate-500">Net</div><div className={`font-bold ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>{isProfit ? '+' : ''}₹{totalNetRs.toFixed(2)}</div></div>
            </div>
          </div>
        </div>

        {/* MADDPG Comparison Banner */}
        {maddpgSchedule && (
          <div className="mx-4 my-3 bg-slate-800/80 border border-purple-800/40 rounded-lg p-4">
            <h4 className="text-[10px] font-bold text-purple-400 uppercase tracking-wider mb-3">📊 Day {bill.day}: Actual vs MADDPG Prediction</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px] font-mono">
              {[
                { label: 'Grid Cost', actual: bill.totalGridCostRs, pred: maddpgSchedule.totalEstimatedCost, lowerBetter: true, unit: '₹' },
                { label: 'V2G Earnings', actual: bill.v2gEarningsRs, pred: maddpgSchedule.totalEstimatedEarnings, lowerBetter: false, unit: '₹' },
                { label: 'Solar (kWh)', actual: bill.solarGeneratedKwh, pred: maddpgSchedule.solarEnergyKwh, lowerBetter: false, unit: 'kWh' },
                { label: 'Net Financial', actual: totalNetRs, pred: maddpgSchedule.netEstimate, lowerBetter: false, unit: '₹' },
              ].map(row => {
                const better = row.lowerBetter ? row.actual <= row.pred : row.actual >= row.pred;
                const diff = row.actual - row.pred;
                return (
                  <div key={row.label} className="bg-slate-900 rounded p-2">
                    <div className="text-slate-500">{row.label}</div>
                    <div className={`font-bold ${row.lowerBetter ? 'text-red-400' : 'text-emerald-400'}`}>{row.unit === '₹' ? '₹' : ''}{row.actual.toFixed(2)}{row.unit !== '₹' ? ' ' + row.unit : ''}</div>
                    <div className="text-slate-600">Pred: {row.unit === '₹' ? '₹' : ''}{row.pred.toFixed(2)}{row.unit !== '₹' ? ' ' + row.unit : ''}</div>
                    <div className={`font-bold text-[10px] ${better ? 'text-emerald-400' : 'text-red-400'}`}>
                      {better ? '✅' : '❌'} {diff > 0 ? '+' : ''}{diff.toFixed(2)}{row.unit !== '₹' ? ' ' + row.unit : '₹'}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2 text-[10px]">
              <span className="px-2 py-0.5 rounded bg-slate-700 text-slate-300">V2G sessions: {bill.v2gExportKwh > 0 ? '✅ Yes' : '❌ None'} | Predicted: {maddpgSchedule.v2gSessions}</span>
              <span className="px-2 py-0.5 rounded bg-slate-700 text-slate-300">MADDPG Reward: {maddpgSchedule.overallReward.toFixed(1)}</span>
              <span className="px-2 py-0.5 rounded bg-slate-700 text-slate-300">Conflicts resolved: {maddpgSchedule.conflictsResolved}</span>
              {bill.outageOccurred && <span className="px-2 py-0.5 rounded bg-red-900/40 text-red-400">⚡ Outage impacted day</span>}
            </div>
          </div>
        )}

        {/* Hourly Table */}
        {hours.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm">
            Hourly data is saved as the simulation completes each hour. Run the simulation to see hour-by-hour breakdowns.
          </div>
        ) : (
          <div className="px-4 pb-6">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">{hours.length} hours recorded · click any row to expand</h4>
              <button onClick={() => { const next = !expandAll; setExpandAll(next); setExpandedHours(next ? new Set(hours.map(h => h.hour)) : new Set()); }}
                className="text-[10px] px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-600">
                {expandAll ? 'Collapse All' : 'Expand All'}
              </button>
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-700">
              <table className="w-full text-left border-collapse min-w-[900px]">
                <thead>
                  <tr className="bg-slate-800 text-slate-400 text-[10px] uppercase tracking-wider">
                    <th className="px-2 py-2">Hour</th>
                    <th className="px-2 py-2 text-center">Wthr</th>
                    <th className="px-2 py-2">Mode</th>
                    <th className="px-2 py-2 text-center">TOU</th>
                    <th className="px-2 py-2 text-right text-yellow-400">Solar</th>
                    <th className="px-2 py-2 text-right text-red-400">Grid In</th>
                    <th className="px-2 py-2 text-right text-emerald-400">Grid Out</th>
                    <th className="px-2 py-2 text-right">Home</th>
                    <th className="px-2 py-2 text-right text-cyan-400">EV kWh</th>
                    <th className="px-2 py-2 text-right text-blue-400">Batt kWh</th>
                    <th className="px-2 py-2 text-right">EV%</th>
                    <th className="px-2 py-2 text-right">Net ₹</th>
                  </tr>
                </thead>
                <tbody>
                  {hours.map(log => (
                    <HourRow key={log.hour} log={log}
                      predicted={mActions.find(a => a.hour === log.hour)}
                      isExpanded={expandedHours.has(log.hour)}
                      onToggle={() => toggleHour(log.hour)}
                      isOutageScheduled={outages.some(o => log.hour >= o.startHour && log.hour < o.endHour)}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Summary footer */}
            <div className="mt-4 bg-slate-800 rounded-lg border border-slate-700 p-4">
              <h4 className="text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-3">📑 Day {bill.day} Summary</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px] font-mono">
                {[
                  ['Total Consumption', `${bill.totalConsumptionKwh} kWh`, 'text-slate-200'],
                  ['Solar Generated', `${bill.solarGeneratedKwh} kWh`, 'text-yellow-400'],
                  ['Grid Imported', `${bill.totalGridKwh} kWh`, 'text-red-400'],
                  ['V2G Export', `${bill.v2gExportKwh} kWh`, 'text-emerald-400'],
                  ['V2H Used', `${bill.v2hUsedKwh} kWh`, 'text-purple-400'],
                  ['EV Charge Cost', `₹${bill.evChargingCostRs}`, 'text-red-400'],
                  ['Solar Savings', `₹${bill.solarSavedCostRs}`, 'text-yellow-400'],
                  ['V2G Earnings', `₹${bill.v2gEarningsRs}`, 'text-emerald-400'],
                  ['V2H Savings', `₹${bill.v2hSavedCostRs}`, 'text-purple-400'],
                  ['EV SOC Start', `${bill.startSoc.toFixed(1)}%`, 'text-slate-200'],
                  ['EV SOC End', `${bill.endSoc.toFixed(1)}%`, 'text-slate-200'],
                  ['km Driven', `${bill.totalKmDriven} km`, 'text-slate-200'],
                ].map(([label, val, cls]) => (
                  <div key={label as string}><span className="text-slate-500">{label}:</span><br/><span className={`font-bold ${cls}`}>{val}</span></div>
                ))}
                <div className="col-span-2 md:col-span-1">
                  <span className="text-slate-500">Net Financial:</span><br/>
                  <span className={`font-black text-lg ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>{isProfit ? '+' : ''}₹{totalNetRs.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
