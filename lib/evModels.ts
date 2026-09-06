/**
 * Global EV & PHEV Model Database — V2G / Bidirectional Capable Only
 *
 * ALL vehicles in this database support V2G (Vehicle-to-Grid), V2H (Vehicle-to-Home),
 * or confirmed bidirectional charging via ISO 15118, CHAdeMO V2G, or proprietary protocols.
 *
 * Sources:
 *   - ev-database.org (usable kWh, WLTP range, consumption Wh/km)
 *   - Manufacturer official spec sheets (Q3 2025)
 *   - SAE J3068 / CHAdeMO V2G certification lists
 *   - InsideEVs, Electrek V2G capability confirmations
 *
 * Degradation factors from: Naumann et al. (2020), Astaneh et al. (2021)
 *   LFP: 0.75× (slowest fade, BYD Blade Cell)
 *   NMC: 1.00× (baseline)
 *   NCA: 0.90× (Tesla-optimised thermal management)
 *   NMCA: 0.90× (next-gen NMC, improved Al-doping)
 */

export interface EVModel {
  id:                  string;
  brand:               string;
  model:               string;
  year:                number;
  region:              string;
  batteryKwh:          number;    // Usable (EV portion for PHEVs)
  rangeKm:             number;    // WLTP EV-only range
  chargeRateKw:        number;    // Max AC Level-2 charge rate (kW)
  dcChargeRateKw:      number;    // Max DC fast-charge rate (kW)
  v2gCapable:          boolean;   // True = bidirectional V2G/V2H confirmed
  v2gRateKw:           number;    // Max V2G discharge rate (kW)
  consumptionWhPerKm:  number;    // Real-world energy consumption
  chemistry:           'NMC' | 'LFP' | 'NCA' | 'NMCA';
  degradationFactor:   number;    // 1.0 = NMC baseline
  warrantyYears:       number;
  warrantyKm:          number;
  color:               string;    // Brand accent color for UI
  flag:                string;    // Region emoji flag
  isPHEV?:             boolean;   // True for plug-in hybrids
  totalRangeKm?:       number;    // PHEV total range (EV + ICE)
  v2gProtocol?:        string;    // e.g. 'ISO 15118', 'CHAdeMO V2G', 'Powershare'
}

