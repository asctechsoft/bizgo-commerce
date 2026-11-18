import {
  convertWeight,
  InvalidPackConversionError,
  normalizeUnit,
  parseSourceUnitText,
  toGrams,
} from '../src';

describe('weight units (BRD §3.2)', () => {
  it('converts yến / tạ / tấn / kg to grams', () => {
    expect(toGrams(1, 'kg')).toBe(1000n);
    expect(toGrams(1, 'yến')).toBe(10_000n);
    expect(toGrams(1, 'Tạ')).toBe(100_000n);
    expect(toGrams(1, 'tấn')).toBe(1_000_000n);
  });

  it('converts between weight units exactly', () => {
    expect(convertWeight(1, 'tạ', 'kg')).toBe(100n);
    expect(convertWeight(2, 'tấn', 'tạ')).toBe(20n);
    expect(convertWeight(10, 'kg', 'yến')).toBe(1n);
  });

  it('refuses inexact conversions instead of rounding', () => {
    expect(() => convertWeight(5, 'kg', 'yến')).toThrow(InvalidPackConversionError);
  });

  it.each([
    'bao',
    'bì',
    'túi',
    'thùng',
    'set',
    'hộp',
    'khay',
    'lon',
    'cuộn',
    'cây',
    'gói',
    'quả',
    'cái',
  ])('never assumes a weight for pack unit "%s"', (unit) => {
    expect(() => toGrams(1, unit)).toThrow(InvalidPackConversionError);
    try {
      toGrams(1, unit);
    } catch (e) {
      expect((e as InvalidPackConversionError).code).toBe('INVALID_PACK_CONVERSION');
    }
  });

  it('rejects fractional quantities and unknown units', () => {
    expect(() => toGrams(1.5, 'kg')).toThrow(InvalidPackConversionError);
    expect(() => toGrams(1, 'furlong')).toThrow(InvalidPackConversionError);
  });

  it('normalizes source spellings and parses source unit text', () => {
    expect(normalizeUnit('Bì')).toBe('bi');
    expect(normalizeUnit('KG')).toBe('kg');
    expect(parseSourceUnitText('Kg / Bao / Bì')).toEqual(['Kg', 'Bao', 'Bì']);
    expect(parseSourceUnitText('')).toEqual([]);
  });
});
