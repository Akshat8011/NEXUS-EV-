import { useState, useEffect, useCallback, useRef } from 'react';
import {
  computeDegradation, makeInitialDegradationState, DegradationState
} from '../lib/degradation';

const STORAGE_KEY  = 'nexusev_degradation_v2';
const HABITS_KEY   = 'nexusev_habits_v2';
const EV_ID_KEY    = 'nexusev_last_ev_id';

export interface HabitRecord {
  date: string;
  chargingStartSoc: number;
  chargingEndSoc: number;
  estimatedKm: number;
  temp: number;
  v2gSessionCount: number;
  peakSoc: number;
  // Cost breakdown: these must be EV-charging-only, not total house cost
  evChargingCostRs: number;    // grid cost attributed to EV charging
  v2gEarningsRs: number;       // earnings from V2G
  solarChargingKwh: number;    // free solar used to charge EV
  gridChargingKwh: number;     // paid grid used to charge EV
  // Legacy compat
  costRs?: number;
  earningsRs?: number;
}

/**
 * useDegradation — tracks battery SoH, FEC, and user habits.
 *
 * @param batteryKwh        The selected EV model's usable battery capacity (kWh).
 * @param chemistryFactor   Model-specific degradation multiplier (LFP=0.75, NMC=1.0, etc.)
 * @param evModelId         Unique ID of the EV model — if it changes, state resets.
 */
export function useDegradation(
  batteryKwh: number = 40.5,
  chemistryFactor: number = 1.0,
  evModelId: string = 'tata_nexon_ev_max'
) {
  const [state, setState] = useState<DegradationState>(() => {
    if (typeof window === 'undefined')
      return makeInitialDegradationState(batteryKwh, chemistryFactor);
    try {
      const lastEvId = localStorage.getItem(EV_ID_KEY);
      if (lastEvId !== evModelId) {
        // EV model changed — start fresh for this model
        return makeInitialDegradationState(batteryKwh, chemistryFactor);
      }
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return makeInitialDegradationState(batteryKwh, chemistryFactor);
      const parsed = JSON.parse(saved) as DegradationState;
      // Patch old states that lacked the new fields
      return {
        ...parsed,
        originalCapacityKwh: batteryKwh,
        capacityKwh: (parsed.soh / 100) * batteryKwh,
        chemistryFactor,
      };
    } catch {
      return makeInitialDegradationState(batteryKwh, chemistryFactor);
    }
  });

  const [habits, setHabits] = useState<HabitRecord[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem(HABITS_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  // Reset when EV model changes
  const prevModelId = useRef(evModelId);
  useEffect(() => {
    if (prevModelId.current !== evModelId) {
      prevModelId.current = evModelId;
      localStorage.setItem(EV_ID_KEY, evModelId);
      setState(makeInitialDegradationState(batteryKwh, chemistryFactor));
      setHabits([]);
    }
  }, [evModelId, batteryKwh, chemistryFactor]);

  // Persist
  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY,  JSON.stringify(state));
    localStorage.setItem(EV_ID_KEY,    evModelId);
  }, [state, evModelId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(HABITS_KEY, JSON.stringify(habits));
  }, [habits]);

  /**
   * recordChargeCycle — call once per simulated day.
   * socStart/socEnd: the EV SOC at start and end of the day's CHARGING session.
   * Not the driving socEnd — we want the charging DoD.
   */
  const recordChargeCycle = useCallback((
    socStart: number,
    socEnd: number,
    tempC: number,
    calendarDaysElapsed: number = 1
  ) => {
    setState(prev =>
      computeDegradation(prev, socStart, socEnd, tempC, calendarDaysElapsed, batteryKwh, chemistryFactor)
    );
  }, [batteryKwh, chemistryFactor]);

  const recordHabit = useCallback((record: HabitRecord) => {
    setHabits(prev => [...prev.slice(-29), record]);
  }, []);

  const resetDegradation = useCallback(() => {
    setState(makeInitialDegradationState(batteryKwh, chemistryFactor));
    setHabits([]);
  }, [batteryKwh, chemistryFactor]);

  // ─── Analytics computations ────────────────────────────────────────────────

  const totalKm        = habits.reduce((a, h) => a + h.estimatedKm, 0);
  const totalEVCost    = habits.reduce((a, h) => a + (h.evChargingCostRs ?? h.costRs ?? 0), 0);
  const totalV2GEarn   = habits.reduce((a, h) => a + (h.v2gEarningsRs ?? h.earningsRs ?? 0), 0);
  const totalSolarKwh  = habits.reduce((a, h) => a + (h.solarChargingKwh ?? 0), 0);
  const totalGridKwh   = habits.reduce((a, h) => a + (h.gridChargingKwh ?? 0), 0);

  // Realistic cost per km: electricity cost for EV charging ÷ km driven
  // This is separate from house load costs
  const costPerKm = totalKm > 0 ? totalEVCost / totalKm : 0;

  const habitAnalytics = {
    sessions:             habits.length,
    totalKm,
    totalEVCostRs:        Math.round(totalEVCost * 100) / 100,
    totalV2GEarningsRs:   Math.round(totalV2GEarn * 100) / 100,
    totalSolarChargingKwh: Math.round(totalSolarKwh * 10) / 10,
    totalGridChargingKwh:  Math.round(totalGridKwh * 10) / 10,
    // ₹ per km — uses only EV charging costs, not whole-house grid bill
    costPerKm:            Math.round(costPerKm * 100) / 100,
    avgChargingStartSoc:  habits.length > 0 ? habits.reduce((a, h) => a + h.chargingStartSoc, 0) / habits.length : 0,
    avgChargingEndSoc:    habits.length > 0 ? habits.reduce((a, h) => a + h.chargingEndSoc, 0) / habits.length : 0,
    totalV2gSessions:     habits.reduce((a, h) => a + h.v2gSessionCount, 0),
  };

  return { state, habits, habitAnalytics, recordChargeCycle, recordHabit, resetDegradation };
}
