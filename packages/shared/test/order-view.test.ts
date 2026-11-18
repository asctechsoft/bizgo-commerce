import { describe, expect, it } from 'vitest';
import {
  ORDER_GROUPS,
  ORDER_GROUP_STATUSES,
  ORDER_STATUSES,
  orderGroupOf,
  PUBLIC_CANCEL_REASONS,
} from '../src';

describe('order groups', () => {
  it('every status belongs to exactly one group', () => {
    for (const s of ORDER_STATUSES) {
      const groups = ORDER_GROUPS.filter((g) => ORDER_GROUP_STATUSES[g].includes(s));
      expect(groups, s).toHaveLength(1);
      expect(orderGroupOf(s)).toBe(groups[0]);
    }
  });
  it('maps the customer-visible tabs', () => {
    expect(orderGroupOf('PACKING')).toBe('preparing');
    expect(orderGroupOf('SHIPPED')).toBe('shipping');
    expect(orderGroupOf('COMPLETED')).toBe('delivered');
    expect(orderGroupOf('CANCEL_REQUESTED')).toBe('confirmed');
  });
  it('only whitelisted cancel reasons are public', () => {
    expect(PUBLIC_CANCEL_REASONS).toContain('OUT_OF_STOCK');
    expect(PUBLIC_CANCEL_REASONS).not.toContain('internal fraud suspicion');
  });
});
