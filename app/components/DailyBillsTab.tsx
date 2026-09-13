'use client';
import { DailyBill, HourlyLog } from '../../hooks/useSimulation';
import { MADDPGSchedule, HourlyAction, OutageWindow } from '../../lib/maddpg';
import { useState } from 'react';

const fmt1 = (n: number) => n.toFixed(1);
const fmt2 = (n: number) => n.toFixed(2);
const fmt3 = (n: number) => n.toFixed(3);
const fmtRs = (n: number) => `₹${n.toFixed(2)}`;

function hourLabel(h: number) {
  const ap = h < 12 ? 'AM' : 'PM';
  const hh = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const nextH = h + 1;
  const ap2 = nextH < 12 ? 'AM' : 'PM';
  const hh2 = nextH === 24 ? 12 : nextH > 12 ? nextH - 12 : nextH;
  return `${hh}:00 ${ap} - ${hh2}:00 ${ap2}`;
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

  if (bills.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-400">
        <p className="text-lg">No daily bills yet.</p>
        <p className="text-sm mt-2">Run the simulation to end of Day 1 to see your detailed bill.</p>
      </div>
    );
  }

  const bill = bills.find(b => b.day === selectedDay) || bills[bills.length - 1];
  const hours = bill.hourlyLog || [];
  const mActions = maddpgSchedule?.actions ?? [];
  const totalNetRs = bill.v2gEarningsRs + bill.v2hSavedCostRs + bill.solarSavedCostRs - bill.totalGridCostRs;
  const isProfit = totalNetRs >= 0;

  // Pie chart variables
  const totalCredits = bill.v2gEarningsRs + bill.v2hSavedCostRs + bill.solarSavedCostRs;
  const totalCharges = bill.totalGridCostRs;
  
  return (
    <div className="flex flex-col lg:flex-row h-full overflow-hidden bg-slate-950 font-sans text-slate-300">
      {/* Sidebar for Day Selection */}
      <div className="w-full lg:w-[150px] shrink-0 border-r border-slate-700 bg-slate-900 overflow-y-auto">
        <div className="px-3 py-2 border-b border-slate-700">
          <h3 className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">Invoices</h3>
        </div>
        {bills.map(b => (
          <button key={b.day} onClick={() => setSelectedDay(b.day)}
            className={`w-full text-left px-3 py-3 border-b border-slate-800 transition-colors ${selectedDay === b.day ? 'bg-slate-700 border-l-4 border-l-cyan-400' : 'hover:bg-slate-800'}`}>
            <div className="font-bold text-sm text-cyan-300">Day {b.day}</div>
            <div className="text-[10px] text-slate-500 mt-1 truncate">{b.weatherCondition}</div>
            <div className={`text-xs font-bold mt-1 ${b.netCostRs <= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {b.netCostRs <= 0 ? 'Credit' : 'Due'}: ₹{Math.abs(b.netCostRs).toFixed(2)}
            </div>
          </button>
        ))}
      </div>

      {/* Invoice Document Viewer */}
      <div className="flex-1 overflow-y-auto p-4 lg:p-8 flex justify-center">
        {/* The "Paper" Document */}
        <div className="w-full max-w-[1000px] bg-slate-900 border border-slate-700 shadow-2xl rounded-sm p-6 lg:p-10">
          
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start mb-10 pb-6 border-b-2 border-cyan-500">
            <div>
              <h1 className="text-3xl font-black text-cyan-400 tracking-tight flex items-center gap-2">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                NEXUS-EV
              </h1>
              <p className="text-slate-400 text-sm mt-1">Smart Energy Account Statement</p>
            </div>
            <div className="mt-4 md:mt-0 text-right">
              <div className="text-sm">
                <span className="text-slate-500">ACCOUNT NUMBER:</span> <span className="text-slate-200 font-mono">NX-{bill.day.toString().padStart(6, '0')}</span>
              </div>
              <div className="text-sm mt-1">
                <span className="text-slate-500">BILLING CYCLE:</span> <span className="text-slate-200">Day {bill.day}</span>
              </div>
              <div className="text-sm mt-1">
                <span className="text-slate-500">WEATHER:</span> <span className="text-slate-200">{bill.weatherEmoji} {bill.weatherCondition}</span>
              </div>
              <div className="text-sm mt-1">
                <span className="text-slate-500">TOTAL USAGE:</span> <span className="text-slate-200">{fmt2(bill.totalConsumptionKwh)} kWh</span>
              </div>
            </div>
          </div>

          {/* Main 2-column layout */}
          <div className="flex flex-col lg:flex-row gap-10">
            
            {/* Left Column (Detail of Charges) */}
            <div className="flex-1">
              <h2 className="text-lg font-bold text-cyan-400 mb-4 border-b border-slate-700 pb-2">Detail of Current Charges</h2>
              
              {/* Electric Service */}
              <div className="mb-6">
                <h3 className="text-md font-bold text-slate-200 mb-2 italic text-cyan-300">Electric Service</h3>
                <div className="text-xs text-slate-400 mb-4 grid grid-cols-2 gap-2">
                  <div><span className="font-semibold text-slate-300">Rate:</span> Time of Use (TOU)</div>
                  <div><span className="font-semibold text-slate-300">Meter Number:</span> EV-59281A</div>
                  <div><span className="font-semibold text-slate-300">Billing Period:</span> 24 Hours</div>
                  <div><span className="font-semibold text-slate-300">Outage Status:</span> {bill.outageOccurred ? <span className="text-red-400">Interruption Recorded</span> : 'Stable'}</div>
                </div>

                <div className="bg-slate-800/50 p-4 rounded border border-slate-700">
                  <div className="flex justify-between text-sm font-bold border-b border-slate-700 pb-2 mb-2 text-slate-400">
                    <span>ELECTRICITY CHARGES</span>
                    <span>Amount (₹)</span>
                  </div>
                  <div className="flex justify-between text-sm py-1">
                    <span>Grid Import Delivery ({fmt2(bill.totalGridKwh)} kWh)</span>
                    <span>{fmtRs(bill.totalGridCostRs)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-500 py-1 pl-4">
                    <span>Includes EV Charging Cost</span>
                    <span>{fmtRs(bill.evChargingCostRs)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold pt-2 mt-2 border-t border-slate-700">
                    <span className="text-cyan-400">Total Electric Charges</span>
                    <span className="text-cyan-400">{fmtRs(bill.totalGridCostRs)}</span>
                  </div>
                </div>
              </div>

              {/* Credits & Offsets */}
              <div className="mb-6">
                <h3 className="text-md font-bold text-slate-200 mb-2 italic text-emerald-400">Generation & Credits</h3>
                <div className="bg-slate-800/50 p-4 rounded border border-slate-700">
                  <div className="flex justify-between text-sm font-bold border-b border-slate-700 pb-2 mb-2 text-slate-400">
                    <span>CREDITS & SAVINGS</span>
                    <span>Amount (₹)</span>
                  </div>
                  
                  {bill.v2gEarningsRs > 0 && (
                    <div className="flex justify-between text-sm py-1">
                      <span>V2G Grid Export ({fmt2(bill.v2gExportKwh)} kWh)</span>
                      <span className="text-emerald-400">-{fmtRs(bill.v2gEarningsRs)}</span>
                    </div>
                  )}
                  {bill.solarSavedCostRs > 0 && (
                    <div className="flex justify-between text-sm py-1">
                      <span>Solar Self-Consumption ({fmt2(bill.solarGeneratedKwh)} kWh)</span>
                      <span className="text-emerald-400">-{fmtRs(bill.solarSavedCostRs)}</span>
                    </div>
                  )}
                  {bill.v2hSavedCostRs > 0 && (
                    <div className="flex justify-between text-sm py-1">
                      <span>V2H Backup Power ({fmt2(bill.v2hUsedKwh)} kWh)</span>
                      <span className="text-emerald-400">-{fmtRs(bill.v2hSavedCostRs)}</span>
                    </div>
                  )}
                  
                  {totalCredits === 0 && (
                    <div className="text-sm py-1 text-slate-500 italic">No credits generated this period.</div>
                  )}
                  
                  <div className="flex justify-between text-sm font-bold pt-2 mt-2 border-t border-slate-700">
                    <span className="text-emerald-400">Total Credits Applied</span>
                    <span className="text-emerald-400">-{fmtRs(totalCredits)}</span>
                  </div>
                </div>
              </div>

              {/* Final Calculation */}
              <div className="bg-cyan-900/20 p-4 rounded border border-cyan-800">
                <div className="flex justify-between text-lg font-black">
                  <span className="text-slate-100">Total Current Charges</span>
                  <span className={isProfit ? 'text-emerald-400' : 'text-red-400'}>
                    {isProfit ? 'Credit: ' : ''}{fmtRs(Math.abs(totalNetRs))}
                  </span>
                </div>
              </div>
            </div>

            {/* Right Column (Summary & MADDPG) */}
            <div className="w-full lg:w-[320px] flex flex-col gap-6">
              
              <div className="border border-slate-700 rounded bg-slate-800/30 p-4">
                <h3 className="font-bold text-cyan-400 text-center mb-4">Breakdown of Financials</h3>
                <div className="relative w-40 h-40 mx-auto rounded-full border-8 border-slate-800 flex items-center justify-center shadow-inner overflow-hidden">
                  {/* CSS pie chart trick using conic-gradient */}
                  {totalCharges + totalCredits > 0 ? (
                    <div 
                      className="absolute inset-0"
                      style={{
                        background: `conic-gradient(#f87171 ${(totalCharges/(totalCharges+totalCredits))*100}%, #34d399 0)`
                      }}
                    />
                  ) : (
                    <div className="absolute inset-0 bg-slate-700" />
                  )}
                  <div className="w-28 h-28 bg-slate-900 rounded-full z-10 flex flex-col items-center justify-center text-center">
                    <span className="text-[10px] text-slate-400">Net Impact</span>
                    <span className={`text-sm font-bold ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                      {fmtRs(Math.abs(totalNetRs))}
                    </span>
                  </div>
                </div>
                <div className="flex justify-between mt-6 text-xs px-4">
                  <div className="flex items-center gap-2"><div className="w-3 h-3 bg-red-400 rounded-full" /> Charges</div>
                  <div className="flex items-center gap-2"><div className="w-3 h-3 bg-emerald-400 rounded-full" /> Credits</div>
                </div>
              </div>

              {maddpgSchedule && (
                <div className="border border-purple-900/50 rounded bg-slate-800/30 p-4">
                  <h3 className="text-xs font-bold text-purple-400 uppercase tracking-wider border-b border-slate-700 pb-2 mb-3">
                    MADDPG AI Prediction Match
                  </h3>
                  <div className="space-y-3 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Predicted Grid Cost:</span>
                      <span className="font-mono text-red-300">{fmtRs(maddpgSchedule.totalEstimatedCost)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Predicted Earnings:</span>
                      <span className="font-mono text-emerald-300">{fmtRs(maddpgSchedule.totalEstimatedEarnings)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Predicted Net:</span>
                      <span className="font-mono text-slate-200">{fmtRs(Math.abs(maddpgSchedule.netEstimate))}</span>
                    </div>
                    <div className="border-t border-slate-700 pt-2 flex justify-between font-bold">
                      <span className="text-slate-300">Variance:</span>
                      <span className={Math.abs(totalNetRs - maddpgSchedule.netEstimate) < 5 ? 'text-emerald-400' : 'text-amber-400'}>
                        {Math.abs(totalNetRs - maddpgSchedule.netEstimate).toFixed(2)} ₹
                      </span>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* Detailed Hourly Log (Usage history) */}
          <div className="mt-12 pt-8 border-t-2 border-slate-700">
            <h2 className="text-lg font-bold text-cyan-400 mb-6">Detailed Hourly Usage Log</h2>
            
            {hours.length === 0 ? (
              <p className="text-slate-500 text-sm italic">No hourly records generated yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b-2 border-slate-700 text-slate-400 uppercase tracking-wider bg-slate-800">
                      <th className="py-3 px-2 font-semibold">Time Period</th>
                      <th className="py-3 px-2 font-semibold">Event / Mode</th>
                      <th className="py-3 px-2 font-semibold text-right">Solar (kWh)</th>
                      <th className="py-3 px-2 font-semibold text-right">EV Δ (kWh)</th>
                      <th className="py-3 px-2 font-semibold text-right">Grid In (kWh)</th>
                      <th className="py-3 px-2 font-semibold text-right">Grid Out (kWh)</th>
                      <th className="py-3 px-2 font-semibold text-right">Rate</th>
                      <th className="py-3 px-2 font-semibold text-right">Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hours.map((log, i) => {
                      const netHour = log.gridCostRs - log.gridEarnRs - log.solarSavedRs;
                      return (
                        <tr key={i} className={`border-b border-slate-800 ${log.isOutage ? 'bg-red-950/20' : i % 2 === 0 ? 'bg-slate-900' : 'bg-slate-800/30'} hover:bg-slate-800 transition-colors`}>
                          <td className="py-2 px-2 font-mono text-slate-400">{hourLabel(log.hour)}</td>
                          <td className="py-2 px-2">
                            <span className="font-semibold text-slate-300">{log.mode}</span>
                            {log.isOutage && <span className="ml-2 text-[10px] text-red-400 font-bold bg-red-900/30 px-1 rounded border border-red-800">OUTAGE</span>}
                          </td>
                          <td className="py-2 px-2 text-right font-mono text-yellow-400">{log.solarKwh > 0 ? fmt3(log.solarKwh) : '-'}</td>
                          <td className="py-2 px-2 text-right font-mono">
                            {log.evChargeKwh > 0 ? <span className="text-cyan-400">+{fmt3(log.evChargeKwh)}</span> 
                             : log.evDischargeKwh > 0 ? <span className="text-orange-400">-{fmt3(log.evDischargeKwh)}</span> 
                             : <span className="text-slate-600">-</span>}
                          </td>
                          <td className="py-2 px-2 text-right font-mono text-red-400">{log.gridImportKwh > 0 ? fmt3(log.gridImportKwh) : '-'}</td>
                          <td className="py-2 px-2 text-right font-mono text-emerald-400">{log.gridExportKwh > 0 ? fmt3(log.gridExportKwh) : '-'}</td>
                          <td className="py-2 px-2 text-right text-[10px] text-slate-500">
                            ₹{fmt2(log.buyRateRs)}
                          </td>
                          <td className={`py-2 px-2 text-right font-mono font-bold ${netHour < 0 ? 'text-emerald-400' : netHour > 0 ? 'text-red-400' : 'text-slate-500'}`}>
                            {netHour === 0 ? '0.00' : (netHour < 0 ? 'Cr: ' + fmtRs(Math.abs(netHour)) : fmtRs(netHour))}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          
          <div className="mt-8 text-center text-[10px] text-slate-500 pt-4 border-t border-slate-800 uppercase tracking-widest">
            End of Statement • Nexus-EV System Automated Generation
          </div>
        </div>
      </div>
    </div>
  );
}
