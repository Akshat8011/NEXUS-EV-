"use client";
import React, { useMemo, useEffect, useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine, Cell,
  RadarChart, PolarGrid, PolarAngleAxis, Radar,
} from 'recharts';
import { DegradationState, generateDegradationCurve } from '../../lib/degradation';
import { MADDPGSchedule } from '../../lib/maddpg';
import { EVModel, CHEMISTRY_INFO } from '../../lib/evModels';

interface AnalyticsTabProps {
  degradation:    DegradationState;
  habits:         any[];
  habitAnalytics: any;
  maddpgSchedule: MADDPGSchedule | null;
  weatherTemp:    number;
  selectedEV?:    EVModel;
  // Pass sim totals from the dashboard for V2G/V2H savings calc
  simTotals?: {
    totalGridCostRs:   number;
    totalV2GEarnRs:    number;
    totalSolarKwh:     number;
    totalV2HKwh:       number;
    cumulativeDays:    number;
  };
}

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h2 className="text-accent font-bold text-base border-b border-gray-600 pb-1 mb-4">{children}</h2>
);

const StatCard = ({ label, value, sub, color, className }: {
  label: string; value: string; sub?: string; color?: string; className?: string
}) => (
  <div className={`bg-input rounded p-3 text-center ${className ?? ''}`}>
    <div className="text-xs text-gray-400 mb-1">{label}</div>
    <div className={`text-xl font-bold ${color || 'text-white'}`}>{value}</div>
    {sub && <div className="text-[10px] text-gray-400 mt-0.5">{sub}</div>}
  </div>
);

const COUNTRIES = ['India','USA','Germany','France','UK','China','Japan','Korea','Norway','Australia','UAE','Canada'];

