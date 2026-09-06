'use client';
import { DailyBill } from '../../hooks/useSimulation';
import { useState } from 'react';

export default function DailyBillsTab({
  bills,
}: {
  bills: DailyBill[];
}) {
  const [selectedDay, setSelectedDay] = useState<number>(bills.length > 0 ? bills[bills.length - 1].day : 1);

  if (bills.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-400">
        <svg className="w-16 h-16 mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-lg">No daily bills generated yet.</p>
        <p className="text-sm mt-2">Run the simulation to the end of Day 1 to see your first detailed bill.</p>
      </div>
    );
  }

  const selectedBill = bills.find(b => b.day === selectedDay) || bills[bills.length - 1];

  return (
    <div className="p-4 flex flex-col md:flex-row gap-6">
      {/* Sidebar for selecting days */}
      <div className="w-full md:w-1/4 flex flex-col gap-2 border-r border-[var(--color-frame)] pr-4">
        <h3 className="font-bold text-lg mb-2 border-b border-[var(--color-frame)] pb-2 text-[var(--color-accent)]">Historical Bills</h3>
        <div className="flex flex-col gap-2 max-h-[600px] overflow-y-auto">
          {bills.map(b => (
            <button
              key={b.day}
              onClick={() => setSelectedDay(b.day)}
              className={`p-3 text-left rounded border transition-colors ${selectedDay === b.day ? 'bg-[var(--color-frame)] border-[var(--color-accent)]' : 'border-transparent hover:bg-[var(--color-frame)]'}`}
            >
              <div className="font-medium text-[var(--color-accent)]">Day {b.day}</div>
              <div className="text-xs text-slate-400 mt-1">Net: ₹{b.netCostRs.toFixed(2)}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Bill Display */}
      <div className="w-full md:w-3/4 bg-[var(--color-frame)] rounded-xl p-6 border border-slate-700 shadow-xl relative overflow-hidden">
        {/* Receipt Header */}
        <div className="text-center mb-6 pb-6 border-b border-dashed border-slate-500">
          <h2 className="text-2xl font-black text-slate-100 tracking-wider">NEXUS ENERGY SUMMARY</h2>
          <div className="text-slate-400 mt-1 font-mono text-sm">DAY {selectedBill.day} STATEMENT</div>
          {selectedBill.outageOccurred && (
            <div className="mt-2 inline-block px-3 py-1 bg-red-900/50 text-red-400 text-xs font-bold rounded-full border border-red-800">
              ⚠️ Grid Emergency Occurred
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column: Power Flow & Energy */}
          <div>
            <h4 className="text-[var(--color-accent)] font-bold mb-4 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              Energy & Power Flow
            </h4>
            <div className="space-y-3 font-mono text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Total Home Consumption:</span>
                <span className="font-bold text-slate-200">{selectedBill.totalConsumptionKwh} kWh</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Total Grid Import:</span>
                <span className="font-bold text-slate-200">{selectedBill.totalGridKwh} kWh</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--color-solar)]">Solar Generated:</span>
                <span className="font-bold text-[var(--color-solar)]">{selectedBill.solarGeneratedKwh} kWh</span>
              </div>
              <div className="flex justify-between border-t border-slate-700 pt-3">
                <span className="text-slate-400">EV Commute Driven:</span>
                <span className="font-bold text-[var(--color-ev)]">{selectedBill.totalKmDriven} km</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">EV Battery Wear (Cycles):</span>
                <span className="font-bold text-slate-200">
                  {((selectedBill.startSoc - selectedBill.endSoc) > 0 ? (selectedBill.startSoc - selectedBill.endSoc) / 100 : 0.01).toFixed(3)}
                </span>
              </div>
            </div>
          </div>

          {/* Right Column: Financials */}
          <div>
            <h4 className="text-[var(--color-accent)] font-bold mb-4 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Financial Charges & Savings
            </h4>
            <div className="space-y-3 font-mono text-sm">
              <div className="flex justify-between text-red-400">
                <span>Total Grid Cost:</span>
                <span>+ ₹{selectedBill.totalGridCostRs}</span>
              </div>
              <div className="flex justify-between text-slate-400 text-xs pl-4">
                <span>(of which EV Charging):</span>
                <span>₹{selectedBill.evChargingCostRs}</span>
              </div>
              
              <div className="flex justify-between text-[var(--color-solar)]">
                <span>Solar Savings (Arbitrage):</span>
                <span>- ₹{selectedBill.solarSavedCostRs}</span>
              </div>
              
              <div className="flex justify-between text-[var(--color-ev)]">
                <span>V2G Grid Export Earnings:</span>
                <span>- ₹{selectedBill.v2gEarningsRs}</span>
              </div>

              {selectedBill.v2hUsedKwh > 0 && (
                <div className="flex justify-between text-purple-400">
                  <span>V2H Self-Consumption Savings:</span>
                  <span>- ₹{selectedBill.v2hSavedCostRs}</span>
                </div>
              )}
              {selectedBill.v2hUsedKwh > 0 && (
                <div className="flex justify-between text-slate-400 text-xs pl-4">
                  <span>(Home powered by EV: {selectedBill.v2hUsedKwh} kWh)</span>
                </div>
              )}

              <div className="border-t border-dashed border-slate-500 pt-3 mt-4 flex justify-between font-black text-lg">
                <span className="text-slate-100">NET ESTIMATE:</span>
                <span className={selectedBill.netCostRs > 0 ? "text-red-400" : "text-emerald-400"}>
                  {selectedBill.netCostRs > 0 ? '+' : ''}₹{selectedBill.netCostRs}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-slate-700 text-center text-xs text-slate-500 font-mono">
          NEXUS-EV SYSTEM • END OF DAY REPORT • GENERATED AUTOMATICALLY
        </div>
      </div>
    </div>
  );
}
