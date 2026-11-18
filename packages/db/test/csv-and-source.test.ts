import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertCatalogInvariants,
  CATEGORY_DISPLAY_NAMES,
  findRepoRoot,
  parseCatalogCsv,
  parseCsv,
} from '../src';

describe('parseCsv', () => {
  it('handles BOM, CRLF, quotes and escaped quotes', () => {
    const text = '﻿a,b\r\n1,"x, y"\r\n2,"he said ""hi"""\r\n';
    expect(parseCsv(text)).toEqual([
      { a: '1', b: 'x, y' },
      { a: '2', b: 'he said "hi"' },
    ]);
  });

  it('rejects ragged rows and unterminated quotes', () => {
    expect(() => parseCsv('a,b\n1\n')).toThrow(/expected 2/);
    expect(() => parseCsv('a\n"oops\n')).toThrow(/Unterminated/);
  });
});

describe('source catalogue (docs/catalog_source_82.csv)', () => {
  const text = readFileSync(join(findRepoRoot(), 'docs', 'catalog_source_82.csv'), 'utf-8');
  const rows = parseCatalogCsv(text);

  it('has exactly 82 items in 8 groups with documented counts', () => {
    expect(rows).toHaveLength(82);
    expect(() => assertCatalogInvariants(rows)).not.toThrow();
    expect(CATEGORY_DISPLAY_NAMES).toHaveLength(8);
  });

  it('keeps source spellings verbatim (typos included)', () => {
    const names = rows.map((r) => r.sourceName);
    expect(names).toContain('Họt thạch dẻo');
    expect(names).toContain('Thạch nỏ hồng');
    expect(names).toContain('Xúc xích Winner (xx winer)');
  });

  it('refuses a catalogue that claims verified/sellable items', () => {
    const bad = rows.map((r, i) => (i === 0 ? { ...r, isSellable: true } : r));
    expect(() => assertCatalogInvariants(bad)).toThrow(/refuses/);
  });

  it('refuses a wrong item count', () => {
    expect(() => assertCatalogInvariants(rows.slice(0, 81))).toThrow(/82/);
  });
});
