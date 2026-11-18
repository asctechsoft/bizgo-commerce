export const SORTS = ['name', '-name', 'newest'] as const;
export type Sort = (typeof SORTS)[number];

export interface CatalogParams {
  category?: string;
  search?: string;
  sort: Sort;
  page: number;
}

type Raw = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** URL is the source of truth for catalog state; every value is validated before it reaches the API. */
export function parseCatalogParams(raw: Raw): CatalogParams {
  const category = first(raw.category)?.trim();
  const search = first(raw.search)?.trim().slice(0, 100);
  const sortRaw = first(raw.sort);
  const pageRaw = Number(first(raw.page));
  return {
    ...(category && /^[a-z0-9-]{1,120}$/.test(category) ? { category } : {}),
    ...(search ? { search } : {}),
    sort: (SORTS as readonly string[]).includes(sortRaw ?? '') ? (sortRaw as Sort) : 'name',
    page: Number.isInteger(pageRaw) && pageRaw >= 1 && pageRaw <= 10_000 ? pageRaw : 1,
  };
}

export function catalogHref(p: Partial<CatalogParams>): string {
  const q = new URLSearchParams();
  if (p.category) q.set('category', p.category);
  if (p.search) q.set('search', p.search);
  if (p.sort && p.sort !== 'name') q.set('sort', p.sort);
  if (p.page && p.page > 1) q.set('page', String(p.page));
  const s = q.toString();
  return s ? `/danh-muc?${s}` : '/danh-muc';
}
