import { useState, useEffect, useRef } from 'react';

// Profile generation
const generateSmoothProfiles = () => {
  const homeLoadHourly = [0.8,0.6,0.5,0.5,0.6,0.8,1.2,1.5,1.8,2.0,2.5,3.0,3.5,3.2,3.0,2.8,2.5,2.8,3.5,3.0,2.5,2.0,1.5,1.0, 0.8];
  const solarHourly = [0,0,0,0,0,0.1,0.8,2.0,4.5,6.0,8.0,10.0,9.5,8.0,6.0,4.0,2.0,0.5,0,0,0,0,0,0, 0].map(x => x * 5.0);
  
  const homeLoadProfile = new Float32Array(1440);
  const solarProfile = new Float32Array(1440);
  
  for (let i = 0; i < 1440; i++) {
    const hour = i / 60;
    const lower = Math.floor(hour);
    const upper = Math.ceil(hour);
    const fraction = hour - lower;
    
    if (lower === upper) {
      homeLoadProfile[i] = homeLoadHourly[lower];
      solarProfile[i] = solarHourly[lower];
    } else {
      homeLoadProfile[i] = homeLoadHourly[lower] * (1 - fraction) + homeLoadHourly[upper] * fraction;
      solarProfile[i] = solarHourly[lower] * (1 - fraction) + solarHourly[upper] * fraction;
    }
  }
  
  return { homeLoadProfile, solarProfile };
};

const { homeLoadProfile, solarProfile } = generateSmoothProfiles();

