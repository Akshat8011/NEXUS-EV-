/**
 * Global EV & PHEV Model Database — V2G / Bidirectional Capable Only
 *
 * ALL vehicles in this database have VERIFIED V2G (Vehicle-to-Grid) or V2H (Vehicle-to-Home)
 * capabilities. Vehicles that only support V2L (Vehicle-to-Load / powering appliances) 
 * such as the MG Windsor EV, BYD Seal, or BMW iX have been strictly excluded.
 *
 * Sources:
 *   - Manufacturer official V2G/V2H press releases (GM Energy, Ford Backup Power, Mobilize)
 *   - SAE J3068 / CHAdeMO V2G certification lists
 *   - VW SW 3.5+ release notes (DC V2H support)
 *
 * Degradation factors from: Naumann et al. (2020), Astaneh et al. (2021)
 */

export interface EVModel {
  id:                  string;
  brand:               string;
  model:               string;
  year:                number;
  region:              string;
  batteryKwh:          number;    // Usable capacity
  rangeKm:             number;    // WLTP / EPA EV-only range
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
  v2gProtocol?:        string;    // Specific bidirectional hardware/software ecosystem
}

export const EV_MODELS: EVModel[] = [

  // ═══════════════════════════════════════════════════════════════════
  // USA — GM Energy, Ford Backup Power, Tesla Powershare
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
    id: 'gmc_silverado_ev',
    brand: 'Chevrolet', model: 'Silverado EV RST', year: 2024,
    region: 'USA', batteryKwh: 200, rangeKm: 724,
    chargeRateKw: 19.2, dcChargeRateKw: 350,
    v2gCapable: true, v2gRateKw: 10.2,
    consumptionWhPerKm: 276, chemistry: 'NMC',
    degradationFactor: 1.0, warrantyYears: 8, warrantyKm: 160000,
    color: '#C8102E', flag: '🇺🇸',
    v2gProtocol: 'GM Energy (Ultium V2H)'
  },
  {
    id: 'chevrolet_blazer_ev',
    brand: 'Chevrolet', model: 'Blazer EV RS', year: 2024,
    region: 'USA', batteryKwh: 85, rangeKm: 449,
    chargeRateKw: 11.5, dcChargeRateKw: 150,
    v2gCapable: true, v2gRateKw: 9.6,
    consumptionWhPerKm: 189, chemistry: 'NMC',
    degradationFactor: 1.0, warrantyYears: 8, warrantyKm: 160000,
    color: '#F2A900', flag: '🇺🇸',
    v2gProtocol: 'GM Energy (Ultium V2H)'
  },
  {
    id: 'honda_prologue',
    brand: 'Honda', model: 'Prologue Elite', year: 2024,
    region: 'USA', batteryKwh: 85, rangeKm: 439,
    chargeRateKw: 11.5, dcChargeRateKw: 155,
    v2gCapable: true, v2gRateKw: 9.6,
    consumptionWhPerKm: 193, chemistry: 'NMC',
    degradationFactor: 1.0, warrantyYears: 8, warrantyKm: 160000,
    color: '#E4002B', flag: '🇺🇸',
    v2gProtocol: 'GM Energy (Ultium Platform V2H)'
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
    v2gProtocol: 'Tesla Powershare (V2H/V2G)'
  },
  {
    id: 'lucid_air_gt',
    brand: 'Lucid', model: 'Air Grand Touring', year: 2024,
    region: 'USA', batteryKwh: 112, rangeKm: 830,
    chargeRateKw: 19.2, dcChargeRateKw: 300,
    v2gCapable: true, v2gRateKw: 9.6,
    consumptionWhPerKm: 135, chemistry: 'NMC',
    degradationFactor: 0.95, warrantyYears: 8, warrantyKm: 160000,
    color: '#000000', flag: '🇺🇸',
    v2gProtocol: 'Lucid Range Exchange (V2H)'
  },
  {
    id: 'rivian_r1t',
    brand: 'Rivian', model: 'R1T Max Pack', year: 2024,
    region: 'USA', batteryKwh: 149, rangeKm: 643,
    chargeRateKw: 11.5, dcChargeRateKw: 220,
    v2gCapable: true, v2gRateKw: 7.2,
    consumptionWhPerKm: 289, chemistry: 'NMC',
    degradationFactor: 1.0, warrantyYears: 8, warrantyKm: 160000,
    color: '#00B140', flag: '🇺🇸',
    v2gProtocol: 'Rivian V2H (SAE J3068 via OTA)'
  },

  // ═══════════════════════════════════════════════════════════════════
  // EUROPE — VW MEB Software 3.5+ and Renault Mobilize
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
    v2gProtocol: 'ISO 15118-20 V2G'
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
    id: 'renault_5_etech',
    brand: 'Renault', model: '5 E-Tech 52kWh', year: 2024,
    region: 'Europe', batteryKwh: 52, rangeKm: 400,
    chargeRateKw: 11, dcChargeRateKw: 100,
    v2gCapable: true, v2gRateKw: 11.0,
    consumptionWhPerKm: 130, chemistry: 'NMC',
    degradationFactor: 1.0, warrantyYears: 8, warrantyKm: 160000,
    color: '#EFDF00', flag: '🇫🇷',
    v2gProtocol: 'Mobilize V2G (Onboard Bidirectional AC)'
  },
  {
    id: 'renault_scenic_etech',
    brand: 'Renault', model: 'Scenic E-Tech 87kWh', year: 2024,
    region: 'Europe', batteryKwh: 87, rangeKm: 620,
    chargeRateKw: 22, dcChargeRateKw: 150,
    v2gCapable: true, v2gRateKw: 11.0,
    consumptionWhPerKm: 155, chemistry: 'NMC',
    degradationFactor: 0.95, warrantyYears: 8, warrantyKm: 160000,
    color: '#EFDF00', flag: '🇫🇷',
    v2gProtocol: 'Mobilize V2G (Onboard Bidirectional AC)'
  },
  {
    id: 'vw_id4_pro',
    brand: 'Volkswagen', model: 'ID.4 Pro', year: 2024,
    region: 'Europe', batteryKwh: 77, rangeKm: 550,
    chargeRateKw: 11, dcChargeRateKw: 135,
    v2gCapable: true, v2gRateKw: 10.0,
    consumptionWhPerKm: 167, chemistry: 'NMC',
    degradationFactor: 0.95, warrantyYears: 8, warrantyKm: 160000,
    color: '#009DE0', flag: '🇩🇪',
    v2gProtocol: 'VW DC V2H (Requires SW 3.5+ & E3/DC Home Station)'
  },
  {
    id: 'vw_id_buzz',
    brand: 'Volkswagen', model: 'ID.Buzz Pro', year: 2024,
    region: 'Europe', batteryKwh: 77, rangeKm: 415,
    chargeRateKw: 11, dcChargeRateKw: 170,
    v2gCapable: true, v2gRateKw: 10.0,
    consumptionWhPerKm: 208, chemistry: 'NMC',
    degradationFactor: 0.95, warrantyYears: 8, warrantyKm: 160000,
    color: '#009DE0', flag: '🇩🇪',
    v2gProtocol: 'VW DC V2H (Requires SW 3.5+ & E3/DC Home Station)'
  },
  {
    id: 'skoda_enyaq_85',
    brand: 'Skoda', model: 'Enyaq 85', year: 2024,
    region: 'Europe', batteryKwh: 77, rangeKm: 560,
    chargeRateKw: 11, dcChargeRateKw: 135,
    v2gCapable: true, v2gRateKw: 10.0,
    consumptionWhPerKm: 155, chemistry: 'NMC',
    degradationFactor: 0.95, warrantyYears: 8, warrantyKm: 160000,
    color: '#4BA82E', flag: '🇨🇿',
    v2gProtocol: 'VW MEB DC V2H (Requires SW 3.5+)'
  },
  {
    id: 'cupra_born',
    brand: 'Cupra', model: 'Born 77kWh', year: 2024,
    region: 'Europe', batteryKwh: 77, rangeKm: 550,
    chargeRateKw: 11, dcChargeRateKw: 170,
    v2gCapable: true, v2gRateKw: 10.0,
    consumptionWhPerKm: 158, chemistry: 'NMC',
    degradationFactor: 0.95, warrantyYears: 8, warrantyKm: 160000,
    color: '#B3A18F', flag: '🇪🇸',
    v2gProtocol: 'VW MEB DC V2H (Requires SW 3.5+)'
  },

  // ═══════════════════════════════════════════════════════════════════
  // ASIA — E-GMP Quasar 2 and CHAdeMO Pioneers
  // ═══════════════════════════════════════════════════════════════════
  {
    id: 'hyundai_ioniq5',
    brand: 'Hyundai', model: 'IONIQ 5 AWD', year: 2024,
    region: 'Korea', batteryKwh: 77.4, rangeKm: 481,
    chargeRateKw: 11, dcChargeRateKw: 220,
    v2gCapable: true, v2gRateKw: 7.4,
    consumptionWhPerKm: 170, chemistry: 'NMC',
    degradationFactor: 0.90, warrantyYears: 8, warrantyKm: 160000,
    color: '#0F4C81', flag: '🇰🇷',
    v2gProtocol: 'E-GMP V2H (via Wallbox Quasar 2)'
  },
  {
    id: 'kia_ev9_lr',
    brand: 'Kia', model: 'EV9 Long Range AWD', year: 2024,
    region: 'Korea', batteryKwh: 99.8, rangeKm: 541,
    chargeRateKw: 11, dcChargeRateKw: 350,
    v2gCapable: true, v2gRateKw: 7.4,
    consumptionWhPerKm: 185, chemistry: 'NMC',
    degradationFactor: 0.90, warrantyYears: 8, warrantyKm: 160000,
    color: '#7B3F00', flag: '🇰🇷',
    v2gProtocol: 'E-GMP V2H (via Wallbox Quasar 2)'
  },
  {
    id: 'nissan_leaf_plus',
    brand: 'Nissan', model: 'Leaf e+ 62kWh', year: 2024,
    region: 'Japan', batteryKwh: 62, rangeKm: 385,
    chargeRateKw: 6.6, dcChargeRateKw: 100,
    v2gCapable: true, v2gRateKw: 6.0,
    consumptionWhPerKm: 161, chemistry: 'NMC',
    degradationFactor: 1.05, warrantyYears: 8, warrantyKm: 160000,
    color: '#C3002F', flag: '🇯🇵',
    v2gProtocol: 'CHAdeMO V2G (The original V2G standard)'
  },
  {
    id: 'mitsubishi_outlander_phev',
    brand: 'Mitsubishi', model: 'Outlander PHEV', year: 2024,
    region: 'Japan', batteryKwh: 20.0, rangeKm: 61,
    chargeRateKw: 6.6, dcChargeRateKw: 50,
    v2gCapable: true, v2gRateKw: 6.0,
    consumptionWhPerKm: 220, chemistry: 'NMC',
    degradationFactor: 1.0, warrantyYears: 8, warrantyKm: 160000,
    color: '#D2042D', flag: '🇯🇵',
    isPHEV: true, totalRangeKm: 675,
    v2gProtocol: 'CHAdeMO V2H (V2G capable)'
  },
  {
    id: 'mitsubishi_eclipse_cross_phev',
    brand: 'Mitsubishi', model: 'Eclipse Cross PHEV', year: 2024,
    region: 'Japan', batteryKwh: 13.8, rangeKm: 55,
    chargeRateKw: 3.7, dcChargeRateKw: 22,
    v2gCapable: true, v2gRateKw: 6.0,
    consumptionWhPerKm: 210, chemistry: 'NMC',
    degradationFactor: 1.0, warrantyYears: 8, warrantyKm: 160000,
    color: '#D2042D', flag: '🇯🇵',
    isPHEV: true, totalRangeKm: 650,
    v2gProtocol: 'CHAdeMO V2H'
  }
];

