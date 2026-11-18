/**
 * API contract types and a small fetch client shared by storefront, backoffice (and later mobile).
 * Shapes mirror backend/api DTOs (the OpenAPI document in docs/api/openapi.json is generated from the same
 * controllers). Response-schema generation from OpenAPI is planned once DTO responses are annotated (P2).
 */

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'OTP_DELIVERY_NOT_CONFIGURED'
  | 'OTP_INVALID'
  | 'OTP_EXPIRED'
  | 'OTP_LOCKED'
  | 'MFA_REQUIRED'
  | 'STEP_UP_REQUIRED'
  | 'CREDENTIALS_INVALID'
  | 'ACCOUNT_NOT_VERIFIED'
  | 'EMAIL_OR_PHONE_TAKEN'
  | 'INVALID_STATE_TRANSITION'
  | 'INTERNAL_ERROR'
  | (string & {});

export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  details: Array<Record<string, unknown>>;
  requestId: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody,
  ) {
    super(body.message);
    this.name = 'ApiError';
  }
  get code(): ErrorCode {
    return this.body.code;
  }
}

/** Network failure / non-JSON response (distinct from a structured ApiError). */
export class NetworkError extends Error {
  constructor(message = 'Không thể kết nối tới máy chủ.') {
    super(message);
    this.name = 'NetworkError';
  }
}

export interface Envelope<T> {
  data: T;
  meta: { requestId: string; page?: number; limit?: number; total?: number };
}

export interface PublicCategory {
  id: string;
  slug: string;
  name: string;
  activeProductCount: number;
}

export interface PublicProduct {
  id: string;
  slug: string;
  name: string;
  sellable: boolean;
  category: { slug: string; name: string };
  image: { url: string; isIllustrative: boolean } | null;
}

export interface PublicVariant {
  id: string;
  sku: string;
  packLabel: string;
  netWeightG: number | null;
  storageClass: string | null;
  minQty: number;
  maxQty: number | null;
  quantityStep: number;
  unitPriceVnd: number | null;
  isTest: boolean;
  inStock: boolean;
}

export interface PublicProductDetail extends PublicProduct {
  referenceCode: string;
  note: string | null;
  variants: PublicVariant[];
}

export type Realm = 'CUSTOMER' | 'ADMIN' | 'FACTORY';

export interface SessionSummary {
  user: { id: string; displayName: string; roles: string[]; realm: Realm };
  mfa: { required: boolean; enrolled: boolean; verified: boolean };
}

export interface LoginResponse extends SessionSummary {
  csrfToken: string;
  expiresAt: string;
}

export interface AdminProduct {
  id: string;
  slug: string;
  sourceIndex: number;
  sourceName: string;
  sourceUnitText: string;
  sourceNoteRaw: string;
  displayName: string;
  displayNote: string;
  originType: string;
  status: string;
  category: { id: string; slug: string; displayName: string };
  media: { id: string; url: string; isIllustrative: boolean; verified: boolean }[];
  aliases: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AdminCategory {
  id: string;
  slug: string;
  sourceName: string;
  displayName: string;
  sortOrder: number;
  status: string;
  productCount: number;
}

export interface Page<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}

export interface Address {
  id: string;
  receiverName: string;
  phone: string;
  province: string;
  district: string;
  ward: string;
  detail: string;
  isDefault: boolean;
}

export type AddressInput = Omit<Address, 'id' | 'isDefault'> & { isDefault?: boolean };

export interface CartItem {
  id: string;
  variantId: string;
  sku: string;
  name: string;
  packLabel: string;
  quantity: number;
  unitPriceVnd: number | null;
  available: boolean;
}

export interface Cart {
  items: CartItem[];
  note: 'ESTIMATE_ONLY';
}

export interface QuoteBlocker {
  code: ErrorCode;
  variantId?: string;
  message: string;
}

export interface CheckoutQuote {
  quoteId: string;
  version: number;
  expiresAt: string;
  currency: 'VND';
  lines: {
    variantId: string;
    sku: string;
    name: string;
    packLabel: string;
    quantity: number;
    unitPriceVnd: number | null;
    lineTotalVnd: number | null;
  }[];
  subtotalVnd: number | null;
  shippingFeeVnd: number | null;
  shippingNote: 'MANUAL_QUOTE' | null;
  totalVnd: number | null;
  canPlaceOrder: boolean;
  blockers: QuoteBlocker[];
}

