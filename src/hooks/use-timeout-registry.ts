'use client';

import { useCallback, useEffect, useRef } from 'react';

export function useTimeoutRegistry() {
  const timers = useRef(new Set<number>());

  const schedule = useCallback((callback: () => void, delay: number) => {
    const timer = window.setTimeout(() => {
      timers.current.delete(timer);
      callback();
    }, delay);
    timers.current.add(timer);
    return timer;
  }, []);

  const clearAll = useCallback(() => {
    timers.current.forEach(window.clearTimeout);
    timers.current.clear();
  }, []);

  useEffect(() => clearAll, [clearAll]);
  return { schedule, clearAll };
}
