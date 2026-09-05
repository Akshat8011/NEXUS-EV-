/**
 * MADDPG-Inspired Multi-Agent V2G Optimizer
 *
 * Deterministic approximation of Multi-Agent Deep Deterministic Policy Gradient.
 * References:
 *   Qiu et al. (2020) "Multi-Agent DRL for V2G Scheduling" — IEEE Trans. Smart Grid
 *   Wang et al. (2021) "MADDPG for Home Energy Management Systems" — Applied Energy
 *
 * Three cooperative agents, individual reward functions, shared state:
 *   EV Agent   — Maximize range security, minimize charging cost
 *   Home Agent — Minimize grid import, maximize solar self-consumption
 *   Grid Agent — Exploit V2G price windows, respect outage constraints
 *
 * Financial units: all costs/earnings in ₹ (Indian Rupees). Rate in ₹/kWh.
 */

export interface OutageWindow {
  startHour: number;
  endHour:   number;
  city:      string;
  severity:  'low' | 'medium' | 'high';
}

export interface MADDPGInputs {
  currentEvSoc:    number;  // 0–100 %
  minRangeKm:      number;  // user-configured reserve
  evMaxRangeKm:    number;  // full range of the EV model
  evCapacityKwh:   number;  // usable battery capacity (kWh)
  chargeRateKw:    number;  // EV model's max AC charge rate (kW)
  v2gRateKw:       number;  // max V2G/V2H discharge rate (kW); 0 if not capable
  consumptionWhPerKm: number; // real-world energy consumption
  weatherTemp:     number;  // °C
  cloudCoverPct:   number;  // 0–100 %
  forecastTemps:   number[];
  forecastClouds:  number[];
  gridIsDown:      boolean;
  outages:         OutageWindow[];
  batterySoh:      number;  // 0–100 % SoH
  homeBatterySoc:  number;  // 0–100 %
}

export interface HourlyAction {
  hour:        number;
  evAction:    'charge' | 'discharge_v2g' | 'discharge_v2h' | 'idle' | 'drive';
  evPowerKw:   number;        // + = charging, − = discharging
  homeAction:  'grid_import' | 'battery_charge' | 'battery_discharge' | 'solar_only';
  gridAction:  'buy' | 'sell' | 'idle';
  agentRewards: { ev: number; home: number; grid: number };
  recommendation: string;
  confidence:  number;        // 0–1
}

export interface MADDPGSchedule {
  actions:              HourlyAction[];
  totalEstimatedCost:   number;   // ₹
  totalEstimatedEarnings: number; // ₹
  netEstimate:          number;   // ₹
  solarEnergyKwh:       number;
  v2gSessions:          number;
  conflictsResolved:    number;
  overallReward:        number;
}

// ── Time-of-Use tariff (₹/kWh) — Indian residential MSEDCL/UPPCL structure ──
const getTOURate = (hour: number): { buy: number; sell: number } => {
  // Off-peak 22:00–06:00 → cheap buy, lower V2G sell
  if (hour >= 22 || hour < 6)  return { buy: 6.50, sell:  9.00 };
  // Morning shoulder 06:00–09:00
  if (hour >= 6  && hour < 9)  return { buy: 8.00, sell: 11.50 };
  // Daytime 09:00–17:00 (solar window)
  if (hour >= 9  && hour < 17) return { buy: 7.50, sell: 12.00 };
  // Evening peak 17:00–22:00 — best V2G window
  return                              { buy: 9.50, sell: 14.50 };
};

// ── Solar kW estimate for a 5 kWp rooftop system ──
// Hourly base profile scaled by cloud cover and temperature de-rating
const BASE_SOLAR = [0,0,0,0,0,0.05,0.40,1.20,2.80,4.00,4.80,5.00,4.80,3.80,2.60,1.40,0.50,0.10,0,0,0,0,0,0];

const estimateSolarKw = (hour: number, cloudPct: number, temp: number): number => {
  const base       = BASE_SOLAR[hour] || 0;
  const cloudFx    = 1 - (cloudPct / 100) * 0.82;      // clouds cut up to 82%
  const tempFx     = 1 - Math.max(0, (temp - 25) * 0.004); // −0.4%/°C above 25°C
  return Math.max(0, base * cloudFx * tempFx);
};