// Default model — Nissan Leaf (Universally verified V2G capabilities globally)
export const DEFAULT_EV = EV_MODELS.find(m => m.id === 'nissan_leaf_plus')!;

// Chemistry-specific degradation info
export const CHEMISTRY_INFO: Record<string, { label: string; color: string; note: string }> = {
  NMC:  {
    label: 'NMC (Lithium Nickel Manganese Cobalt)',
    color: '#88C0D0',
    note:  'Balanced energy density & cycle life. Baseline degradation model (K_cycle=0.00025, α=1.08).'
  },
  LFP:  {
    label: 'LFP (Lithium Iron Phosphate)',
    color: '#A3BE8C',
    note:  '~25% longer cycle life than NMC. Safe to charge to 100% daily. Degradation factor 0.75×.'
  },
  NCA:  {
    label: 'NCA (Lithium Nickel Cobalt Aluminum)',
    color: '#EBCB8B',
    note:  'Highest energy density. Thermal management reduces fade. Degradation factor 0.90×.'
  },
  NMCA: {
    label: 'NMCA (Next-gen NMC + Aluminium doping)',
    color: '#B48EAD',
    note:  'Improved Al-doping reduces thermal runaway risk vs standard NMC. Degradation factor 0.90×.'
  },
};

export const REGIONS = [...new Set(EV_MODELS.map(m => m.region))];
