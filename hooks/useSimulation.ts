import { useState, useEffect, useRef, useCallback } from 'react';

// Profile generation
const generateSmoothProfiles = () => {
  const homeLoadHourly = [0.8,0.6,0.5,0.5,0.6,0.8,1.2,1.5,1.8,2.0,2.5,3.0,3.5,3.2,3.0,2.8,2.5,2.8,3.5,3.0,2.5,2.0,1.5,1.0, 0.8];
  // 5 kWp rooftop PV — clear-sky kW output per hour. Peak ≈ 5.00 kW at solar noon.
  // Values from IEC 61724 irradiance model, 18% panel efficiency, 0.75 performance ratio.
  // DO NOT multiply by 5 — values are already in kW, not per-unit.
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
}

const DEFAULT_PARAMS: SimParams = {
  evCapacityKwh: 62.0,
  evMaxRangeKm:  385.0,
  chargeRateKw:  6.6,
  v2gRateKw:     6.0,
  v2gCapable:    true,
  consumptionWhPerKm: 161,
};

export interface DailyBill {
  day: number;
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

  const { evCapacityKwh, evMaxRangeKm, chargeRateKw, v2gRateKw, v2gCapable, consumptionWhPerKm } = params;
  const fixedBufferKm  = 50.0;
  const homeBatteryCapacityKwh = 10.0;
  
  // Real-time TOU rates
  const getRate = (h: number) => {
    if (h >= 18 && h <= 22) return { buy: 12.0, sell: 10.0 }; // Peak
    if (h >= 10 && h <= 15) return { buy:  5.0, sell:  4.0 }; // Solar surplus hours
    return { buy: 7.5, sell: 6.0 };                           // Off-peak
  };

  const [flows,       setFlows]       = useState<Record<string, number>>({});
  const [powerLabels, setPowerLabels] = useState({ grid: 0, solar: 0, house: 0, ev: 0, battery: 0 });

  const [history, setHistory] = useState<{
    time: number; evSoc: number; homeBatterySoc: number; gridNet: number;
    solarToHouse: number; evToHouse: number; gridToHouse: number; day: number;
  }[]>([]);

  const [dailyBills, setDailyBills] = useState<DailyBill[]>([]);

  // Ref to accumulate intra-day stats precisely
  const intraDayStats = useRef({
    totalGridKwh: 0, totalGridCostRs: 0, evChargingCostRs: 0,
    solarGeneratedKwh: 0, solarSavedCostRs: 0,
    v2gExportKwh: 0, v2gEarningsRs: 0,
    v2hUsedKwh: 0, v2hSavedCostRs: 0,
    totalKmDriven: 0, totalConsumptionKwh: 0,
    outageOccurred: false
  });

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
    // Reset intra-day
    intraDayStats.current = {
      totalGridKwh: 0, totalGridCostRs: 0, evChargingCostRs: 0,
      solarGeneratedKwh: 0, solarSavedCostRs: 0,
      v2gExportKwh: 0, v2gEarningsRs: 0,
      v2hUsedKwh: 0, v2hSavedCostRs: 0,
      totalKmDriven: 0, totalConsumptionKwh: 0,
      outageOccurred: false
    };
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
    
    // Finalize Daily Bill
    const stats = intraDayStats.current;
    const bill: DailyBill = {
      day: dayNumber,
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
    };

    setDailyBills(prev => [...prev, bill]);
    setCumulativeCost(prev  => prev + totalCost);
    setCumulativeEarnings(prev => prev + totalEarnings);

    // Auto-advance
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

    const solarPower = solarProfile[minuteOfDay] || 0;
    const homeLoad   = homeLoadProfile[minuteOfDay] || 0;
    intraDayStats.current.solarGeneratedKwh += solarPower * interval_h;
    intraDayStats.current.totalConsumptionKwh += homeLoad * interval_h;
    if (gridIsDown) intraDayStats.current.outageOccurred = true;

