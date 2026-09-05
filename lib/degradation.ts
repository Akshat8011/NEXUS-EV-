/**
 * Battery Degradation Model
 *
 * References:
 * - Naumann et al. (2020) "Calendar and cycle aging of lithium-ion batteries"
 * - Schimpe et al. (2018) "Comprehensive Modeling of Temperature-Dependent Aging"
 * - Wikner & Thiringer (2018) "Understanding Battery Degradation"
 * - BYD Blade (LFP) and NMC empirical curves from public EV battery research
 *
 * Chemistry-specific degradation factors applied via degradationFactor (from EVModel):
 *   LFP  → factor 0.75 (excellent longevity, cycle-stable)
 *   NMC  → factor 1.00 (baseline)
 *   NCA  → factor 0.90 (slightly better than NMC at moderate temps)
 *   NMCA → factor 0.95
 */

export interface DegradationState {
  soh: number;               // State of Health (%) — 100% = new
  fec: number;               // Full Equivalent Cycles completed
  calendarDays: number;      // Days since battery first use
  capacityKwh: number;       // Actual usable capacity in kWh (SoH-adjusted)
  originalCapacityKwh: number; // The EV model's nominal usable capacity
  estimatedLifetimeKm: number; // Remaining km before SoH < 80% (EOL)
  degradationRate: number;   // % SoH loss per 1000 FEC
  temperatureStress: number; // 1.0 = ideal 25°C, higher = more stress
  chemistryFactor: number;   // model-specific degradation multiplier
  cycleHistory: CycleEvent[];
}

export interface CycleEvent {
  session: number;
  fecAdded: number;
  socStart: number;
  socEnd: number;
  temp: number;
  dod: number;
  stressMultiplier: number;
}

// DoD stress factor — from Wikner & Thiringer (2018)
// Deeper discharges exponentially increase wear
const getDoDStressFactor = (dod: number): number => {
  if (dod <= 5)  return 0.15;
  if (dod <= 10) return 0.30;
  if (dod <= 20) return 0.50;
  if (dod <= 40) return 0.70;
  if (dod <= 60) return 0.90;
  if (dod <= 80) return 1.00; // baseline
  if (dod <= 90) return 1.40;
  return 1.80; // >90% DoD — significant wear
};

// Temperature stress: Arrhenius model, Ea ≈ 30 kJ/mol for NMC
// LFP has higher thermal tolerance; apply via chemistryFactor instead
const getTempStressFactor = (tempC: number): number => {
  const deviation = Math.abs(tempC - 25);
  if (deviation <= 3)  return 1.00;
  if (deviation <= 8)  return 1.08;
  if (deviation <= 15) return 1.20;
  if (deviation <= 25) return 1.45;
  return 1.90;
};

// SoC storage stress — chronically high SoC accelerates SEI growth
const getSoCStorageStress = (avgSoC: number): number => {
  if (avgSoC > 95) return 1.45;
  if (avgSoC > 90) return 1.15;
  if (avgSoC > 80) return 1.00;
  if (avgSoC > 50) return 0.85;
  return 0.90;
};

/**
 * Compute a new degradation state after one charge/discharge session.
 *
 * @param state            Current degradation state
 * @param socStart         SoC (%) at start of the session (lower = discharged)
 * @param socEnd           SoC (%) at end of the session (higher = charged)
 * @param temperatureC     Ambient temperature during session
 * @param calendarDaysElapsed  Days elapsed since last update (usually 1 per sim day)
 * @param originalCapacityKwh  The EV model's nominal usable battery capacity (kWh)
 * @param chemistryFactor  Model-specific factor: LFP=0.75, NMC=1.0, NCA=0.9 etc.
 */
