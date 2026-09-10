// lib/weatherModel.ts
// Custom offline weather engine. No external API calls.
// Physics multipliers derived from real climate-energy literature.

export type WeatherConditionId =
  | 'sunny'
  | 'partly_cloudy'
  | 'overcast'
  | 'rainy'
  | 'thunderstorm'
  | 'windy'
  | 'foggy_cold'
  | 'hot_humid';

export interface WeatherPreset {
  id: WeatherConditionId;
  label: string;
  emoji: string;
  description: string;
  solarMultiplier: number;
  loadMultiplier: number;
  evEfficiencyMultiplier: number;
  outageChancePer120Min: number;
  temperatureC: number;
  cloudCoverPct: number;
  outageWarning: string | null;
}

export const WEATHER_PRESETS: Record<WeatherConditionId, WeatherPreset> = {
  sunny:         { id:'sunny',         label:'Sunny',         emoji:'☀️',    description:'Clear sky. Peak solar. Low demand.',              solarMultiplier:1.00, loadMultiplier:0.80, evEfficiencyMultiplier:1.00, outageChancePer120Min:0,    temperatureC:28, cloudCoverPct:5,   outageWarning: null },
  partly_cloudy: { id:'partly_cloudy', label:'Partly Cloudy', emoji:'⛅', description:'Mixed sun and cloud. Solar reduced by ~35%.',      solarMultiplier:0.65, loadMultiplier:0.90, evEfficiencyMultiplier:0.97, outageChancePer120Min:0,    temperatureC:25, cloudCoverPct:45,  outageWarning: null },
  overcast:      { id:'overcast',      label:'Overcast',      emoji:'☁️',  description:'Thick cloud. Solar at ~25% of clear-sky peak.',   solarMultiplier:0.25, loadMultiplier:1.00, evEfficiencyMultiplier:0.95, outageChancePer120Min:0.02, temperatureC:22, cloudCoverPct:85,  outageWarning: null },
  rainy:         { id:'rainy',         label:'Rainy',         emoji:'🌧️',   description:'Persistent rain. Minimal solar. Higher home load.', solarMultiplier:0.10, loadMultiplier:1.10, evEfficiencyMultiplier:0.88, outageChancePer120Min:0.05, temperatureC:19, cloudCoverPct:95,  outageWarning: 'Rainy: grid outage risk ~5% per 2hr window.' },
  thunderstorm:  { id:'thunderstorm',  label:'Thunderstorm',  emoji:'⛈️',  description:'Severe storm. Near-zero solar. Grid highly unstable.',  solarMultiplier:0.05, loadMultiplier:1.30, evEfficiencyMultiplier:0.80, outageChancePer120Min:0.25, temperatureC:17, cloudCoverPct:100, outageWarning: 'THUNDERSTORM: High outage risk. Enable EV V2H backup now.' },
  windy:         { id:'windy',         label:'Windy',         emoji:'🌬️',   description:'Strong winds. EV aerodynamic drag increases energy use.',  solarMultiplier:0.70, loadMultiplier:1.05, evEfficiencyMultiplier:0.90, outageChancePer120Min:0.03, temperatureC:20, cloudCoverPct:30,  outageWarning: 'High winds may cause brief grid fluctuations.' },
  foggy_cold:    { id:'foggy_cold',    label:'Foggy / Cold',  emoji:'🌫️',    description:'Dense fog and cold. Heavy heating. EV battery ~18% worse.',  solarMultiplier:0.15, loadMultiplier:1.40, evEfficiencyMultiplier:0.82, outageChancePer120Min:0.01, temperatureC:8,  cloudCoverPct:90,  outageWarning: null },
  hot_humid:     { id:'hot_humid',     label:'Hot and Humid', emoji:'🥵',    description:'Extreme heat. AC drives home load to 150%.',          solarMultiplier:0.85, loadMultiplier:1.50, evEfficiencyMultiplier:0.85, outageChancePer120Min:0,    temperatureC:40, cloudCoverPct:20,  outageWarning: 'Extreme heat: EV efficiency reduced. Avoid peak-hour charging.' },
};

export const WEATHER_CONDITION_IDS: WeatherConditionId[] = [
  'sunny', 'partly_cloudy', 'overcast', 'rainy',
  'thunderstorm', 'windy', 'foggy_cold', 'hot_humid',
];

export const DEFAULT_14_DAY_SCHEDULE: WeatherConditionId[] = [
  'sunny', 'partly_cloudy', 'sunny', 'overcast', 'rainy',
  'thunderstorm', 'overcast', 'sunny', 'windy', 'partly_cloudy',
  'hot_humid', 'hot_humid', 'foggy_cold', 'rainy',
];

export function getWeatherForDay(
  dayNumber: number,
  userOverrides: Partial<Record<number, WeatherConditionId>>
): WeatherPreset {
  const override = userOverrides[dayNumber];
  if (override) return WEATHER_PRESETS[override];
  const idx = (dayNumber - 1) % DEFAULT_14_DAY_SCHEDULE.length;
  return WEATHER_PRESETS[DEFAULT_14_DAY_SCHEDULE[idx]];
}