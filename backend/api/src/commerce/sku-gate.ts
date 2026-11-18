/**
 * SKU activation gate (ADR-0009). Pure function over facts loaded by the service. A real product can
 * only become ACTIVE with verified (non-illustrative) media and a verified origin; TEST fixtures
 * (`isTest`) are exempt from those two items only, so tests can sell without pretending data is real.
 */
export interface SkuGateFacts {
  isTest: boolean;
  packLabel: string;
  netWeightG: number | null;
  storageClass: string | null;
  manufacturer: string | null;
  responsibleEntity: string | null;
  hasCurrentCost: boolean;
  hasCurrentRetailPrice: boolean;
  hasStockRow: boolean;
  hasVerifiedMedia: boolean;
  originVerified: boolean;
}

export interface GateItem {
  item: string;
  ok: boolean;
  message: string;
}

export function evaluateSkuGate(f: SkuGateFacts): { ready: boolean; items: GateItem[] } {
  const items: GateItem[] = [
    { item: 'PACK_LABEL', ok: f.packLabel.trim().length > 0, message: 'Thiếu quy cách đóng gói.' },
    {
      item: 'NET_WEIGHT',
      ok: (f.netWeightG ?? 0) > 0,
      message: 'Thiếu khối lượng tịnh (gram) đã xác minh.',
    },
    { item: 'STORAGE_CLASS', ok: f.storageClass !== null, message: 'Thiếu nhóm bảo quản.' },
    {
      item: 'MANUFACTURER',
      ok: !!f.manufacturer?.trim(),
      message: 'Thiếu nhà sản xuất/nguồn hàng.',
    },
    {
      item: 'RESPONSIBLE_ENTITY',
      ok: !!f.responsibleEntity?.trim(),
      message: 'Thiếu đơn vị chịu trách nhiệm nhãn.',
    },
    { item: 'SUPPLIER_COST', ok: f.hasCurrentCost, message: 'Thiếu giá vốn còn hiệu lực.' },
    {
      item: 'RETAIL_PRICE',
      ok: f.hasCurrentRetailPrice,
      message: 'Thiếu giá bán lẻ còn hiệu lực.',
    },
    { item: 'STOCK_RECORD', ok: f.hasStockRow, message: 'Chưa khai báo tồn kho ban đầu.' },
    {
      item: 'VERIFIED_MEDIA',
      ok: f.isTest || f.hasVerifiedMedia,
      message: 'Cần ảnh thật đã xác minh (ảnh AI chỉ để minh họa).',
    },
    {
      item: 'ORIGIN_VERIFIED',
      ok: f.isTest || f.originVerified,
      message: 'Cần xác minh nguồn gốc/quyền phân phối sản phẩm.',
    },
  ];
  return { ready: items.every((i) => i.ok), items };
}
