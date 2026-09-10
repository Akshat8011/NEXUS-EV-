'use client';
import { useState } from 'react';
import {
  WeatherConditionId, WeatherPreset,
  WEATHER_PRESETS, WEATHER_CONDITION_IDS, getWeatherForDay,
} from '../../lib/weatherModel';

interface Props {
  dayNumber: number;
  overrides: Partial<Record<number, WeatherConditionId>>;
  onChange: (overrides: Partial<Record<number, WeatherConditionId>>) => void;
  totalDaysToShow?: number;
}

const CONDITION_CHIPS: { id: WeatherConditionId; preset: WeatherPreset }[] =
  WEATHER_CONDITION_IDS.map(id => ({ id, preset: WEATHER_PRESETS[id] }));

export default function WeatherPlannerPanel({
  dayNumber, overrides, onChange, totalDaysToShow = 14,
}: Props) {
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);

  const setDayWeather = (day: number, conditionId: WeatherConditionId) => {
    onChange({ ...overrides, [day]: conditionId });
    setHoveredDay(null);
  };

  const resetDay = (day: number) => {
    const next = { ...overrides };
    delete next[day];
    onChange(next);
    setHoveredDay(null);
  };

  const todayPreset = getWeatherForDay(dayNumber, overrides);

  return (
    <div className="flex flex-col gap-3 text-xs">
      {/* Current day condition chips legend */}
      <div className="flex flex-wrap gap-1 justify-center">
        {CONDITION_CHIPS.map(({ id, preset }) => (
          <button
            key={id}
            title={preset.description}
            onClick={() => setDayWeather(dayNumber, id)}
            className={`px-1.5 py-0.5 rounded border text-[10px] transition-colors cursor-pointer select-none
              ${todayPreset.id === id
                ? 'border-yellow-400 bg-yellow-900/30 text-yellow-300 font-bold'
                : 'border-gray-600 bg-root text-gray-400 hover:border-gray-400 hover:text-gray-200'}`}
          >
            {preset.emoji} {preset.label}
          </button>
        ))}
      </div>

      {/* Today stats bar */}
      <div className="grid grid-cols-3 gap-1 border border-gray-700 rounded p-2 bg-root/30">
        <div className="text-center">
          <div className="text-gray-500 text-[9px]">Solar Yield</div>
          <div className="text-yellow-400 font-bold text-sm">{(todayPreset.solarMultiplier * 100).toFixed(0)}%</div>
        </div>
        <div className="text-center">
          <div className="text-gray-500 text-[9px]">Home Load</div>
          <div className="text-orange-400 font-bold text-sm">{(todayPreset.loadMultiplier * 100).toFixed(0)}%</div>
        </div>
        <div className="text-center">
          <div className="text-gray-500 text-[9px]">EV Efficiency</div>
          <div className="text-green-400 font-bold text-sm">{(todayPreset.evEfficiencyMultiplier * 100).toFixed(0)}%</div>
        </div>
      </div>

      {/* Outage warning */}
      {todayPreset.outageWarning && (
        <div className="text-[10px] leading-snug px-2 py-1.5 rounded border border-red-700 bg-red-950/40 text-red-400 font-medium">
          {todayPreset.outageWarning}
        </div>
      )}

      {/* 14-day grid */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: totalDaysToShow }, (_, i) => i + 1).map(day => {
          const preset = getWeatherForDay(day, overrides);
          const isOverridden = overrides[day] !== undefined;
          const isCurrent = day === dayNumber;
          const isPast = day < dayNumber;

          return (
            <div
              key={day}
              onMouseEnter={() => !isPast && setHoveredDay(day)}
              onMouseLeave={() => setHoveredDay(null)}
              className={`
                relative flex flex-col items-center rounded p-1 border transition-all
                ${isCurrent ? 'border-yellow-400 bg-yellow-900/20 ring-1 ring-yellow-400' : ''}
                ${isPast ? 'border-gray-700 opacity-40 cursor-default' : 'border-gray-600 hover:border-gray-300 cursor-pointer bg-root'}
                ${isOverridden && !isCurrent ? 'ring-1 ring-blue-500' : ''}
              `}
            >
              <span className="text-[8px] text-gray-500 font-bold">D{day}</span>
              <span className="text-sm leading-none mt-0.5">{preset.emoji}</span>
              <span className="text-[7px] text-gray-500 leading-tight text-center mt-0.5 truncate w-full text-center">
                {preset.label.split(' ')[0].split('/')[0]}
              </span>

              {/* Hover dropdown */}
              {hoveredDay === day && !isPast && (
                <div
                  className="absolute top-full left-1/2 -translate-x-1/2 z-50 mt-1 bg-gray-900 border border-gray-600 rounded shadow-2xl min-w-[160px] py-1"
                  onMouseEnter={() => setHoveredDay(day)}
                  onMouseLeave={() => setHoveredDay(null)}
                >
                  <div className="text-[10px] text-gray-400 px-3 py-1 border-b border-gray-700 font-bold">
                    Day {day} — Set Weather
                  </div>
                  {CONDITION_CHIPS.map(({ id, preset: p }) => (
                    <button
                      key={id}
                      onClick={() => setDayWeather(day, id)}
                      className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-gray-700 transition-colors
                        ${preset.id === id ? 'text-yellow-300 font-bold' : 'text-gray-200'}`}
                    >
                      <span>{p.emoji}</span>
                      <span>{p.label}</span>
                      <span className="ml-auto text-gray-500 text-[9px]">{(p.solarMultiplier*100).toFixed(0)}% sun</span>
                    </button>
                  ))}
                  {isOverridden && (
                    <button
                      onClick={() => resetDay(day)}
                      className="w-full text-left px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-700 border-t border-gray-700 transition-colors"
                    >
                      Reset to default schedule
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="text-[9px] text-gray-600 text-center">
        Click a chip above to set today · Hover any day to change it individually
        · Blue border = manually set · Yellow = today · Cycles every 14 days by default
      </div>
    </div>
  );
}