export function useSimulation() {
  const [isRunning, setIsRunning] = useState(false);
  const [timeStep, setTimeStep] = useState(0); // minutes 0 to 1440
  const [gridIsDown, setGridIsDown] = useState(false);
  const [isEvPluggedIn, setIsEvPluggedIn] = useState(true);
  
  const [evSoc, setEvSoc] = useState(80.0);
  const [homeBatterySoc, setHomeBatterySoc] = useState(50.0);
  const [totalCost, setTotalCost] = useState(0.0);
  const [totalEarnings, setTotalEarnings] = useState(0.0);
  const [mode, setMode] = useState("Ready");
  
  const [minRangeKm, setMinRangeKm] = useState(80);
  
  const evCapacityKwh = 79.0;
  const evMaxRangeKm = 500.0;
  const homeBatteryCapacityKwh = 10.0;
  const chargeRateKw = 12.5;
  const v2gRateKw = 6.0;
  const fixedBufferKm = 50.0;
  const residentialRate = 7.5;
  const commercialRate = 13.5;
  
  const [flows, setFlows] = useState<Record<string, number>>({});
  const [powerLabels, setPowerLabels] = useState({ grid: 0, solar: 0, house: 0, ev: 0, battery: 0 });
  
  const [history, setHistory] = useState<{
    time: number, evSoc: number, homeBatterySoc: number, gridNet: number, 
    solarToHouse: number, evToHouse: number, gridToHouse: number
  }[]>([]);

  const resetSimulation = () => {
    setIsRunning(false);
    setTimeStep(0);
    setGridIsDown(false);
    setIsEvPluggedIn(true);
    setEvSoc(80.0);
    setHomeBatterySoc(50.0);
    setTotalCost(0.0);
    setTotalEarnings(0.0);
    setMode("Ready");
    setHistory([]);
    setFlows({});
    setPowerLabels({ grid: 0, solar: 0, house: 0, ev: 0, battery: 0 });
  };

  const startSim = () => {
    if (timeStep === 0) resetSimulation();
    setIsRunning(true);
  };

  const pauseSim = () => setIsRunning(false);

  useEffect(() => {
    if (!isRunning) return;
    
    const interval = setInterval(() => {
      setTimeStep(prev => {
        if (prev >= 1439) {
          setIsRunning(false);
          return 1440; // End
        }
        return prev + 1;
      });
    }, 111); // similar to Python's 111ms delay
    
    return () => clearInterval(interval);
  }, [isRunning]);

  // The actual update logic running whenever timeStep changes
  useEffect(() => {
    if (timeStep === 0 || timeStep > 1440) return;
    if (!isRunning) return;

    const minuteOfDay = timeStep;
    const hour = Math.floor(minuteOfDay / 60);
    const interval_h = 1 / 60.0;
    
    const solarPower = solarProfile[minuteOfDay] || 0;
    const homeLoad = homeLoadProfile[minuteOfDay] || 0;
    
    let chargerMode = "Idle";
    let netEvPower = 0;
    let netHomeBatteryPower = 0;
    let gridPower = 0;
    const currentFlows: Record<string, number> = {
      solar_house: 0, solar_ev: 0, solar_battery: 0,
      grid_house: 0, grid_ev: 0, ev_house: 0, ev_grid: 0, battery_house: 0
    };
    
    let powerNeededByHouse = homeLoad;
    const fromSolar = Math.min(powerNeededByHouse, solarPower);
    currentFlows.solar_house = fromSolar;
    powerNeededByHouse -= fromSolar;
    
    let currentHomeBattSoc = homeBatterySoc;
    let currentEvSoc = evSoc;

    if (powerNeededByHouse > 0 && currentHomeBattSoc > 1) {
      const fromBatt = Math.min(powerNeededByHouse, homeBatteryCapacityKwh * 0.5);
      netHomeBatteryPower = -fromBatt;
      currentFlows.battery_house = fromBatt;
      powerNeededByHouse -= fromBatt;
    }
    
    const requiredRangeKm = minRangeKm + fixedBufferKm;
    const requiredSoc = (requiredRangeKm / evMaxRangeKm) * 100;
    
    let pluggedIn = isEvPluggedIn;

    // Driving logic overrides
    if (hour >= 8 && hour < 9) {
      const commuteKwhPerHour = (30 / evMaxRangeKm) * evCapacityKwh;
      netEvPower = -commuteKwhPerHour;
      chargerMode = "Driving (Commute)";
      pluggedIn = false;
    } else if (hour >= 17 && hour < 18) {
      const commuteKwhPerHour = (30 / evMaxRangeKm) * evCapacityKwh;
      netEvPower = -commuteKwhPerHour;
      chargerMode = "Driving (Home)";
      pluggedIn = false;
    } else if (hour === 18 && minuteOfDay === 18 * 60) {
      pluggedIn = true;
      chargerMode = "Plugged In (Idle)";
    } else if (hour >= 11 && hour < 17 && !gridIsDown) {
      pluggedIn = false;
      if (currentEvSoc > requiredSoc + 1) {
        chargerMode = "V2G @ Office";
        const surplusSoc = currentEvSoc - requiredSoc;
        const surplusKwh = (surplusSoc / 100) * evCapacityKwh;
        const maxDischargeForInterval = surplusKwh / interval_h;
        const dischargePower = Math.min(v2gRateKw, maxDischargeForInterval);
        netEvPower = -dischargePower;
        currentFlows.ev_grid = dischargePower;
        gridPower -= dischargePower;
      }
    } else if (pluggedIn) {
      if (gridIsDown) {
        const isTotalBlackout = currentHomeBattSoc <= 1 && solarPower < 0.1;
        if (isTotalBlackout) {
          if (currentEvSoc > requiredSoc && powerNeededByHouse > 0) {
            chargerMode = "EMERGENCY V2H";
            const surplusSoc = currentEvSoc - requiredSoc;
            const surplusKwh = (surplusSoc / 100) * evCapacityKwh;
            const maxDischargeForInterval = surplusKwh / interval_h;
            const fromEv = Math.min(powerNeededByHouse, v2gRateKw, maxDischargeForInterval);
            netEvPower = -fromEv;
            currentFlows.ev_house = fromEv;
            powerNeededByHouse -= fromEv;
          }
          if (powerNeededByHouse > 0) {
            chargerMode = "BLACKOUT";
          }
        } else {
          chargerMode = "Grid Down (Batt OK)";
        }
      } else {
        if (powerNeededByHouse > 0) {
          gridPower += powerNeededByHouse;
          currentFlows.grid_house = powerNeededByHouse;
        }
        if (hour >= 21 || hour < 5) {
          if (currentEvSoc < 100) {
            netEvPower = chargeRateKw;
            chargerMode = "Night Charging";
            currentFlows.grid_ev = chargeRateKw;
            gridPower += chargeRateKw;
          }
        }
      }

      let surplusSolar = solarPower - currentFlows.solar_house;
      if (surplusSolar > 0) {
        if (currentHomeBattSoc < 100) {
          const toBatt = Math.min(surplusSolar, homeBatteryCapacityKwh * 0.5);
          netHomeBatteryPower += toBatt;
          currentFlows.solar_battery = toBatt;
          surplusSolar -= toBatt;
        }
        if (surplusSolar > 0) {
          const toEv = Math.min(surplusSolar, chargeRateKw);
          netEvPower += toEv;
          currentFlows.solar_ev = toEv;
          chargerMode = "Solar Charging";
        }
      }
    } else {
      chargerMode = "Idle (Unplugged)";
      netEvPower = 0;
      if (!gridIsDown && powerNeededByHouse > 0) {
        gridPower += powerNeededByHouse;
        currentFlows.grid_house = powerNeededByHouse;
      }
      let surplusSolar = solarPower - currentFlows.solar_house;
      if (surplusSolar > 0) {
        if (currentHomeBattSoc < 100) {
          const toBatt = Math.min(surplusSolar, homeBatteryCapacityKwh * 0.5);
          netHomeBatteryPower += toBatt;
          currentFlows.solar_battery = toBatt;
          surplusSolar -= toBatt;
        }
      }
    }

    // Ensure plug state stays in sync 
    if (pluggedIn !== isEvPluggedIn) setIsEvPluggedIn(pluggedIn);

    const nextEvSoc = Math.min(100, Math.max(0, currentEvSoc + (netEvPower * interval_h / evCapacityKwh) * 100));
    const nextHomeBattSoc = Math.min(100, Math.max(0, currentHomeBattSoc + (netHomeBatteryPower * interval_h / homeBatteryCapacityKwh) * 100));

    let costDelta = 0;
    let earnDelta = 0;
    if (gridPower > 0) costDelta = gridPower * interval_h * residentialRate;
    else if (gridPower < 0) earnDelta = Math.abs(gridPower) * interval_h * commercialRate;

    setEvSoc(nextEvSoc);
    setHomeBatterySoc(nextHomeBattSoc);
    if (costDelta > 0) setTotalCost(prev => prev + costDelta);
    if (earnDelta > 0) setTotalEarnings(prev => prev + earnDelta);
    setMode(chargerMode);
    
    setFlows(currentFlows);
    setPowerLabels({
      grid: gridPower,
      solar: solarPower,
      house: homeLoad,
      ev: netEvPower,
      battery: netHomeBatteryPower
    });

    setHistory(prev => [...prev, {
      time: hour + (minuteOfDay % 60)/60, // e.g. 1.5 for 1:30
      evSoc: nextEvSoc,
      homeBatterySoc: nextHomeBattSoc,
      gridNet: gridPower,
      solarToHouse: currentFlows.solar_house,
      evToHouse: currentFlows.ev_house || 0,
      gridToHouse: currentFlows.grid_house || 0
    }]);

  }, [timeStep, isRunning]);

  return {
    isRunning, timeStep, gridIsDown, isEvPluggedIn, evSoc, homeBatterySoc, 
    totalCost, totalEarnings, mode, minRangeKm, flows, history, powerLabels, evMaxRangeKm,
    setMinRangeKm, setGridIsDown, setIsEvPluggedIn, startSim, pauseSim, resetSimulation
  };
}