export type OrderStatus =
  | 'PENDING_CONFIRMATION'
  | 'CONFIRMED'
  | 'PACKING'
  | 'READY_TO_SHIP'
  | 'PARTIALLY_SHIPPED'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'ON_HOLD'
  | 'CANCEL_REQUESTED'
  | 'CANCELLED'
  | 'RETURN_REQUESTED'
  | 'RETURNED'
  | 'FAILED'
  | 'DRAFT';

export interface OrderSummary {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: string;
  paymentMethod: 'COD' | 'BANK_TRANSFER';
  totalVnd: number;
  shippingFeeVnd: number | null;
  shippingNote: 'MANUAL_QUOTE' | null;
  isTest: boolean;
  createdAt: string;
}

export interface OrderDetail extends OrderSummary {
  shipAddress: {
    receiverName?: string;
    phone?: string;
    province?: string;
    district?: string;
    ward?: string;
    detail?: string;
  };
  items: {
    id: string;
    sku: string;
    name: string;
    packLabel: string;
    quantity: number;
    unitPriceVnd: number;
    lineTotalVnd: number;
  }[];
  timeline: { from: OrderStatus | null; to: OrderStatus; at: string }[];
}

export interface AdminVariant {
  id: string;
  productId: string;
  sku: string;
  packLabel: string;
  sellableUnit: string;
  netWeightG: number | null;
  storageClass: string | null;
  minQty: number;
  maxQty: number | null;
  quantityStep: number;
  status: string;
  isTest: boolean;
}

export interface VariantCreateInput {
  productId: string;
  sku: string;
  packLabel: string;
  sellableUnit: string;
  netWeightG?: number;
  storageClass?: 'DRY' | 'AMBIENT' | 'CHILLED' | 'FROZEN' | 'FRAGILE';
  minQty?: number;
  maxQty?: number;
  quantityStep?: number;
  manufacturer?: string;
  responsibleEntity?: string;
  shelfLifeDays?: number;
}

export interface GateItem {
  item: string;
  ok: boolean;
  message: string;
}

export interface InventoryRow {
  warehouseId: string;
  warehouseCode: string;
  variantId: string;
  sku: string;
  onHand: number;
  reserved: number;
  quarantined: number;
  available: number;
}

export interface AdminOrderSummary extends OrderSummary {
  userId: string;
}

export interface AdminOrderDetail extends OrderDetail {
  contact?: { name?: string; phone?: string | null };
  /** Present only when the caller holds margin:read. */
  financial?: {
    revenueNetVnd: number;
    costSnapshotVnd: number | null;
    expectedMarginVnd: number | null;
  };
}

export type AdminOrderAction = 'confirm' | 'hold' | 'resume' | 'cancel';

export interface ClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  /** Called to attach headers (e.g. CSRF token) for browser requests. */
  getCsrfToken?: () => string | null;
  /** Browser clients send cookies; server components usually do not. */
  credentials?: RequestCredentials;
  /** Extra headers (e.g. forward cookies during SSR). */
  headers?: Record<string, string>;
  cache?: RequestCache;
  /** Realm hint (X-Realm) for multi-realm endpoints such as /auth/session. */
  realm?: Realm;
  next?: { revalidate?: number | false; tags?: string[] };
}

