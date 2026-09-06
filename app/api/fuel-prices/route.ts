import { NextRequest, NextResponse } from 'next/server';

/**
 * Fuel & Electricity Prices API
 * Data sourced from: GlobalPetrolPrices.com, IEA, national energy regulators (Q3 2025)
 * Prices in local currency per litre (fuel) and per kWh (electricity).
 * Also returns USD equivalent for comparison.
 */

interface CountryPrices {
  country: string;
  currency: string;
  symbol: string;
  petrolPerLitre: number;     // local currency
  dieselPerLitre: number;
  electricityPerKwh: number;  // local currency, residential
  usdPetrolPerLitre: number;  // for ICE km-cost comparison
  usdElecPerKwh: number;
  inrPetrolPerLitre: number;  // in ₹ for display parity
  inrElecPerKwh: number;
  exchangeToInr: number;      // 1 unit local = X INR
  taxPct: number;             // approximate fuel tax %
  carbonTaxPct: number;       // carbon pricing component
}

// Exchange rates (approximate Q3 2025)
const USD_TO_INR = 83.5;

const COUNTRY_DATA: Record<string, CountryPrices> = {
  India: {
    country: 'India', currency: 'INR', symbol: '₹',
    petrolPerLitre: 104.0, dieselPerLitre: 92.0, electricityPerKwh: 7.5,
    usdPetrolPerLitre: 104.0 / USD_TO_INR, usdElecPerKwh: 7.5 / USD_TO_INR,
    inrPetrolPerLitre: 104.0, inrElecPerKwh: 7.5,
    exchangeToInr: 1, taxPct: 52, carbonTaxPct: 0,
  },
  USA: {
    country: 'USA', currency: 'USD', symbol: '$',
    petrolPerLitre: 0.924, dieselPerLitre: 0.978, electricityPerKwh: 0.16,
    usdPetrolPerLitre: 0.924, usdElecPerKwh: 0.16,
    inrPetrolPerLitre: 0.924 * USD_TO_INR, inrElecPerKwh: 0.16 * USD_TO_INR,
    exchangeToInr: USD_TO_INR, taxPct: 15, carbonTaxPct: 2,
  },
  Germany: {
    country: 'Germany', currency: 'EUR', symbol: '€',
    petrolPerLitre: 1.74, dieselPerLitre: 1.62, electricityPerKwh: 0.34,
    usdPetrolPerLitre: 1.74 * 1.085, usdElecPerKwh: 0.34 * 1.085,
    inrPetrolPerLitre: 1.74 * 1.085 * USD_TO_INR, inrElecPerKwh: 0.34 * 1.085 * USD_TO_INR,
    exchangeToInr: 1.085 * USD_TO_INR, taxPct: 65, carbonTaxPct: 12,
  },
  France: {
    country: 'France', currency: 'EUR', symbol: '€',
    petrolPerLitre: 1.79, dieselPerLitre: 1.70, electricityPerKwh: 0.24,
    usdPetrolPerLitre: 1.79 * 1.085, usdElecPerKwh: 0.24 * 1.085,
    inrPetrolPerLitre: 1.79 * 1.085 * USD_TO_INR, inrElecPerKwh: 0.24 * 1.085 * USD_TO_INR,
    exchangeToInr: 1.085 * USD_TO_INR, taxPct: 62, carbonTaxPct: 14,
  },
  UK: {
    country: 'UK', currency: 'GBP', symbol: '£',
    petrolPerLitre: 1.52, dieselPerLitre: 1.56, electricityPerKwh: 0.25,
    usdPetrolPerLitre: 1.52 * 1.27, usdElecPerKwh: 0.25 * 1.27,
    inrPetrolPerLitre: 1.52 * 1.27 * USD_TO_INR, inrElecPerKwh: 0.25 * 1.27 * USD_TO_INR,
    exchangeToInr: 1.27 * USD_TO_INR, taxPct: 70, carbonTaxPct: 10,
  },
  China: {
    country: 'China', currency: 'CNY', symbol: '¥',
    petrolPerLitre: 7.82, dieselPerLitre: 7.35, electricityPerKwh: 0.62,
    usdPetrolPerLitre: 7.82 / 7.25, usdElecPerKwh: 0.62 / 7.25,
    inrPetrolPerLitre: (7.82 / 7.25) * USD_TO_INR, inrElecPerKwh: (0.62 / 7.25) * USD_TO_INR,
    exchangeToInr: USD_TO_INR / 7.25, taxPct: 35, carbonTaxPct: 5,
  },
  Japan: {
    country: 'Japan', currency: 'JPY', symbol: '¥',
    petrolPerLitre: 178.0, dieselPerLitre: 155.0, electricityPerKwh: 36.0,
    usdPetrolPerLitre: 178.0 / 155.0, usdElecPerKwh: 36.0 / 155.0,
    inrPetrolPerLitre: (178.0 / 155.0) * USD_TO_INR, inrElecPerKwh: (36.0 / 155.0) * USD_TO_INR,
    exchangeToInr: USD_TO_INR / 155.0, taxPct: 45, carbonTaxPct: 6,
  },
  Korea: {
    country: 'Korea', currency: 'KRW', symbol: '₩',
    petrolPerLitre: 1720.0, dieselPerLitre: 1540.0, electricityPerKwh: 147.0,
    usdPetrolPerLitre: 1720.0 / 1330.0, usdElecPerKwh: 147.0 / 1330.0,
    inrPetrolPerLitre: (1720.0 / 1330.0) * USD_TO_INR, inrElecPerKwh: (147.0 / 1330.0) * USD_TO_INR,
    exchangeToInr: USD_TO_INR / 1330.0, taxPct: 41, carbonTaxPct: 4,
  },
  Norway: {
    country: 'Norway', currency: 'NOK', symbol: 'kr',
    petrolPerLitre: 19.8, dieselPerLitre: 18.4, electricityPerKwh: 0.85,
    usdPetrolPerLitre: 19.8 / 10.6, usdElecPerKwh: 0.85 / 10.6,
    inrPetrolPerLitre: (19.8 / 10.6) * USD_TO_INR, inrElecPerKwh: (0.85 / 10.6) * USD_TO_INR,
    exchangeToInr: USD_TO_INR / 10.6, taxPct: 68, carbonTaxPct: 18,
  },
  Australia: {
    country: 'Australia', currency: 'AUD', symbol: 'A$',
    petrolPerLitre: 2.12, dieselPerLitre: 2.05, electricityPerKwh: 0.32,
    usdPetrolPerLitre: 2.12 / 1.55, usdElecPerKwh: 0.32 / 1.55,
    inrPetrolPerLitre: (2.12 / 1.55) * USD_TO_INR, inrElecPerKwh: (0.32 / 1.55) * USD_TO_INR,
    exchangeToInr: USD_TO_INR / 1.55, taxPct: 42, carbonTaxPct: 5,
  },
  UAE: {
    country: 'UAE', currency: 'AED', symbol: 'د.إ',
    petrolPerLitre: 3.01, dieselPerLitre: 2.81, electricityPerKwh: 0.23,
    usdPetrolPerLitre: 3.01 / 3.67, usdElecPerKwh: 0.23 / 3.67,
    inrPetrolPerLitre: (3.01 / 3.67) * USD_TO_INR, inrElecPerKwh: (0.23 / 3.67) * USD_TO_INR,
    exchangeToInr: USD_TO_INR / 3.67, taxPct: 5, carbonTaxPct: 0,
  },
  Canada: {
    country: 'Canada', currency: 'CAD', symbol: 'C$',
    petrolPerLitre: 1.68, dieselPerLitre: 1.72, electricityPerKwh: 0.13,
    usdPetrolPerLitre: 1.68 / 1.37, usdElecPerKwh: 0.13 / 1.37,
    inrPetrolPerLitre: (1.68 / 1.37) * USD_TO_INR, inrElecPerKwh: (0.13 / 1.37) * USD_TO_INR,
    exchangeToInr: USD_TO_INR / 1.37, taxPct: 33, carbonTaxPct: 10,
  },
};

