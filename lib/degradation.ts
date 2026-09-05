/**
 * Battery Degradation Model
 * 
 * Based on research:
 * - Naumann et al. (2020) "Calendar and cycle aging of lithium-ion batteries"
 * - Schimpe et al. (2018) "Comprehensive Modeling of Temperature-Dependent Aging"
 * - Tesla Semi / BYD Blade empirical degradation curves (public domain)
 * - SEI (Solid Electrolyte Interphase) growth kinetic model
 * 
 * Model: NMC lithium-ion chemistry (typical for modern EVs like Nexon EV, Atto 3)
 */

export interface DegradationState {
  soh: number;                    // State of Health (%) — 100% = new
  fec: number;                    // Full Equivalent Cycles completed
  calendarDays: number;           // Days since battery first use
  capacityKwh: number;            // Actual usable capacity in kWh
  estimatedLifetimeKm: number;    // Remaining km before SoH < 80%
  degradationRate: number;        // % per 1000 km
  temperatureStress: number;      // 1.0 = normal, >1.0 = accelerated
  cycleHistory: CycleEvent[];
}

export interface CycleEvent {
  session: number;
  fecAdded: number;
  socStart: number;
  socEnd: number;
  temp: number;
  dod: number;                    // Depth of Discharge
  stressMultiplier: number;
}

// DoD stress factor — deeper discharges cause more wear
// From Wikner & Thiringer (2018): "Understanding Battery Degradation"
const getDoDStressFactor = (dod: number): number => {
  // DoD (0-100%) → stress multiplier
  if (dod < 10) return 0.2;
  if (dod < 20) return 0.4;
  if (dod < 40) return 0.6;
  if (dod < 60) return 0.8;
  if (dod < 80) return 1.0;
  if (dod < 90) return 1.5;
  return 2.0; // >90% DoD is very damaging
};

// Temperature stress factor for charging
// Based on Arrhenius equation — activation energy Ea ≈ 30 kJ/mol for NMC
const getTempStressFactor = (tempC: number): number => {
  const optimalTemp = 25; // °C
  const deviation = Math.abs(tempC - optimalTemp);
  if (deviation < 5) return 1.0;
  if (deviation < 10) return 1.1;
  if (deviation < 20) return 1.3;
  if (deviation < 30) return 1.7;
  return 2.2; // extreme temps
};

// High SoC storage stress — keeping battery above 90% accelerates calendar aging
const getSoCStorageStress = (avgSoC: number): number => {
  if (avgSoC > 95) return 1.5;
  if (avgSoC > 90) return 1.2;
  if (avgSoC > 80) return 1.0;
  if (avgSoC > 50) return 0.85; // ideal storage range
  return 0.9;
};

export function computeDegradation(
  state: DegradationState,
  chargingSessionSocStart: number,
  chargingSessionSocEnd: number,
  temperatureC: number,
  calendarDaysElapsed: number,
  originalCapacityKwh: number = 79.0
): DegradationState {
  const dod = Math.abs(chargingSessionSocEnd - chargingSessionSocStart);
  const avgSoC = (chargingSessionSocStart + chargingSessionSocEnd) / 2;

  const dodStress = getDoDStressFactor(dod);
  const tempStress = getTempStressFactor(temperatureC);
  const socStress = getSoCStorageStress(avgSoC);

  const stressMultiplier = dodStress * tempStress * socStress;

  // FEC contribution of this session
  // A full cycle = 0→100→0, so a session with DoD=50% = 0.5 FEC
  const fecAdded = (dod / 100) * stressMultiplier;
  const newFec = state.fec + fecAdded;

  // Cycle capacity fade: empirical NMC model
  // SoH_cycle = 100 - 0.0003 × FEC^1.1 (slightly superlinear)
  const cycleFade = 0.0003 * Math.pow(newFec, 1.1);

  // Calendar fade: SEI growth ∝ √(calendar days) (diffusion-limited)
  // Based on Naumann (2020): ~3% fade per year at 25°C
  const newCalendarDays = state.calendarDays + calendarDaysElapsed;
  const calendarFade = 0.008 * Math.sqrt(newCalendarDays * tempStress);

  const newSoH = Math.max(60, 100 - cycleFade - calendarFade);
  const newCapacity = (newSoH / 100) * originalCapacityKwh;

  // Remaining km estimation: assuming 80% SoH as end-of-life
  // and ~200 Wh/km typical consumption
  const fecAtEOL = ((100 - 80 - calendarFade) / 0.0003) ** (1/1.1);
  const remainingFec = Math.max(0, fecAtEOL - newFec);
  const estimatedLifetimeKm = remainingFec * (originalCapacityKwh / 0.2); // 200 Wh/km

  const sessionRecord: CycleEvent = {
    session: state.cycleHistory.length + 1,
    fecAdded: Math.round(fecAdded * 1000) / 1000,
    socStart: chargingSessionSocStart,
    socEnd: chargingSessionSocEnd,
    temp: temperatureC,
    dod,
    stressMultiplier: Math.round(stressMultiplier * 100) / 100,
  };

  return {
    soh: Math.round(newSoH * 100) / 100,
    fec: Math.round(newFec * 10) / 10,
    calendarDays: newCalendarDays,
    capacityKwh: Math.round(newCapacity * 100) / 100,
    estimatedLifetimeKm: Math.round(estimatedLifetimeKm),
    degradationRate: Math.round((cycleFade / newFec) * 1000 * 100) / 100, // % per 1000 FEC
    temperatureStress: Math.round(tempStress * 100) / 100,
    cycleHistory: [...state.cycleHistory.slice(-49), sessionRecord], // Keep last 50 events
  };
}

// Generate a degradation projection curve (for charting)
export function generateDegradationCurve(
  initialSoH: number,
  avgTemp: number,
  avgDod: number,
  totalKmTarget: number = 300000,
  originalCapacity: number = 79.0
): { km: number; soh: number; capacityKwh: number }[] {
  const wh_per_km = 200; // 200 Wh/km
  const kmPerFec = originalCapacity * 1000 / wh_per_km; // ~395 km per full cycle
  const tempStress = getTempStressFactor(avgTemp);
  const dodStress = getDoDStressFactor(avgDod);
  const calendarDaysPerKm = 365 / 15000; // assuming 15,000 km/year

  const points: { km: number; soh: number; capacityKwh: number }[] = [];
  
  for (let km = 0; km <= totalKmTarget; km += 10000) {
    const fec = (km / kmPerFec) * dodStress * tempStress;
    const calDays = km * calendarDaysPerKm;
    const cycleFade = 0.0003 * Math.pow(fec, 1.1);
    const calFade = 0.008 * Math.sqrt(calDays * tempStress);
    const soh = Math.max(60, initialSoH - cycleFade - calFade);
    const cap = (soh / 100) * originalCapacity;
    points.push({
      km,
      soh: Math.round(soh * 10) / 10,
      capacityKwh: Math.round(cap * 10) / 10,
    });
  }
  return points;
}

export const INITIAL_DEGRADATION_STATE: DegradationState = {
  soh: 100,
  fec: 0,
  calendarDays: 0,
  capacityKwh: 79.0,
  estimatedLifetimeKm: 300000,
  degradationRate: 0,
  temperatureStress: 1.0,
  cycleHistory: [],
};
