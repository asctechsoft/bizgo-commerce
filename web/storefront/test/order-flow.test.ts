import { describe, expect, it } from 'vitest';
import type { OrderStatus, OrderTimelineEvent } from '@bizgo/contracts';
import { buildSteps } from '../src/lib/order-flow';

const ev = (to: OrderStatus, from: OrderStatus | null = null, min = 0): OrderTimelineEvent => ({
  from,
  to,
  at: `2026-11-19T10:${String(min).padStart(2, '0')}:00Z`,
  by: 'SYSTEM',
  reasonCode: null,
});

describe('buildSteps', () => {
  it('waiting for confirmation: placed is current with a waiting hint', () => {
    const s = buildSteps('PENDING_CONFIRMATION', [ev('PENDING_CONFIRMATION')]);
    expect(s[0]).toMatchObject({ key: 'placed', state: 'current', hint: 'waiting' });
    expect(s.slice(1).every((x) => x.state === 'todo')).toBe(true);
  });
  it('shipping: earlier steps done, shipping current, later todo', () => {
    const tl = [
      ev('PENDING_CONFIRMATION', null, 0),
      ev('CONFIRMED', 'PENDING_CONFIRMATION', 1),
      ev('PACKING', 'CONFIRMED', 2),
      ev('READY_TO_SHIP', 'PACKING', 3),
      ev('SHIPPED', 'READY_TO_SHIP', 4),
    ];
    const s = buildSteps('SHIPPED', tl);
    expect(s.map((x) => x.state)).toEqual(['done', 'done', 'done', 'current', 'todo', 'todo']);
    expect(s[3]?.at).toBe(tl[4]?.at);
  });
  it('completed: every step done', () => {
    const tl = [
      ev('PENDING_CONFIRMATION'),
      ev('CONFIRMED'),
      ev('PACKING'),
      ev('SHIPPED'),
      ev('DELIVERED'),
      ev('COMPLETED'),
    ];
    expect(buildSteps('COMPLETED', tl).every((x) => x.state === 'done')).toBe(true);
  });
  it('cancelled before confirmation keeps only the reached step plus a failed one', () => {
    const s = buildSteps('CANCELLED', [
      ev('PENDING_CONFIRMATION'),
      ev('CANCELLED', 'PENDING_CONFIRMATION', 5),
    ]);
    expect(s.map((x) => [x.key, x.state])).toEqual([
      ['placed', 'done'],
      ['cancelled', 'failed'],
    ]);
  });
  it('on hold and cancel-requested are flagged on the current step', () => {
    expect(buildSteps('ON_HOLD', [ev('PENDING_CONFIRMATION'), ev('ON_HOLD')])[0]?.hint).toBe(
      'onHold',
    );
    expect(
      buildSteps('CANCEL_REQUESTED', [
        ev('PENDING_CONFIRMATION'),
        ev('CONFIRMED'),
        ev('CANCEL_REQUESTED'),
      ])[1]?.hint,
    ).toBe('cancelRequested');
  });
});
