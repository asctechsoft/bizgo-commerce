import {
  ORDER_EDGES,
  ORDER_STATUSES,
  allowedOrderActions,
  nextOrderStatus,
  CANCELLABLE_BEFORE_DISPATCH,
  type OrderAction,
} from '../src';

describe('order transition table (ADR-0005)', () => {
  it('has no duplicate (from, action) pairs, so every action is deterministic', () => {
    const keys = ORDER_EDGES.map((e) => `${e.from}|${e.action}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('only references known statuses', () => {
    for (const e of ORDER_EDGES) {
      expect(ORDER_STATUSES).toContain(e.from);
      expect(ORDER_STATUSES).toContain(e.to);
    }
  });

  it('terminal statuses have no outgoing edges', () => {
    for (const s of ['CANCELLED', 'COMPLETED', 'RETURNED', 'FAILED'] as const) {
      expect(allowedOrderActions(s)).toEqual([]);
    }
  });

  it('table-driven: every (status, action) pair is either an exact listed edge or rejected', () => {
    const actions = [...new Set(ORDER_EDGES.map((e) => e.action))] as OrderAction[];
    let allowed = 0;
    let denied = 0;
    for (const from of ORDER_STATUSES) {
      for (const action of actions) {
        const to = nextOrderStatus(from, action);
        const edge = ORDER_EDGES.find((e) => e.from === from && e.action === action);
        if (edge) {
          expect(to).toBe(edge.to);
          allowed++;
        } else {
          expect(to).toBeNull();
          denied++;
        }
      }
    }
    expect(allowed).toBe(ORDER_EDGES.length);
    expect(denied).toBeGreaterThan(allowed);
  });

  it('cannot cancel after goods were handed over (return workflow only)', () => {
    for (const s of ['SHIPPED', 'PARTIALLY_SHIPPED', 'DELIVERED', 'COMPLETED'] as const) {
      expect(nextOrderStatus(s, 'CANCEL')).toBeNull();
      expect(CANCELLABLE_BEFORE_DISPATCH).not.toContain(s);
    }
  });

  it('DELIVERED does not imply COMPLETED without the COMPLETE action', () => {
    expect(nextOrderStatus('DELIVERED', 'COMPLETE')).toBe('COMPLETED');
    expect(nextOrderStatus('SHIPPED', 'COMPLETE')).toBeNull();
  });
});
