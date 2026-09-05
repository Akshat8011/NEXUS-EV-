"use client";
import React, { useState } from 'react';
import { EV_MODELS, REGIONS, EVModel, CHEMISTRY_INFO, DEFAULT_EV } from '../../lib/evModels';

interface EVSelectorProps {
  selected: EVModel;
  onSelect: (model: EVModel) => void;
}

export default function EVSelector({ selected, onSelect }: EVSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [region, setRegion] = useState('All');
  const [search, setSearch] = useState('');

  const filtered = EV_MODELS.filter(m => {
    const matchRegion = region === 'All' || m.region === region;
    const matchSearch = search === '' ||
      `${m.brand} ${m.model}`.toLowerCase().includes(search.toLowerCase());
    return matchRegion && matchSearch;
  });

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(v => !v)}
        className="w-full text-left bg-input hover:bg-gray-600 transition-colors rounded px-3 py-2 text-sm"
      >
        <div className="flex items-center justify-between">
          <div>
            <span className="text-gray-400 text-xs block">Selected EV Model</span>
            <span className="font-bold text-white">{selected.flag} {selected.brand} {selected.model}</span>
          </div>
          <span className="text-accent text-lg">{isOpen ? '▲' : '▼'}</span>
        </div>
        <div className="flex gap-3 mt-1 text-[10px] text-gray-400">
          <span>{selected.batteryKwh} kWh</span>
          <span>{selected.rangeKm} km</span>
          <span className={CHEMISTRY_INFO[selected.chemistry]?.color ? '' : ''} style={{ color: CHEMISTRY_INFO[selected.chemistry]?.color }}>{selected.chemistry}</span>
          {selected.v2gCapable && <span className="text-green-400">V2G✓</span>}
        </div>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-frame border border-gray-500 rounded shadow-xl max-h-[420px] overflow-hidden flex flex-col">
          {/* Search & Region filter */}
          <div className="p-2 border-b border-gray-600 space-y-2 shrink-0">
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search brand or model..."
              className="w-full bg-root px-2 py-1.5 rounded text-sm outline-none border border-gray-600 focus:border-accent"
            />
            <div className="flex gap-1 flex-wrap">
              {['All', ...REGIONS].map(r => (
                <button
                  key={r}
                  onClick={() => setRegion(r)}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${region === r ? 'bg-accent text-root' : 'bg-input text-gray-300 hover:bg-gray-600'}`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Model list */}
          <div className="overflow-y-auto custom-scrollbar">
            {filtered.length === 0 && (
              <div className="p-4 text-center text-gray-400 text-sm">No models found</div>
            )}
            {filtered.map(model => (
              <button
                key={model.id}
                onClick={() => { onSelect(model); setIsOpen(false); setSearch(''); }}
                className={`w-full text-left px-3 py-2 border-b border-gray-700 hover:bg-accent hover:text-root transition-colors ${selected.id === model.id ? 'bg-input' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-sm">{model.flag} {model.brand} {model.model}</span>
                    <span className="text-[10px] text-gray-400 ml-2">{model.year}</span>
                  </div>
                  {selected.id === model.id && <span className="text-accent text-xs font-bold">✓ Selected</span>}
                </div>
                <div className="flex gap-3 text-[10px] text-gray-400 mt-0.5">
                  <span>🔋 {model.batteryKwh} kWh</span>
                  <span>🛣️ {model.rangeKm} km</span>
                  <span>⚡ DC {model.dcChargeRateKw}kW</span>
                  <span style={{ color: CHEMISTRY_INFO[model.chemistry]?.color }}>{model.chemistry}</span>
                  {model.v2gCapable && <span className="text-green-400">V2G</span>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Backdrop to close */}
      {isOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
      )}
    </div>
  );
}