export const EV_MODELS: EVModel[] = [

  // ═══════════════════════════════════════════════════════════════════
  // INDIA — All V2G confirmed
  // ═══════════════════════════════════════════════════════════════════
  {
    id: 'mg_windsor_ev',
    brand: 'MG', model: 'Windsor EV', year: 2024,
    region: 'India', batteryKwh: 38.0, rangeKm: 332,
    chargeRateKw: 6.6, dcChargeRateKw: 40,
    v2gCapable: true, v2gRateKw: 3.3,
    consumptionWhPerKm: 114, chemistry: 'LFP',
    degradationFactor: 0.75, warrantyYears: 8, warrantyKm: 150000,
    color: '#FF6600', flag: '🇮🇳',
    v2gProtocol: 'MG V2L/V2H (CHAdeMO)'
  },
  {
    id: 'hyundai_ioniq5',
    brand: 'Hyundai', model: 'IONIQ 5 AWD', year: 2024,
    region: 'India', batteryKwh: 72.6, rangeKm: 481,
    chargeRateKw: 11, dcChargeRateKw: 220,
    v2gCapable: true, v2gRateKw: 3.6,
    consumptionWhPerKm: 154, chemistry: 'NMC',
    degradationFactor: 0.90, warrantyYears: 8, warrantyKm: 160000,
    color: '#0F4C81', flag: '🇮🇳',
    v2gProtocol: 'ISO 15118 V2G (800V E-GMP)'
  },
  {
    id: 'hyundai_ioniq6',
    brand: 'Hyundai', model: 'IONIQ 6 RWD', year: 2024,
    region: 'India', batteryKwh: 77.4, rangeKm: 614,
    chargeRateKw: 11, dcChargeRateKw: 350,
    v2gCapable: true, v2gRateKw: 3.6,
    consumptionWhPerKm: 145, chemistry: 'NMC',
    degradationFactor: 0.90, warrantyYears: 8, warrantyKm: 160000,
    color: '#1B5FA4', flag: '🇮🇳',
    v2gProtocol: 'ISO 15118 V2G (800V E-GMP)'
  },
  {
    id: 'byd_seal_india',
    brand: 'BYD', model: 'Seal AWD (India)', year: 2024,
    region: 'India', batteryKwh: 82.56, rangeKm: 570,
    chargeRateKw: 11, dcChargeRateKw: 150,
    v2gCapable: true, v2gRateKw: 6.0,
    consumptionWhPerKm: 158, chemistry: 'LFP',
    degradationFactor: 0.75, warrantyYears: 8, warrantyKm: 150000,
    color: '#1DB954', flag: '🇮🇳',
    v2gProtocol: 'BYD DiLink V2G (Blade LFP)'
  },

  // ═══════════════════════════════════════════════════════════════════
  // USA — All V2G / V2H confirmed
  // ═══════════════════════════════════════════════════════════════════
  {
    id: 'ford_f150_lightning',
    brand: 'Ford', model: 'F-150 Lightning Ext Range', year: 2024,
    region: 'USA', batteryKwh: 131, rangeKm: 515,
    chargeRateKw: 19.2, dcChargeRateKw: 150,
    v2gCapable: true, v2gRateKw: 9.6,
    consumptionWhPerKm: 254, chemistry: 'NMC',
    degradationFactor: 1.0, warrantyYears: 8, warrantyKm: 160000,
    color: '#003087', flag: '🇺🇸',
    v2gProtocol: 'Ford Intelligent Backup Power (V2H/V2G)'
  },
  {
    id: 'tesla_cybertruck_dm',
    brand: 'Tesla', model: 'Cybertruck Dual Motor AWD', year: 2024,
    region: 'USA', batteryKwh: 123, rangeKm: 565,
    chargeRateKw: 11.5, dcChargeRateKw: 250,
    v2gCapable: true, v2gRateKw: 11.5,
    consumptionWhPerKm: 240, chemistry: 'NMC',
    degradationFactor: 0.90, warrantyYears: 8, warrantyKm: 192000,
    color: '#CC0000', flag: '🇺🇸',
    v2gProtocol: 'Tesla Powershare (V2H/V2G — 11.5 kW)'
  },
  {
    id: 'rivian_r1t',
    brand: 'Rivian', model: 'R1T Max Pack', year: 2024,
    region: 'USA', batteryKwh: 149, rangeKm: 515,
    chargeRateKw: 11.5, dcChargeRateKw: 220,
    v2gCapable: true, v2gRateKw: 7.2,
    consumptionWhPerKm: 289, chemistry: 'NMC',
    degradationFactor: 1.0, warrantyYears: 8, warrantyKm: 160000,
    color: '#00B140', flag: '🇺🇸',
    v2gProtocol: 'Rivian V2H (SAE J3068)'
  },
  {
    id: 'gmc_silverado_ev',
    brand: 'GMC', model: 'Silverado EV RST', year: 2024,
    region: 'USA', batteryKwh: 200, rangeKm: 724,
    chargeRateKw: 19.2, dcChargeRateKw: 350,
    v2gCapable: true, v2gRateKw: 10.2,
    consumptionWhPerKm: 276, chemistry: 'NMC',
    degradationFactor: 1.0, warrantyYears: 8, warrantyKm: 160000,
    color: '#C8102E', flag: '🇺🇸',
    v2gProtocol: 'GM Energy Intelligent Backup Power (V2H/V2G)'
  },

  // ═══════════════════════════════════════════════════════════════════
  // EUROPE — All V2G confirmed
  // ═══════════════════════════════════════════════════════════════════
  {
    id: 'volvo_ex90',
    brand: 'Volvo', model: 'EX90 Twin Motor', year: 2024,
    region: 'Europe', batteryKwh: 106, rangeKm: 625,
    chargeRateKw: 11, dcChargeRateKw: 250,
    v2gCapable: true, v2gRateKw: 11.0,
    consumptionWhPerKm: 175, chemistry: 'NMC',
    degradationFactor: 0.90, warrantyYears: 8, warrantyKm: 160000,
    color: '#002D62', flag: '🇸🇪',
    v2gProtocol: 'ISO 15118-20 V2G (800V)'
  },
  {
    id: 'polestar_3',
    brand: 'Polestar', model: '3 Long Range Dual Motor', year: 2024,
    region: 'Europe', batteryKwh: 111, rangeKm: 631,
    chargeRateKw: 11, dcChargeRateKw: 250,
    v2gCapable: true, v2gRateKw: 11.0,
    consumptionWhPerKm: 178, chemistry: 'NMC',
    degradationFactor: 0.90, warrantyYears: 8, warrantyKm: 160000,
    color: '#2D2D2D', flag: '🇸🇪',
    v2gProtocol: 'ISO 15118-20 V2G'
  },
  {
    id: 'bmw_ix_xdrive50',
    brand: 'BMW', model: 'iX xDrive50', year: 2024,
    region: 'Europe', batteryKwh: 105.2, rangeKm: 630,
    chargeRateKw: 11, dcChargeRateKw: 200,
    v2gCapable: true, v2gRateKw: 11.0,
    consumptionWhPerKm: 180, chemistry: 'NMCA',
    degradationFactor: 0.90, warrantyYears: 8, warrantyKm: 160000,
    color: '#1C69D4', flag: '🇩🇪',
    v2gProtocol: 'BMW V2H (ISO 15118-2)'
  },
  {
    id: 'renault_scenic_etech',
    brand: 'Renault', model: 'Scenic E-Tech 220hp', year: 2024,
    region: 'Europe', batteryKwh: 87, rangeKm: 620,
    chargeRateKw: 22, dcChargeRateKw: 150,
    v2gCapable: true, v2gRateKw: 11.0,
    consumptionWhPerKm: 155, chemistry: 'NMC',
    degradationFactor: 0.95, warrantyYears: 8, warrantyKm: 160000,
    color: '#EFDF00', flag: '🇫🇷',
    v2gProtocol: 'ISO 15118 V2G (via Wallbox Quasar 2)'
  },

  // ═══════════════════════════════════════════════════════════════════
  // CHINA — All V2G confirmed
  // ═══════════════════════════════════════════════════════════════════
  {
    id: 'byd_seal',
    brand: 'BYD', model: 'Seal AWD', year: 2024,
    region: 'China', batteryKwh: 82.56, rangeKm: 650,
    chargeRateKw: 11, dcChargeRateKw: 150,
    v2gCapable: true, v2gRateKw: 6.0,
    consumptionWhPerKm: 158, chemistry: 'LFP',
    degradationFactor: 0.75, warrantyYears: 8, warrantyKm: 150000,
    color: '#1DB954', flag: '🇨🇳',
    v2gProtocol: 'BYD DiLink V2G (Blade Cell LFP)'
  },
  {
    id: 'byd_han_ev',
    brand: 'BYD', model: 'Han EV', year: 2024,
    region: 'China', batteryKwh: 85.44, rangeKm: 715,
    chargeRateKw: 11, dcChargeRateKw: 120,
    v2gCapable: true, v2gRateKw: 6.0,
    consumptionWhPerKm: 145, chemistry: 'LFP',
    degradationFactor: 0.75, warrantyYears: 8, warrantyKm: 150000,
    color: '#008080', flag: '🇨🇳',
    v2gProtocol: 'BYD DiLink V2G (Blade Cell LFP)'
  },
  {
    id: 'byd_sealion7',
    brand: 'BYD', model: 'Sealion 7 AWD', year: 2024,
    region: 'China', batteryKwh: 82.56, rangeKm: 450,
    chargeRateKw: 11, dcChargeRateKw: 150,
    v2gCapable: true, v2gRateKw: 6.0,
    consumptionWhPerKm: 183, chemistry: 'LFP',
    degradationFactor: 0.75, warrantyYears: 8, warrantyKm: 150000,
    color: '#005BAC', flag: '🇨🇳',
    v2gProtocol: 'BYD DiLink V2G (Blade Cell LFP)'
  },
  {
    id: 'zeekr_001',
    brand: 'Zeekr', model: '001 Long Range', year: 2024,
    region: 'China', batteryKwh: 100, rangeKm: 580,
    chargeRateKw: 11, dcChargeRateKw: 200,
    v2gCapable: true, v2gRateKw: 7.4,
    consumptionWhPerKm: 172, chemistry: 'LFP',
    degradationFactor: 0.75, warrantyYears: 8, warrantyKm: 200000,
    color: '#4B0082', flag: '🇨🇳',
    v2gProtocol: 'ISO 15118 V2G (CATL Qilin LFP)'
  },

  // ═══════════════════════════════════════════════════════════════════
  // KOREA — All V2G confirmed (E-GMP platform)
  // ═══════════════════════════════════════════════════════════════════
  {
    id: 'kia_ev6_gt',
    brand: 'Kia', model: 'EV6 GT', year: 2024,
    region: 'Korea', batteryKwh: 77.4, rangeKm: 424,
    chargeRateKw: 11, dcChargeRateKw: 350,
    v2gCapable: true, v2gRateKw: 3.6,
    consumptionWhPerKm: 203, chemistry: 'NMC',
    degradationFactor: 0.90, warrantyYears: 8, warrantyKm: 160000,
    color: '#05141F', flag: '🇰🇷',
    v2gProtocol: 'ISO 15118 V2G (800V E-GMP)'
  },
  {
    id: 'kia_ev9_lr',
    brand: 'Kia', model: 'EV9 Long Range AWD', year: 2024,
    region: 'Korea', batteryKwh: 99.8, rangeKm: 541,
    chargeRateKw: 11, dcChargeRateKw: 350,
    v2gCapable: true, v2gRateKw: 3.6,
    consumptionWhPerKm: 185, chemistry: 'NMC',
    degradationFactor: 0.90, warrantyYears: 8, warrantyKm: 160000,
    color: '#7B3F00', flag: '🇰🇷',
    v2gProtocol: 'ISO 15118 V2G (800V E-GMP) + Wallbox Quasar 2'
  },

  // ═══════════════════════════════════════════════════════════════════
  // JAPAN — V2G pioneers via CHAdeMO V2G standard
  // ═══════════════════════════════════════════════════════════════════
  {
    id: 'nissan_leaf_plus',
    brand: 'Nissan', model: 'Leaf e+ 62kWh', year: 2024,
    region: 'Japan', batteryKwh: 62, rangeKm: 385,
    chargeRateKw: 6.6, dcChargeRateKw: 50,
    v2gCapable: true, v2gRateKw: 6.0,
    consumptionWhPerKm: 161, chemistry: 'NMC',
    degradationFactor: 1.05, warrantyYears: 8, warrantyKm: 160000,
    color: '#C3002F', flag: '🇯🇵',
    v2gProtocol: 'CHAdeMO V2G (first mass-market V2G standard)'
  },
  {
    // PHEV — battery kWh & rangeKm refer to EV-only mode
    id: 'mitsubishi_outlander_phev',
    brand: 'Mitsubishi', model: 'Outlander PHEV', year: 2024,
    region: 'Japan', batteryKwh: 17.0, rangeKm: 87,
    chargeRateKw: 6.6, dcChargeRateKw: 50,
    v2gCapable: true, v2gRateKw: 6.0,
    consumptionWhPerKm: 195, chemistry: 'NMC',
    degradationFactor: 1.0, warrantyYears: 8, warrantyKm: 160000,
    color: '#D2042D', flag: '🇯🇵',
    isPHEV: true, totalRangeKm: 680,
    v2gProtocol: 'CHAdeMO V2G (PHEV pioneer — rated 6 kW export)'
  },
];