// Comparable ICE cars for each EV model ID
// Mileage (km/L) and CO2 (g/km) from ARAI / WLTP / EPA test data
export const ICE_COMPARABLES: Record<string, { name: string; mileageKmPerL: number; co2GPerKm: number }> = {
  // USA
  'ford_f150_lightning':         { name: 'Ford F-150 3.5L EcoBoost',    mileageKmPerL: 8.9,  co2GPerKm: 320 },
  'gmc_silverado_ev':            { name: 'Chevy Silverado 1500 5.3L',   mileageKmPerL: 9.8,  co2GPerKm: 290 },
  'chevrolet_blazer_ev':         { name: 'Chevrolet Blazer 2.0T',       mileageKmPerL: 11.5, co2GPerKm: 210 },
  'honda_prologue':              { name: 'Honda Passport 3.5L',         mileageKmPerL: 10.0, co2GPerKm: 240 },
  'tesla_cybertruck_dm':         { name: 'RAM 1500 5.7L HEMI',          mileageKmPerL: 7.6,  co2GPerKm: 370 },
  'lucid_air_gt':                { name: 'Mercedes S500 3.0T',          mileageKmPerL: 10.5, co2GPerKm: 225 },
  'rivian_r1t':                  { name: 'Ford F-150 Raptor 3.5L',      mileageKmPerL: 9.1,  co2GPerKm: 295 },
  // Europe
  'volvo_ex90':                  { name: 'Volvo XC90 B5 Mild Hybrid',   mileageKmPerL: 12.5, co2GPerKm: 196 },
  'polestar_3':                  { name: 'Porsche Cayenne 3.0T',         mileageKmPerL: 11.0, co2GPerKm: 219 },
  'renault_5_etech':             { name: 'Renault Clio 1.0T',           mileageKmPerL: 18.0, co2GPerKm: 130 },
  'renault_scenic_etech':        { name: 'Renault Austral 1.3T',        mileageKmPerL: 15.0, co2GPerKm: 148 },
  'vw_id4_pro':                  { name: 'VW Tiguan 2.0 TSI',           mileageKmPerL: 12.5, co2GPerKm: 182 },
  'vw_id_buzz':                  { name: 'VW Multivan 2.0 TSI',         mileageKmPerL: 11.5, co2GPerKm: 200 },
  'skoda_enyaq_85':              { name: 'Skoda Kodiaq 2.0 TSI',        mileageKmPerL: 13.0, co2GPerKm: 175 },
  'cupra_born':                  { name: 'VW Golf GTI 2.0T',            mileageKmPerL: 13.5, co2GPerKm: 168 },
  // Asia
  'hyundai_ioniq5':              { name: 'Hyundai Tucson 2.0L',         mileageKmPerL: 13.8, co2GPerKm: 170 },
  'kia_ev9_lr':                  { name: 'Kia Telluride 3.8L',          mileageKmPerL: 9.5,  co2GPerKm: 246 },
  'nissan_leaf_plus':            { name: 'Nissan Qashqai 1.5T',         mileageKmPerL: 13.5, co2GPerKm: 172 },
  'mitsubishi_outlander_phev':   { name: 'Mitsubishi Outlander 2.5L',   mileageKmPerL: 13.0, co2GPerKm: 185 },
  'mitsubishi_eclipse_cross_phev': { name: 'Mitsubishi Eclipse Cross 1.5T', mileageKmPerL: 13.5, co2GPerKm: 175 },
};

export async function GET(req: NextRequest) {
  const country = req.nextUrl.searchParams.get('country') || 'India';
  const prices  = COUNTRY_DATA[country] ?? COUNTRY_DATA['India'];
  return NextResponse.json({
    ...prices,
    allCountries: Object.keys(COUNTRY_DATA),
    iceComparables: ICE_COMPARABLES,
    dataSource:  'GlobalPetrolPrices.com / IEA Q3 2025',
    updatedAt:   '2025-09-01',
  });
}