// ── EV Agent policy ──────────────────────────────────────────────────────────
const evAgentPolicy = (
  hour:          number,
  evSoc:         number,
  requiredSoc:   number,
  v2gCapable:    boolean,
  gridIsDown:    boolean,
  isOutageHour:  boolean,
  nextOutageIn:  number,
  tou:           { buy: number; sell: number },
  chargeRateKw:  number,   // model-specific AC charge rate
  v2gRateKw:     number,   // model-specific V2G rate
  consumptionWhPerKm: number,
  soh:           number
): { action: HourlyAction['evAction']; powerKw: number; reward: number; reason: string } => {

  // Degrade charge rate proportionally with SoH
  const effectiveChargeRate = chargeRateKw * (soh / 100);
  const effectiveV2gRate    = v2gRateKw  * (soh / 100);

  // Commute power: consumption (Wh/km) × 30 km ÷ 1000 = kWh used in 1 hour
  const commutePowerKw = (consumptionWhPerKm * 30) / 1000;

  // ── Fixed driving hours: agent cannot intervene ──────────────────────────
  if (hour >= 8 && hour < 9)  return { action: 'drive', powerKw: -commutePowerKw, reward: 0, reason: `Morning commute 30 km (−${commutePowerKw.toFixed(1)} kWh)` };
  if (hour >= 17 && hour < 18) return { action: 'drive', powerKw: -commutePowerKw, reward: 0, reason: `Evening commute 30 km (−${commutePowerKw.toFixed(1)} kWh)` };

  // ── Emergency pre-charge before outage ───────────────────────────────────
  if (nextOutageIn > 0 && nextOutageIn <= 2 && evSoc < 90) {
    return {
      action:  'charge', powerKw: effectiveChargeRate, reward: 3.0,
      reason:  `⚠️ Pre-charging before outage in ${nextOutageIn}h — charging @ ${effectiveChargeRate.toFixed(1)} kW`
    };
  }

  // ── Grid outage: discharge to house if V2G-capable ───────────────────────
  if ((gridIsDown || isOutageHour) && v2gCapable && evSoc > requiredSoc + 8) {
    return {
      action:  'discharge_v2h', powerKw: -effectiveV2gRate, reward: 4.0,
      reason:  `⚡ V2H during outage — ${effectiveV2gRate.toFixed(1)} kW to house`
    };
  }
  if ((gridIsDown || isOutageHour) && !v2gCapable) {
    return { action: 'idle', powerKw: 0, reward: 0.5, reason: 'Grid outage (V2H not available on this model)' };
  }

  // ── Range security — charge at any tariff if we are below reserve ────────
  const socDeficit = requiredSoc - evSoc;
  if (socDeficit > 8) {
    return {
      action:  'charge', powerKw: effectiveChargeRate, reward: 2.5 - tou.buy * 0.05,
      reason:  `🔋 Below reserve — charging to ${requiredSoc.toFixed(0)}% @ ${effectiveChargeRate.toFixed(1)} kW`
    };
  }

  // ── Evening peak V2G (best revenue window, 17:00–22:00) ─────────────────
  if (hour >= 17 && hour < 22 && v2gCapable && evSoc > requiredSoc + 18 && !isOutageHour) {
    const revenue = effectiveV2gRate * tou.sell; // ₹/h
    return {
      action:  'discharge_v2g', powerKw: -effectiveV2gRate, reward: revenue * 0.15,
      reason:  `💰 V2G peak export @ ₹${tou.sell}/kWh — earning ₹${revenue.toFixed(1)}/h`
    };
  }

  // ── Night off-peak charging (cheapest window, 22:00–06:00) ───────────────
  if ((hour >= 22 || hour < 6) && evSoc < 95) {
    return {
      action:  'charge', powerKw: effectiveChargeRate, reward: 1.2,
      reason:  `🌙 Off-peak charge @ ₹${tou.buy}/kWh — ${effectiveChargeRate.toFixed(1)} kW`
    };
  }

  // ── Midday opportunistic V2G (moderate price, excess solar) ─────────────
  if (hour >= 9 && hour < 17 && v2gCapable && evSoc > requiredSoc + 30 && !isOutageHour) {
    return {
      action:  'discharge_v2g', powerKw: -(effectiveV2gRate * 0.5), reward: 0.8,
      reason:  `☀️ Midday partial V2G @ ₹${tou.sell}/kWh`
    };
  }

  return { action: 'idle', powerKw: 0, reward: 0.5, reason: 'Optimal idle — SoC maintained' };
};