// Default model — MG Windsor EV (India's first V2G-capable mass-market EV)
export const DEFAULT_EV = EV_MODELS.find(m => m.id === 'mg_windsor_ev')!;

// Chemistry-specific degradation info (Naumann 2020, Schimpe 2018)
export const CHEMISTRY_INFO: Record<string, { label: string; color: string; note: string }> = {
  NMC:  {
    label: 'NMC (Lithium Nickel Manganese Cobalt)',
    color: '#88C0D0',
    note:  'Balanced energy density & cycle life. Baseline degradation model (K_cycle=0.00025, α=1.08).'
  },
  LFP:  {
    label: 'LFP (Lithium Iron Phosphate — BYD Blade Cell)',
    color: '#A3BE8C',
    note:  '~25% longer cycle life than NMC. Thermally very stable. Safe to charge to 100% daily. Degradation factor 0.75×.'
  },
  NCA:  {
    label: 'NCA (Lithium Nickel Cobalt Aluminum — Tesla)',
    color: '#EBCB8B',
    note:  'Highest energy density. Tesla-specific thermal management reduces fade. Degradation factor 0.90×.'
  },
  NMCA: {
    label: 'NMCA (Next-gen NMC + Aluminium doping)',
    color: '#B48EAD',
    note:  'Improved Al-doping reduces thermal runaway risk vs NMC. Used in BMW iX. Degradation factor 0.90×.'
  },
};

export const REGIONS = [...new Set(EV_MODELS.map(m => m.region))];
