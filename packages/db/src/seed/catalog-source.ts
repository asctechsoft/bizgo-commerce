import { parseCsv } from './csv';

export interface SourceRow {
  sourceIndex: number;
  categorySource: string;
  sourceName: string;
  sourceUnit: string;
  sourceNote: string;
  isSellable: boolean;
  skuVerified: boolean;
  imagesVerified: boolean;
}

/** Order = order of first appearance in the source file (verified by assertCatalogInvariants). */
export const EXPECTED_CATEGORY_COUNTS = [13, 16, 8, 4, 7, 8, 17, 9] as const;

/**
 * Editorial short labels taken from the HTML prototype (`CATS`), same order as the source groups.
 * `source_name` of each category keeps the verbatim group title from the source document.
 */
export const CATEGORY_DISPLAY_NAMES = [
  'Bột nấu chè & tinh bột',
  'Cùi bưởi & phụ liệu',
  'Cốm, sen & đường',
  'Các loại đậu & hạt',
  'Khoai dẻo & mochi',
  'Đồ ăn vặt',
  'Trân châu & topping',
  'Kem béo & cốt dừa',
] as const;

function bool(v: string | undefined, col: string, row: number): boolean {
  if (v === 'true') return true;
  if (v === 'false') return false;
  throw new Error(`catalog CSV row ${row}: column ${col} must be true|false, got "${v}"`);
}

export function parseCatalogCsv(text: string): SourceRow[] {
  return parseCsv(text).map((r, i) => {
    const idx = Number(r.source_index);
    if (!Number.isInteger(idx) || idx < 1)
      throw new Error(`catalog CSV row ${i + 2}: bad source_index`);
    const need = (k: string): string => {
      const v = r[k];
      if (v === undefined || v === '') {
        if (k === 'source_note' || k === 'source_unit') return v ?? '';
        throw new Error(`catalog CSV row ${i + 2}: missing ${k}`);
      }
      return v;
    };
    return {
      sourceIndex: idx,
      categorySource: need('category_source'),
      sourceName: need('source_name'),
      sourceUnit: need('source_unit'),
      sourceNote: need('source_note'),
      isSellable: bool(r.is_sellable, 'is_sellable', i + 2),
      skuVerified: bool(r.sku_verified, 'sku_verified', i + 2),
      imagesVerified: bool(r.images_verified, 'images_verified', i + 2),
    };
  });
}

/** Fail loudly if the source catalogue is not the documented 82 items / 8 groups, all unverified. */
export function assertCatalogInvariants(rows: readonly SourceRow[]): void {
  if (rows.length !== 82) throw new Error(`Expected 82 catalogue rows, got ${rows.length}`);
  const order: string[] = [];
  const counts = new Map<string, number>();
  rows.forEach((r, i) => {
    if (r.sourceIndex !== i + 1)
      throw new Error(`source_index must run 1..82 in order (row ${i + 1})`);
    if (!counts.has(r.categorySource)) order.push(r.categorySource);
    counts.set(r.categorySource, (counts.get(r.categorySource) ?? 0) + 1);
    if (r.isSellable || r.skuVerified || r.imagesVerified) {
      throw new Error(
        `Source row ${r.sourceIndex} claims verified/sellable; the seed refuses (all must start DRAFT)`,
      );
    }
  });
  if (order.length !== 8) throw new Error(`Expected 8 categories, got ${order.length}`);
  order.forEach((c, i) => {
    const expected = EXPECTED_CATEGORY_COUNTS[i];
    if (counts.get(c) !== expected) {
      throw new Error(`Category "${c}" expected ${expected} items, got ${counts.get(c)}`);
    }
  });
}
