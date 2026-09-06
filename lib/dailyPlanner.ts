/**
 * Daily Estimation Engine — Physics-Correct 24-Hour Energy Planner
 *
 * Generates a rigorous 24-hour smart energy plan using:
 *   - EV model-specific battery capacity, charge rate, consumption, V2G capability
 *   - Real-time weather (temperature + cloud cover → solar kW via IEC 61724 model)
 *   - 5-day forecast for next-day planning
 *   - Grid outage schedule with pre-charge optimization
 *   - MADDPG schedule for every hour (EV action, power, recommendation)
 *   - Battery SoH-adjusted usable capacity
 *   - Correct TOU tariff financial accounting (₹ = kWh × ₹/kWh)
 *
 * All financial values in ₹. All power values in kW. All energy in kWh.
 */

import { MADDPGSchedule, OutageWindow } from './maddpg';

// ─── Interfaces ────────────────────────────────────────────────────────────────

export interface DailyEstimationInputs {
  cityName:            string;
  weatherTemp:         number;       // °C (current)
  cloudCoverPct:       number;       // 0–100 %
  forecastTemps:       number[];     // next 8 3-hour slots
  forecastClouds:      number[];
  forecastDescriptions: string[];
  evSoc:               number;       // 0–100 % (current)
  homeBatterySoc:      number;       // 0–100 %
  minRangeKm:          number;       // user-configured reserve
  evMaxRangeKm:        number;       // full WLTP range of selected model
  evCapacityKwh:       number;       // nominal usable battery capacity (kWh)
  chargeRateKw:        number;       // max AC charge rate (kW) for this model
  consumptionWhPerKm:  number;       // real-world consumption
  v2gCapable:          boolean;
  batterySoh:          number;       // 0–100 %
  gridIsDown:          boolean;
  outages:             OutageWindow[];
  maddpgSchedule:      MADDPGSchedule;
}

export interface HourlyEstimate {
  hour:          number;
  label:         string;         // "6:00 AM"
  action:        string;         // "Solar Charge", "V2G Export", etc.
  actionColor:   string;
  estimatedSoc:  number;         // EV SoC at END of this hour (%)
  socDelta:      number;         // Change in SoC this hour (pp)
  costRs:        number;         // ₹ spent this hour (grid purchase)
  earningRs:     number;         // ₹ earned this hour (V2G)
  solarKw:       number;         // Solar output this hour (kW)
  gridKw:        number;         // Grid import (+) or export (-) (kW)
  evPowerKw:     number;         // EV charge (+) or discharge (-) (kW)
  homeLoadKw:    number;         // Home load this hour (kW)
  netHomeGridKw: number;         // Grid needed for home after solar (kW)
  isOutage:      boolean;
  recommendation: string;        // From MADDPG
}

export interface DailyRecommendation {
  icon:     string;
  title:    string;
  detail:   string;
  priority: 'high' | 'medium' | 'low';
}

export interface DailyEstimation {
  cityName:        string;
  date:            string;
  evModelName:     string;
  evCapacityKwh:   number;
  hourlyPlan:      HourlyEstimate[];
  recommendations: DailyRecommendation[];
  summary: {
    totalCostRs:       number;   // total grid spend (EV + home)
    totalEarningsRs:   number;   // total V2G earnings
    netRs:             number;   // net financial position
    totalSolarKwh:     number;   // solar generated
    solarSelfUseKwh:   number;   // solar used in-house (not exported)
    gridPurchaseKwh:   number;   // total kWh bought from grid
    evEnergyKwh:       number;   // total energy charged into EV
    totalHomeCostRs:   number;   // what home load would cost on grid-only
    totalEVCostRs:     number;   // what EV charging cost on grid
    solarSavingsRs:    number;   // ₹ saved by using solar instead of grid
    peakSocHour:       number;
    peakSoc:           number;
    lowestSocHour:     number;
    lowestSoc:         number;
    v2gWindows:        string[];
    chargeWindows:     string[];
    outageWarnings:    string[];
    estimatedDailyKm:  number;   // based on driving actions
  };
}

