'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export function useNotice(duration = 2200) {
  const [message, setMessage] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const hide = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    setMessage(null);
  }, []);

  const show = useCallback((nextMessage: string) => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    setMessage(nextMessage);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setMessage(null);
    }, duration);
  }, [duration]);

  useEffect(() => hide, [hide]);

  return { message, show, hide };
}
