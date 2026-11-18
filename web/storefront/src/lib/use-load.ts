'use client';

import { useCallback, useEffect, useState } from 'react';

export interface Loaded<T> {
  data: T | null;
  error: unknown;
  loading: boolean;
  reload: () => void;
  setData: (d: T) => void;
}

/** Minimal client data loader: no demo fallback — failures surface as `error`. */
export function useLoad<T>(fn: () => Promise<T>): Loaded<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const stable = useCallback(fn, []);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    stable()
      .then((d) => {
        if (alive) {
          setData(d);
          setError(null);
        }
      })
      .catch((e) => alive && setError(e))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [stable, tick]);
  return { data, error, loading, reload: () => setTick((n) => n + 1), setData };
}