export function buildQuery(params: Record<string, string | number | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

export function createApiClient(opts: ClientOptions) {
  const f = opts.fetchImpl ?? fetch;

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<Envelope<T>> {
    const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers };
    if (opts.realm) headers['X-Realm'] = opts.realm;
    if (extraHeaders) Object.assign(headers, extraHeaders);
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET') {
      const csrf = opts.getCsrfToken?.();
      if (csrf) headers['X-CSRF-Token'] = csrf;
    }
    let res: Response;
    try {
      res = await f(`${opts.baseUrl}${path}`, {
        method,
        headers,
        credentials: opts.credentials ?? 'omit',
        cache: opts.cache,
        ...(opts.next ? { next: opts.next } : {}),
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      } as RequestInit);
    } catch {
      throw new NetworkError();
    }
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new NetworkError('Máy chủ trả về dữ liệu không hợp lệ.');
    }
    if (!res.ok) {
      const b = json as Partial<ApiErrorBody>;
      throw new ApiError(res.status, {
        code: b.code ?? 'INTERNAL_ERROR',
        message: b.message ?? 'Đã có lỗi xảy ra.',
        details: b.details ?? [],
        requestId: b.requestId ?? '',
      });
    }
    return json as Envelope<T>;
  }

  const page = <T>(env: Envelope<T[]>): Page<T> => ({
    items: env.data,
    page: env.meta.page ?? 1,
    limit: env.meta.limit ?? env.data.length,
    total: env.meta.total ?? env.data.length,
  });

  return {
    request,
    catalog: {
      categories: async () => (await request<PublicCategory[]>('GET', '/v1/categories')).data,
      products: async (q: {
        category?: string;
        search?: string;
        sort?: string;
        page?: number;
        limit?: number;
      }) => page(await request<PublicProduct[]>('GET', `/v1/products${buildQuery(q)}`)),
      product: async (slug: string) =>
        (await request<PublicProductDetail>('GET', `/v1/products/${encodeURIComponent(slug)}`))
          .data,
    },
    auth: {
      register: async (b: {
        identity: string;
        password: string;
        displayName: string;
        acceptTerms: boolean;
      }) =>
        (
          await request<{ requiresVerification: true; target: string; resendAfterSec: number }>(
            'POST',
            '/v1/auth/register',
            b,
          )
        ).data,
      verifyOtp: async (b: { identity: string; code: string }) =>
        (
          await request<{ verified: true }>('POST', '/v1/auth/otp/verify', {
            ...b,
            purpose: 'REGISTER_VERIFY',
          })
        ).data,
      resendOtp: async (b: { identity: string }) =>
        (
          await request<{ sent: true; resendAfterSec: number }>('POST', '/v1/auth/otp/resend', {
            ...b,
            purpose: 'REGISTER_VERIFY',
          })
        ).data,
      login: async (b: { identity: string; password: string; realm?: Realm }) =>
        (await request<LoginResponse>('POST', '/v1/auth/login', b)).data,
      logout: async () => (await request<{ loggedOut: true }>('POST', '/v1/auth/logout')).data,
      session: async () => (await request<SessionSummary>('GET', '/v1/auth/session')).data,
      forgotPassword: async (b: { identity: string }) =>
        (await request<{ accepted: true }>('POST', '/v1/auth/password/forgot', b)).data,
      mfaEnroll: async () =>
        (await request<{ secret: string; otpauthUrl: string }>('POST', '/v1/auth/mfa/enroll')).data,
      mfaVerify: async (code: string) =>
        (
          await request<{ verified: true; verifiedAt: string; recoveryCodes?: string[] }>(
            'POST',
            '/v1/auth/mfa/verify',
            { code },
          )
        ).data,
    },
    addresses: {
      list: async () => (await request<Address[]>('GET', '/v1/me/addresses')).data,
      create: async (b: AddressInput) =>
        (await request<Address>('POST', '/v1/me/addresses', b)).data,
      remove: async (id: string) =>
        (await request<{ deleted: true }>('DELETE', `/v1/me/addresses/${id}`)).data,
    },
    cart: {
      get: async () => (await request<Cart>('GET', '/v1/cart')).data,
      add: async (variantId: string, quantity: number) =>
        (await request<Cart>('POST', '/v1/cart/items', { variantId, quantity })).data,
      setQuantity: async (itemId: string, quantity: number) =>
        (await request<Cart>('PATCH', `/v1/cart/items/${itemId}`, { quantity })).data,
      remove: async (itemId: string) =>
        (await request<Cart>('DELETE', `/v1/cart/items/${itemId}`)).data,
    },
    checkout: {
      quote: async (b: { addressId?: string; items?: { variantId: string; quantity: number }[] }) =>
        (await request<CheckoutQuote>('POST', '/v1/checkout/quote', b)).data,
      /** `idempotencyKey` must be generated ONCE per user attempt and reused on retries. */
      placeOrder: async (
        b: {
          checkoutQuoteId: string;
          acceptedQuoteVersion: number;
          paymentMethod: 'COD' | 'BANK_TRANSFER';
        },
        idempotencyKey: string,
      ) =>
        (
          await request<OrderSummary>('POST', '/v1/orders', b, {
            'Idempotency-Key': idempotencyKey,
          })
        ).data,
    },
    orders: {
      list: async (q: { status?: string; page?: number; limit?: number } = {}) =>
        page(await request<OrderSummary[]>('GET', `/v1/me/orders${buildQuery(q)}`)),
      get: async (id: string) => (await request<OrderDetail>('GET', `/v1/me/orders/${id}`)).data,
      cancel: async (id: string, idempotencyKey: string) =>
        (
          await request<{ id: string; status: OrderStatus }>(
            'POST',
            `/v1/me/orders/${id}/cancel`,
            undefined,
            {
              'Idempotency-Key': idempotencyKey,
            },
          )
        ).data,
    },
    admin: {
      orders: {
        list: async (q: { status?: string; page?: number; limit?: number } = {}) =>
          page(await request<AdminOrderSummary[]>('GET', `/v1/admin/orders${buildQuery(q)}`)),
        get: async (id: string) =>
          (await request<AdminOrderDetail>('GET', `/v1/admin/orders/${id}`)).data,
        act: async (
          id: string,
          action: AdminOrderAction,
          idempotencyKey: string,
          reason?: string,
        ) =>
          (
            await request<{ id: string; status: OrderStatus }>(
              'POST',
              `/v1/admin/orders/${id}/${action}`,
              reason ? { reason } : {},
              { 'Idempotency-Key': idempotencyKey },
            )
          ).data,
      },
      variants: {
        list: async (productId: string) =>
          (await request<AdminVariant[]>('GET', `/v1/admin/products/${productId}/variants`)).data,
        create: async (b: VariantCreateInput) =>
          (await request<AdminVariant>('POST', '/v1/admin/variants', b)).data,
        readiness: async (id: string) =>
          (
            await request<{ ready: boolean; items: GateItem[] }>(
              'GET',
              `/v1/admin/variants/${id}/readiness`,
            )
          ).data,
        publish: async (id: string) =>
          (await request<AdminVariant>('POST', `/v1/admin/variants/${id}/publish`)).data,
        setPrice: async (b: { variantId: string; unitPriceVnd: number; minQty?: number }) =>
          (await request<unknown>('POST', '/v1/admin/prices', b)).data,
        setCost: async (b: { variantId: string; costVnd: number }) =>
          (await request<unknown>('POST', '/v1/admin/costs', b)).data,
      },
      inventory: {
        list: async (variantId?: string) =>
          (await request<InventoryRow[]>('GET', `/v1/admin/inventory${buildQuery({ variantId })}`))
            .data,
        warehouses: async () =>
          (
            await request<{ id: string; code: string; name: string }[]>(
              'GET',
              '/v1/admin/warehouses',
            )
          ).data,
        createWarehouse: async (b: { code: string; name: string }) =>
          (
            await request<{ id: string; code: string; name: string }>(
              'POST',
              '/v1/admin/warehouses',
              b,
            )
          ).data,
        adjust: async (
          b: { warehouseId: string; variantId: string; delta: number; reasonCode: string },
          idempotencyKey: string,
        ) =>
          (
            await request<{ onHand: number; reserved: number; available: number }>(
              'POST',
              '/v1/admin/inventory/adjustments',
              b,
              { 'Idempotency-Key': idempotencyKey },
            )
          ).data,
      },
      categories: async () => (await request<AdminCategory[]>('GET', '/v1/admin/categories')).data,
      products: async (q: {
        category?: string;
        search?: string;
        status?: string;
        sort?: string;
        page?: number;
        limit?: number;
      }) => page(await request<AdminProduct[]>('GET', `/v1/admin/products${buildQuery(q)}`)),
      product: async (id: string) =>
        (await request<AdminProduct>('GET', `/v1/admin/products/${id}`)).data,
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