    let chargerMode = 'Idle';
    let netEvPower  = 0;
    let netHomeBatteryPower = 0;
    let gridPower   = 0;
    const currentFlows: Record<string, number> = {
      solar_house: 0, solar_ev: 0, solar_battery: 0,
      grid_house: 0,  grid_ev: 0,  ev_house: 0,   ev_grid: 0, battery_house: 0
    };

    let powerNeededByHouse = homeLoad;
    
    // 1. Solar powers house first
    const fromSolar = Math.min(powerNeededByHouse, solarPower);
    currentFlows.solar_house = fromSolar;
    powerNeededByHouse -= fromSolar;
    intraDayStats.current.solarSavedCostRs += (fromSolar * interval_h) * buyRate;

    let currentHomeBattSoc = homeBatterySoc;
    let currentEvSoc       = evSoc;

    // 2. Home battery powers house if needed
    if (powerNeededByHouse > 0 && currentHomeBattSoc > 1) {
      const fromBatt = Math.min(powerNeededByHouse, homeBatteryCapacityKwh * 0.5);
      netHomeBatteryPower = -fromBatt;
      currentFlows.battery_house = fromBatt;
      powerNeededByHouse -= fromBatt;
    }

    const requiredRangeKm = minRangeKm + fixedBufferKm;
    const requiredSoc     = (requiredRangeKm / evMaxRangeKm) * 100;
    const commuteKm = 30; // 15km each way
    const commuteKwhPerHour = (commuteKm * consumptionWhPerKm / 1000);

    let pluggedIn = isEvPluggedIn;

    // 3. EV Commute logic
    if (hour >= 8 && hour < 9) {
      netEvPower = -commuteKwhPerHour;
      chargerMode = 'Driving (Commute)';
      pluggedIn = false;
      intraDayStats.current.totalKmDriven += commuteKm * interval_h;
    } else if (hour >= 17 && hour < 18) {
      netEvPower = -commuteKwhPerHour;
      chargerMode = 'Driving (Home)';
      pluggedIn = false;
      intraDayStats.current.totalKmDriven += commuteKm * interval_h;
    } else if (hour === 18 && minuteOfDay === 18 * 60) {
      pluggedIn = true;
      chargerMode = 'Plugged In (Idle)';
    } else if (hour >= 11 && hour < 17 && !gridIsDown && v2gCapable && !isManualV2H) {
      // Automatic V2G at office if surplus SOC
      pluggedIn = false; // "At office" logically means plugged into office grid, but we treat it as exporting from remote for demo
      if (currentEvSoc > requiredSoc + 1) {
        chargerMode = 'V2G Export';
        const surplusSoc = currentEvSoc - requiredSoc;
        const surplusKwh = (surplusSoc / 100) * evCapacityKwh;
        const dischargePower = Math.min(v2gRateKw, surplusKwh / interval_h);
        netEvPower = -dischargePower;
        currentFlows.ev_grid = dischargePower;
        gridPower -= dischargePower;
        intraDayStats.current.v2gExportKwh += dischargePower * interval_h;
        intraDayStats.current.v2gEarningsRs += (dischargePower * interval_h) * sellRate;
      }
    } 
    