// ─── Helper Functions ──────────────────────────────────────────────────────────

// TOU tariff — must match maddpg.ts exactly
const getTOURate = (hour: number): { buy: number; sell: number } => {
  if (hour >= 22 || hour < 6)  return { buy: 6.50, sell:  9.00 };
  if (hour >= 6  && hour < 9)  return { buy: 8.00, sell: 11.50 };
  if (hour >= 9  && hour < 17) return { buy: 7.50, sell: 12.00 };
  return                              { buy: 9.50, sell: 14.50 };
};

// Solar estimate — must match maddpg.ts BASE_SOLAR profile
// Returns kW output for 5 kWp rooftop system, cloud and temperature adjusted
const BASE_SOLAR_KW = [0,0,0,0,0,0.05,0.40,1.20,2.80,4.00,4.80,5.00,4.80,3.80,2.60,1.40,0.50,0.10,0,0,0,0,0,0];
const estimateSolarKw = (hour: number, cloudPct: number, tempC: number): number => {
  const base    = BASE_SOLAR_KW[hour] ?? 0;
  const cloudFx = 1 - (cloudPct / 100) * 0.82;
  const tempFx  = 1 - Math.max(0, (tempC - 25) * 0.004);
  return Math.max(0, base * cloudFx * tempFx);
};

// Home load baseline (kW) — average Indian household, same as maddpg.ts
const HOME_LOAD_KW = [0.7,0.5,0.5,0.4,0.5,0.7,1.1,1.4,1.7,1.9,2.3,2.8,3.2,3.0,2.8,2.6,2.4,2.7,3.3,2.9,2.4,2.0,1.4,0.9];

