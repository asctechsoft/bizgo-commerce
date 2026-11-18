import { catalogHref, parseCatalogParams } from '../src/lib/catalog-params';

describe('catalog URL state', () => {
  it('defaults safely', () => {
    expect(parseCatalogParams({})).toEqual({ sort: 'name', page: 1 });
  });

  it('accepts valid values and trims search', () => {
    expect(
      parseCatalogParams({
        category: 'cui-buoi-phu-lieu',
        search: '  cùi zip ',
        sort: '-name',
        page: '3',
      }),
    ).toEqual({
      category: 'cui-buoi-phu-lieu',
      search: 'cùi zip',
      sort: '-name',
      page: 3,
    });
  });

  it('drops malicious or malformed values', () => {
    expect(parseCatalogParams({ category: '../../etc', sort: 'price', page: '-5' })).toEqual({
      sort: 'name',
      page: 1,
    });
    expect(parseCatalogParams({ page: '1.5' }).page).toBe(1);
    expect(parseCatalogParams({ page: '99999999' }).page).toBe(1);
    expect(parseCatalogParams({ search: 'x'.repeat(500) }).search).toHaveLength(100);
    expect(parseCatalogParams({ category: ['a', 'b'] }).category).toBe('a');
  });

  it('builds canonical hrefs (defaults omitted) so back/forward restores state', () => {
    expect(catalogHref({})).toBe('/danh-muc');
    expect(catalogHref({ category: 'x', sort: 'newest', page: 2, search: 'bột nếp' })).toBe(
      '/danh-muc?category=x&search=b%E1%BB%99t+n%E1%BA%BFp&sort=newest&page=2',
    );
    expect(catalogHref({ sort: 'name', page: 1 })).toBe('/danh-muc');
  });
});
