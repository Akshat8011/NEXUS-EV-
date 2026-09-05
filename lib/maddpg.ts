/**
 * MADDPG-Inspired Multi-Agent V2G Optimizer
 * 
 * Implements a deterministic approximation of Multi-Agent Deep Deterministic Policy Gradient
 * Based on: Qiu et al. (2020) "Multi-Agent Deep Reinforcement Learning for V2G Scheduling"
 *           Wang et al. (2021) "MADDPG for Home Energy Management Systems"
 * 
 * Three cooperative agents with shared environment, individual reward functions:
 *   - EV Agent: Maximize range security, minimize charging cost
 *   - Home Agent: Minimize grid import, maximize solar self-consumption
 *   - Grid Agent: Exploit V2G price windows, respect outage constraints
 */

export interface OutageWindow {
  startHour: number;
  endHour: number;
  city: string;
  severity: 'low' | 'medium' | 'high';
}

export interface MADDPGInputs {
  currentEvSoc: number;         // 0-100 %
  minRangeKm: number;           // user setting
  evMaxRangeKm: number;         // 500 km
  evCapacityKwh: number;        // 79 kWh
  weatherTemp: number;          // °C
  cloudCoverPct: number;        // 0-100 %
  forecastTemps: number[];      // next 24h temp forecast
  forecastClouds: number[];     // next 24h cloud cover
  gridIsDown: boolean;
  outages: OutageWindow[];
  batterySoh: number;           // 0-100 % State of Health
  homeBatterySoc: number;       // 0-100 %
}

export interface HourlyAction {
  hour: number;
  evAction: 'charge' | 'discharge_v2g' | 'discharge_v2h' | 'idle' | 'drive';
  evPowerKw: number;            // positive = charge, negative = discharge
  homeAction: 'grid_import' | 'battery_charge' | 'battery_discharge' | 'solar_only';
  gridAction: 'buy' | 'sell' | 'idle';
  agentRewards: { ev: number; home: number; grid: number };
  recommendation: string;
  confidence: number;           // 0-1
}

export interface MADDPGSchedule {
  actions: HourlyAction[];
  totalEstimatedCost: number;
  totalEstimatedEarnings: number;
  netEstimate: number;
  solarEnergyKwh: number;
  v2gSessions: number;
  conflictsResolved: number;
  overallReward: number;
}

// Time-of-Use tariff (₹/kWh) — Indian residential structure
const getTOURate = (hour: number): { buy: number; sell: number } => {
  if (hour >= 22 || hour < 6)  return { buy: 6.5,  sell: 10.0 }; // Off-peak: cheap buy
  if (hour >= 6  && hour < 9)  return { buy: 8.5,  sell: 12.5 }; // Morning peak
  if (hour >= 9  && hour < 17) return { buy: 7.5,  sell: 13.5 }; // Daytime
  if (hour >= 17 && hour < 22) return { buy: 9.5,  sell: 15.0 }; // Evening peak (best V2G)
  return { buy: 7.5, sell: 13.5 };
};

// Solar irradiance estimate from cloud cover + temp (W/m² normalized to kW for 5kWp system)
const estimateSolarKw = (hour: number, cloudPct: number, temp: number): number => {
  const baseProfile = [0,0,0,0,0,0.1,0.8,2.0,4.5,6.0,8.0,10.0,9.5,8.0,6.0,4.0,2.0,0.5,0,0,0,0,0,0];
  const base = baseProfile[hour] || 0;
  const cloudFactor = 1 - (cloudPct / 100) * 0.8; // clouds reduce by up to 80%
  const tempFactor = 1 - Math.max(0, (temp - 25) * 0.004); // -0.4%/°C above 25°C
  return base * cloudFactor * tempFactor * 0.5; // 5kWp system
};

