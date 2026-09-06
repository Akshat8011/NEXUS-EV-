"use client";
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useSimulation, SimParams } from '../hooks/useSimulation';
import { useDegradation } from '../hooks/useDegradation';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';
import { runMADDPG, OutageWindow, MADDPGSchedule } from '../lib/maddpg';
import { generateDailyEstimation, DailyEstimation } from '../lib/dailyPlanner';
import { EVModel, DEFAULT_EV, CHEMISTRY_INFO } from '../lib/evModels';
import dynamic from 'next/dynamic';

const AnalyticsTab    = dynamic(() => import('./components/AnalyticsTab'),    { ssr: false });
const DailyPlannerTab = dynamic(() => import('./components/DailyPlannerTab'), { ssr: false });
const OutagesTab      = dynamic(() => import('./components/OutagesTab'),       { ssr: false });
const DigitalTwinTab  = dynamic(() => import('./components/DigitalTwinTab'),  { ssr: false });
const EVSelector      = dynamic(() => import('./components/EVSelector'),       { ssr: false });
const DailyBillsTab   = dynamic(() => import('./components/DailyBillsTab'),    { ssr: false });

export function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

const LabelFrame = ({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) => (
  <fieldset className={cn("border border-gray-500 p-3 rounded bg-frame mb-3", className)}>
    <legend className="text-white font-bold px-1 text-[11px]">{title}</legend>
    {children}
  </fieldset>
);

const TkButton = ({ children, onClick, disabled, className }: any) => (
  <button
    className={cn("w-full font-bold py-1.5 px-2 text-sm text-root transition-colors",
      disabled ? "bg-disabled text-disabledText cursor-not-allowed" : "bg-accent hover:bg-ev cursor-pointer",
      className
    )}
    onClick={onClick} disabled={disabled}
  >
    {children}
  </button>
);

const TABS = ['Dashboard', 'Analytics', 'Daily Planner', 'Outages', 'Digital Twin', 'Detailed Bills'] as const;
type Tab = typeof TABS[number];

export default function Dashboard() {
  // EV model state
  const [selectedEV, setSelectedEV] = useState<EVModel>(DEFAULT_EV);

  const simParams: SimParams = {
    evCapacityKwh:      selectedEV.batteryKwh,
    evMaxRangeKm:       selectedEV.rangeKm,
    chargeRateKw:       selectedEV.chargeRateKw,
    v2gRateKw:          selectedEV.v2gCapable ? 6.0 : 0,
    v2gCapable:         selectedEV.v2gCapable,
    consumptionWhPerKm: selectedEV.consumptionWhPerKm,
  };

  const sim = useSimulation(simParams);
  const { state: degradation, habits, habitAnalytics, recordChargeCycle, recordHabit } = useDegradation(
    selectedEV.batteryKwh,
    selectedEV.degradationFactor,
    selectedEV.id
  );

  const [activeTab, setActiveTab] = useState<Tab>('Dashboard');
  const [weather, setWeather] = useState<any>(null);
  const [cityInput, setCityInput] = useState('');
  const [isFetchingWeather, setIsFetchingWeather] = useState(false);
  const [isTripModalOpen, setIsTripModalOpen] = useState(false);
  const [isForecastModalOpen, setIsForecastModalOpen] = useState(false);
  const [outages, setOutages] = useState<OutageWindow[]>([]);
  const [maddpgSchedule, setMaddpgSchedule] = useState<MADDPGSchedule | null>(null);
  const [dailyEstimation, setDailyEstimation] = useState<DailyEstimation | null>(null);
  const [isPlannerLoading, setIsPlannerLoading] = useState(false);

  // Debounce MADDPG and planner to prevent flicker
  const maddpgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const plannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchWeather = useCallback(async (city?: string) => {
    setIsFetchingWeather(true);
    try {
      const url = city ? `/api/weather?city=${encodeURIComponent(city)}` : '/api/weather';
      const data = await fetch(url).then(r => r.json());
      setWeather(data);
    } catch (e) { console.error(e); }
    setIsFetchingWeather(false);
  }, []);

  useEffect(() => { fetchWeather('Lucknow'); }, []);

  const weatherTemp    = weather?.current?.main?.temp ?? 25;
  const cloudCover     = weather?.current?.clouds?.all ?? 50;
  const forecastTemps  = weather?.forecast?.list?.slice(0,8).map((f: any) => f.main.temp) ?? [];
  const forecastClouds = weather?.forecast?.list?.slice(0,8).map((f: any) => f.clouds.all) ?? [];
  const forecastDescs  = weather?.forecast?.list?.slice(0,8).map((f: any) => f.weather[0].description) ?? [];

  // Debounced MADDPG — now passes ALL model-specific params
  useEffect(() => {
    if (maddpgTimerRef.current) clearTimeout(maddpgTimerRef.current);
    maddpgTimerRef.current = setTimeout(() => {
      const schedule = runMADDPG({
        currentEvSoc:        sim.evSoc,
        minRangeKm:          sim.minRangeKm,
        evMaxRangeKm:        sim.evMaxRangeKm,
        evCapacityKwh:       sim.evCapacityKwh,
        chargeRateKw:        selectedEV.chargeRateKw,           // ← model-specific AC charge rate
        v2gRateKw:           selectedEV.v2gRateKw ?? 0,         // ← model-specific V2G rate (kW)
        consumptionWhPerKm:  selectedEV.consumptionWhPerKm,    // ← model-specific consumption
        weatherTemp, cloudCoverPct: cloudCover,
        forecastTemps, forecastClouds,
        gridIsDown: sim.gridIsDown,
        outages,
        batterySoh:          degradation.soh,
        homeBatterySoc:      sim.homeBatterySoc,
      });
      setMaddpgSchedule(schedule);
    }, 800);
    return () => { if (maddpgTimerRef.current) clearTimeout(maddpgTimerRef.current); };
  }, [sim.evSoc, sim.minRangeKm, sim.gridIsDown, weatherTemp, cloudCover, outages, degradation.soh, selectedEV.id]);

  // Debounced Daily Planner — runs 1200ms after MADDPG stabilizes
  useEffect(() => {
    if (!maddpgSchedule || !weather?.current) return;
    if (plannerTimerRef.current) clearTimeout(plannerTimerRef.current);
    plannerTimerRef.current = setTimeout(() => {
      const plan = generateDailyEstimation({
        cityName:            weather?.cityName ?? 'Lucknow',
        weatherTemp,         cloudCoverPct: cloudCover,
        forecastTemps,       forecastClouds,    forecastDescriptions: forecastDescs,
        evSoc:               sim.evSoc,
        homeBatterySoc:      sim.homeBatterySoc,
        minRangeKm:          sim.minRangeKm,
        evMaxRangeKm:        sim.evMaxRangeKm,
        // ── EV model-specific params (REQUIRED for correct physics) ──────
        evCapacityKwh:       selectedEV.batteryKwh,
        chargeRateKw:        selectedEV.chargeRateKw,
        consumptionWhPerKm:  selectedEV.consumptionWhPerKm,
        v2gCapable:          selectedEV.v2gCapable,
        // ─────────────────────────────────────────────────────────────────
        batterySoh:          degradation.soh,
        gridIsDown:          sim.gridIsDown,
        outages,
        maddpgSchedule,
      });
      setDailyEstimation(plan);
      setIsPlannerLoading(false);
    }, 1200);
    return () => { if (plannerTimerRef.current) clearTimeout(plannerTimerRef.current); };
  }, [maddpgSchedule, weather?.cityName, weatherTemp, cloudCover, selectedEV.id]);

  // Record habit when sim day completes — use EV-specific costs only
  const prevDay = useRef(1);
  useEffect(() => {
    if (sim.dayNumber > prevDay.current && sim.dayNumber > 1) {
      // EV charging energy cost = consumption × 30km commute × ₹/kWh
      // This is the realistic EV-only cost, not the whole house electricity bill
      const dailyKm = 60; // two commutes of 30km each
      const evGridKwh = (selectedEV.consumptionWhPerKm * dailyKm) / 1000;
      const evChargingCostRs = evGridKwh * 7.5; // residential rate ₹/kWh
      const solarChargeKwh  = evGridKwh * 0.3;  // ~30% solar contribution

      recordChargeCycle(20, sim.evSoc, weatherTemp, 1);
      recordHabit({
        date: new Date().toISOString(),
        chargingStartSoc:  20,
        chargingEndSoc:    sim.evSoc,
        estimatedKm:       dailyKm,
        temp:              weatherTemp,
        v2gSessionCount:   maddpgSchedule?.v2gSessions ?? 0,
        peakSoc:           100,
        evChargingCostRs,
        v2gEarningsRs:     sim.totalEarnings,
        solarChargingKwh:  solarChargeKwh,
        gridChargingKwh:   Math.max(0, evGridKwh - solarChargeKwh),
      });
      prevDay.current = sim.dayNumber;
    }
  }, [sim.dayNumber]);

  const formatTime = (mins: number) => {
    const h = Math.floor(mins / 60).toString().padStart(2, '0');
    const m = (mins % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
  };

  const generatePlan = useCallback(() => {
    if (!maddpgSchedule || !weather?.current) return;
    setIsPlannerLoading(true);
    if (plannerTimerRef.current) clearTimeout(plannerTimerRef.current);
    plannerTimerRef.current = setTimeout(() => {
      const plan = generateDailyEstimation({
        cityName:            weather?.cityName ?? 'Lucknow',
        weatherTemp,         cloudCoverPct: cloudCover,
        forecastTemps,       forecastClouds,  forecastDescriptions: forecastDescs,
        evSoc:               sim.evSoc,
        homeBatterySoc:      sim.homeBatterySoc,
        minRangeKm:          sim.minRangeKm,
        evMaxRangeKm:        sim.evMaxRangeKm,
        evCapacityKwh:       selectedEV.batteryKwh,
        chargeRateKw:        selectedEV.chargeRateKw,
        consumptionWhPerKm:  selectedEV.consumptionWhPerKm,
        v2gCapable:          selectedEV.v2gCapable,
        batterySoh:          degradation.soh,
        gridIsDown:          sim.gridIsDown,
        outages,             maddpgSchedule,
      });
      setDailyEstimation(plan);
      setIsPlannerLoading(false);
    }, 300);
  }, [maddpgSchedule, weather, weatherTemp, cloudCover, sim, degradation.soh, outages]);

  return (
    <div className="flex flex-col h-screen bg-root text-white overflow-hidden">
      {/* TOP NAV */}
      <nav className="flex items-center bg-frame border-b border-gray-600 px-3 shrink-0 overflow-x-auto">
        <div className="text-accent font-black text-sm mr-4 shrink-0 py-2">⚡ NEXUS-EV</div>
        {/* Day badge */}
        <div className="bg-input rounded px-3 py-1 text-xs font-bold mr-3 shrink-0 text-accent">
          Day {sim.dayNumber}
        </div>
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={cn("px-3 py-3 text-xs font-bold whitespace-nowrap border-b-2 transition-colors",
              activeTab === tab ? "border-accent text-accent" : "border-transparent text-gray-400 hover:text-white"
            )}
          >
            {tab === 'Dashboard' ? '🏠 ' : tab === 'Analytics' ? '📊 ' : tab === 'Daily Planner' ? '📅 ' : tab === 'Outages' ? '⚡ ' : tab === 'Digital Twin' ? '🔮 ' : '🧾 '}
            {tab}
          </button>
        ))}
      </nav>

      {/* MAIN CONTENT */}
      <div className="flex-1 overflow-hidden">

        {/* DASHBOARD TAB */}
        {activeTab === 'Dashboard' && (
          <div className="flex flex-col lg:flex-row h-full p-2 gap-2 overflow-auto lg:overflow-hidden">

            {/* LEFT PANEL */}
            <div className="w-full lg:w-[300px] flex flex-col shrink-0 custom-scrollbar lg:overflow-y-auto lg:pr-1">

              {/* EV Model Selector */}
              <LabelFrame title="EV Model">
                <EVSelector selected={selectedEV} onSelect={(model) => {
                  setSelectedEV(model);
                  sim.resetAll();
                }} />
                <div className="mt-2 text-[10px] space-y-0.5">
                  <div className="flex justify-between"><span className="text-gray-400">Battery:</span><span>{selectedEV.batteryKwh} kWh</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Range:</span><span>{selectedEV.rangeKm} km WLTP</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">AC Charge:</span><span>{selectedEV.chargeRateKw} kW</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">DC Charge:</span><span>{selectedEV.dcChargeRateKw} kW</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Chemistry:</span>
                    <span style={{ color: CHEMISTRY_INFO[selectedEV.chemistry]?.color }}>{selectedEV.chemistry}</span>
                  </div>
                  <div className="flex justify-between"><span className="text-gray-400">V2G:</span>
                    <span className={selectedEV.v2gCapable ? 'text-green-400' : 'text-gray-500'}>{selectedEV.v2gCapable ? '✓ Capable' : '✗ Not available'}</span>
                  </div>
                </div>
              </LabelFrame>

              <LabelFrame title="Simulation Control">
                <div className="text-xs text-accent font-bold text-center mb-2">
                  📅 Day {sim.dayNumber} · {formatTime(sim.timeStep)}
                  {sim.timeStep >= 1430 && <span className="ml-2 text-yellow-400 animate-pulse">⏩ Next day...</span>}
                </div>
                <TkButton onClick={sim.startSim} disabled={sim.isRunning && sim.timeStep > 0 && sim.timeStep < 1440} className="mb-2">
                  {sim.timeStep === 0 ? 'Start Day 1' : sim.timeStep >= 1440 ? '⏩ Next Day' : 'Start 24-Hour Day'}
                </TkButton>
                <div className="flex gap-2 mb-2">
                  <TkButton onClick={sim.pauseSim} disabled={!sim.isRunning}>Pause</TkButton>
                  <TkButton onClick={sim.startSim} disabled={sim.isRunning || sim.timeStep === 0}>Resume</TkButton>
                </div>
                <TkButton onClick={sim.resetAll} className="bg-gridDown hover:bg-red-700 text-xs">Reset All Days</TkButton>
              </LabelFrame>

              <LabelFrame title="System Status">
                <div className="flex justify-between items-end mb-2">
                  <div>
                    <div className="text-xs mb-0.5">Day {sim.dayNumber} — {formatTime(sim.timeStep)}</div>
                    <div className={cn("font-bold text-sm",
                      sim.mode.includes("BLACKOUT") ? "text-red-500" :
                      sim.mode.includes("V2H") ? "text-orange-400" :
                      sim.mode.includes("Driving") ? "text-[#EBCB8B]" : "text-[#88C0D0]"
                    )}>Mode: {sim.mode}</div>
                  </div>
                  <div className={cn("font-bold text-xs", sim.isEvPluggedIn ? "text-[#A3BE8C]" : "text-[#BF616A]")}>
                    EV: {sim.isEvPluggedIn ? "Plugged In" : "Unplugged"}
                  </div>
                </div>
                <div className="w-full bg-root h-3 overflow-hidden mb-1 border border-gray-500">
                  <div className="bg-accent h-full transition-all" style={{ width: `${sim.evSoc}%` }} />
                </div>
                <div className="flex justify-between items-center mb-2">
                  <div className="font-bold text-sm">EV SOC: {sim.evSoc.toFixed(1)}%</div>
                  <div className="text-xs">Range: {((sim.evSoc/100)*sim.evMaxRangeKm).toFixed(0)} km</div>
                </div>
                <div className="flex justify-between text-xs text-gray-400">
                  <span>Today: ₹{(sim.totalEarnings - sim.totalCost).toFixed(1)}</span>
                  <span>Total: ₹{(sim.cumulativeEarnings - sim.cumulativeCost).toFixed(1)}</span>
                </div>
                {degradation.soh < 98 && (
                  <div className="text-xs text-yellow-400 mt-1">Battery SoH: {degradation.soh.toFixed(1)}%</div>
                )}
              </LabelFrame>

              <LabelFrame title={`Weather (${weather?.cityName || 'Lucknow'})`}>
                <div className="flex gap-2 mb-2">
                  <input value={cityInput} onChange={e => setCityInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && fetchWeather(cityInput)}
                    placeholder="Search city..." className="flex-1 bg-input px-2 py-1 text-xs rounded outline-none" />
                  <TkButton className="w-auto px-3 text-xs" disabled={isFetchingWeather || !cityInput} onClick={() => fetchWeather(cityInput)}>Go</TkButton>
                </div>
                {weather?.current?.weather ? (
                  <div className="text-center">
                    <div className="font-bold">{weather.current.weather[0].main}</div>
                    <div className="text-sm">{weather.current.main.temp.toFixed(1)}°C</div>
                    <div className="text-xs">Vis: {(weather.current.visibility/1000).toFixed(1)} km</div>
                    {weather.air_pollution?.list?.[0]?.components && (
                      <div className="text-xs font-bold mt-1 text-[#A3BE8C]">
                        PM2.5: {weather.air_pollution.list[0].components.pm2_5.toFixed(1)} µg/m³
                      </div>
                    )}
                  </div>
                ) : weather?.error ? (
                  <div className="text-center text-xs text-red-400">Weather API Error</div>
                ) : <div className="text-center text-xs">Loading...</div>}
                <TkButton disabled={!weather?.forecast} className="mt-2 text-xs" onClick={() => setIsForecastModalOpen(true)}>
                  Show 5-Day Forecast
                </TkButton>
              </LabelFrame>

              <LabelFrame title="User Settings">
                <div className="text-xs mb-1">V2G Reserve Range: {sim.minRangeKm} km</div>
                <input type="range" min="0" max={selectedEV.rangeKm - 50}
                  value={sim.minRangeKm}
                  onChange={e => sim.setMinRangeKm(Number(e.target.value))}
                  className="w-full accent-accent h-1 rounded appearance-none" />
              </LabelFrame>

              <LabelFrame title="Grid Services">
                <div className={cn("font-bold text-center text-sm mb-2", sim.gridIsDown ? "text-[#BF616A]" : "text-[#A3BE8C]")}>
                  Grid: {sim.gridIsDown ? "OFFLINE" : "CONNECTED"}
                </div>
                <div className="flex gap-2 mb-2">
                  <TkButton onClick={() => sim.setGridIsDown(true)}>Grid Failure</TkButton>
                  <TkButton onClick={() => sim.setGridIsDown(false)}>Restore Grid</TkButton>
                </div>
                <div className="flex gap-2">
                  <TkButton 
                    onClick={() => sim.setIsManualV2H(!sim.isManualV2H)}
                    disabled={!selectedEV.v2gCapable}
                    className={sim.isManualV2H ? "!bg-purple-600 !text-white" : ""}
                  >
                    {sim.isManualV2H ? "Stop Manual V2H" : "Power Home Manually"}
                  </TkButton>
                </div>
              </LabelFrame>

              {/* Multi-day summary */}
              {sim.dailyBills.length > 0 && (
                <LabelFrame title="Multi-Day History">
                  <div className="space-y-1">
                    {sim.dailyBills.map((d, i) => (
                      <div key={i} className="flex justify-between text-xs border-b border-gray-700 pb-1">
                        <span className="text-accent font-bold">Day {d.day}</span>
                        <span className={d.netCostRs >= 0 ? 'text-red-400' : 'text-emerald-400'}>
                          {d.netCostRs >= 0 ? '+' : ''}₹{d.netCostRs.toFixed(1)}
                        </span>
                        <span className="text-gray-400">SoC: {d.startSoc.toFixed(0)}→{d.endSoc.toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                  <div className="text-xs mt-2 pt-2 border-t border-gray-600 flex justify-between">
                    <span className="text-gray-400">Cumulative:</span>
                    <span className={sim.cumulativeEarnings - sim.cumulativeCost >= 0 ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                      ₹{(sim.cumulativeEarnings - sim.cumulativeCost).toFixed(2)}
                    </span>
                  </div>
                </LabelFrame>
              )}

              {maddpgSchedule && (
                <LabelFrame title="MADDPG Today">
                  <div className="text-xs space-y-1">
                    <div className="flex justify-between"><span className="text-gray-400">Net Estimate:</span><span className={maddpgSchedule.netEstimate >= 0 ? 'text-green-400' : 'text-red-400'}>₹{maddpgSchedule.netEstimate.toFixed(2)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">V2G Sessions:</span><span>{selectedEV.v2gCapable ? maddpgSchedule.v2gSessions : 'N/A (no V2G)'}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Solar Est.:</span><span className="text-yellow-400">{maddpgSchedule.solarEnergyKwh} kWh</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Reward:</span><span className="text-accent">{maddpgSchedule.overallReward.toFixed(1)}</span></div>
                  </div>
                </LabelFrame>
              )}

              <LabelFrame title="EV Trip">
                <TkButton onClick={() => setIsTripModalOpen(true)}>Open My EV Trip</TkButton>
              </LabelFrame>

              <LabelFrame title="Financials">
                <div className="text-center">
                  <div className="text-base font-bold">Today: ₹{(sim.totalEarnings - sim.totalCost).toFixed(2)}</div>
                  <div className="text-xs text-gray-400 mt-0.5">Cost: ₹{sim.totalCost.toFixed(2)} | Earn: ₹{sim.totalEarnings.toFixed(2)}</div>
                  {sim.dayNumber > 1 && (
                    <div className="text-sm font-bold text-accent mt-1">Total: ₹{(sim.cumulativeEarnings - sim.cumulativeCost).toFixed(2)}</div>
                  )}
                </div>
              </LabelFrame>
            </div>

            {/* RIGHT PANEL */}
            <div className="flex-1 flex flex-col md:flex-row gap-2 bg-frame p-2 rounded lg:overflow-hidden min-h-[600px] lg:min-h-0">
              <div className="w-full md:w-[45%] h-[280px] md:h-full relative border-b-2 md:border-b-0 md:border-r-2 border-root pb-2 md:pb-0 md:pr-2 shrink-0">
                <PowerFlowDiagram sim={sim} evModel={selectedEV} />
              </div>
              <div className="w-full md:w-[55%] flex flex-col gap-1.5 md:pl-2 h-[540px] md:h-full">
                <ChartWrapper title="Battery SOC (%)" yLabel="SOC (%)">
                  <LineChart data={sim.history} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="time" type="number" domain={[0,24]} ticks={[0,6,12,18,24]} />
                    <YAxis domain={[0,100]} ticks={[0,25,50,75,100]} />
                    <Tooltip />
                    <Legend verticalAlign="top" height={28} iconType="plainline" wrapperStyle={{fontSize:'10px'}}/>
                    <Line type="stepAfter" dataKey="evSoc" stroke="green" name="EV SOC" dot={false} strokeWidth={1.5} isAnimationActive={false}/>
                    <Line type="stepAfter" dataKey="homeBatterySoc" stroke="blue" strokeDasharray="5 5" name="Home Batt SOC" dot={false} strokeWidth={1.5} isAnimationActive={false}/>
                  </LineChart>
                </ChartWrapper>
                <ChartWrapper title="Home Power Sources (kW)" yLabel="Power (kW)">
                  <LineChart data={sim.history} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="time" type="number" domain={[0,24]} ticks={[0,6,12,18,24]} />
                    <YAxis domain={[0,10]} ticks={[0,2,4,6,8,10]} />
                    <Tooltip />
                    <Legend verticalAlign="top" height={28} iconType="plainline" wrapperStyle={{fontSize:'10px'}}/>
                    <Line type="stepAfter" dataKey="solarToHouse" stroke="orange" name="Solar" dot={false} isAnimationActive={false} strokeWidth={1.5}/>
                    <Line type="stepAfter" dataKey="evToHouse" stroke="green" name="EV V2H" dot={false} isAnimationActive={false} strokeWidth={1.5}/>
                    <Line type="stepAfter" dataKey="gridToHouse" stroke="red" name="Grid" dot={false} isAnimationActive={false} strokeWidth={1.5}/>
                  </LineChart>
                </ChartWrapper>
                <ChartWrapper title="Grid Interaction (kW)" yLabel="kW" xLabel="Time (hour)">
                  <LineChart data={sim.history} margin={{ top: 5, right: 8, left: 0, bottom: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="time" type="number" domain={[0,24]} ticks={[0,6,12,18,24]} />
                    <YAxis domain={[-5,5]} ticks={[-4,-2,0,2,4]} />
                    <Tooltip />
                    <Line type="stepAfter" dataKey="gridNet" stroke="purple" name="Grid Net (kW)" dot={false} strokeWidth={1.5} isAnimationActive={false}/>
                  </LineChart>
                </ChartWrapper>

                {/* Multi-day summary bar chart */}
                {sim.dailyBills.length > 1 && (
                  <div className="h-[140px] w-full bg-white text-black border border-gray-300 flex flex-col shrink-0">
                    <div className="text-center text-[10px] font-bold pt-1">Daily Net Profit (₹) — Multi-Day</div>
                    <div className="flex-1 p-1">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={sim.dailyBills}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                          <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#888' }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: '#888' }} axisLine={false} tickLine={false} />
                          <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: '4px', fontSize: '12px' }} />
                          <Bar dataKey="netCostRs" name="Net ₹" radius={2}>
                            {sim.dailyBills.map((d, i) => (
                              <Cell key={i} fill={d.netCostRs <= 0 ? '#A3BE8C' : '#BF616A'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'Analytics' && (
          <AnalyticsTab
            degradation={degradation}
            habits={habits}
            habitAnalytics={habitAnalytics}
            maddpgSchedule={maddpgSchedule}
            weatherTemp={weatherTemp}
            selectedEV={selectedEV}
            simTotals={{
              totalGridCostRs:  sim.cumulativeCost,
              totalV2GEarnRs:   sim.cumulativeEarnings,
              totalSolarKwh:    maddpgSchedule?.solarEnergyKwh ?? 0,
              totalV2HKwh:      0,
              cumulativeDays:   sim.dayNumber,
            }}
          />
        )}
        {activeTab === 'Daily Planner' && (
          <DailyPlannerTab
            estimation={dailyEstimation}
            isLoading={isPlannerLoading}
            onRefresh={generatePlan}
            dayNumber={sim.dayNumber}
          />
        )}
        {activeTab === 'Outages' && (
          <OutagesTab
            outages={outages}
            onOutagesChange={setOutages}
            maddpgActions={maddpgSchedule?.actions ?? []}
          />
        )}
        {activeTab === 'Digital Twin' && (
          <DigitalTwinTab
            sim={sim}
            weather={weather}
            degradation={degradation}
            maddpgSchedule={maddpgSchedule}
            selectedEV={selectedEV}
          />
        )}
        {activeTab === 'Detailed Bills' && (
          <DailyBillsTab
            bills={sim.dailyBills}
          />
        )}
      </div>

      {isTripModalOpen && <EVTripModal onClose={() => setIsTripModalOpen(false)} evSoc={sim.evSoc} evMaxRange={sim.evMaxRangeKm} />}
      {isForecastModalOpen && weather?.forecast && (
        <ForecastModal onClose={() => setIsForecastModalOpen(false)} forecast={weather.forecast} city={weather.cityName} />
      )}
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function ChartWrapper({ title, yLabel, children, xLabel }: { title: string; yLabel: string; children: React.ReactNode; xLabel?: string }) {
  return (
    <div className="h-1/3 min-h-[150px] md:min-h-0 w-full bg-white text-black relative border border-gray-300 flex flex-col">
      <div className="text-center text-xs font-bold pt-1">{title}</div>
      <div className="absolute left-[-8px] top-1/2 -rotate-90 text-[9px] origin-center -translate-y-1/2 -translate-x-1/2">{yLabel}</div>
      {xLabel && <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] z-10">{xLabel}</div>}
      <div className="flex-1 pb-1 pr-1 pl-3">
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </div>
    </div>
  );
}

function ForecastModal({ onClose, forecast, city }: { onClose: () => void; forecast: any; city: string }) {
  const daily = forecast.list.filter((i: any) => i.dt_txt.includes("12:00:00"));
  const display = daily.length > 0 ? daily : Object.values(
    forecast.list.reduce((acc: any, i: any) => {
      const d = i.dt_txt.split(' ')[0]; if (!acc[d]) acc[d] = i; return acc;
    }, {})
  ).slice(1, 6) as any[];
  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
      <div className="bg-frame w-full max-w-[350px] rounded shadow-lg border border-accent p-4 relative">
        <button className="absolute top-2 right-2 text-white font-bold p-2 leading-none" onClick={onClose}>X</button>
        <h2 className="text-lg font-bold mb-4 text-center">5-Day Forecast ({city})</h2>
        <div className="flex flex-col gap-2">
          {display.map((item: any, i: number) => (
            <div key={i} className="bg-root p-2 rounded border border-gray-600">
              <div className="font-bold text-sm text-accent">{new Date(item.dt_txt).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}</div>
              <div className="text-sm">{item.main.temp.toFixed(1)}°C · <span className="capitalize">{item.weather[0].description}</span></div>
              <div className="text-xs text-gray-400">Clouds: {item.clouds.all}% · Humidity: {item.main.humidity}%</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EVTripModal({ onClose, evSoc, evMaxRange }: { onClose: () => void; evSoc: number; evMaxRange: number }) {
  const [startLoc, setStartLoc] = useState("Lucknow");
  const [endLoc, setEndLoc] = useState("Delhi");
  const [soc, setSoc] = useState(evSoc.toFixed(0));
  const [routeStatus, setRouteStatus] = useState("Enter details and check your route.");
  const [isCheckingRoute, setIsCheckingRoute] = useState(false);
  const [findLoc, setFindLoc] = useState("Lucknow");
  const [findStatus, setFindStatus] = useState("Enter a location to find chargers.");
  const [chargers, setChargers] = useState<any[]>([]);
  const [isFinding, setIsFinding] = useState(false);

  const checkRoute = async () => {
    setIsCheckingRoute(true); setRouteStatus("Checking route...");
    try {
      const data = await fetch('/api/route-adviser', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ startLoc, endLoc }) }).then(r => r.json());
      if (data.error) { setRouteStatus(`Error: ${data.error}`); }
      else {
        const dist = data.distanceKm; const currentRange = (Number(soc)/100)*evMaxRange;
        setRouteStatus(`Distance: ${dist.toFixed(1)} km | Range: ${currentRange.toFixed(1)} km\n\n${dist > currentRange - 50 ? `⚠️ Need to charge. Require ~${(dist+50).toFixed(0)} km range.` : '✅ Enough range!'}`);
      }
    } catch (e: any) { setRouteStatus(`Error: ${e.message}`); }
    setIsCheckingRoute(false);
  };
  const findChargers = async () => {
    setIsFinding(true); setFindStatus(`Finding near ${findLoc}...`);
    try {
      const data = await fetch(`/api/chargers?location=${encodeURIComponent(findLoc)}`).then(r => r.json());
      if (data.error) { setFindStatus(`Error: ${data.error}`); }
      else { setChargers(data.chargers||[]); setFindStatus(data.chargers?.length===0 ? "None found." : `Found ${data.chargers.length} chargers.`); }
    } catch (e: any) { setFindStatus(`Error: ${e.message}`); }
    setIsFinding(false);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
      <div className="bg-frame w-full max-w-[500px] max-h-[90vh] overflow-y-auto rounded shadow-lg border border-accent p-4 relative">
        <button className="absolute top-2 right-2 text-white font-bold p-2 leading-none" onClick={onClose}>X</button>
        <h2 className="text-lg font-bold mb-4">My EV Trip</h2>
        <LabelFrame title="Route Adviser">
          <div className="flex flex-col gap-2 mb-2 text-sm">
            <div className="flex items-center gap-2"><span className="w-28 shrink-0">Start:</span><input className="flex-1 bg-input px-2 py-1 rounded" value={startLoc} onChange={e=>setStartLoc(e.target.value)}/></div>
            <div className="flex items-center gap-2"><span className="w-28 shrink-0">End:</span><input className="flex-1 bg-input px-2 py-1 rounded" value={endLoc} onChange={e=>setEndLoc(e.target.value)}/></div>
            <div className="flex items-center gap-2"><span className="w-28 shrink-0">SOC (%):</span><input className="w-20 bg-input px-2 py-1 rounded" value={soc} onChange={e=>setSoc(e.target.value)}/></div>
          </div>
          <TkButton onClick={checkRoute} disabled={isCheckingRoute}>Check Route</TkButton>
          <div className="text-sm italic mt-2 whitespace-pre-wrap">{routeStatus}</div>
        </LabelFrame>
        <LabelFrame title="Find Nearby Chargers" className="mt-3">
          <div className="flex items-center gap-2 mb-2 text-sm">
            <span className="shrink-0">Location:</span>
            <input className="flex-1 bg-input px-2 py-1 rounded" value={findLoc} onChange={e=>setFindLoc(e.target.value)}/>
          </div>
          <TkButton onClick={findChargers} disabled={isFinding}>Find Chargers</TkButton>
          <div className="text-sm italic mt-2">{findStatus}</div>
          <div className="mt-3 bg-input rounded overflow-hidden text-xs border border-gray-600">
            <div className="flex bg-root font-bold p-2 border-b border-gray-500">
              <div className="w-[130px] shrink-0">Name</div><div className="flex-1 pl-2">Address</div>
            </div>
            <div className="max-h-[140px] overflow-y-auto custom-scrollbar">
              {chargers.map((c,i)=>(
                <div key={i} className="flex p-2 border-b border-gray-600 hover:bg-accent hover:text-root">
                  <div className="w-[130px] shrink-0 font-semibold truncate">{c.title}</div>
                  <div className="flex-1 pl-2 border-l border-gray-600 truncate">{c.address}</div>
                </div>
              ))}
              {chargers.length===0&&<div className="p-3 text-center opacity-60">No chargers to display</div>}
            </div>
          </div>
        </LabelFrame>
      </div>
    </div>
  );
}

function PowerFlowDiagram({ sim, evModel }: { sim: any; evModel: EVModel }) {
  return (
    <div className="w-full h-full">
      <svg viewBox="0 0 1000 500" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
        <circle cx="200" cy="250" r="50" fill={sim.gridIsDown ? "#5e636e" : "#BF616A"} stroke="white" strokeWidth="2"/>
        <text x="200" y="250" textAnchor="middle" dominantBaseline="middle" fill="white" fontWeight="bold" fontSize="16">GRID</text>
        <text x="200" y="320" textAnchor="middle" fill="white" fontSize="12">{Math.abs(sim.powerLabels.grid).toFixed(1)} kW</text>

        <rect x="450" y="20" width="100" height="90" fill="#EBCB8B" stroke="white" strokeWidth="2" rx="8"/>
        <text x="500" y="65" textAnchor="middle" dominantBaseline="middle" fill="#2E3440" fontWeight="bold" fontSize="14">SOLAR</text>
        <text x="500" y="130" textAnchor="middle" fill="white" fontSize="12">{sim.powerLabels.solar.toFixed(1)} kW</text>

        <rect x="750" y="200" width="100" height="90" fill="#88C0D0" stroke="white" strokeWidth="2" rx="8"/>
        <text x="800" y="245" textAnchor="middle" dominantBaseline="middle" fill="#2E3440" fontWeight="bold" fontSize="14">HOUSE</text>
        <text x="800" y="310" textAnchor="middle" fill="white" fontSize="12">{sim.powerLabels.house.toFixed(1)} kW</text>

        {/* EV — shows model brand */}
        <circle cx="500" cy="410" r="50" fill="#A3BE8C"
          stroke={!sim.isEvPluggedIn ? "grey" : Math.abs(sim.powerLabels.ev)>0.1 ? "gold" : "white"}
          strokeWidth={Math.abs(sim.powerLabels.ev)>0.1 ? 4 : 2}/>
        <text x="500" y="403" textAnchor="middle" dominantBaseline="middle" fill="#2E3440" fontWeight="bold" fontSize="11">{evModel.brand}</text>
        <text x="500" y="420" textAnchor="middle" dominantBaseline="middle" fill="#2E3440" fontSize="9">{evModel.batteryKwh}kWh</text>
        <text x="500" y="480" textAnchor="middle" fill="white" fontSize="12">{Math.abs(sim.powerLabels.ev).toFixed(1)} kW</text>
        <text x="500" y="345" textAnchor="middle" fill="white" fontSize="12">SOC: {sim.evSoc.toFixed(1)}%</text>

        <rect x="750" y="360" width="100" height="90" fill="#5E81AC" stroke="white" strokeWidth="2" rx="8"/>
        <text x="800" y="405" textAnchor="middle" dominantBaseline="middle" fill="white" fontWeight="bold" fontSize="12">HOME BATT</text>
        <text x="800" y="470" textAnchor="middle" fill="white" fontSize="12">{Math.abs(sim.powerLabels.battery).toFixed(1)} kW</text>
        <text x="800" y="345" textAnchor="middle" fill="white" fontSize="12">SOC: {sim.homeBatterySoc.toFixed(1)}%</text>

        <FlowLine start={[250,250]} end={[750,245]} active={sim.flows.grid_house>0} color="#e60000"/>
        <FlowLine start={[240,275]} end={[460,385]} active={sim.flows.grid_ev>0} color="#e60000"/>
        <FlowLine start={[460,385]} end={[240,275]} active={sim.flows.ev_grid>0} color="lightgreen"/>
        <FlowLine start={[550,65]} end={[750,215]} active={sim.flows.solar_house>0} color="gold"/>
        <FlowLine start={[500,110]} end={[500,360]} active={sim.flows.solar_ev>0} color="gold"/>
        <FlowLine start={[530,110]} end={[750,375]} active={sim.flows.solar_battery>0} color="gold"/>
        <FlowLine start={[550,410]} end={[750,265]} active={sim.flows.ev_house>0} color="lightblue"/>
        <FlowLine start={[800,360]} end={[800,290]} active={sim.flows.battery_house>0} color="cyan"/>
      </svg>
    </div>
  );
}

function FlowLine({ start, end, active, color }: { start:[number,number]; end:[number,number]; active:boolean; color:string }) {
  if (!active) return null;
  return <line x1={start[0]} y1={start[1]} x2={end[0]} y2={end[1]} stroke={color} strokeWidth="4" strokeDasharray="8 8" className="animate-flow"/>;
}