const formatHour = (h: number): string => {
  const ampm    = h < 12 ? 'AM' : 'PM';
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:00 ${ampm}`;
};

const ACTION_COLORS: Record<string, string> = {
  'Drive (Commute)':    '#EBCB8B',
  'Solar Charge':       '#A3BE8C',
  'Night Charge':       '#5E81AC',
  'V2G Export':         '#BF616A',
  'V2H (Outage)':       '#D08770',
  'Pre-Outage Charge':  '#88C0D0',
  'Grid Charge':        '#B48EAD',
  'Solar (Home Only)':  '#A3BE8C',
  'Outage (No Power)':  '#4C566A',
  'Idle':               '#4C566A',
};

// ─── Main Estimation Engine ────────────────────────────────────────────────────

export function generateDailyEstimation(inputs: DailyEstimationInputs): DailyEstimation {
  const {
    cityName, weatherTemp, cloudCoverPct,
    forecastTemps, forecastClouds, forecastDescriptions,
    evSoc, minRangeKm, evMaxRangeKm,
    evCapacityKwh, chargeRateKw, consumptionWhPerKm, v2gCapable,
    batterySoh, gridIsDown, outages, maddpgSchedule
  } = inputs;

  // SoH-adjusted usable capacity (what actually fits in the battery today)
  const usableCapKwh  = evCapacityKwh * (batterySoh / 100);
  // Reserve SoC threshold — must maintain this for range security
  const reserveSoc    = Math.min(95, ((minRangeKm + 40) / evMaxRangeKm) * 100);
  // Energy consumed per commute leg (Wh/km × km ÷ 1000 = kWh, then as SoC %)
  const commuteLegKm  = 30;  // one-way
  const commuteKwh    = (consumptionWhPerKm * commuteLegKm) / 1000;
  const commuteSocPp  = (commuteKwh / usableCapKwh) * 100;
  // Effective charge rate (SoH-derated)
  const effectiveChargeRateKw = chargeRateKw * (batterySoh / 100);

  const hourlyPlan:     HourlyEstimate[]      = [];
  const v2gWindows:     string[]              = [];
  const chargeWindows:  string[]              = [];
  const outageWarnings: string[]              = [];

  let evSocCurrent      = evSoc;
  let totalCostRs       = 0;
  let totalEarningsRs   = 0;
  let totalSolarKwh     = 0;
  let solarSelfUseKwh   = 0;
  let gridPurchaseKwh   = 0;
  let evEnergyKwh       = 0;
  let totalEVCostRs     = 0;
  let totalHomeCostRs   = 0;
  let solarSavingsRs    = 0;
  let estimatedDailyKm  = 0;

  let peakSoc      = evSocCurrent;
  let peakSocHour  = 0;
  let lowestSoc    = evSocCurrent;
  let lowestSocHour = 0;

  for (let hour = 0; hour < 24; hour++) {
    const mAction  = maddpgSchedule.actions[hour];
    const tempNow  = forecastTemps[hour]  ?? weatherTemp;
    const cloudNow = forecastClouds[hour] ?? cloudCoverPct;
    const solarKw  = estimateSolarKw(hour, cloudNow, tempNow);
    const homeLoad = HOME_LOAD_KW[hour] ?? 0.8;
    const tou      = getTOURate(hour);
    const isOutage = outages.some(o => hour >= o.startHour && hour < o.endHour);
    const mRec     = mAction?.recommendation ?? 'No MADDPG signal';

    // ── Net solar available after home load ────────────────────────────────
    // Solar first covers home load; surplus can charge EV or export
    const solarSurplusKw = Math.max(0, solarKw - homeLoad);
    const solarShortfallKw = Math.max(0, homeLoad - solarKw);

    let action     = 'Idle';
    let evPowerKw  = 0;           // + = charging, − = discharging
    let gridKw     = 0;           // + = grid import, − = V2G export
    let costRs     = 0;
    let earningRs  = 0;

    if (isOutage || gridIsDown) {
      // ── OUTAGE: EV acts as V2H backup ─────────────────────────────────
      if (v2gCapable && evSocCurrent > reserveSoc + 8) {
        const v2hRate = Math.min(3.0, homeLoad); // deliver what house needs, up to 3 kW
        action    = 'V2H (Outage)';
        evPowerKw = -v2hRate;
        // V2H avoids grid cost — save the grid price
        earningRs  = 0; // no earnings, but avoided cost (tracked in solarSavingsRs below)
      } else {
        action    = 'Outage (No Power)';
        evPowerKw = 0;
      }

    } else if (mAction) {
      switch (mAction.evAction) {

        case 'drive': {
          // ── DRIVING: energy consumed proportional to commute ────────────
          action    = 'Drive (Commute)';
          evPowerKw = -(commuteKwh);  // kWh consumed over this 1-hour window
          estimatedDailyKm += commuteLegKm;
          // Solar still generates during drive (car is away, but solar feeds home)
          gridKw = Math.max(0, homeLoad - solarKw);   // home grid import
          const homeGridKwh = gridKw * 1.0;
          costRs = homeGridKwh * tou.buy;
          totalHomeCostRs += costRs;
          gridPurchaseKwh += homeGridKwh;
          solarSavingsRs  += Math.min(solarKw, homeLoad) * 1.0 * tou.buy;
          break;
        }

        case 'charge': {
          const requestedChargeKw = effectiveChargeRateKw;
          const availableSolar    = solarSurplusKw;

          if (availableSolar >= requestedChargeKw) {
            // ── SOLAR CHARGE: solar fully covers EV charging ─────────────
            action    = 'Solar Charge';
            evPowerKw = requestedChargeKw;
            // Home already covered by remaining solar — no grid needed
            const solarUsedForEV = requestedChargeKw;
            solarSelfUseKwh += solarUsedForEV;
            solarSavingsRs  += solarUsedForEV * tou.buy;
            // Home shortfall from remaining solar
            const solarRemaining = solarKw - solarUsedForEV;
            const homeGridKwh    = Math.max(0, homeLoad - solarRemaining) * 1.0;
            costRs = homeGridKwh * tou.buy;
            totalHomeCostRs += costRs;
            gridPurchaseKwh += homeGridKwh;

          } else if (availableSolar > 0) {
            // ── PARTIAL SOLAR + GRID: solar helps, grid tops up ──────────
            action    = availableSolar > 0.3 ? 'Solar Charge' : (hour >= 22 || hour < 6) ? 'Night Charge' : 'Grid Charge';
            evPowerKw = requestedChargeKw;
            const solarForEV  = availableSolar;          // kW from solar to EV
            const gridForEV   = requestedChargeKw - solarForEV; // kW from grid to EV
            const homeGridKwh = solarShortfallKw * 1.0; // grid for home shortfall
            const evGridKwh   = gridForEV * 1.0;

            costRs = (homeGridKwh + evGridKwh) * tou.buy;
            solarSelfUseKwh += solarForEV * 1.0;
            solarSavingsRs  += solarForEV * 1.0 * tou.buy;
            gridPurchaseKwh += (homeGridKwh + evGridKwh);
            totalEVCostRs   += evGridKwh * tou.buy;
            totalHomeCostRs += homeGridKwh * tou.buy;

          } else {
            // ── GRID-ONLY CHARGE ─────────────────────────────────────────
            action    = (hour >= 22 || hour < 6) ? 'Night Charge' : 'Grid Charge';
            evPowerKw = requestedChargeKw;
            const evKwh   = requestedChargeKw * 1.0;
            const homeKwh = homeLoad * 1.0;
            costRs = (evKwh + homeKwh) * tou.buy;
            gridPurchaseKwh += evKwh + homeKwh;
            totalEVCostRs   += evKwh * tou.buy;
            totalHomeCostRs += homeKwh * tou.buy;
          }
          evEnergyKwh += evPowerKw * 1.0;
          gridKw = Math.max(0, homeLoad + evPowerKw - solarKw);
          break;
        }

        case 'discharge_v2g': {
          // ── V2G EXPORT: sell to grid at peak tariff ───────────────────
          if (!v2gCapable) {
            action    = 'Idle';
            evPowerKw = 0;
          } else {
            action    = 'V2G Export';
            const v2gPowerKw = Math.abs(mAction.evPowerKw);
            evPowerKw = -v2gPowerKw;
            gridKw    = -v2gPowerKw;  // negative = export
            earningRs = v2gPowerKw * 1.0 * tou.sell; // kWh × ₹/kWh
            // Home still uses grid for its load (solar may cover some)
            const homeGridKwh = solarShortfallKw * 1.0;
            costRs = homeGridKwh * tou.buy;
            totalHomeCostRs += costRs;
            gridPurchaseKwh += homeGridKwh;
          }
          break;
        }

        case 'discharge_v2h': {
          // ── V2H: EV powers home during scheduled outage ───────────────
          if (!v2gCapable) {
            action    = 'Idle';
            evPowerKw = 0;
          } else {
            action    = 'V2H (Outage)';
            const v2hRate = Math.min(3.0, homeLoad);
            evPowerKw  = -v2hRate;
            earningRs  = 0;
            solarSavingsRs += v2hRate * 1.0 * tou.buy; // avoided grid cost
          }
          break;
        }

        default: {
          // ── IDLE: EV not active, home uses solar + grid ────────────────
          action    = solarKw > 0.2 ? 'Solar (Home Only)' : 'Idle';
          evPowerKw = 0;
          const homeGridKwh = Math.max(0, homeLoad - solarKw) * 1.0;
          costRs = homeGridKwh * tou.buy;
          totalHomeCostRs += costRs;
          gridPurchaseKwh += homeGridKwh;
          solarSavingsRs  += Math.min(solarKw, homeLoad) * 1.0 * tou.buy;
          solarSelfUseKwh += Math.min(solarKw, homeLoad) * 1.0;
        }
      }
    }

    // ── SoC update (physics): SoC change = power (kWh) / capacity (kWh) × 100 ──
    const socDelta   = (evPowerKw / usableCapKwh) * 100;
    evSocCurrent     = Math.min(100, Math.max(0, evSocCurrent + socDelta));
    totalCostRs     += costRs;
    totalEarningsRs += earningRs;
    totalSolarKwh   += solarKw * 1.0;

    if (evSocCurrent > peakSoc)    { peakSoc = evSocCurrent; peakSocHour = hour; }
    if (evSocCurrent < lowestSoc)  { lowestSoc = evSocCurrent; lowestSocHour = hour; }

    if (action === 'V2G Export')                             v2gWindows.push(formatHour(hour));
    if (action === 'Night Charge' || action === 'Solar Charge' || action === 'Grid Charge')
      chargeWindows.push(formatHour(hour));

    hourlyPlan.push({
      hour,
      label:          formatHour(hour),
      action,
      actionColor:    ACTION_COLORS[action] || '#4C566A',
      estimatedSoc:   Math.round(evSocCurrent * 10) / 10,
      socDelta:       Math.round(socDelta * 10) / 10,
      costRs:         Math.round(costRs * 100) / 100,
      earningRs:      Math.round(earningRs * 100) / 100,
      solarKw:        Math.round(solarKw * 100) / 100,
      gridKw:         Math.round(Math.max(0, gridKw) * 100) / 100,
      evPowerKw:      Math.round(evPowerKw * 100) / 100,
      homeLoadKw:     Math.round(homeLoad * 100) / 100,
      netHomeGridKw:  Math.round(solarShortfallKw * 100) / 100,
      isOutage,
      recommendation: mRec,
    });
  }

  // Outage warnings
  outages.forEach(o => {
    outageWarnings.push(`⚠️ Outage in ${o.city}: ${o.startHour}:00–${o.endHour}:00 (${o.severity} severity)`);
  });

  // ─── Smart Recommendations ─────────────────────────────────────────────────
  const recommendations: DailyRecommendation[] = [];

  const hotDay   = weatherTemp > 35;
  const cloudyDay = cloudCoverPct > 70;
  const peakSolarClear = forecastClouds.slice(9, 15).reduce((a,b) => a+b, 0) / 6 < 40;

  if (peakSolarClear) {
    const peakSolarKwh = BASE_SOLAR_KW.slice(9, 16)
      .map(b => b * (1 - (cloudCoverPct/100) * 0.82))
      .reduce((a,b) => a+b, 0);
    recommendations.push({
      icon: '☀️',
      title: 'Solar Charging Window: 10 AM – 3 PM',
      detail: `Forecast clear sky will deliver ~${peakSolarKwh.toFixed(1)} kWh today. `
            + `Charge EV at ${effectiveChargeRateKw.toFixed(1)} kW during this window for maximum free energy.`,
      priority: 'high',
    });
  }

  if (cloudyDay) {
    recommendations.push({
      icon: '☁️',
      title: 'Cloudy — Shift Charging to Off-Peak (10 PM–6 AM)',
      detail: `${cloudCoverPct}% cloud cover limits solar to ~${
        (BASE_SOLAR_KW.slice(9,16).reduce((a,b)=>a+b,0) * (1-cloudCoverPct/100*0.82)).toFixed(1)
      } kWh. Night charging @ ₹6.50/kWh saves ₹${((chargeRateKw * 6 * (9.5-6.5)).toFixed(0))} vs evening peak.`,
      priority: 'medium',
    });
  }

  if (hotDay) {
    const tempStress = 1 + (weatherTemp - 25) * 0.028;
    recommendations.push({
      icon: '🌡️',
      title: `Extreme Heat ${weatherTemp.toFixed(0)}°C — Limit Charging to 80% SoC`,
      detail: `Temperature stress factor: ${tempStress.toFixed(2)}×. Charging above 80% at ${weatherTemp}°C `
            + `accelerates SEI growth (Schimpe et al. 2018). Park in shade, finish charging before 10 AM.`,
      priority: 'high',
    });
  }

  if (outages.length > 0) {
    const o = outages[0];
    const preChargeBy = o.startHour > 1 ? o.startHour - 1 : 23;
    const v2hCapacity = ((evSoc - reserveSoc) / 100) * usableCapKwh;
    const avgHomeLoadKw  = 2.0; // average home load for V2H duration estimate
    const v2hDurationH = v2hCapacity / Math.min(3.0, avgHomeLoadKw);
    recommendations.push({
      icon: '🔋',
      title: `Pre-charge to 90% Before ${o.startHour}:00 — Outage Ahead`,
      detail: `Outage ${o.startHour}:00–${o.endHour}:00. At current SoC=${evSoc.toFixed(0)}%, EV can power home for ~${v2hDurationH.toFixed(1)}h via V2H. `
            + `${v2gCapable ? 'V2H mode will activate automatically.' : 'Note: your EV model does not support V2H.'}`,
      priority: 'high',
    });
  }

  if (v2gWindows.length > 0 && v2gCapable) {
    const mEarnings = maddpgSchedule.totalEstimatedEarnings;
    recommendations.push({
      icon: '⚡',
      title: `V2G Revenue: ${v2gWindows.length} Export Windows Planned`,
      detail: `MADDPG scheduled V2G at ${v2gWindows.slice(0,3).join(', ')} (peak tariff ₹14.50/kWh). `
            + `Estimated earnings: ₹${mEarnings.toFixed(2)}. Ensure SoC ≥${reserveSoc.toFixed(0)}% before export.`,
      priority: 'medium',
    });
  } else if (!v2gCapable) {
    recommendations.push({
      icon: '📵',
      title: 'V2G Not Available on This Model',
      detail: 'Your selected EV does not support bidirectional charging. '
            + 'Consider upgrading to a V2G-capable model (BYD Seal, Nissan Leaf, Hyundai IONIQ 5) to earn ₹3,000–8,000/month.',
      priority: 'low',
    });
  }

  if (batterySoh < 85) {
    recommendations.push({
      icon: '🔧',
      title: `Battery SoH ${batterySoh.toFixed(1)}% — Gentle Charging Protocol`,
      detail: `Avoid charging above 80% SoC and discharging below 20%. `
            + `Degraded capacity: ${usableCapKwh.toFixed(1)} kWh (was ${inputs.evCapacityKwh} kWh). `
            + `Charge at slow rate (≤${(chargeRateKw * 0.5).toFixed(1)} kW) to reduce further stress.`,
      priority: 'medium',
    });
  }

  recommendations.push({
    icon: '🗓️',
    title: "Tomorrow's Forecast",
    detail: forecastDescriptions.length > 0
      ? `Tomorrow: ${forecastDescriptions[0]} (${forecastTemps[0]?.toFixed(0) ?? '?'}°C, `
        + `clouds: ${forecastClouds[0]?.toFixed(0) ?? '?'}%). Plan charging accordingly.`
      : 'Weather forecast unavailable. Defaulting to grid-charge strategy.',
    priority: 'low',
  });

  const today = new Date();

  return {
    cityName,
    date: today.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
    evModelName: '',   // filled in by page.tsx if desired
    evCapacityKwh: inputs.evCapacityKwh,
    hourlyPlan,
    recommendations,
    summary: {
      totalCostRs:      Math.round(totalCostRs * 100) / 100,
      totalEarningsRs:  Math.round(totalEarningsRs * 100) / 100,
      netRs:            Math.round((totalEarningsRs - totalCostRs) * 100) / 100,
      totalSolarKwh:    Math.round(totalSolarKwh * 10) / 10,
      solarSelfUseKwh:  Math.round(solarSelfUseKwh * 10) / 10,
      gridPurchaseKwh:  Math.round(gridPurchaseKwh * 10) / 10,
      evEnergyKwh:      Math.round(evEnergyKwh * 10) / 10,
      totalHomeCostRs:  Math.round(totalHomeCostRs * 100) / 100,
      totalEVCostRs:    Math.round(totalEVCostRs * 100) / 100,
      solarSavingsRs:   Math.round(solarSavingsRs * 100) / 100,
      peakSocHour,
      peakSoc:          Math.round(peakSoc * 10) / 10,
      lowestSocHour,
      lowestSoc:        Math.round(lowestSoc * 10) / 10,
      v2gWindows:       v2gWindows.slice(0, 8),
      chargeWindows:    chargeWindows.slice(0, 8),
      outageWarnings,
      estimatedDailyKm,
    },
  };
}
