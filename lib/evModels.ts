/**
 * Global EV Model Database
 * Real-world specifications sourced from manufacturer datasheets and public EV databases
 * Sources: EV Database (ev-database.org), InsideEVs, manufacturer spec sheets
 */

export interface EVModel {
  id: string;
  brand: string;
  model: string;
  year: number;
  region: string;           // Market region
  batteryKwh: number;       // Usable battery capacity
  rangeKm: number;          // WLTP range
  chargeRateKw: number;     // Max AC charge rate
  dcChargeRateKw: number;   // Max DC fast charge rate
  v2gCapable: boolean;
  consumptionWhPerKm: number; // Real-world consumption
  chemistry: 'NMC' | 'LFP' | 'NCA' | 'NMCA';
  // Degradation model parameters (from Astaneh et al. 2021, Saxena et al. 2015)
  degradationFactor: number;   // 1.0 = standard, <1 = better (LFP), >1 = worse
  warrantyYears: number;
  warrantyKm: number;
  color: string;             // Brand color for UI
  flag: string;              // Emoji flag for region
}

export const EV_MODELS: EVModel[] = [
  // === INDIA ===
  {
    id: 'tata_nexon_ev_max',
    brand: 'Tata', model: 'Nexon EV Max', year: 2023,
    region: 'India', batteryKwh: 40.5, rangeKm: 437,
    chargeRateKw: 7.2, dcChargeRateKw: 50, v2gCapable: false,
    consumptionWhPerKm: 93, chemistry: 'NMC',
    degradationFactor: 1.0, warrantyYears: 8, warrantyKm: 160000,
    color: '#1A73E8', flag: '🇮🇳'
  },
  {
    id: 'tata_punch_ev',
    brand: 'Tata', model: 'Punch EV', year: 2024,
    region: 'India', batteryKwh: 35, rangeKm: 421,
    chargeRateKw: 7.2, dcChargeRateKw: 50, v2gCapable: false,
    consumptionWhPerKm: 83, chemistry: 'LFP',
    degradationFactor: 0.75, warrantyYears: 8, warrantyKm: 160000,
    color: '#EA4335', flag: '🇮🇳'
  },
  {
    id: 'mg_windsor_ev',
    brand: 'MG', model: 'Windsor EV', year: 2024,
    region: 'India', batteryKwh: 38, rangeKm: 332,
    chargeRateKw: 6.6, dcChargeRateKw: 40, v2gCapable: true,
    consumptionWhPerKm: 114, chemistry: 'LFP',
    degradationFactor: 0.75, warrantyYears: 8, warrantyKm: 150000,
    color: '#FF6600', flag: '🇮🇳'
  },
  {
    id: 'byd_atto3',
    brand: 'BYD', model: 'Atto 3', year: 2024,
    region: 'India', batteryKwh: 60.48, rangeKm: 521,
    chargeRateKw: 7, dcChargeRateKw: 80, v2gCapable: false,
    consumptionWhPerKm: 116, chemistry: 'LFP',
    degradationFactor: 0.75, warrantyYears: 8, warrantyKm: 150000,
    color: '#1DB954', flag: '🇮🇳'
  },
  {
    id: 'hyundai_ioniq5',
    brand: 'Hyundai', model: 'IONIQ 5', year: 2024,
    region: 'India', batteryKwh: 72.6, rangeKm: 631,
    chargeRateKw: 11, dcChargeRateKw: 220, v2gCapable: true,
    consumptionWhPerKm: 154, chemistry: 'NMC',
    degradationFactor: 0.9, warrantyYears: 8, warrantyKm: 160000,
    color: '#0F4C81', flag: '🇮🇳'
  },
  // === USA ===
  {
    id: 'tesla_model3_lr',
    brand: 'Tesla', model: 'Model 3 Long Range', year: 2024,
    region: 'USA', batteryKwh: 78.1, rangeKm: 629,
    chargeRateKw: 11.5, dcChargeRateKw: 250, v2gCapable: false,
    consumptionWhPerKm: 143, chemistry: 'NMC',
    degradationFactor: 0.85, warrantyYears: 8, warrantyKm: 192000,
    color: '#CC0000', flag: '🇺🇸'
  },
  {
    id: 'tesla_model_y_perf',
    brand: 'Tesla', model: 'Model Y Performance', year: 2024,
    region: 'USA', batteryKwh: 82, rangeKm: 514,
    chargeRateKw: 11.5, dcChargeRateKw: 250, v2gCapable: false,
    consumptionWhPerKm: 175, chemistry: 'NCA',
    degradationFactor: 0.9, warrantyYears: 8, warrantyKm: 192000,
    color: '#CC0000', flag: '🇺🇸'
  },
  {
    id: 'chevrolet_bolt_euv',
    brand: 'Chevrolet', model: 'Bolt EUV', year: 2024,
    region: 'USA', batteryKwh: 65, rangeKm: 397,
    chargeRateKw: 11, dcChargeRateKw: 55, v2gCapable: false,
    consumptionWhPerKm: 164, chemistry: 'NMC',
    degradationFactor: 1.0, warrantyYears: 8, warrantyKm: 160000,
    color: '#F2A900', flag: '🇺🇸'
  },
  {
    id: 'ford_mustang_mache',
    brand: 'Ford', model: 'Mustang Mach-E', year: 2024,
    region: 'USA', batteryKwh: 91, rangeKm: 502,
    chargeRateKw: 11.5, dcChargeRateKw: 150, v2gCapable: false,
    consumptionWhPerKm: 181, chemistry: 'NMC',
    degradationFactor: 1.0, warrantyYears: 8, warrantyKm: 160000,
    color: '#003087', flag: '🇺🇸'
  },
  {
    id: 'rivian_r1t',
    brand: 'Rivian', model: 'R1T Max Pack', year: 2024,
    region: 'USA', batteryKwh: 149, rangeKm: 515,
    chargeRateKw: 11.5, dcChargeRateKw: 220, v2gCapable: true,
    consumptionWhPerKm: 289, chemistry: 'NMC',
    degradationFactor: 1.1, warrantyYears: 8, warrantyKm: 160000,
    color: '#00B140', flag: '🇺🇸'
  },
  // === EUROPE ===
  {
    id: 'vw_id4',
    brand: 'Volkswagen', model: 'ID.4 Pro', year: 2024,
    region: 'Europe', batteryKwh: 82, rangeKm: 559,
    chargeRateKw: 11, dcChargeRateKw: 175, v2gCapable: false,
    consumptionWhPerKm: 167, chemistry: 'NMC',
    degradationFactor: 0.95, warrantyYears: 8, warrantyKm: 160000,
    color: '#009DE0', flag: '🇩🇪'
  },
  {
    id: 'bmw_i4_m50',
    brand: 'BMW', model: 'i4 M50', year: 2024,
    region: 'Europe', batteryKwh: 83.9, rangeKm: 510,
    chargeRateKw: 11, dcChargeRateKw: 205, v2gCapable: false,
    consumptionWhPerKm: 193, chemistry: 'NMC',
    degradationFactor: 0.9, warrantyYears: 8, warrantyKm: 160000,
    color: '#1C69D4', flag: '🇩🇪'
  },
  {
    id: 'audi_etron_gt',
    brand: 'Audi', model: 'e-tron GT', year: 2024,
    region: 'Europe', batteryKwh: 93.4, rangeKm: 495,
    chargeRateKw: 11, dcChargeRateKw: 270, v2gCapable: false,
    consumptionWhPerKm: 203, chemistry: 'NMC',
    degradationFactor: 0.9, warrantyYears: 8, warrantyKm: 160000,
    color: '#BB0A1E', flag: '🇩🇪'
  },
  {
    id: 'renault_zoe',
    brand: 'Renault', model: 'Zoe R135', year: 2023,
    region: 'Europe', batteryKwh: 54.7, rangeKm: 395,
    chargeRateKw: 22, dcChargeRateKw: 50, v2gCapable: false,
    consumptionWhPerKm: 167, chemistry: 'NMC',
    degradationFactor: 1.05, warrantyYears: 8, warrantyKm: 160000,
    color: '#EFDF00', flag: '🇫🇷'
  },
  // === CHINA ===
  {
    id: 'byd_seal',
    brand: 'BYD', model: 'Seal AWD', year: 2024,
    region: 'China', batteryKwh: 82.56, rangeKm: 650,
    chargeRateKw: 11, dcChargeRateKw: 150, v2gCapable: true,
    consumptionWhPerKm: 158, chemistry: 'LFP',
    degradationFactor: 0.75, warrantyYears: 8, warrantyKm: 150000,
    color: '#1DB954', flag: '🇨🇳'
  },
  {
    id: 'byd_han_ev',
    brand: 'BYD', model: 'Han EV', year: 2024,
    region: 'China', batteryKwh: 85.44, rangeKm: 715,
    chargeRateKw: 7, dcChargeRateKw: 120, v2gCapable: true,
    consumptionWhPerKm: 145, chemistry: 'LFP',
    degradationFactor: 0.75, warrantyYears: 8, warrantyKm: 150000,
    color: '#008080', flag: '🇨🇳'
  },
  {
    id: 'nio_et7',
    brand: 'NIO', model: 'ET7 100kWh', year: 2024,
    region: 'China', batteryKwh: 100, rangeKm: 580,
    chargeRateKw: 11, dcChargeRateKw: 126, v2gCapable: false,
    consumptionWhPerKm: 200, chemistry: 'NMC',
    degradationFactor: 0.95, warrantyYears: 10, warrantyKm: 1000000,
    color: '#0047AB', flag: '🇨🇳'
  },
  {
    id: 'xpeng_p7',
    brand: 'XPENG', model: 'P7 AWD', year: 2024,
    region: 'China', batteryKwh: 80.9, rangeKm: 562,
    chargeRateKw: 11, dcChargeRateKw: 80, v2gCapable: false,
    consumptionWhPerKm: 175, chemistry: 'NMC',
    degradationFactor: 1.0, warrantyYears: 8, warrantyKm: 160000,
    color: '#FF4500', flag: '🇨🇳'
  },
  // === KOREA ===
  {
    id: 'kia_ev6_gt',
    brand: 'Kia', model: 'EV6 GT', year: 2024,
    region: 'Korea', batteryKwh: 77.4, rangeKm: 424,
    chargeRateKw: 11, dcChargeRateKw: 350, v2gCapable: true,
    consumptionWhPerKm: 203, chemistry: 'NMC',
    degradationFactor: 0.9, warrantyYears: 8, warrantyKm: 160000,
    color: '#05141F', flag: '🇰🇷'
  },
  {
    id: 'genesis_gv60',
    brand: 'Genesis', model: 'GV60 Performance', year: 2024,
    region: 'Korea', batteryKwh: 77.4, rangeKm: 466,
    chargeRateKw: 11, dcChargeRateKw: 350, v2gCapable: true,
    consumptionWhPerKm: 193, chemistry: 'NMC',
    degradationFactor: 0.9, warrantyYears: 8, warrantyKm: 160000,
    color: '#6B5B95', flag: '🇰🇷'
  },
  // === JAPAN ===
  {
    id: 'nissan_leaf_plus',
    brand: 'Nissan', model: 'Leaf e+ 62kWh', year: 2024,
    region: 'Japan', batteryKwh: 62, rangeKm: 385,
    chargeRateKw: 6.6, dcChargeRateKw: 50, v2gCapable: true,
    consumptionWhPerKm: 161, chemistry: 'NMC',
    degradationFactor: 1.15, warrantyYears: 8, warrantyKm: 160000,
    color: '#C3002F', flag: '🇯🇵'
  },
  {
    id: 'toyota_bz4x',
    brand: 'Toyota', model: 'bZ4X AWD', year: 2024,
    region: 'Japan', batteryKwh: 71.4, rangeKm: 466,
    chargeRateKw: 6.6, dcChargeRateKw: 150, v2gCapable: false,
    consumptionWhPerKm: 173, chemistry: 'NMC',
    degradationFactor: 0.9, warrantyYears: 10, warrantyKm: 240000,
    color: '#EB0A1E', flag: '🇯🇵'
  },
];

export const DEFAULT_EV = EV_MODELS.find(m => m.id === 'tata_nexon_ev_max')!;

// Chemistry-specific degradation labels for Analytics tab
export const CHEMISTRY_INFO: Record<string, { label: string; color: string; note: string }> = {
  NMC: { label: 'NMC (Lithium Nickel Manganese Cobalt)', color: '#88C0D0', note: 'High energy density, moderate degradation. Best balanced performance.' },
  LFP: { label: 'LFP (Lithium Iron Phosphate)',  color: '#A3BE8C', note: 'Slowest degradation (~25% better life). Can safely charge to 100%. BYD Blade Cell.' },
  NCA: { label: 'NCA (Lithium Nickel Cobalt Aluminum)', color: '#EBCB8B', note: 'Highest energy density (Tesla). Slight higher degradation at extreme temps.' },
  NMCA: { label: 'NMCA (Next-gen NMC+Al)',       color: '#B48EAD', note: 'Modern variant with improved thermal stability vs standard NMC.' },
};

export const REGIONS = [...new Set(EV_MODELS.map(m => m.region))];
