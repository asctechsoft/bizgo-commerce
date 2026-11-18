import type { OrderStatus, OrderTimelineEvent } from '@bizgo/contracts';

export type StepKey = 'placed' | 'confirmed' | 'preparing' | 'shipping' | 'delivered' | 'completed';
export type StepState = 'done' | 'current' | 'todo' | 'failed';
export interface Step {
  key: StepKey | 'cancelled';
  state: StepState;
  at: string | null;
  /** extra wording hint for the UI (e.g. waiting for confirmation, on hold) */
  hint?: 'waiting' | 'onHold' | 'cancelRequested';
}

const ORDER: StepKey[] = ['placed', 'confirmed', 'preparing', 'shipping', 'delivered', 'completed'];
const REACHED_BY: Record<StepKey, OrderStatus[]> = {
  placed: ['PENDING_CONFIRMATION'],
  confirmed: ['CONFIRMED'],
  preparing: ['PACKING', 'READY_TO_SHIP'],
  shipping: ['SHIPPED', 'PARTIALLY_SHIPPED'],
  delivered: ['DELIVERED'],
  completed: ['COMPLETED'],
};

/**
 * Pure stepper model from the real timeline (nothing is invented): a step is reached when the order ever
 * entered one of its statuses. Cancelled orders keep the steps reached before cancellation, then one red step.
 */
export function buildSteps(status: OrderStatus, timeline: OrderTimelineEvent[]): Step[] {
  const at = (key: StepKey): string | null =>
    timeline.find((e) => REACHED_BY[key].includes(e.to))?.at ?? null;
  const reached = ORDER.filter((k) => at(k) !== null);
  const last = reached[reached.length - 1] ?? 'placed';
  if (status === 'CANCELLED') {
    const cancelledAt = [...timeline].reverse().find((e) => e.to === 'CANCELLED')?.at ?? null;
    return [
      ...reached.map((key): Step => ({ key, state: 'done', at: at(key) })),
      { key: 'cancelled', state: 'failed', at: cancelledAt },
    ];
  }
  return ORDER.map((key): Step => {
    const idx = ORDER.indexOf(key);
    const lastIdx = ORDER.indexOf(last);
    if (idx < lastIdx) return { key, state: 'done', at: at(key) };
    if (idx === lastIdx) {
      const finished = key === 'completed';
      return {
        key,
        state: finished ? 'done' : 'current',
        at: at(key),
        ...(status === 'ON_HOLD' ? { hint: 'onHold' as const } : {}),
        ...(status === 'CANCEL_REQUESTED' ? { hint: 'cancelRequested' as const } : {}),
        ...(status === 'PENDING_CONFIRMATION' ? { hint: 'waiting' as const } : {}),
      };
    }
    return { key, state: 'todo', at: null };
  });
}
