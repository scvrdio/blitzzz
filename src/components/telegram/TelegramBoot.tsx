'use client';

import { useEffect } from 'react';
import { telegram } from '../../lib/telegram/client';
import type { TelegramInsets } from '../../lib/telegram/types';

function applyInsets(name: 'tg-safe' | 'tg-content-safe', insets?: TelegramInsets) {
  const root = document.documentElement;
  for (const side of ['top', 'bottom', 'left', 'right'] as const) {
    root.style.setProperty(`--${name}-${side}`, `${Math.max(0, Math.floor(insets?.[side] ?? 0))}px`);
  }
}

export function TelegramBoot() {
  useEffect(() => {
    telegram.init();
    telegram.requestFullscreen();

    const apply = () => {
      const webApp = window.Telegram?.WebApp;
      applyInsets('tg-safe', webApp?.safeAreaInset);
      applyInsets('tg-content-safe', webApp?.contentSafeAreaInset);
    };

    apply();
    const webApp = window.Telegram?.WebApp;
    webApp?.onEvent('safeAreaChanged', apply);
    webApp?.onEvent('contentSafeAreaChanged', apply);
    webApp?.onEvent('viewportChanged', apply);

    return () => {
      webApp?.offEvent('safeAreaChanged', apply);
      webApp?.offEvent('contentSafeAreaChanged', apply);
      webApp?.offEvent('viewportChanged', apply);
    };
  }, []);

  return null;
}
