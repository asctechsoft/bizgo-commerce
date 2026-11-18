import { Injectable } from '@nestjs/common';
import { Observable, Subject, filter, interval, map, merge } from 'rxjs';
import type { OrderStatus } from '@bizgo/shared';

/** What the live stream tells the browser: "something changed, refetch" (never carries order data). */
export interface LiveEvent {
  kind: 'order' | 'support';
  orderId: string;
  /** owner of the order: customer streams are filtered on this */
  userId: string;
  status?: OrderStatus;
  supportId?: string;
  at: string;
}

export interface SseMessage {
  type: string;
  data: unknown;
}

/**
 * In-process fan-out for realtime UI updates (SSE). Emitted only AFTER the DB transaction committed.
 * Single API instance only: with several instances this must be backed by Redis pub/sub (ADR-0015).
 */
@Injectable()
export class OrderEventsService {
  private readonly bus = new Subject<LiveEvent>();

  emit(e: Omit<LiveEvent, 'at'>): void {
    this.bus.next({ ...e, at: new Date().toISOString() });
  }

  /** `userId` = customer scope (own orders only); undefined = staff stream (all orders). */
  stream(userId: string | undefined, heartbeatMs = 25_000): Observable<SseMessage> {
    const events = this.bus.pipe(
      filter((e) => userId === undefined || e.userId === userId),
      map(
        (e): SseMessage => ({
          type: e.kind,
          data: {
            orderId: e.orderId,
            ...(e.status ? { status: e.status } : {}),
            ...(e.supportId ? { supportId: e.supportId } : {}),
            at: e.at,
          },
        }),
      ),
    );
    const beat = interval(heartbeatMs).pipe(
      map((): SseMessage => ({ type: 'ping', data: { at: new Date().toISOString() } })),
    );
    return merge(events, beat);
  }
}
