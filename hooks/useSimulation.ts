import { useState, useEffect, useRef, useCallback } from 'react';
import { WeatherConditionId, WeatherPreset, getWeatherForDay } from '../lib/weatherModel';

// Profile generation
const generateSmoothProfiles = () => {
  const homeLoadHourly = [0.8,0.6,0.5,0.5,0.6,0.8,1.2,1.5,1.8,2.0,2.5,3.0,3.5,3.2,3.0,2.8,2.5,2.8,3.5,3.0,2.5,2.0,1.5,1.0, 0.8];
  // 5 kWp rooftop PV — clear-sky kW output per hour. Peak ≈ 5.00 kW at solar noon.
  // Values from IEC 61724 irradiance model, 18% panel efficiency, 0.75 performance ratio.
  const solarHourly    = [0,0,0,0,0,0.05,0.40,1.20,2.80,4.00,4.80,5.00,4.80,3.80,2.60,1.40,0.50,0.10,0,0,0,0,0,0, 0];

  const homeLoadProfile = new Float32Array(1440);
  const solarProfile    = new Float32Array(1440);

  for (let i = 0; i < 1440; i++) {
    const hour = i / 60;
    const lower = Math.floor(hour);
    const upper = Math.min(Math.ceil(hour), 24);
    const fraction = hour - lower;
    if (lower === upper) {
      homeLoadProfile[i] = homeLoadHourly[lower];
      solarProfile[i]    = solarHourly[lower];
    } else {
      homeLoadProfile[i] = homeLoadHourly[lower] * (1 - fraction) + homeLoadHourly[upper] * fraction;
      solarProfile[i]    = solarHourly[lower]    * (1 - fraction) + solarHourly[upper]    * fraction;
    }
  }
  return { homeLoadProfile, solarProfile };
};

const { homeLoadProfile, solarProfile } = generateSmoothProfiles();

export interface SimParams {
  evCapacityKwh: number;
  evMaxRangeKm:  number;
  chargeRateKw:  number;
  v2gRateKw:     number;
  v2gCapable:    boolean;
  consumptionWhPerKm: number;
  /** User-controlled per-day weather overrides. Keys are 1-based day numbers. */
  weatherOverrides: Partial<Record<number, WeatherConditionId>>;
  outages?: { startHour: number; endHour: number; city: string }[];
}

const DEFAULT_PARAMS: SimParams = {
  evCapacityKwh: 62.0,
  evMaxRangeKm:  385.0,
  chargeRateKw:  6.6,
  v2gRateKw:     6.0,
  v2gCapable:    true,
  consumptionWhPerKm: 161,
  weatherOverrides: {},
};

export interface HourlyLog {
  hour: number;           // 0–23
  // Energy flows (kWh for the hour)
  homeLoadKwh: number;
  solarKwh: number;
  gridImportKwh: number;
  gridExportKwh: number;
  evChargeKwh: number;
  evDischargeKwh: number; // V2G+V2H combined
  battChargeKwh: number;
  battDischargeKwh: number;
  // Financials
  gridCostRs: number;
  gridEarnRs: number;
  solarSavedRs: number;
  // State at end of hour
  evSocEnd: number;
  homeBattSocEnd: number;
  // Metadata
  mode: string;
  isOutage: boolean;
  weatherLabel: string;
  weatherEmoji: string;
  kmDriven: number;
  // TOU rate
  buyRateRs: number;
  sellRateRs: number;
}

export interface DailyBill {
  day: number;
  weatherCondition: string;  // e.g. "☀️ Sunny"
  weatherEmoji: string;
  totalGridKwh: number;
  totalGridCostRs: number;
  evChargingCostRs: number;
  solarGeneratedKwh: number;
  solarSavedCostRs: number;
  v2gExportKwh: number;
  v2gEarningsRs: number;
  v2hUsedKwh: number;
  v2hSavedCostRs: number;
  totalKmDriven: number;
  totalConsumptionKwh: number;
  outageOccurred: boolean;
  netCostRs: number;
  startSoc: number;
  endSoc: number;
  hourlyLog: HourlyLog[];
}