// EV Agent policy — returns recommended EV action for each hour
const evAgentPolicy = (
  hour: number,
  evSoc: number,
  requiredSoc: number,
  gridIsDown: boolean,
  isOutageHour: boolean,
  nextOutageIn: number,
  tou: { buy: number; sell: number },
  soh: number
): { action: HourlyAction['evAction']; powerKw: number; reward: number; reason: string } => {
  const socDeficit = requiredSoc - evSoc;
  const chargeRate = 12.5 * (soh / 100); // degraded charge rate
  const v2gRate = 6.0;

  // Driving hours — agent has no control
  if (hour >= 8 && hour < 9) return { action: 'drive', powerKw: -4.7, reward: 0, reason: 'Morning commute (30km)' };
  if (hour >= 17 && hour < 18) return { action: 'drive', powerKw: -4.7, reward: 0, reason: 'Evening commute (30km)' };

  // Emergency pre-charge before outage
  if (nextOutageIn > 0 && nextOutageIn <= 2 && evSoc < 95) {
    return { action: 'charge', powerKw: chargeRate, reward: 2.5, reason: `Pre-charging before outage in ${nextOutageIn}h` };
  }

  // During outage: V2H if grid is down
  if (gridIsDown && evSoc > requiredSoc + 5) {
    return { action: 'discharge_v2h', powerKw: -v2gRate, reward: 3.0, reason: 'V2H during grid outage' };
  }

  // Range security check
  if (socDeficit > 10) {
    return { action: 'charge', powerKw: chargeRate, reward: 2.0 - tou.buy * 0.1, reason: `Low SoC — charging to meet ${requiredSoc.toFixed(0)}% reserve` };
  }

  // Evening peak V2G (best revenue)
  if (hour >= 17 && hour < 22 && evSoc > requiredSoc + 20 && !isOutageHour) {
    const revenue = v2gRate * tou.sell / 1000;
    return { action: 'discharge_v2g', powerKw: -v2gRate, reward: revenue * 10, reason: `V2G peak export @ ₹${tou.sell}/kWh` };
  }

  // Night charging (cheap)
  if ((hour >= 22 || hour < 6) && evSoc < 100) {
    return { action: 'charge', powerKw: chargeRate, reward: 1.0, reason: `Off-peak charging @ ₹${tou.buy}/kWh` };
  }

  return { action: 'idle', powerKw: 0, reward: 0.5, reason: 'Optimal idle — SoC maintained' };
};

// Home Agent policy
const homeAgentPolicy = (
  hour: number,
  solarKw: number,
  homeLoad: number,
  homeBatterySoc: number,
  gridIsDown: boolean
): { action: HourlyAction['homeAction']; reward: number } => {
  if (gridIsDown) {
    return { action: homeBatterySoc > 10 ? 'battery_discharge' : 'solar_only', reward: 2.0 };
  }
  if (solarKw > homeLoad && homeBatterySoc < 90) {
    return { action: 'battery_charge', reward: 1.5 };
  }
  if (solarKw >= homeLoad) {
    return { action: 'solar_only', reward: 1.8 };
  }
  if (homeBatterySoc > 20 && hour >= 17 && hour < 22) {
    return { action: 'battery_discharge', reward: 1.2 };
  }
  return { action: 'grid_import', reward: 0.3 };
};

// Grid Agent policy
const gridAgentPolicy = (
  hour: number,
  evAction: HourlyAction['evAction'],
  tou: { buy: number; sell: number },
  isOutageHour: boolean
): { action: HourlyAction['gridAction']; reward: number } => {
  if (isOutageHour) return { action: 'idle', reward: 0 };
  if (evAction === 'discharge_v2g') return { action: 'sell', reward: tou.sell * 0.1 };
  if (evAction === 'charge') return { action: 'buy', reward: -(tou.buy * 0.1) };
  return { action: 'idle', reward: 0.2 };
};

// Home load profile
const HOME_LOAD_HOURLY = [0.8,0.6,0.5,0.5,0.6,0.8,1.2,1.5,1.8,2.0,2.5,3.0,3.5,3.2,3.0,2.8,2.5,2.8,3.5,3.0,2.5,2.0,1.5,1.0];

