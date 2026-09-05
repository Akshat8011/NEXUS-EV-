/**
 * Daily Estimation Engine
 * 
 * Generates a 24-hour smart energy plan factoring ALL live variables:
 * - Real-time weather (temperature, clouds → solar output)
 * - 5-day forecast (plan for tomorrow)
 * - Grid conditions (outages, time-of-use pricing)
 * - EV buffer range setting (user preference)
 * - MADDPG schedule output
 * - Battery State of Health
 * - User driving habits
 */

import { MADDPGSchedule, OutageWindow } from './maddpg';

export interface DailyEstimationInputs {
  cityName: string;
  weatherTemp: number;
  cloudCoverPct: number;
  forecastTemps: number[];
  forecastClouds: number[];
  forecastDescriptions: string[];
  evSoc: number;
  homeBatterySoc: number;
  minRangeKm: number;
  evMaxRangeKm: number;
  batterySoh: number;
  gridIsDown: boolean;
  outages: OutageWindow[];
  maddpgSchedule: MADDPGSchedule;
}

export interface HourlyEstimate {
  hour: number;
  label: string;          // "6:00 AM"
  action: string;         // "Solar Charge", "V2G Export", "Night Charge", etc.
  actionColor: string;    // Hex color for chart
  estimatedSoc: number;   // EV SoC at end of this hour
  costRs: number;         // ₹ cost (positive = spend)
  earningRs: number;      // ₹ earned (positive = earn)
  solarKw: number;
  gridKw: number;
  isOutage: boolean;
}

export interface DailyRecommendation {
  icon: string;
  title: string;
  detail: string;
  priority: 'high' | 'medium' | 'low';
}

export interface DailyEstimation {
  cityName: string;
  date: string;
  hourlyPlan: HourlyEstimate[];
  recommendations: DailyRecommendation[];
  summary: {
    totalCostRs: number;
    totalEarningsRs: number;
    netRs: number;
    totalSolarKwh: number;
    peakSocHour: number;
    peakSoc: number;
    lowestSocHour: number;
    lowestSoc: number;
    v2gWindows: string[];
    chargeWindows: string[];
    outageWarnings: string[];
  };
}

const getTOURate = (hour: number) => {
  if (hour >= 22 || hour < 6)  return { buy: 6.5,  sell: 10.0 };
  if (hour >= 6  && hour < 9)  return { buy: 8.5,  sell: 12.5 };
  if (hour >= 9  && hour < 17) return { buy: 7.5,  sell: 13.5 };
  return { buy: 9.5, sell: 15.0 };
};

const estimateSolar = (hour: number, clouds: number, temp: number): number => {
  const base = [0,0,0,0,0,0.1,0.8,2.0,4.5,6.0,8.0,10.0,9.5,8.0,6.0,4.0,2.0,0.5,0,0,0,0,0,0][hour] || 0;
  return base * (1 - (clouds/100)*0.8) * (1 - Math.max(0,(temp-25)*0.004)) * 0.5;
};

const formatHour = (h: number) => {
  const ampm = h < 12 ? 'AM' : 'PM';
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
  'Idle':               '#4C566A',
};