// ── Home Agent policy ────────────────────────────────────────────────────────
const homeAgentPolicy = (
  hour:          number,
  solarKw:       number,
  homeLoad:      number,
  homeBatterySoc: number,
  gridIsDown:    boolean
): { action: HourlyAction['homeAction']; reward: number } => {
  if (gridIsDown) {
    return { action: homeBatterySoc > 15 ? 'battery_discharge' : 'solar_only', reward: 2.5 };
  }
  // Surplus solar → charge home battery
  if (solarKw > homeLoad + 0.3 && homeBatterySoc < 88) {
    return { action: 'battery_charge', reward: 1.8 };
  }
  // Solar covers load exactly
  if (solarKw >= homeLoad) {
    return { action: 'solar_only', reward: 2.0 };
  }
  // Evening peak — discharge home battery to avoid expensive grid
  if (homeBatterySoc > 25 && hour >= 17 && hour < 22) {
    return { action: 'battery_discharge', reward: 1.4 };
  }
  return { action: 'grid_import', reward: 0.2 };
};

// ── Grid Agent policy ────────────────────────────────────────────────────────
const gridAgentPolicy = (
  evAction:     HourlyAction['evAction'],
  tou:          { buy: number; sell: number },
  isOutageHour: boolean
): { action: HourlyAction['gridAction']; reward: number } => {
  if (isOutageHour)                          return { action: 'idle', reward: 0 };
  if (evAction === 'discharge_v2g')          return { action: 'sell', reward: tou.sell * 0.08 };
  if (evAction === 'charge')                 return { action: 'buy',  reward: -(tou.buy * 0.05) };
  return                                            { action: 'idle', reward: 0.15 };
};

// ── Home load profile (kW) — average Indian household ────────────────────────
const HOME_LOAD_KW = [0.7,0.5,0.5,0.4,0.5,0.7,1.1,1.4,1.7,1.9,2.3,2.8,3.2,3.0,2.8,2.6,2.4,2.7,3.3,2.9,2.4,2.0,1.4,0.9];

