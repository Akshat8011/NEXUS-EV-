"use client";
import React, { useState } from 'react';
import { OutageWindow } from '../../lib/maddpg';

interface OutagesTabProps {
  outages: OutageWindow[];
  onOutagesChange: (outages: OutageWindow[]) => void;
  maddpgActions: any[];
}

export default function OutagesTab({ outages, onOutagesChange, maddpgActions }: OutagesTabProps) {
  const [citySearch, setCitySearch] = useState('');
  const [gridInfo, setGridInfo] = useState<any>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState('');

  // Manual outage form
  const [form, setForm] = useState({ city: '', startHour: 17, endHour: 22, severity: 'medium' as OutageWindow['severity'] });

  const fetchGridInfo = async () => {
    if (!citySearch) return;
    setIsFetching(true);
    setFetchError('');
    try {
      const res = await fetch(`/api/outages?city=${encodeURIComponent(citySearch)}`);
      const data = await res.json();
      if (data.error) setFetchError(data.error);
      else setGridInfo(data);
    } catch (e: any) { setFetchError(e.message); }
    setIsFetching(false);
  };

  const addOutage = () => {
    if (!form.city) return;
    const newOutage: OutageWindow = { ...form };
    onOutagesChange([...outages, newOutage]);
    setForm({ city: form.city, startHour: 17, endHour: 22, severity: 'medium' });
  };

  const removeOutage = (index: number) => {
    onOutagesChange(outages.filter((_, i) => i !== index));
  };

  const SEVERITY_COLORS = { low: 'text-yellow-400 border-yellow-500', medium: 'text-orange-400 border-orange-500', high: 'text-red-400 border-red-500' };
  const SEVERITY_BG = { low: 'bg-yellow-900 bg-opacity-20', medium: 'bg-orange-900 bg-opacity-20', high: 'bg-red-900 bg-opacity-30' };

  // MADDPG response to outages
  const outageHours = new Set<number>();
  outages.forEach(o => { for (let h = o.startHour; h < o.endHour; h++) outageHours.add(h); });
  const maddpgResponse = maddpgActions.filter(a => outageHours.has(a.hour) || (outageHours.size > 0 && a.recommendation.includes('outage')));

  return (
    <div className="p-4 overflow-y-auto h-full custom-scrollbar space-y-6">
      <div>
        <h2 className="text-accent font-bold text-lg mb-1">⚡ Power Outage Tracker</h2>
        <p className="text-xs text-gray-400">Enter known power outages from your electricity board. The MADDPG optimizer will automatically adjust the charging schedule to pre-charge your EV and activate V2H mode during outages.</p>
      </div>

      {/* City Grid Info Lookup */}
      <div className="bg-frame rounded p-4 border border-gray-600">
        <h3 className="font-bold text-sm mb-3">🔍 Check City Grid Status</h3>
        <div className="flex gap-2 mb-3">
          <input
            value={citySearch}
            onChange={e => setCitySearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && fetchGridInfo()}
            placeholder="Enter city name (e.g. Lucknow, Delhi, Mumbai)"
            className="flex-1 bg-input px-3 py-2 rounded text-sm outline-none"
          />
          <button
            onClick={fetchGridInfo}
            disabled={isFetching || !citySearch}
            className="bg-accent text-root font-bold px-4 py-2 rounded text-sm hover:bg-ev disabled:opacity-50"
          >
            {isFetching ? '...' : 'Check'}
          </button>
        </div>
        {fetchError && <div className="text-red-400 text-xs">{fetchError}</div>}
        {gridInfo && (
          <div className="space-y-2">
            <div className="bg-root rounded p-3 text-sm">
              <div className="font-bold text-accent text-base mb-2">{gridInfo.city}</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-gray-400">Coordinates:</span> {gridInfo.lat.toFixed(2)}°N, {gridInfo.lon.toFixed(2)}°E</div>
                <div><span className="text-gray-400">Grid Stress:</span> <span className={gridInfo.gridStressLevel === 'high' ? 'text-red-400 font-bold' : gridInfo.gridStressLevel === 'medium' ? 'text-yellow-400' : 'text-green-400'}>{gridInfo.gridStressLevel?.toUpperCase()}</span></div>
                {gridInfo.gridCarbonIntensity && <div><span className="text-gray-400">Carbon Intensity:</span> {gridInfo.gridCarbonIntensity} gCO₂/kWh</div>}
                <div><span className="text-gray-400">Source:</span> {gridInfo.source}</div>
              </div>
              <div className="mt-2 text-xs text-gray-400 border-t border-gray-600 pt-2">{gridInfo.note}</div>
            </div>
            {gridInfo.gridStressLevel === 'high' && (
              <div className="bg-red-900 bg-opacity-30 border border-red-500 rounded p-2 text-xs text-red-300 font-bold">
                ⚠️ HIGH GRID STRESS detected in {gridInfo.city}. Outage risk is elevated. Consider pre-charging now.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Manual Outage */}
      <div className="bg-frame rounded p-4 border border-gray-600">
        <h3 className="font-bold text-sm mb-3">➕ Add Known Outage Window</h3>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">City / Area</label>
            <input
              value={form.city}
              onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
              placeholder="e.g. Lucknow"
              className="w-full bg-input px-2 py-1.5 rounded text-sm outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Severity</label>
            <select
              value={form.severity}
              onChange={e => setForm(f => ({ ...f, severity: e.target.value as OutageWindow['severity'] }))}
              className="w-full bg-input px-2 py-1.5 rounded text-sm outline-none"
            >
              <option value="low">Low (rolling cuts)</option>
              <option value="medium">Medium (2-4 hours)</option>
              <option value="high">High (full blackout)</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Start Hour (0-23)</label>
            <input
              type="number" min="0" max="23"
              value={form.startHour}
              onChange={e => setForm(f => ({ ...f, startHour: Number(e.target.value) }))}
              className="w-full bg-input px-2 py-1.5 rounded text-sm outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">End Hour (0-23)</label>
            <input
              type="number" min="0" max="23"
              value={form.endHour}
              onChange={e => setForm(f => ({ ...f, endHour: Number(e.target.value) }))}
              className="w-full bg-input px-2 py-1.5 rounded text-sm outline-none"
            />
          </div>
        </div>
        <button onClick={addOutage} className="w-full bg-accent text-root font-bold py-2 rounded text-sm hover:bg-ev">
          Add Outage to Schedule
        </button>
      </div>

      {/* Active Outages */}
      <div>
        <h3 className="font-bold text-sm mb-3">📋 Active Outage Schedule ({outages.length})</h3>
        {outages.length === 0 ? (
          <div className="text-center text-gray-500 text-sm py-6 border border-dashed border-gray-600 rounded">
            No outages scheduled. Add outage windows above.
          </div>
        ) : (
          <div className="space-y-2">
            {outages.map((o, i) => (
              <div key={i} className={`border-l-4 rounded p-3 flex items-center justify-between ${SEVERITY_COLORS[o.severity]} ${SEVERITY_BG[o.severity]}`}>
                <div>
                  <div className="font-bold text-sm">{o.city}</div>
                  <div className="text-xs text-gray-300">{o.startHour}:00 – {o.endHour}:00 · {o.endHour - o.startHour}h duration · {o.severity} severity</div>
                </div>
                <button onClick={() => removeOutage(i)} className="text-red-400 hover:text-red-200 font-bold text-lg leading-none px-2">×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MADDPG Response */}
      {outages.length > 0 && (
        <div className="bg-frame rounded p-4 border border-accent border-opacity-50">
          <h3 className="font-bold text-sm mb-3 text-accent">🤖 MADDPG Automatic Response</h3>
          <p className="text-xs text-gray-400 mb-3">The multi-agent optimizer has adjusted the 24-hour schedule to account for these outages:</p>
          {maddpgActions.length > 0 ? (
            <div className="space-y-1 text-xs max-h-48 overflow-y-auto custom-scrollbar">
              {maddpgActions.map((a: any, i: number) => {
                const isOutageHour = outageHours.has(a.hour);
                const isPreOutage = outages.some(o => a.hour === o.startHour - 1);
                if (!isOutageHour && !isPreOutage && !a.recommendation.toLowerCase().includes('outage') && !a.recommendation.toLowerCase().includes('pre-charg')) return null;
                return (
                  <div key={i} className={`flex items-center gap-2 p-1.5 rounded ${isOutageHour ? 'bg-red-900 bg-opacity-30' : isPreOutage ? 'bg-orange-900 bg-opacity-30' : 'bg-input'}`}>
                    <span className="text-accent font-bold w-8">{a.hour}:00</span>
                    <span className={`w-24 font-semibold ${isOutageHour ? 'text-orange-400' : 'text-green-400'}`}>{a.evAction.toUpperCase()}</span>
                    <span className="text-gray-300 flex-1">{a.recommendation}</span>
                  </div>
                );
              }).filter(Boolean)}
            </div>
          ) : (
            <div className="text-gray-400 text-xs">Generate a MADDPG schedule to see automatic response.</div>
          )}
        </div>
      )}
    </div>
  );
}