export function generateDailyEstimation(inputs: DailyEstimationInputs): DailyEstimation {
  const {
    cityName, weatherTemp, cloudCoverPct, forecastTemps, forecastClouds, forecastDescriptions,
    evSoc, minRangeKm, evMaxRangeKm, batterySoh, outages, maddpgSchedule
  } = inputs;

  const hourlyPlan: HourlyEstimate[] = [];
  const v2gWindows: string[] = [];
  const chargeWindows: string[] = [];
  const outageWarnings: string[] = [];

  let evSocCurrent = evSoc;
  let totalCost = 0;
  let totalEarnings = 0;
  let totalSolar = 0;
  let peakSoc = evSoc;
  let peakSocHour = 0;
  let lowestSoc = evSoc;
  let lowestSocHour = 0;

  const evCapKwh = 79.0 * (batterySoh / 100);
  const requiredSoc = ((minRangeKm + 50) / evMaxRangeKm) * 100;

  for (let hour = 0; hour < 24; hour++) {
    const mAction = maddpgSchedule.actions[hour];
    const temp = forecastTemps[hour] ?? weatherTemp;
    const clouds = forecastClouds[hour] ?? cloudCoverPct;
    const solarKw = estimateSolar(hour, clouds, temp);
    const tou = getTOURate(hour);
    const isOutage = outages.some(o => hour >= o.startHour && hour < o.endHour);

    let action = 'Idle';
    let evPower = 0;
    let gridKw = 0;
    let costRs = 0;
    let earningRs = 0;

    if (isOutage) {
      if (evSocCurrent > requiredSoc + 5) {
        action = 'V2H (Outage)';
        evPower = -3.0;
      } else {
        action = 'Outage (No Power)';
      }
    } else if (mAction) {
      switch (mAction.evAction) {
        case 'drive':
          action = 'Drive (Commute)';
          evPower = mAction.evPowerKw;
          break;
        case 'charge':
          if (solarKw > 1.0) {
            action = 'Solar Charge';
            evPower = Math.min(mAction.evPowerKw, solarKw);
          } else if (hour >= 22 || hour < 6) {
            action = 'Night Charge';
            evPower = mAction.evPowerKw;
            gridKw = evPower;
            costRs = gridKw * tou.buy / 100;
          } else {
            action = 'Grid Charge';
            evPower = mAction.evPowerKw;
            gridKw = evPower;
            costRs = gridKw * tou.buy / 100;
          }
          break;
        case 'discharge_v2g':
          action = 'V2G Export';
          evPower = mAction.evPowerKw;
          earningRs = Math.abs(evPower) * tou.sell / 100;
          break;
        case 'discharge_v2h':
          action = 'V2H (Outage)';
          evPower = mAction.evPowerKw;
          break;
        default:
          action = solarKw > 0.5 ? 'Solar (Home)' : 'Idle';
      }
    }

    // Update SoC
    const socDelta = (evPower / evCapKwh) * 100;
    evSocCurrent = Math.min(100, Math.max(0, evSocCurrent + socDelta));
    totalCost += costRs;
    totalEarnings += earningRs;
    totalSolar += solarKw;

    if (evSocCurrent > peakSoc) { peakSoc = evSocCurrent; peakSocHour = hour; }
    if (evSocCurrent < lowestSoc) { lowestSoc = evSocCurrent; lowestSocHour = hour; }

    if (action === 'V2G Export') v2gWindows.push(formatHour(hour));
    if (action === 'Night Charge' || action === 'Solar Charge') chargeWindows.push(formatHour(hour));

    hourlyPlan.push({
      hour,
      label: formatHour(hour),
      action,
      actionColor: ACTION_COLORS[action] || '#4C566A',
      estimatedSoc: Math.round(evSocCurrent * 10) / 10,
      costRs: Math.round(costRs * 100) / 100,
      earningRs: Math.round(earningRs * 100) / 100,
      solarKw: Math.round(solarKw * 100) / 100,
      gridKw: Math.round(gridKw * 100) / 100,
      isOutage,
    });
  }

  // Build outage warnings
  outages.forEach(o => {
    outageWarnings.push(`⚠️ Outage in ${o.city}: ${o.startHour}:00–${o.endHour}:00 (${o.severity} severity)`);
  });

  // Build smart recommendations
  const recommendations: DailyRecommendation[] = [];

  const hotDay = weatherTemp > 35;
  const cloudyDay = cloudCoverPct > 70;
  const peakSolar = forecastClouds.slice(9, 15).reduce((a,b) => a+b, 0) / 6 < 40;

  if (peakSolar) {
    recommendations.push({
      icon: '☀️',
      title: 'Solar Charging Opportunity',
      detail: `Good solar forecast today (${Math.round(100-cloudCoverPct)}% clear). Charge between 10 AM–2 PM for free energy.`,
      priority: 'high'
    });
  }

  if (cloudyDay) {
    recommendations.push({
      icon: '☁️',
      title: 'Cloudy Day — Rely on Night Charge',
      detail: `High cloud cover (${cloudCoverPct}%) will limit solar output. Schedule most charging after 10 PM for cheapest rates.`,
      priority: 'medium'
    });
  }

  if (hotDay) {
    recommendations.push({
      icon: '🌡️',
      title: 'Extreme Heat — Protect Battery',
      detail: `${weatherTemp}°C detected. Avoid charging above 90% SoC and park in shade. Battery degradation is 1.7× faster today.`,
      priority: 'high'
    });
  }

  if (outages.length > 0) {
    const o = outages[0];
    const preChargeBy = o.startHour > 1 ? o.startHour - 1 : 23;
    recommendations.push({
      icon: '🔋',
      title: 'Grid Outage — Pre-charge Immediately',
      detail: `Outage expected ${o.startHour}:00–${o.endHour}:00. Charge EV to ≥90% by ${preChargeBy}:00. V2H mode activates automatically.`,
      priority: 'high'
    });
  }

  if (v2gWindows.length > 2) {
    const estEarnings = maddpgSchedule.totalEstimatedEarnings;
    recommendations.push({
      icon: '⚡',
      title: 'V2G Revenue Opportunity',
      detail: `MADDPG identified ${v2gWindows.length} V2G export windows (${v2gWindows.slice(0,3).join(', ')}). Estimated earnings: ₹${estEarnings}.`,
      priority: 'medium'
    });
  }

  if (batterySoh < 85) {
    recommendations.push({
      icon: '🔧',
      title: 'Battery Degradation Notice',
      detail: `Battery SoH is ${batterySoh.toFixed(1)}%. Avoid charging to 100% or depleting below 20% to slow further degradation.`,
      priority: 'medium'
    });
  }

  recommendations.push({
    icon: '🗓️',
    title: 'Tomorrow\'s Forecast',
    detail: forecastDescriptions.length > 0
      ? `Tomorrow: ${forecastDescriptions[0]} (${forecastTemps[0]?.toFixed(0) ?? '?'}°C). Adjust charging plan accordingly.`
      : 'Check the 5-day forecast for planning ahead.',
    priority: 'low'
  });

  const today = new Date();
  return {
    cityName,
    date: today.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
    hourlyPlan,
    recommendations,
    summary: {
      totalCostRs: Math.round(totalCost * 100) / 100,
      totalEarningsRs: Math.round(totalEarnings * 100) / 100,
      netRs: Math.round((totalEarnings - totalCost) * 100) / 100,
      totalSolarKwh: Math.round(totalSolar * 10) / 10,
      peakSocHour,
      peakSoc: Math.round(peakSoc * 10) / 10,
      lowestSocHour,
      lowestSoc: Math.round(lowestSoc * 10) / 10,
      v2gWindows: v2gWindows.slice(0, 6),
      chargeWindows: chargeWindows.slice(0, 6),
      outageWarnings,
    },
  };
}