export function useSimulation(params: SimParams = DEFAULT_PARAMS) {
  const [isRunning, setIsRunning] = useState(false);
  const [timeStep,  setTimeStep]  = useState(0);
  const [dayNumber, setDayNumber] = useState(1);
  const [gridIsDown, setGridIsDown] = useState(false);
  const [isManualV2H, setIsManualV2H] = useState(false);
  const [isEvPluggedIn, setIsEvPluggedIn] = useState(true);

  const [evSoc,         setEvSoc]         = useState(80.0);
  const [homeBatterySoc, setHomeBatterySoc] = useState(50.0);
  const [totalCost,     setTotalCost]     = useState(0.0);
  const [totalEarnings, setTotalEarnings] = useState(0.0);
  const [cumulativeCost,     setCumulativeCost]     = useState(0.0);
  const [cumulativeEarnings, setCumulativeEarnings] = useState(0.0);
  const [mode, setMode] = useState('Ready');

  const [minRangeKm, setMinRangeKm] = useState(80);

  const { evCapacityKwh, evMaxRangeKm, chargeRateKw, v2gRateKw, v2gCapable, consumptionWhPerKm, weatherOverrides, outages = [] } = params;
  const fixedBufferKm  = 50.0;
  const homeBatteryCapacityKwh = 10.0;

  // Current day's resolved weather preset (ref so tick loop can read without stale closure)
  const currentWeatherRef = useRef<WeatherPreset>(getWeatherForDay(1, weatherOverrides ?? {}));

  // Real-time TOU rates
  const getRate = (h: number) => {
    if (h >= 18 && h <= 22) return { buy: 12.0, sell: 10.0 }; // Peak
    if (h >= 10 && h <= 15) return { buy:  5.0, sell:  4.0 }; // Solar surplus hours
    return { buy: 7.5, sell: 6.0 };                           // Off-peak
  };

  // Daily variation factors — driven by weather preset + small behavioural noise
  const dailyFactors = useRef({
    solar: 1.0, load: 1.0, commute: 1.0, evEfficiency: 1.0,
    isWeekend: false, errandHour: 10, errandDuration: 60
  });

  useEffect(() => {
    const preset = getWeatherForDay(dayNumber, weatherOverrides ?? {});
    currentWeatherRef.current = preset;
    const isWeekend = (dayNumber % 7 === 6) || (dayNumber % 7 === 0);
    // Weather preset defines the dominant multipliers.
    // A small ±5% behavioural noise is added on top (different people run different appliances).
    const behaviourNoise = 0.95 + Math.random() * 0.10;
    dailyFactors.current = {
      solar:       preset.solarMultiplier,               // fully weather-driven
      load:        preset.loadMultiplier * behaviourNoise,
      evEfficiency: preset.evEfficiencyMultiplier,
      commute:     isWeekend ? 0 : 0.85 + Math.random() * 0.30,
      isWeekend,
      errandHour:  10 + Math.floor(Math.random() * 5),
      errandDuration: 30 + Math.floor(Math.random() * 90),
    };
  }, [dayNumber, JSON.stringify(weatherOverrides)]);

    const [flows,       setFlows]       = useState<Record<string, number>>({});
    const [powerLabels, setPowerLabels] = useState({ grid: 0, solar: 0, house: 0, ev: 0, battery: 0 });

    const [history, setHistory] = useState<{
      time: number; evSoc: number; homeBatterySoc: number; gridNet: number;
      solarToHouse: number; evToHouse: number; gridToHouse: number; day: number;
    }[]>([]);

    const [dailyBills, setDailyBills] = useState<DailyBill[]>([]);

    const intraDayStats = useRef({
      totalGridKwh: 0, totalGridCostRs: 0, evChargingCostRs: 0,
      solarGeneratedKwh: 0, solarSavedCostRs: 0,
      v2gExportKwh: 0, v2gEarningsRs: 0,
      v2hUsedKwh: 0, v2hSavedCostRs: 0,
      totalKmDriven: 0, totalConsumptionKwh: 0,
      outageOccurred: false
    });

    const makeEmptyHourAccum = () => ({
      homeLoadKwh: 0, solarKwh: 0, gridImportKwh: 0, gridExportKwh: 0,
      evChargeKwh: 0, evDischargeKwh: 0, battChargeKwh: 0, battDischargeKwh: 0,
      gridCostRs: 0, gridEarnRs: 0, solarSavedRs: 0,
      evSocEnd: 0, homeBattSocEnd: 0,
      mode: 'Idle', isOutage: false, weatherLabel: '', weatherEmoji: '', kmDriven: 0,
      buyRateRs: 0, sellRateRs: 0, minuteCount: 0,
    });
    const hourlyAccum = useRef<(ReturnType<typeof makeEmptyHourAccum> & { hour?: number })[]>(
      Array.from({ length: 24 }, (_, h) => ({ ...makeEmptyHourAccum(), hour: h }))
    );
    const hourlyLog = useRef<HourlyLog[]>([]);

    const dayStartSocRef = useRef(80.0);

    const resetDay = useCallback(() => {
      setIsRunning(false);
      setTimeStep(0);
      setGridIsDown(false);
      setIsEvPluggedIn(true);
      setTotalCost(0.0);
      setTotalEarnings(0.0);
      setMode('Ready');
      setHistory([]);
      setFlows({});
      setPowerLabels({ grid: 0, solar: 0, house: 0, ev: 0, battery: 0 });
      intraDayStats.current = {
        totalGridKwh: 0, totalGridCostRs: 0, evChargingCostRs: 0,
        solarGeneratedKwh: 0, solarSavedCostRs: 0,
        v2gExportKwh: 0, v2gEarningsRs: 0,
        v2hUsedKwh: 0, v2hSavedCostRs: 0,
        totalKmDriven: 0, totalConsumptionKwh: 0,
        outageOccurred: false
      };
      hourlyAccum.current = Array.from({ length: 24 }, (_, h) => ({ ...makeEmptyHourAccum(), hour: h }));
      hourlyLog.current = [];
    }, []);

    const resetAll = useCallback(() => {
      resetDay();
      setDayNumber(1);
      setEvSoc(80.0);
      setHomeBatterySoc(50.0);
      setCumulativeCost(0.0);
      setCumulativeEarnings(0.0);
      setDailyBills([]);
      dayStartSocRef.current = 80.0;
    }, [resetDay]);

    const startSim = useCallback(() => {
      if (timeStep === 0) dayStartSocRef.current = evSoc;
      setIsRunning(true);
    }, [timeStep, evSoc]);

    const pauseSim = useCallback(() => setIsRunning(false), []);

    useEffect(() => {
      if (!isRunning) return;
      const interval = setInterval(() => {
        setTimeStep(prev => {
          if (prev >= 1439) {
            setIsRunning(false);
            return 1440;
          }
          return prev + 1;
        });
      }, 111);
      return () => clearInterval(interval);
    }, [isRunning]);

    useEffect(() => {
      if (timeStep !== 1440) return;
      
      const stats = intraDayStats.current;
      const w = currentWeatherRef.current;
      const bill: DailyBill = {
        day: dayNumber,
        weatherCondition: `${w.emoji} ${w.label}`,
        weatherEmoji: w.emoji,
        totalGridKwh: parseFloat(stats.totalGridKwh.toFixed(2)),
        totalGridCostRs: parseFloat(stats.totalGridCostRs.toFixed(2)),
        evChargingCostRs: parseFloat(stats.evChargingCostRs.toFixed(2)),
        solarGeneratedKwh: parseFloat(stats.solarGeneratedKwh.toFixed(2)),
        solarSavedCostRs: parseFloat(stats.solarSavedCostRs.toFixed(2)),
        v2gExportKwh: parseFloat(stats.v2gExportKwh.toFixed(2)),
        v2gEarningsRs: parseFloat(stats.v2gEarningsRs.toFixed(2)),
        v2hUsedKwh: parseFloat(stats.v2hUsedKwh.toFixed(2)),
        v2hSavedCostRs: parseFloat(stats.v2hSavedCostRs.toFixed(2)),
        totalKmDriven: parseFloat(stats.totalKmDriven.toFixed(1)),
        totalConsumptionKwh: parseFloat(stats.totalConsumptionKwh.toFixed(2)),
        outageOccurred: stats.outageOccurred,
        netCostRs: parseFloat((stats.totalGridCostRs - stats.v2gEarningsRs).toFixed(2)),
        startSoc: dayStartSocRef.current,
        endSoc: evSoc,
        hourlyLog: [...hourlyLog.current],
      };

      setDailyBills(prev => [...prev, bill]);
      setCumulativeCost(prev  => prev + totalCost);
      setCumulativeEarnings(prev => prev + totalEarnings);

      const t = setTimeout(() => {
        setDayNumber(d => d + 1);
        dayStartSocRef.current = evSoc;
        setTimeStep(0);
        setTotalCost(0.0);
        setTotalEarnings(0.0);
        setHistory([]);
        setFlows({});
        setMode('Ready');
        intraDayStats.current = {
          totalGridKwh: 0, totalGridCostRs: 0, evChargingCostRs: 0,
          solarGeneratedKwh: 0, solarSavedCostRs: 0,
          v2gExportKwh: 0, v2gEarningsRs: 0,
          v2hUsedKwh: 0, v2hSavedCostRs: 0,
          totalKmDriven: 0, totalConsumptionKwh: 0,
          outageOccurred: false
        };
        hourlyAccum.current = Array.from({ length: 24 }, (_, h) => ({ ...makeEmptyHourAccum(), hour: h }));
        hourlyLog.current = [];
        setIsRunning(true);
      }, 1500);
      return () => clearTimeout(t);
    }, [timeStep]);

    useEffect(() => {
      if (timeStep === 0 || timeStep > 1440) return;
      if (!isRunning) return;

      const minuteOfDay = timeStep;
      const hour        = Math.floor(minuteOfDay / 60);
      const interval_h  = 1 / 60.0;
      const { buy: buyRate, sell: sellRate } = getRate(hour);
      const f = dailyFactors.current;
      const w = currentWeatherRef.current;

      // Realistic pseudo-random high-frequency noise (mimics cloud scattering & appliance cycling)
      const minuteNoise = (Math.sin(minuteOfDay / 5) * 0.05) + (Math.sin(minuteOfDay / 13) * 0.03);

      // Solar: weather preset drives the base yield; noise adds sub-minute cloud flickers
      const baseSolar = solarProfile[minuteOfDay] || 0;
      let solarPower = baseSolar > 0 ? Math.max(0, baseSolar * f.solar + minuteNoise * 0.4) : 0;
      if (solarPower < 0.1) solarPower = 0; // Inverter startup threshold

      // Home load: weather preset drives heating/cooling demand; noise adds appliance cycling
      let homeLoad = Math.max(0.15, (homeLoadProfile[minuteOfDay] || 0) * f.load + minuteNoise * 0.08);

      // Weather-driven random grid outage (check every 120 minutes of simulation time)
      if (w.outageChancePer120Min > 0 && !gridIsDown && minuteOfDay % 120 === 60) {
        if (Math.random() < w.outageChancePer120Min) {
          setGridIsDown(true);
          // Auto-restore after 20–40 simulated minutes
          const restoreAfter = (20 + Math.floor(Math.random() * 20)) * 111; // ms
          setTimeout(() => setGridIsDown(false), restoreAfter);
        }
      }

      const isScheduledOutage = outages.some(o => hour >= o.startHour && hour < o.endHour);
      const currentGridIsDown = gridIsDown || isScheduledOutage;

      intraDayStats.current.solarGeneratedKwh += solarPower * interval_h;
      intraDayStats.current.totalConsumptionKwh += homeLoad * interval_h;
      if (currentGridIsDown) intraDayStats.current.outageOccurred = true;

    let chargerMode = 'Idle';
    let netEvPower  = 0;
    let netHomeBatteryPower = 0;
    let gridPower   = 0;
    const currentFlows: Record<string, number> = {
      solar_house: 0, solar_ev: 0, solar_battery: 0,
      grid_house: 0,  grid_ev: 0,  ev_house: 0,   ev_grid: 0, battery_house: 0
    };

    let houseLoadRemaining = homeLoad;
    let solarRemaining = solarPower;
    
    // --- 1. SOLAR TO HOUSE ---
    const solarToHouse = Math.min(houseLoadRemaining, solarRemaining);
    currentFlows.solar_house = solarToHouse;
    houseLoadRemaining -= solarToHouse;
    solarRemaining -= solarToHouse;
    intraDayStats.current.solarSavedCostRs += (solarToHouse * interval_h) * buyRate;

    // --- 2. HOME BATTERY TO HOUSE ---
    const currentHomeBattSoc = homeBatterySoc;
    if (houseLoadRemaining > 0 && currentHomeBattSoc > 1) {
      const battAvailableEnergy = (currentHomeBattSoc / 100) * homeBatteryCapacityKwh;
      const battAvailableKw = battAvailableEnergy / interval_h;
      const maxDischargeRate = homeBatteryCapacityKwh * 0.5; // e.g. 5kW discharge limit
      const battToHouse = Math.min(houseLoadRemaining, battAvailableKw, maxDischargeRate);
      currentFlows.battery_house = battToHouse;
      houseLoadRemaining -= battToHouse;
      netHomeBatteryPower -= battToHouse;
    }

    // --- 3. EV LOCATION & MOVEMENT ---
    const requiredRangeKm = minRangeKm + fixedBufferKm;
    const requiredSoc     = (requiredRangeKm / evMaxRangeKm) * 100;
    const currentEvSoc    = evSoc;

    let isAtHome = true;
    let isCommuting = false;
    let currentCommuteKmPerHour = 0;
    
    if (!f.isWeekend) {
      if (hour >= 8 && hour < 9) { isCommuting = true; isAtHome = false; currentCommuteKmPerHour = 15 * f.commute; }
      else if (hour >= 17 && hour < 18) { isCommuting = true; isAtHome = false; currentCommuteKmPerHour = 15 * f.commute; }
      else if (hour >= 9 && hour < 17) { isAtHome = false; }
    } else {
      if (hour >= f.errandHour && minuteOfDay < (f.errandHour * 60 + f.errandDuration)) {
        isCommuting = true; isAtHome = false;
        currentCommuteKmPerHour = 20 / (f.errandDuration / 60);
      }
    }

    // --- 4. EV POWER LOGIC ---
    if (isCommuting) {
      chargerMode = f.isWeekend ? 'Weekend Errand' : 'Driving (Commute)';
      // evEfficiency < 1 in cold/hot/rainy weather → more Wh consumed per km
      const effectiveWhPerKm = consumptionWhPerKm / f.evEfficiency;
      netEvPower = -(currentCommuteKmPerHour * effectiveWhPerKm / 1000);
      intraDayStats.current.totalKmDriven += currentCommuteKmPerHour * interval_h;
      setIsEvPluggedIn(false);
    } 
    else if (!isAtHome) {
      setIsEvPluggedIn(false); // At Office
      if (!currentGridIsDown && v2gCapable && !isManualV2H && currentEvSoc > requiredSoc + 1) {
        chargerMode = 'V2G Export (Office)';
        const surplusSoc = currentEvSoc - requiredSoc;
        const surplusKw = (surplusSoc / 100) * evCapacityKwh / interval_h;
        const discharge = Math.min(v2gRateKw, surplusKw);
        netEvPower = -discharge;
        currentFlows.ev_grid = discharge;
        gridPower -= discharge;
        intraDayStats.current.v2gExportKwh += discharge * interval_h;
        intraDayStats.current.v2gEarningsRs += (discharge * interval_h) * sellRate;
      } else {
        chargerMode = 'Parked (Office)';
      }
    }
    else {
      setIsEvPluggedIn(true); // At Home
      chargerMode = 'Plugged In (Idle)';
      
      // V2H Check
      const wantsV2H = isManualV2H || currentGridIsDown;
      if (wantsV2H && v2gCapable && currentEvSoc > requiredSoc + 1 && houseLoadRemaining > 0) {
        chargerMode = currentGridIsDown ? 'EMERGENCY V2H' : 'Manual V2H Active';
        const surplusSoc = currentEvSoc - requiredSoc;
        const surplusKw = (surplusSoc / 100) * evCapacityKwh / interval_h;
        const evToHouse = Math.min(houseLoadRemaining, v2gRateKw, surplusKw);
        netEvPower = -evToHouse;
        currentFlows.ev_house = evToHouse;
        houseLoadRemaining -= evToHouse;
        
        intraDayStats.current.v2hUsedKwh += evToHouse * interval_h;
        intraDayStats.current.v2hSavedCostRs += (evToHouse * interval_h) * buyRate;
      }
      
      // Night Charging (if not V2H, Grid is UP)
      if (!currentGridIsDown && !isManualV2H && (hour >= 22 || hour < 5) && currentEvSoc < 100 && netEvPower === 0) {
        const missingSoc = 100 - currentEvSoc;
        const missingKw = (missingSoc / 100) * evCapacityKwh / interval_h;
        const chargeKw = Math.min(chargeRateKw, missingKw);
        netEvPower = chargeKw;
        currentFlows.grid_ev = chargeKw;
        gridPower += chargeKw;
        chargerMode = 'Night Charging';
        
        intraDayStats.current.totalGridKwh += chargeKw * interval_h;
        intraDayStats.current.totalGridCostRs += (chargeKw * interval_h) * buyRate;
        intraDayStats.current.evChargingCostRs += (chargeKw * interval_h) * buyRate;
      }
    }

    // --- 5. GRID COVERS REMAINING HOUSE LOAD ---
    if (houseLoadRemaining > 0) {
      if (!currentGridIsDown) {
        currentFlows.grid_house = houseLoadRemaining;
        gridPower += houseLoadRemaining;
        intraDayStats.current.totalGridKwh += houseLoadRemaining * interval_h;
        intraDayStats.current.totalGridCostRs += (houseLoadRemaining * interval_h) * buyRate;
        houseLoadRemaining = 0;
      } else {
        if (chargerMode !== 'EMERGENCY V2H') chargerMode = 'BLACKOUT';
      }
    }

    // --- 6. EXCESS SOLAR ALLOCATION ---
    if (solarRemaining > 0) {
      // a) Home Battery
      if (currentHomeBattSoc < 100) {
        const spaceEnergy = (1 - currentHomeBattSoc / 100) * homeBatteryCapacityKwh;
        const spaceKw = spaceEnergy / interval_h;
        const maxChargeKw = homeBatteryCapacityKwh * 0.5;
        const toBatt = Math.min(solarRemaining, spaceKw, maxChargeKw);
        netHomeBatteryPower += toBatt;
        currentFlows.solar_battery = toBatt;
        solarRemaining -= toBatt;
      }
      // b) EV Charging
      if (solarRemaining > 0 && isAtHome && currentEvSoc < 100 && netEvPower <= 0) {
        const missingSoc = 100 - currentEvSoc;
        const missingKw = (missingSoc / 100) * evCapacityKwh / interval_h;
        const evSpaceKw = Math.max(0, chargeRateKw - netEvPower);
        const toEv = Math.min(solarRemaining, missingKw, evSpaceKw);
        netEvPower += toEv;
        currentFlows.solar_ev = toEv;
        solarRemaining -= toEv;
        chargerMode = 'Solar Charging';
      }
      // c) Grid Export
      if (solarRemaining > 0 && !currentGridIsDown) {
        gridPower -= solarRemaining;
        intraDayStats.current.v2gEarningsRs += (solarRemaining * interval_h) * sellRate;
      }
    }

    const nextEvSoc        = Math.min(100, Math.max(0, currentEvSoc       + (netEvPower           * interval_h / evCapacityKwh)        * 100));
    const nextHomeBattSoc  = Math.min(100, Math.max(0, currentHomeBattSoc + (netHomeBatteryPower   * interval_h / homeBatteryCapacityKwh) * 100));

    let costDelta = 0, earnDelta = 0;
    if (gridPower > 0)      costDelta = gridPower * interval_h * buyRate;
    else if (gridPower < 0) earnDelta = Math.abs(gridPower) * interval_h * sellRate;

    setEvSoc(nextEvSoc);
    setHomeBatterySoc(nextHomeBattSoc);
    if (costDelta > 0) setTotalCost(prev => prev + costDelta);
    if (earnDelta > 0) setTotalEarnings(prev => prev + earnDelta);
    setMode(chargerMode);
    setFlows(currentFlows);
    setPowerLabels({ grid: gridPower, solar: solarPower, house: homeLoad, ev: netEvPower, battery: netHomeBatteryPower });

    setHistory(prev => [...prev, {
      time: hour + (minuteOfDay % 60) / 60,
      evSoc: nextEvSoc,
      homeBatterySoc: nextHomeBattSoc,
      gridNet: gridPower,
      solarToHouse: currentFlows.solar_house,
      evToHouse:    currentFlows.ev_house  || 0,
      gridToHouse:  currentFlows.grid_house || 0,
      day: dayNumber,
    }]);

    // ── Per-minute accumulation into hourlyAccum ─────────────────────────────
    const acc = hourlyAccum.current[hour];
    if (acc) {
      acc.homeLoadKwh    += homeLoad * interval_h;
      acc.solarKwh       += solarPower * interval_h;
      acc.gridImportKwh  += gridPower > 0 ? gridPower * interval_h : 0;
      acc.gridExportKwh  += gridPower < 0 ? Math.abs(gridPower) * interval_h : 0;
      acc.evChargeKwh    += netEvPower > 0 ? netEvPower * interval_h : 0;
      acc.evDischargeKwh += netEvPower < 0 ? Math.abs(netEvPower) * interval_h : 0;
      acc.battChargeKwh  += netHomeBatteryPower > 0 ? netHomeBatteryPower * interval_h : 0;
      acc.battDischargeKwh += netHomeBatteryPower < 0 ? Math.abs(netHomeBatteryPower) * interval_h : 0;
      acc.gridCostRs     += costDelta;
      acc.gridEarnRs     += earnDelta;
      acc.solarSavedRs   += (currentFlows.solar_house * interval_h) * buyRate;
      acc.kmDriven       += isCommuting ? currentCommuteKmPerHour * interval_h : 0;
      acc.evSocEnd        = nextEvSoc;
      acc.homeBattSocEnd  = nextHomeBattSoc;
      acc.mode            = chargerMode;
      acc.isOutage        = acc.isOutage || currentGridIsDown;
      acc.weatherLabel    = currentWeatherRef.current.label;
      acc.weatherEmoji    = currentWeatherRef.current.emoji;
      acc.buyRateRs       = buyRate;
      acc.sellRateRs      = sellRate;
      acc.minuteCount     = (acc.minuteCount || 0) + 1;
    }

    // At the last minute of each hour, flush completed hourly snapshot
    const minuteInHour = minuteOfDay % 60;
    if (minuteInHour === 59) {
      const a = hourlyAccum.current[hour];
      if (a) {
        hourlyLog.current = [...hourlyLog.current, {
          hour,
          homeLoadKwh:     parseFloat(a.homeLoadKwh.toFixed(3)),
          solarKwh:        parseFloat(a.solarKwh.toFixed(3)),
          gridImportKwh:   parseFloat(a.gridImportKwh.toFixed(3)),
          gridExportKwh:   parseFloat(a.gridExportKwh.toFixed(3)),
          evChargeKwh:     parseFloat(a.evChargeKwh.toFixed(3)),
          evDischargeKwh:  parseFloat(a.evDischargeKwh.toFixed(3)),
          battChargeKwh:   parseFloat(a.battChargeKwh.toFixed(3)),
          battDischargeKwh: parseFloat(a.battDischargeKwh.toFixed(3)),
          gridCostRs:      parseFloat(a.gridCostRs.toFixed(3)),
          gridEarnRs:      parseFloat(a.gridEarnRs.toFixed(3)),
          solarSavedRs:    parseFloat(a.solarSavedRs.toFixed(3)),
          evSocEnd:        parseFloat(a.evSocEnd.toFixed(1)),
          homeBattSocEnd:  parseFloat(a.homeBattSocEnd.toFixed(1)),
          mode:            a.mode,
          isOutage:        a.isOutage,
          weatherLabel:    a.weatherLabel,
          weatherEmoji:    a.weatherEmoji,
          kmDriven:        parseFloat(a.kmDriven.toFixed(1)),
          buyRateRs:       a.buyRateRs,
          sellRateRs:      a.sellRateRs,
        }];
      }
    }
  }, [timeStep, isRunning]);

  const currentHour = Math.floor(timeStep / 60);
  const isScheduledOutage = (outages || []).some(o => currentHour >= o.startHour && currentHour < o.endHour);
  const effectiveGridIsDown = gridIsDown || isScheduledOutage;

  return {
    isRunning, timeStep, dayNumber,
    gridIsDown: effectiveGridIsDown, isManualV2H, isEvPluggedIn, evSoc, homeBatterySoc,
    totalCost, totalEarnings, cumulativeCost, cumulativeEarnings,
    mode, minRangeKm, flows, history, powerLabels,
    evMaxRangeKm, evCapacityKwh,
    dailyBills,
    currentWeather: currentWeatherRef.current,
    setMinRangeKm, setGridIsDown, setIsManualV2H, setIsEvPluggedIn,
    startSim, pauseSim, resetDay, resetAll,
  };
}
