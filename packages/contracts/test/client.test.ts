import { ApiError, buildQuery, createApiClient, NetworkError } from '../src';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('api client', () => {
  it('builds query strings skipping empty values', () => {
    expect(buildQuery({ a: 1, b: '', c: undefined, d: 'x y' })).toBe('?a=1&d=x+y');
    expect(buildQuery({})).toBe('');
  });

  it('unwraps the {data, meta} envelope and pages', async () => {
    const fetchImpl = vi.fn(async () =>
      json(200, { data: [{ id: '1' }], meta: { requestId: 'r', page: 2, limit: 24, total: 49 } }),
    ) as unknown as typeof fetch;
    const api = createApiClient({ baseUrl: 'http://api', fetchImpl });
    const p = await api.catalog.products({ page: 2 });
    expect(p).toEqual({ items: [{ id: '1' }], page: 2, limit: 24, total: 49 });
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://api/v1/products?page=2',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('turns error envelopes into ApiError with code and requestId', async () => {
    const fetchImpl = (async () =>
      json(404, {
        code: 'NOT_FOUND',
        message: 'Không tìm thấy',
        details: [],
        requestId: 'abc',
      })) as unknown as typeof fetch;
    const api = createApiClient({ baseUrl: 'http://api', fetchImpl });
    await expect(api.catalog.product('x')).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
    await expect(api.catalog.product('x')).rejects.toBeInstanceOf(ApiError);
  });

  it('wraps network failures and non-JSON bodies in NetworkError', async () => {
    const down = createApiClient({
      baseUrl: 'http://api',
      fetchImpl: (async () => {
        throw new Error('ECONNREFUSED');
      }) as unknown as typeof fetch,
    });
    await expect(down.catalog.categories()).rejects.toBeInstanceOf(NetworkError);
    const html = createApiClient({
      baseUrl: 'http://api',
      fetchImpl: (async () => new Response('<html>', { status: 502 })) as unknown as typeof fetch,
    });
    await expect(html.catalog.categories()).rejects.toBeInstanceOf(NetworkError);
  });

  it('adds the CSRF header only to unsafe requests', async () => {
    const calls: RequestInit[] = [];
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      calls.push(init);
      return json(200, { data: {}, meta: { requestId: 'r' } });
    }) as unknown as typeof fetch;
    const api = createApiClient({
      baseUrl: 'http://api',
      fetchImpl,
      getCsrfToken: () => 'tok',
      credentials: 'include',
    });
    await api.auth.session();
    await api.auth.logout();
    expect((calls[0]?.headers as Record<string, string>)['X-CSRF-Token']).toBeUndefined();
    expect((calls[1]?.headers as Record<string, string>)['X-CSRF-Token']).toBe('tok');
    expect(calls[1]?.credentials).toBe('include');
  });
});

describe('admin commerce client', () => {
  it('sends the Idempotency-Key and reason for order actions', async () => {
    const fetchImpl = vi.fn(async () =>
      json(200, { data: { id: 'o1', status: 'CONFIRMED' }, meta: { requestId: 'r' } }),
    ) as unknown as typeof fetch;
    const api = createApiClient({ baseUrl: 'http://api', fetchImpl, realm: 'ADMIN' });
    await api.admin.orders.act('o1', 'confirm', 'key-1', 'OK');
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://api/v1/admin/orders/o1/confirm',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ reason: 'OK' }),
        headers: expect.objectContaining({ 'Idempotency-Key': 'key-1', 'X-Realm': 'ADMIN' }),
      }),
    );
  });

  it('adjusts inventory with an idempotency key', async () => {
    const fetchImpl = vi.fn(async () =>
      json(200, { data: { onHand: 1, reserved: 0, available: 1 }, meta: { requestId: 'r' } }),
    ) as unknown as typeof fetch;
    const api = createApiClient({ baseUrl: 'http://api', fetchImpl });
    await api.admin.inventory.adjust(
      { warehouseId: 'w', variantId: 'v', delta: 1, reasonCode: 'COUNT' },
      'k2',
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://api/v1/admin/inventory/adjustments',
      expect.objectContaining({
        headers: expect.objectContaining({ 'Idempotency-Key': 'k2' }),
      }),
    );
  });
});