// ═══════════════════════════════════════════════════════════════════════════════
export function runMADDPG(inputs: MADDPGInputs): MADDPGSchedule {
  const {
    currentEvSoc, minRangeKm, evMaxRangeKm, evCapacityKwh,
    chargeRateKw, v2gRateKw, consumptionWhPerKm,
    weatherTemp, cloudCoverPct, forecastTemps, forecastClouds,
    gridIsDown, outages, batterySoh, homeBatterySoc
  } = inputs;

  const v2gCapable  = v2gRateKw > 0;
  // Reserve: minRangeKm + 40 km buffer
  const requiredSoc = Math.min(95, ((minRangeKm + 40) / evMaxRangeKm) * 100);

  const actions:    HourlyAction[] = [];
  let evSoc       = currentEvSoc;
  let homeBattSoc = homeBatterySoc;
  let totalCost   = 0;  // ₹
  let totalEarn   = 0;  // ₹
  let totalSolar  = 0;  // kWh
  let v2gSessions = 0;
  let conflicts   = 0;
  let totalReward = 0;

  for (let hour = 0; hour < 24; hour++) {
    const temp     = forecastTemps[hour]  ?? weatherTemp;
    const clouds   = forecastClouds[hour] ?? cloudCoverPct;
    const solarKw  = estimateSolarKw(hour, clouds, temp);
    const homeLoad = HOME_LOAD_KW[hour] || 0.8;
    const tou      = getTOURate(hour);

    const isOutageHour = outages.some(o => hour >= o.startHour && hour < o.endHour);
    const nextOutage   = outages.find(o => o.startHour > hour);
    const nextOutageIn = nextOutage ? nextOutage.startHour - hour : 99;

    // ── Run agents ───────────────────────────────────────────────────────────
    const evDec = evAgentPolicy(
      hour, evSoc, requiredSoc, v2gCapable,
      gridIsDown, isOutageHour, nextOutageIn,
      tou, chargeRateKw, v2gRateKw, consumptionWhPerKm, batterySoh
    );
    const homeDec  = homeAgentPolicy(hour, solarKw, homeLoad, homeBattSoc, gridIsDown || isOutageHour);
    const gridDec  = gridAgentPolicy(evDec.action, tou, isOutageHour);

    // ── Conflict resolution ──────────────────────────────────────────────────
    // If EV wants to charge but home wants to discharge battery and EV has
    // sufficient SoC: postpone EV charging so home battery serves the load first
    let finalEvPower = evDec.powerKw;
    if (
      evDec.action === 'charge' &&
      homeDec.action === 'battery_discharge' &&
      evSoc > requiredSoc + 15
    ) {
      finalEvPower = 0;
      conflicts++;
    }

    // ── State update (1-hour interval) ──────────────────────────────────────
    const SOC_DELTA_EV   = (finalEvPower / evCapacityKwh) * 100;
    const SOC_DELTA_BATT = homeDec.action === 'battery_charge'     ?  6
                         : homeDec.action === 'battery_discharge'  ? -5
                         : 0;

    evSoc       = Math.min(100, Math.max(0, evSoc       + SOC_DELTA_EV));
    homeBattSoc = Math.min(100, Math.max(0, homeBattSoc + SOC_DELTA_BATT));

    // ── Financial accounting (₹) ─────────────────────────────────────────────
    // Energy × rate (kWh × ₹/kWh = ₹)
    const interval_h = 1.0;

    if (evDec.action === 'discharge_v2g' && !isOutageHour) {
      const energyKwh = Math.abs(finalEvPower) * interval_h;
      totalEarn += energyKwh * tou.sell;
      v2gSessions++;
    }
    if (evDec.action === 'charge') {
      const energyKwh = Math.abs(finalEvPower) * interval_h;
      // Only pay for grid portion (solar can cover some of the charge)
      const solarAvailable = Math.max(0, solarKw - homeLoad);
      const gridForEV      = Math.max(0, energyKwh - solarAvailable);
      totalCost += gridForEV * tou.buy;
    }
    if (homeDec.action === 'grid_import') {
      const netHomeLoad = Math.max(0, homeLoad - solarKw);
      totalCost += netHomeLoad * interval_h * tou.buy;
    }
    totalSolar += solarKw * interval_h;

    const hourReward = evDec.reward + homeDec.reward + gridDec.reward;
    totalReward += hourReward;

    actions.push({
      hour,
      evAction:   finalEvPower === 0 && evDec.action === 'charge' ? 'idle' : evDec.action,
      evPowerKw:  finalEvPower,
      homeAction: homeDec.action,
      gridAction: gridDec.action,
      agentRewards: {
        ev:   Math.round(evDec.reward   * 100) / 100,
        home: Math.round(homeDec.reward * 100) / 100,
        grid: Math.round(gridDec.reward * 100) / 100,
      },
      recommendation: evDec.reason,
      confidence: Math.min(1, 0.65 + (batterySoh / 100) * 0.35),
    });
  }

  return {
    actions,
    totalEstimatedCost:     Math.round(totalCost * 100) / 100,
    totalEstimatedEarnings: Math.round(totalEarn * 100) / 100,
    netEstimate:            Math.round((totalEarn - totalCost) * 100) / 100,
    solarEnergyKwh:         Math.round(totalSolar * 10) / 10,
    v2gSessions,
    conflictsResolved:      conflicts,
    overallReward:          Math.round(totalReward * 100) / 100,
  };
}