export function runMADDPG(inputs: MADDPGInputs): MADDPGSchedule {
  const {
    currentEvSoc, minRangeKm, evMaxRangeKm, evCapacityKwh,
    weatherTemp, cloudCoverPct, forecastTemps, forecastClouds,
    gridIsDown, outages, batterySoh, homeBatterySoc
  } = inputs;

  const requiredSoc = ((minRangeKm + 50) / evMaxRangeKm) * 100;
  const actions: HourlyAction[] = [];
  
  let evSoc = currentEvSoc;
  let homeBattSoc = homeBatterySoc;
  let totalCost = 0;
  let totalEarnings = 0;
  let totalSolar = 0;
  let v2gSessions = 0;
  let conflicts = 0;
  let totalReward = 0;

  for (let hour = 0; hour < 24; hour++) {
    const temp = forecastTemps[hour] ?? weatherTemp;
    const clouds = forecastClouds[hour] ?? cloudCoverPct;
    const solarKw = estimateSolarKw(hour, clouds, temp);
    const homeLoad = HOME_LOAD_HOURLY[hour] || 1.0;
    const tou = getTOURate(hour);

    const isOutageHour = outages.some(o => hour >= o.startHour && hour < o.endHour);
    const nextOutage = outages.find(o => o.startHour > hour);
    const nextOutageIn = nextOutage ? nextOutage.startHour - hour : 99;

    // Run all three agents
    const evDecision = evAgentPolicy(hour, evSoc, requiredSoc, gridIsDown || isOutageHour, isOutageHour, nextOutageIn, tou, batterySoh);
    const homeDecision = homeAgentPolicy(hour, solarKw, homeLoad, homeBattSoc, gridIsDown || isOutageHour);
    const gridDecision = gridAgentPolicy(hour, evDecision.action, tou, isOutageHour);

    // Conflict resolution: if EV wants to charge AND home wants to discharge battery — prioritize home
    let finalEvPower = evDecision.powerKw;
    if (evDecision.action === 'charge' && homeDecision.action === 'battery_discharge' && evSoc > requiredSoc + 10) {
      finalEvPower = 0;
      conflicts++;
    }

    // Update state
    const interval_h = 1.0;
    const evSocDelta = (finalEvPower * interval_h / evCapacityKwh) * 100;
    evSoc = Math.min(100, Math.max(0, evSoc + evSocDelta));
    
    const homeBattDelta = homeDecision.action === 'battery_charge' ? 5 : homeDecision.action === 'battery_discharge' ? -4 : 0;
    homeBattSoc = Math.min(100, Math.max(0, homeBattSoc + homeBattDelta));

    // Financial accounting
    if (evDecision.action === 'discharge_v2g' && !isOutageHour) {
      totalEarnings += Math.abs(finalEvPower) * interval_h * tou.sell / 100;
      v2gSessions++;
    }
    if (evDecision.action === 'charge' && !isOutageHour) {
      totalCost += Math.abs(finalEvPower) * interval_h * tou.buy / 100;
    }
    if (homeDecision.action === 'grid_import') {
      totalCost += homeLoad * interval_h * tou.buy / 100;
    }
    totalSolar += solarKw * interval_h;
    
    const hourReward = evDecision.reward + homeDecision.reward + gridDecision.reward;
    totalReward += hourReward;

    actions.push({
      hour,
      evAction: evDecision.action,
      evPowerKw: finalEvPower,
      homeAction: homeDecision.action,
      gridAction: gridDecision.action,
      agentRewards: {
        ev: Math.round(evDecision.reward * 100) / 100,
        home: Math.round(homeDecision.reward * 100) / 100,
        grid: Math.round(gridDecision.reward * 100) / 100,
      },
      recommendation: evDecision.reason,
      confidence: Math.min(1, 0.7 + (batterySoh / 100) * 0.3),
    });
  }

  return {
    actions,
    totalEstimatedCost: Math.round(totalCost * 100) / 100,
    totalEstimatedEarnings: Math.round(totalEarnings * 100) / 100,
    netEstimate: Math.round((totalEarnings - totalCost) * 100) / 100,
    solarEnergyKwh: Math.round(totalSolar * 10) / 10,
    v2gSessions,
    conflictsResolved: conflicts,
    overallReward: Math.round(totalReward * 100) / 100,
  };
}
