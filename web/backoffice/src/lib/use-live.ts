'use client';

import { useEffect, useRef, useState } from 'react';
import { liveStreamPath } from '@bizgo/contracts';

/** Staff realtime refresh over SSE (cookie session); falls back to polling every 15s if the stream drops. */
export function useLive(onChange: () => void): boolean {
  const [live, setLive] = useState(false);
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';
    let timer: number | undefined;
    let poll: number | undefined;
    const fire = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => cb.current(), 150);
    };
    const es = new EventSource(`${base}${liveStreamPath.admin}`, { withCredentials: true });
    es.onopen = () => {
      setLive(true);
      window.clearInterval(poll);
      poll = undefined;
    };
    es.addEventListener('order', fire);
    es.addEventListener('support', fire);
    es.onerror = () => {
      setLive(false);
      if (poll === undefined) poll = window.setInterval(() => cb.current(), 15_000);
    };
    return () => {
      es.close();
      window.clearTimeout(timer);
      window.clearInterval(poll);
    };
  }, []);

  return live;
}