export function computeDegradation(
  state: DegradationState,
  socStart: number,
  socEnd: number,
  temperatureC: number,
  calendarDaysElapsed: number,
  originalCapacityKwh: number,
  chemistryFactor: number = 1.0
): DegradationState {
  const dod    = Math.abs(socEnd - socStart);
  const avgSoC = (socStart + socEnd) / 2;

  const dodStress  = getDoDStressFactor(dod);
  const tempStress = getTempStressFactor(temperatureC);
  const socStress  = getSoCStorageStress(avgSoC);
  const stressMultiplier = dodStress * tempStress * socStress * chemistryFactor;

  // FEC: DoD=100% = 1 full cycle; DoD=50% = 0.5 cycles (Ah throughput basis)
  const fecAdded = (dod / 100) * stressMultiplier;
  const newFec   = state.fec + fecAdded;

  // Cycle fade — empirical NMC model (Naumann 2020, Eq. 5)
  // SoH_cycle(FEC) = 100 − k_c × FEC^α  where k_c=0.00025, α=1.08
  const K_CYCLE = 0.00025;
  const ALPHA   = 1.08;
  const cycleFade = K_CYCLE * Math.pow(newFec, ALPHA);

  // Calendar fade — SEI diffusion-limited growth: ∝ √(t)
  // ~2.5% capacity loss per year at 25°C for NMC
  const newCalendarDays = state.calendarDays + calendarDaysElapsed;
  const K_CAL = 0.0070; // tuned to ~2.5% loss/year at 25°C
  const calendarFade = K_CAL * Math.sqrt(newCalendarDays * tempStress);

  // Total SoH — floor at 60% (practical battery end of life)
  const newSoH     = Math.max(60, 100 - cycleFade - calendarFade);
  const newCapacity = (newSoH / 100) * originalCapacityKwh;

  // Remaining km to EOL (SoH = 80%)
  // Invert cycleFade formula: FEC_EOL = ((20 − calendarFade) / K_CYCLE)^(1/ALPHA)
  const remainingFade = Math.max(0, 20 - calendarFade); // must lose 20% SoH to reach EOL
  const fecAtEOL     = remainingFade > 0 ? Math.pow(remainingFade / K_CYCLE, 1 / ALPHA) : 0;
  const remainingFec = Math.max(0, fecAtEOL - newFec);

  // km per FEC = capacity(kWh) × 1000 / consumption(Wh/km)
  // Use 180 Wh/km as a reasonable representative average across models
  const WH_PER_KM        = 180;
  const kmPerFec         = (originalCapacityKwh * 1000) / WH_PER_KM;
  const estimatedLifetimeKm = Math.round(remainingFec * kmPerFec);

  const sessionRecord: CycleEvent = {
    session: state.cycleHistory.length + 1,
    fecAdded: Math.round(fecAdded * 1000) / 1000,
    socStart, socEnd, temp: temperatureC, dod,
    stressMultiplier: Math.round(stressMultiplier * 100) / 100,
  };

  // degradationRate = % SoH lost per 1000 FEC so far
  const degradationRate = newFec > 0
    ? Math.round((cycleFade / newFec) * 1000 * 100) / 100
    : 0;

  return {
    soh:                  Math.round(newSoH * 100) / 100,
    fec:                  Math.round(newFec * 100) / 100,
    calendarDays:         newCalendarDays,
    capacityKwh:          Math.round(newCapacity * 100) / 100,
    originalCapacityKwh,
    estimatedLifetimeKm,
    degradationRate,
    temperatureStress:    Math.round(tempStress * 100) / 100,
    chemistryFactor,
    cycleHistory:         [...state.cycleHistory.slice(-49), sessionRecord],
  };
}

/**
 * Generate a degradation projection curve for the Analytics chart.
 * Returns (km, soh, capacityKwh) points from 0 to totalKmTarget.
 */
export function generateDegradationCurve(
  initialSoH: number,
  avgTemp: number,
  avgDod: number,
  totalKmTarget: number = 300000,
  originalCapacity: number = 40.5,  // default = Nexon EV Max
  chemistryFactor: number = 1.0,
  consumptionWhPerKm: number = 180
): { km: number; soh: number; capacityKwh: number }[] {
  const kmPerFec          = (originalCapacity * 1000) / consumptionWhPerKm;
  const tempStress        = getTempStressFactor(avgTemp);
  const dodStress         = getDoDStressFactor(avgDod);
  const calendarDaysPerKm = 365 / 15000; // assume 15,000 km/year driving

  const K_CYCLE = 0.00025;
  const ALPHA   = 1.08;
  const K_CAL   = 0.0070;

  const points: { km: number; soh: number; capacityKwh: number }[] = [];

  for (let km = 0; km <= totalKmTarget; km += 5000) {
    const fec     = (km / kmPerFec) * dodStress * tempStress * chemistryFactor;
    const calDays = km * calendarDaysPerKm;
    const cycleFade  = K_CYCLE * Math.pow(Math.max(0, fec), ALPHA);
    const calFade    = K_CAL * Math.sqrt(calDays * tempStress);
    const soh        = Math.max(60, initialSoH - cycleFade - calFade);
    const cap        = (soh / 100) * originalCapacity;
    points.push({
      km,
      soh:         Math.round(soh * 10) / 10,
      capacityKwh: Math.round(cap * 10) / 10,
    });
  }
  return points;
}

/** Build an initial DegradationState for a specific EV model. */
export function makeInitialDegradationState(
  originalCapacityKwh: number,
  chemistryFactor: number = 1.0
): DegradationState {
  return {
    soh: 100,
    fec: 0,
    calendarDays: 0,
    capacityKwh: originalCapacityKwh,
    originalCapacityKwh,
    estimatedLifetimeKm: Math.round((originalCapacityKwh * 1000 / 180) * Math.pow(20 / 0.00025, 1 / 1.08)),
    degradationRate: 0,
    temperatureStress: 1.0,
    chemistryFactor,
    cycleHistory: [],
  };
}

// Keep for backward compatibility
export const INITIAL_DEGRADATION_STATE = makeInitialDegradationState(40.5, 1.0);