    // 4. EV Plugged in at home logic
    if (pluggedIn) {
      // Manual V2H OR Grid Down Emergency V2H
      const wantsV2H = isManualV2H || gridIsDown;
      
      if (wantsV2H && v2gCapable) {
        const isTotalBlackout = gridIsDown && currentHomeBattSoc <= 1 && solarPower < 0.1;
        if (currentEvSoc > requiredSoc && powerNeededByHouse > 0) {
          chargerMode = gridIsDown ? 'EMERGENCY V2H' : 'Manual V2H Active';
          const surplusSoc  = currentEvSoc - requiredSoc;
          const surplusKwh  = (surplusSoc / 100) * evCapacityKwh;
          const fromEv      = Math.min(powerNeededByHouse, v2gRateKw, surplusKwh / interval_h);
          
          netEvPower        = -fromEv;
          currentFlows.ev_house  = fromEv;
          powerNeededByHouse -= fromEv;
          
          const kwhUsed = fromEv * interval_h;
          intraDayStats.current.v2hUsedKwh += kwhUsed;
          intraDayStats.current.v2hSavedCostRs += kwhUsed * buyRate; // Saved from buying grid power
        }
        if (gridIsDown && powerNeededByHouse > 0) chargerMode = 'BLACKOUT';
        if (gridIsDown && powerNeededByHouse === 0 && currentFlows.ev_house === 0) chargerMode = 'Grid Down (Batt OK)';
      } 
      
      // Grid supplies remaining house load
      if (!gridIsDown && powerNeededByHouse > 0) {
        gridPower += powerNeededByHouse;
        currentFlows.grid_house = powerNeededByHouse;
        intraDayStats.current.totalGridKwh += powerNeededByHouse * interval_h;
        intraDayStats.current.totalGridCostRs += (powerNeededByHouse * interval_h) * buyRate;
      }

      // Grid Charging EV (Night time or TOU optimized)
      if (!gridIsDown && !isManualV2H && (hour >= 22 || hour < 5)) {
        if (currentEvSoc < 100) {
          netEvPower = chargeRateKw;
          chargerMode = 'Night Charging';
          currentFlows.grid_ev = chargeRateKw;
          gridPower += chargeRateKw;
          const chargeKwh = chargeRateKw * interval_h;
          intraDayStats.current.totalGridKwh += chargeKwh;
          intraDayStats.current.totalGridCostRs += chargeKwh * buyRate;
          intraDayStats.current.evChargingCostRs += chargeKwh * buyRate;
        }
      }

      // Solar Surplus logic
      let surplusSolar = solarPower - currentFlows.solar_house;
      if (surplusSolar > 0) {
        // Charge home battery
        if (currentHomeBattSoc < 100) {
          const toBatt = Math.min(surplusSolar, homeBatteryCapacityKwh * 0.5);
          netHomeBatteryPower += toBatt;
          currentFlows.solar_battery = toBatt;
          surplusSolar -= toBatt;
        }
        // Charge EV
        if (surplusSolar > 0 && currentEvSoc < 100) {
          const toEv = Math.min(surplusSolar, chargeRateKw);
          netEvPower += toEv;
          currentFlows.solar_ev = toEv;
          chargerMode = 'Solar Charging';
        }
        // Export rest to grid
        if (surplusSolar > 0 && !gridIsDown) {
          gridPower -= surplusSolar;
          intraDayStats.current.v2gEarningsRs += (surplusSolar * interval_h) * sellRate;
        }
      }
    } else if (!pluggedIn && (hour < 8 || hour > 18)) {
      chargerMode = 'Idle (Unplugged)';
      if (!gridIsDown && powerNeededByHouse > 0) {
        gridPower += powerNeededByHouse;
        currentFlows.grid_house = powerNeededByHouse;
        intraDayStats.current.totalGridKwh += powerNeededByHouse * interval_h;
        intraDayStats.current.totalGridCostRs += (powerNeededByHouse * interval_h) * buyRate;
      }
      let surplusSolar = solarPower - currentFlows.solar_house;
      if (surplusSolar > 0 && currentHomeBattSoc < 100) {
        const toBatt = Math.min(surplusSolar, homeBatteryCapacityKwh * 0.5);
        netHomeBatteryPower += toBatt;
        currentFlows.solar_battery = toBatt;
      }
    }

    if (pluggedIn !== isEvPluggedIn) setIsEvPluggedIn(pluggedIn);

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
  }, [timeStep, isRunning]);

  return {
    isRunning, timeStep, dayNumber,
    gridIsDown, isManualV2H, isEvPluggedIn, evSoc, homeBatterySoc,
    totalCost, totalEarnings, cumulativeCost, cumulativeEarnings,
    mode, minRangeKm, flows, history, powerLabels,
    evMaxRangeKm, evCapacityKwh,
    dailyBills,
    setMinRangeKm, setGridIsDown, setIsManualV2H, setIsEvPluggedIn,
    startSim, pauseSim, resetDay, resetAll,
  };
}
