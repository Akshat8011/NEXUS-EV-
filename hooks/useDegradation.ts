import { useState, useEffect, useCallback } from 'react';
import { computeDegradation, INITIAL_DEGRADATION_STATE, DegradationState } from '../lib/degradation';

const STORAGE_KEY = 'nexusev_degradation';
const HABITS_KEY = 'nexusev_habits';

export interface HabitRecord {
  date: string;
  chargingStartSoc: number;
  chargingEndSoc: number;
  estimatedKm: number;
  temp: number;
  v2gSessionCount: number;
  peakSoc: number;
  costRs: number;
  earningsRs: number;
}

export function useDegradation() {
  const [state, setState] = useState<DegradationState>(() => {
    if (typeof window === 'undefined') return INITIAL_DEGRADATION_STATE;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : INITIAL_DEGRADATION_STATE;
    } catch { return INITIAL_DEGRADATION_STATE; }
  });

  const [habits, setHabits] = useState<HabitRecord[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem(HABITS_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  // Persist to localStorage whenever state changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(HABITS_KEY, JSON.stringify(habits));
  }, [habits]);

  // Call this at end of each simulation run to record a charge cycle
  const recordChargeCycle = useCallback((
    socStart: number,
    socEnd: number,
    tempC: number,
    calendarDaysElapsed: number = 1
  ) => {
    setState(prev => computeDegradation(prev, socStart, socEnd, tempC, calendarDaysElapsed));
  }, []);

  // Record a full daily simulation habit snapshot
  const recordHabit = useCallback((record: HabitRecord) => {
    setHabits(prev => {
      const updated = [...prev.slice(-29), record]; // keep last 30 sessions
      return updated;
    });
  }, []);

  const resetDegradation = useCallback(() => {
    setState(INITIAL_DEGRADATION_STATE);
  }, []);

  // Computed habit analytics
  const habitAnalytics = {
    avgChargingStartSoc: habits.length > 0 ? habits.reduce((a,h) => a + h.chargingStartSoc, 0) / habits.length : 0,
    avgChargingEndSoc: habits.length > 0 ? habits.reduce((a,h) => a + h.chargingEndSoc, 0) / habits.length : 0,
    totalKm: habits.reduce((a,h) => a + h.estimatedKm, 0),
    totalV2gSessions: habits.reduce((a,h) => a + h.v2gSessionCount, 0),
    totalEarningsRs: habits.reduce((a,h) => a + h.earningsRs, 0),
    totalCostRs: habits.reduce((a,h) => a + h.costRs, 0),
    costPerKm: habits.reduce((a,h) => a + h.estimatedKm, 0) > 0
      ? habits.reduce((a,h) => a + h.costRs, 0) / habits.reduce((a,h) => a + h.estimatedKm, 0)
      : 0,
    sessions: habits.length,
  };

  return { state, habits, habitAnalytics, recordChargeCycle, recordHabit, resetDegradation };
}