export default function AnalyticsTab({
  degradation, habits, habitAnalytics, maddpgSchedule, weatherTemp, selectedEV, simTotals
}: AnalyticsTabProps) {

  const batteryKwh        = selectedEV?.batteryKwh       ?? 40.5;
  const chemistryFactor   = selectedEV?.degradationFactor ?? 1.0;
  const chemistry         = selectedEV?.chemistry         ?? 'NMC';
  const chemInfo          = CHEMISTRY_INFO[chemistry];
  const consumptionWhPerKm = selectedEV?.consumptionWhPerKm ?? 93;

  // ── Battery degradation curve ─────────────────────────────────────────────
  const degradationCurve = useMemo(() =>
    generateDegradationCurve(
      degradation.soh, weatherTemp, 60, 250000,
      batteryKwh, chemistryFactor, consumptionWhPerKm
    ),
    [degradation.soh, weatherTemp, batteryKwh, chemistryFactor, consumptionWhPerKm]
  );

  const sohColor = degradation.soh > 90 ? '#A3BE8C' : degradation.soh > 80 ? '#EBCB8B' : '#BF616A';

  // ── MADDPG charts ──────────────────────────────────────────────────────────
  const agentData = maddpgSchedule?.actions.map(a => ({
    hour:      `${a.hour}h`,
    evReward:  a.agentRewards.ev,
    homeReward: a.agentRewards.home,
    gridReward: a.agentRewards.grid,
    evPower:   a.evPowerKw,
  })) || [];

  // ── Habit charts ───────────────────────────────────────────────────────────
  const habitChartData = habits.slice(-14).map((h, i) => ({
    session:  `S${i + 1}`,
    startSoc: h.chargingStartSoc,
    endSoc:   h.chargingEndSoc,
  }));

  const plugInHourData = Array.from({ length: 24 }, (_, h) => ({
    hour: `${h}:00`,
    frequency: habits.filter(hb => new Date(hb.date).getHours() === h).length,
  }));

  // ── EV vs ICE Comparison ───────────────────────────────────────────────────
  const [selectedCountry, setSelectedCountry] = useState('India');
  const [fuelPrices, setFuelPrices] = useState<any>(null);
  const [iceData, setIceData] = useState<any>(null);
  const [isFetchingPrices, setIsFetchingPrices] = useState(false);

  const fetchFuelPrices = async (country: string) => {
    setIsFetchingPrices(true);
    try {
      const data = await fetch(`/api/fuel-prices?country=${encodeURIComponent(country)}`).then(r => r.json());
      setFuelPrices(data);
      if (selectedEV) {
        const ice = data.iceComparables?.[selectedEV.id];
        setIceData(ice);
      }
    } catch (e) { console.error(e); }
    setIsFetchingPrices(false);
  };

  useEffect(() => { fetchFuelPrices(selectedCountry); }, [selectedCountry, selectedEV?.id]);

  // Compute EV vs ICE costs
  const computeComparison = () => {
    if (!fuelPrices || !iceData || !selectedEV) return null;

    const sym = fuelPrices.symbol;
    const ex  = fuelPrices.exchangeToInr;

    // EV: local currency per km
    const evElecCostPerKm = (consumptionWhPerKm / 1000) * fuelPrices.electricityPerKwh;

    // ICE: local currency per km
    const iceFuelCostPerKm = fuelPrices.petrolPerLitre / iceData.mileageKmPerL;

    const savingsPerKm      = iceFuelCostPerKm - evElecCostPerKm;
    const savingsPctPerKm   = (savingsPerKm / iceFuelCostPerKm) * 100;
    const annualKm          = 15000; // typical annual driving
    const annualSavingsLocal = savingsPerKm * annualKm;
    const annualCO2SavedKg  = ((iceData.co2GPerKm - (consumptionWhPerKm * 0.5)) * annualKm) / 1000;
    // 0.5 gCO2/Wh = Indian grid emission factor

    // Radar comparison data
    const radarData = [
      { subject: 'Cost/km',   EV: 100 - (evElecCostPerKm / iceFuelCostPerKm) * 100, ICE: 0 },
      { subject: 'CO₂',       EV: 100 - (consumptionWhPerKm * 0.5 / iceData.co2GPerKm) * 100, ICE: 0 },
      { subject: 'Mainten.',  EV: 70, ICE: 0 },  // EVs have ~70% lower maintenance
      { subject: 'Silence',   EV: 100, ICE: 15 },
      { subject: 'V2G Earn.', EV: selectedEV.v2gCapable ? 85 : 0, ICE: 0 },
      { subject: 'Range',     EV: (selectedEV.rangeKm / 600) * 100, ICE: 100 },
    ];

    return {
      evElecCostPerKm, iceFuelCostPerKm, savingsPerKm, savingsPctPerKm,
      annualSavingsLocal, annualCO2SavedKg, radarData, sym, ex,
      iceName: iceData.name,
    };
  };

  const comparison = computeComparison();

  // ── V2G / V2H / Solar savings ──────────────────────────────────────────────
  const electricityRate  = 7.5; // ₹/kWh baseline grid rate
  const v2gEarnings      = habitAnalytics.totalV2GEarningsRs;
  const solarSavings     = (habitAnalytics.totalSolarChargingKwh ?? 0) * electricityRate;
  const v2hSavings       = (simTotals?.totalV2HKwh ?? 0) * electricityRate;
  const totalSystemSavings = v2gEarnings + solarSavings + v2hSavings;

  // What would it cost if NO solar/V2H/V2G — pure grid for everything
  const pureGridCostEstimate = habitAnalytics.totalKm > 0
    ? habitAnalytics.totalKm * (consumptionWhPerKm / 1000) * electricityRate
      + (simTotals?.totalSolarKwh ?? 0) * electricityRate  // solar was free; add it back
    : null;

  // Compare MADDPG optimized vs naive (charge at peak hours only)
  const maddpgSaving = maddpgSchedule
    ? (maddpgSchedule.totalEstimatedEarnings + solarSavings) - maddpgSchedule.totalEstimatedCost
    : 0;

  // Bar data for savings breakdown
  const savingsBreakdownData = [
    { name: 'V2G Export', value: parseFloat(v2gEarnings.toFixed(2)), color: '#A3BE8C' },
    { name: 'Solar Self-Use', value: parseFloat(solarSavings.toFixed(2)), color: '#EBCB8B' },
    { name: 'V2H Backup', value: parseFloat(v2hSavings.toFixed(2)), color: '#88C0D0' },
    { name: 'MADDPG Opt.', value: Math.max(0, parseFloat(maddpgSaving.toFixed(2))), color: '#B48EAD' },
  ];

  return (
    <div className="p-4 overflow-y-auto h-full custom-scrollbar space-y-10">

      {/* ═══ 1. BATTERY DEGRADATION ═══════════════════════════════════════════ */}
      <section>
        <SectionTitle>🔋 Battery Degradation & Life Cycles</SectionTitle>

        {/* EV model info banner */}
        {selectedEV && (
          <div className="bg-input rounded p-3 mb-4 border border-gray-600 flex flex-wrap gap-6 items-start">
            <div>
              <div className="text-xs text-gray-400">Selected Model</div>
              <div className="font-bold">{selectedEV.flag} {selectedEV.brand} {selectedEV.model} ({selectedEV.year})</div>
            </div>
            <div>
              <div className="text-xs text-gray-400">Battery Chemistry</div>
              <div className="font-bold" style={{ color: chemInfo?.color }}>{chemInfo?.label}</div>
              <div className="text-[10px] text-gray-400 max-w-xs">{chemInfo?.note}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400">Degradation Profile</div>
              <div className="font-bold">
                {chemistryFactor <= 0.80 ? '🟢 Excellent (LFP — very low fade)' :
                 chemistryFactor <= 0.95 ? '🟡 Good' :
                 chemistryFactor <= 1.05 ? '🟠 Standard (NMC baseline)' : '🔴 Higher wear'}
              </div>
              <div className="text-[10px] text-gray-400">{chemistryFactor}× vs NMC baseline</div>
            </div>
            <div>
              <div className="text-xs text-gray-400">Warranty</div>
              <div className="font-bold">{selectedEV.warrantyYears} yrs / {(selectedEV.warrantyKm/1000).toFixed(0)}k km</div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <StatCard
            label="State of Health"
            value={`${degradation.soh.toFixed(1)}%`}
            sub="100% = brand new"
            color={sohColor}
          />
          <StatCard label="Full Equiv. Cycles" value={degradation.fec.toFixed(2)} sub="Ah-throughput basis" />
          <StatCard
            label="Usable Capacity"
            value={`${((degradation.soh / 100) * batteryKwh).toFixed(1)} kWh`}
            sub={`of ${batteryKwh} kWh original`}
          />
          <StatCard
            label="Est. Lifetime Left"
            value={`${(degradation.estimatedLifetimeKm / 1000).toFixed(0)}k km`}
            sub="until SoH reaches 80%"
            color={degradation.estimatedLifetimeKm > 150000 ? '#A3BE8C' : '#BF616A'}
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
          <StatCard
            label="Temp Stress Factor"
            value={`${degradation.temperatureStress.toFixed(2)}×`}
            sub={`${weatherTemp.toFixed(0)}°C ambient (1.0 = ideal 25°C)`}
            color={degradation.temperatureStress > 1.3 ? '#BF616A' : '#A3BE8C'}
          />
          <StatCard label="Calendar Age" value={`${degradation.calendarDays} days`} sub="since first use" />
          <StatCard
            label="Degradation Rate"
            value={`${degradation.degradationRate.toFixed(3)}%`}
            sub="per 1000 FEC (Naumann 2020)"
            color={degradation.degradationRate > 0.15 ? '#BF616A' : '#A3BE8C'}
          />
        </div>

        {/* SoH vs Distance chart */}
        <div className="h-60 bg-white text-black p-2 rounded mb-2">
          <div className="text-center text-xs font-bold mb-1">Battery SoH vs Lifetime Distance — Research Model ({chemistry})</div>
          <ResponsiveContainer width="100%" height="90%">
            <LineChart data={degradationCurve} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="km" tickFormatter={v => `${v/1000}k`} tick={{ fontSize: 10 }} />
              <YAxis domain={[60, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: any) => [`${Number(v).toFixed(1)}%`, 'SoH']} labelFormatter={(l: any) => `${Number(l)/1000}k km`} />
              <ReferenceLine y={80} stroke="red" strokeDasharray="6 2" label={{ value: 'EOL (80%)', position: 'right', fontSize: 9, fill: 'red' }} />
              <Line type="monotone" dataKey="soh" stroke={chemInfo?.color ?? '#88C0D0'} dot={false} strokeWidth={2} name="SoH %" />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[10px] text-gray-500 italic">
          Model: SoH = 100 − 0.00025·FEC^1.08 − 0.007·√(t·Tₛ) | Chemistry factor: {chemistryFactor}× | Source: Naumann et al. 2020, Schimpe et al. 2018
        </p>
      </section>

      {/* ═══ 2. EV vs ICE COMPARISON ══════════════════════════════════════════ */}
      <section>
        <SectionTitle>🚗 EV vs ICE Comparison — Real-World Cost & Savings</SectionTitle>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-sm text-gray-400">Select Country / Region:</span>
          <div className="flex flex-wrap gap-1">
            {COUNTRIES.map(c => (
              <button key={c} onClick={() => setSelectedCountry(c)}
                className={`px-2 py-1 rounded text-xs font-bold transition-colors ${selectedCountry === c ? 'bg-accent text-root' : 'bg-input text-gray-300 hover:bg-gray-600'}`}
              >{c}</button>
            ))}
          </div>
          {isFetchingPrices && <span className="text-xs text-yellow-400 animate-pulse">Fetching prices...</span>}
        </div>

        {fuelPrices && comparison && selectedEV && (
          <>
            {/* Fuel & electricity prices */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <StatCard
                label={`Petrol (${selectedCountry})`}
                value={`${fuelPrices.symbol}${fuelPrices.petrolPerLitre.toFixed(2)}/L`}
                sub={`≈ ₹${fuelPrices.inrPetrolPerLitre.toFixed(1)}/L`}
                color="#EBCB8B"
              />
              <StatCard
                label="Electricity"
                value={`${fuelPrices.symbol}${fuelPrices.electricityPerKwh.toFixed(3)}/kWh`}
                sub={`≈ ₹${fuelPrices.inrElecPerKwh.toFixed(2)}/kWh`}
                color="#88C0D0"
              />
              <StatCard
                label="Fuel Tax"
                value={`${fuelPrices.taxPct}%`}
                sub="of pump price"
              />
              <StatCard
                label="Carbon Tax"
                value={`${fuelPrices.carbonTaxPct}%`}
                sub="component"
                color={fuelPrices.carbonTaxPct > 10 ? '#A3BE8C' : '#gray-400'}
              />
            </div>

            {/* ICE vs EV cost cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {/* ICE car */}
              <div className="bg-input rounded p-4 border border-orange-600">
                <div className="text-orange-400 font-bold text-sm mb-2">🚗 ICE Equivalent: {comparison.iceName}</div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Mileage</span>
                    <span>{iceData?.mileageKmPerL?.toFixed(1)} km/L</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Fuel cost / km</span>
                    <span className="text-orange-400 font-bold">
                      {fuelPrices.symbol}{comparison.iceFuelCostPerKm.toFixed(3)} ({`₹${(comparison.iceFuelCostPerKm * fuelPrices.exchangeToInr).toFixed(2)}`})
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">CO₂ per km</span>
                    <span className="text-red-400">{iceData?.co2GPerKm} g/km</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Annual fuel cost (15k km)</span>
                    <span className="text-orange-400 font-bold">
                      {fuelPrices.symbol}{(comparison.iceFuelCostPerKm * 15000).toFixed(0)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Avg engine maintenance / yr</span>
                    <span className="text-gray-300">~{fuelPrices.symbol}{(fuelPrices.exchangeToInr > 1 ? (15000 / fuelPrices.exchangeToInr).toFixed(0) : '15000')}</span>
                  </div>
                </div>
              </div>

              {/* EV */}
              <div className="bg-input rounded p-4 border border-green-600">
                <div className="text-green-400 font-bold text-sm mb-2">⚡ {selectedEV.flag} {selectedEV.brand} {selectedEV.model}</div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Consumption</span>
                    <span>{consumptionWhPerKm} Wh/km</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Electricity cost / km</span>
                    <span className="text-green-400 font-bold">
                      {fuelPrices.symbol}{comparison.evElecCostPerKm.toFixed(3)} ({`₹${(comparison.evElecCostPerKm * fuelPrices.exchangeToInr).toFixed(2)}`})
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">CO₂ per km (grid mix)</span>
                    <span className="text-green-400">{(consumptionWhPerKm * 0.5).toFixed(0)} g/km</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Annual elec. cost (15k km)</span>
                    <span className="text-green-400 font-bold">
                      {fuelPrices.symbol}{(comparison.evElecCostPerKm * 15000).toFixed(0)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">EV maintenance / yr</span>
                    <span className="text-green-400">~30% of ICE 🟢</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Savings summary */}
            <div className="bg-gradient-to-r from-green-900 to-green-800 rounded p-4 mb-4 border border-green-600">
              <div className="text-green-300 font-bold text-base mb-2">
                💚 Annual Savings vs ICE in {selectedCountry}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="text-center">
                  <div className="text-xs text-green-400">Saved per km</div>
                  <div className="text-2xl font-black text-green-300">
                    {fuelPrices.symbol}{comparison.savingsPerKm.toFixed(3)}
                  </div>
                  <div className="text-xs text-green-500">({comparison.savingsPctPerKm.toFixed(0)}% cheaper)</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-green-400">Annual savings (15k km)</div>
                  <div className="text-2xl font-black text-green-300">
                    {fuelPrices.symbol}{comparison.annualSavingsLocal.toFixed(0)}
                  </div>
                  <div className="text-xs text-green-500">≈ ₹{(comparison.annualSavingsLocal * fuelPrices.exchangeToInr).toFixed(0)}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-green-400">CO₂ avoided / year</div>
                  <div className="text-2xl font-black text-green-300">{comparison.annualCO2SavedKg.toFixed(0)} kg</div>
                  <div className="text-xs text-green-500">= {(comparison.annualCO2SavedKg / 20).toFixed(0)} trees/yr</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-green-400">Break-even (excl. V2G)</div>
                  <div className="text-2xl font-black text-green-300">
                    {comparison.annualSavingsLocal > 0 ? `~${Math.ceil(200000 / (comparison.annualSavingsLocal * fuelPrices.exchangeToInr))}` : '—'} yrs
                  </div>
                  <div className="text-xs text-green-500">vs ₹2L premium</div>
                </div>
              </div>
            </div>

            {/* Radar chart */}
            <div className="h-64 bg-white rounded p-2 mb-2">
              <div className="text-center text-xs font-bold mb-1">Multi-Factor EV vs ICE Comparison</div>
              <ResponsiveContainer width="100%" height="90%">
                <RadarChart data={comparison.radarData} margin={{ top: 5, right: 20, bottom: 5, left: 20 }}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10 }} />
                  <Radar name="EV" dataKey="EV" stroke="#A3BE8C" fill="#A3BE8C" fillOpacity={0.4} />
                  <Radar name="ICE" dataKey="ICE" stroke="#BF616A" fill="#BF616A" fillOpacity={0.3} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[10px] text-gray-500 italic">
              Higher score = better on each axis. CO₂ uses {selectedCountry} grid emission factor.
              Maintenance savings from ICCT (2021) lifecycle analysis.
            </p>
          </>
        )}
      </section>

      {/* ═══ 3. V2G / V2H / SOLAR SAVINGS ANALYSIS ═══════════════════════════ */}
      <section>
        <SectionTitle>💰 Energy System Savings vs Pure-Grid Baseline</SectionTitle>
        <p className="text-xs text-gray-400 mb-3">
          Compares your NEXUS-EV system (solar + V2G + V2H + MADDPG) against a household with no solar and grid-only EV charging at residential rate ₹{electricityRate}/kWh.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <StatCard label="V2G Earnings" value={`₹${v2gEarnings.toFixed(2)}`} sub="exported to grid" color="#A3BE8C" />
          <StatCard label="Solar Free Charge" value={`₹${solarSavings.toFixed(2)}`} sub={`${habitAnalytics.totalSolarChargingKwh?.toFixed(1) ?? 0} kWh @ ₹${electricityRate}`} color="#EBCB8B" />
          <StatCard label="V2H Grid Avoidance" value={`₹${v2hSavings.toFixed(2)}`} sub="would have cost from grid" color="#88C0D0" />
          <StatCard
            label="Total System Benefit"
            value={`₹${totalSystemSavings.toFixed(2)}`}
            sub="vs pure-grid baseline"
            color={totalSystemSavings >= 0 ? '#A3BE8C' : '#BF616A'}
          />
        </div>

        {/* Savings breakdown bar chart */}
        <div className="h-56 bg-white rounded p-2 mb-3">
          <div className="text-center text-xs font-bold mb-1">Savings Breakdown (₹)</div>
          <ResponsiveContainer width="100%" height="90%">
            <BarChart data={savingsBreakdownData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: any) => [`₹${Number(v).toFixed(2)}`, 'Savings']} />
              <Bar dataKey="value" radius={[3,3,0,0]}>
                {savingsBreakdownData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* MADDPG vs naive comparison */}
        {maddpgSchedule && (
          <div className="bg-input rounded p-3 border border-gray-600">
            <div className="text-accent font-bold text-sm mb-2">🤖 MADDPG Smart Scheduling vs Naive Grid Charging</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              <div>
                <div className="text-xs text-gray-400">MADDPG estimated daily cost</div>
                <div className="font-bold text-white">₹{maddpgSchedule.totalEstimatedCost.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400">MADDPG V2G earnings</div>
                <div className="font-bold text-green-400">₹{maddpgSchedule.totalEstimatedEarnings.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400">Net daily estimate</div>
                <div className={`font-bold text-lg ${maddpgSchedule.netEstimate >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  ₹{maddpgSchedule.netEstimate.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-400">Overall reward score</div>
                <div className="font-bold text-accent">{maddpgSchedule.overallReward.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400">V2G sessions planned</div>
                <div className="font-bold">{selectedEV?.v2gCapable ? maddpgSchedule.v2gSessions : 'N/A (no V2G)'}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400">Conflicts resolved</div>
                <div className="font-bold">{maddpgSchedule.conflictsResolved}</div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ═══ 4. MADDPG AGENT REWARDS ═══════════════════════════════════════════ */}
      {agentData.length > 0 && (
        <section>
          <SectionTitle>🤖 MADDPG 24-Hour Agent Reward Distribution</SectionTitle>
          <div className="h-56 bg-white rounded p-2 mb-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={agentData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hour" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: '10px' }} />
                <Bar dataKey="evReward"   fill="#A3BE8C" name="EV Agent"   stackId="a" />
                <Bar dataKey="homeReward" fill="#88C0D0" name="Home Agent" stackId="a" />
                <Bar dataKey="gridReward" fill="#EBCB8B" name="Grid Agent" stackId="a" radius={[2,2,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* EV Power Schedule */}
          <div className="h-48 bg-white rounded p-2">
            <div className="text-center text-xs font-bold mb-1">EV Charge / Discharge Schedule (kW)</div>
            <ResponsiveContainer width="100%" height="90%">
              <BarChart data={agentData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hour" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip formatter={(v: any) => [`${Number(v).toFixed(2)} kW`, 'Power']} />
                <ReferenceLine y={0} stroke="gray" />
                <Bar dataKey="evPower" name="EV Power (kW)" radius={[2,2,0,0]}>
                  {agentData.map((entry, i) => (
                    <Cell key={i} fill={entry.evPower > 0 ? '#A3BE8C' : entry.evPower < 0 ? '#BF616A' : '#4C566A'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] text-gray-500 italic mt-1">Green = charging, Red = V2G/V2H discharge, Grey = idle</p>
        </section>
      )}

      {/* ═══ 5. USER DRIVING & CHARGING HABITS ════════════════════════════════ */}
      <section>
        <SectionTitle>📱 User Driving & Charging Habits</SectionTitle>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <StatCard label="Sessions Recorded" value={String(habitAnalytics.sessions)} sub="simulated days" />
          <StatCard label="Total Distance" value={`${habitAnalytics.totalKm} km`} sub="estimated" />
          <StatCard
            label="EV Cost per km"
            value={habitAnalytics.sessions > 0 && habitAnalytics.costPerKm > 0
              ? `₹${habitAnalytics.costPerKm.toFixed(2)}`
              : `₹${((consumptionWhPerKm / 1000) * electricityRate).toFixed(2)}`
            }
            sub={`${consumptionWhPerKm} Wh/km × ₹${electricityRate}/kWh`}
            color="#A3BE8C"
          />
          <StatCard
            label="V2G Earnings"
            value={`₹${habitAnalytics.totalV2GEarningsRs.toFixed(0)}`}
            sub="lifetime"
            color="#EBCB8B"
          />
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <StatCard
            label="Avg Plug-In SoC"
            value={`${habitAnalytics.avgChargingStartSoc.toFixed(0)}%`}
            sub="when you plug in"
          />
          <StatCard
            label="Avg Unplug SoC"
            value={`${habitAnalytics.avgChargingEndSoc.toFixed(0)}%`}
            sub="when you leave"
          />
        </div>

        {/* Theoretical cost per km info */}
        <div className="bg-input rounded p-3 mb-4 text-xs border border-gray-600">
          <div className="font-bold text-accent mb-1">📐 Theoretical EV Running Cost for {selectedEV?.brand ?? ''} {selectedEV?.model ?? ''}</div>
          <div className="flex flex-wrap gap-4">
            <span>Consumption: <b>{consumptionWhPerKm} Wh/km</b></span>
            <span>Grid cost: <b>{consumptionWhPerKm / 1000} kWh/km × ₹{electricityRate}/kWh = <span className="text-green-400">₹{((consumptionWhPerKm / 1000) * electricityRate).toFixed(2)}/km</span></b></span>
            <span>With solar: <b className="text-yellow-400">₹{((consumptionWhPerKm / 1000) * electricityRate * 0.4).toFixed(2)}/km</b> (60% solar share)</span>
            <span>ICE equivalent: <b className="text-red-400">₹{(104 / (iceData?.mileageKmPerL ?? 16)).toFixed(2)}/km</b></span>
          </div>
        </div>

        {habitChartData.length > 0 && (
          <div className="h-52 bg-white rounded p-2 mb-4">
            <div className="text-center text-xs font-bold mb-1">SoC at Plug-In vs Plug-Out (per Session)</div>
            <ResponsiveContainer width="100%" height="90%">
              <BarChart data={habitChartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="session" tick={{ fontSize: 9 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: '10px' }} />
                <Bar dataKey="startSoc" fill="#BF616A" name="Plug-In SoC %" />
                <Bar dataKey="endSoc"   fill="#A3BE8C" name="Plug-Out SoC %" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="h-48 bg-white rounded p-2">
          <div className="text-center text-xs font-bold mb-1">Plug-In Frequency by Hour of Day</div>
          <ResponsiveContainer width="100%" height="90%">
            <BarChart data={plugInHourData} margin={{ top: 5, right: 10, left: -25, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="hour" tick={{ fontSize: 8 }} interval={2} />
              <YAxis tick={{ fontSize: 9 }} />
              <Tooltip />
              <Bar dataKey="frequency" fill="#88C0D0" name="Sessions" radius={[2,2,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

    </div>
  );
}
