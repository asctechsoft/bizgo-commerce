/**
 * Unit handling (ADR-0003, BRD §3.2).
 * Only weight units are convertible globally:
 *   kg = 1000 g, yến = 10 kg, tạ = 100 kg, tấn = 1000 kg.
 * Pack units (bao, bì, túi, thùng, set, hộp, ...) have NO global factor; a verified,
 * variant-specific factor is required. We never assume "1 bao = N kg".
 */
export const WEIGHT_UNIT_GRAMS = {
  g: 1n,
  kg: 1000n,
  yen: 10_000n,
  ta: 100_000n,
  tan: 1_000_000n,
} as const;

export type WeightUnit = keyof typeof WEIGHT_UNIT_GRAMS;

export const PACK_UNITS = [
  'bao',
  'bi',
  'tui',
  'thung',
  'set',
  'hop',
  'khay',
  'lon',
  'cuon',
  'cay',
  'goi',
  'qua',
  'cai',
] as const;
export type PackUnit = (typeof PACK_UNITS)[number];

/** Vietnamese source spellings → canonical codes. */
const ALIASES: Record<string, WeightUnit | PackUnit> = {
  g: 'g',
  gam: 'g',
  gram: 'g',
  kg: 'kg',
  yến: 'yen',
  yen: 'yen',
  tạ: 'ta',
  ta: 'ta',
  tấn: 'tan',
  tan: 'tan',
  bao: 'bao',
  bì: 'bi',
  bi: 'bi',
  túi: 'tui',
  tui: 'tui',
  thùng: 'thung',
  thung: 'thung',
  set: 'set',
  hộp: 'hop',
  hop: 'hop',
  khay: 'khay',
  lon: 'lon',
  cuộn: 'cuon',
  cuon: 'cuon',
  cây: 'cay',
  cay: 'cay',
  gói: 'goi',
  goi: 'goi',
  quả: 'qua',
  qua: 'qua',
  cái: 'cai',
  cai: 'cai',
};

export class InvalidPackConversionError extends Error {
  readonly code = 'INVALID_PACK_CONVERSION';
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPackConversionError';
  }
}

export function normalizeUnit(raw: string): WeightUnit | PackUnit | null {
  const key = raw.trim().toLowerCase();
  return ALIASES[key] ?? null;
}

export function isWeightUnit(u: string): u is WeightUnit {
  return Object.prototype.hasOwnProperty.call(WEIGHT_UNIT_GRAMS, u);
}

/** Convert an integer quantity of a weight unit to grams. Throws for pack/unknown units. */
export function toGrams(quantity: number | bigint, unit: string): bigint {
  const canonical = normalizeUnit(unit);
  if (canonical === null || !isWeightUnit(canonical)) {
    throw new InvalidPackConversionError(
      `Unit "${unit}" has no global weight conversion; a verified variant-specific factor is required`,
    );
  }
  if (typeof quantity === 'number' && !Number.isInteger(quantity)) {
    throw new InvalidPackConversionError('Fractional quantities are not supported (ADR-0003)');
  }
  return BigInt(quantity) * WEIGHT_UNIT_GRAMS[canonical];
}

/** Convert between two weight units; result must be exact (integer) or it throws. */
export function convertWeight(quantity: number | bigint, from: string, to: string): bigint {
  const grams = toGrams(quantity, from);
  const target = normalizeUnit(to);
  if (target === null || !isWeightUnit(target)) {
    throw new InvalidPackConversionError(`Unit "${to}" has no global weight conversion`);
  }
  const factor = WEIGHT_UNIT_GRAMS[target];
  if (grams % factor !== 0n) {
    throw new InvalidPackConversionError(`${quantity} ${from} is not an exact number of ${to}`);
  }
  return grams / factor;
}

/**
 * Split the source "Đơn Vị Tính" text ("Kg / Bao / Bì") into raw tokens, keeping source spelling.
 * Pure text helper: it does not decide that any unit is sellable.
 */
export function parseSourceUnitText(text: string): string[] {
  return text
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);
}
