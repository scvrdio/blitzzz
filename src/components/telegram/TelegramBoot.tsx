'use client';

import { useEffect } from 'react';
import type { TelegramInsets } from '../../lib/telegram/types';

function applyInsets(name: 'tg-safe' | 'tg-content-safe', insets?: TelegramInsets) {
  const root = document.documentElement;
  for (const side of ['top', 'bottom', 'left', 'right'] as const) {
    root.style.setProperty(`--${name}-${side}`, `${Math.max(0, Math.floor(insets?.[side] ?? 0))}px`);
  }
}

function isMobile(platform?: string) {
  return platform === 'ios' || platform === 'android';
}

export function TelegramBoot() {
  useEffect(() => {
    const root = document.documentElement;
    const webApp = window.Telegram?.WebApp;
    if (!webApp) {
      root.classList.add('tg-layout-ready');
      return;
    }

    const prepare = () => {
      try {
        webApp.ready();
        webApp.expand();
        if (isMobile(webApp.platform)) webApp.requestFullscreen?.();
      } catch {}
    };

    const apply = () => {
      applyInsets('tg-safe', webApp?.safeAreaInset);
      applyInsets('tg-content-safe', webApp?.contentSafeAreaInset);
      prepare();
    };

    apply();
    root.classList.add('tg-layout-ready');
    const timers = [120, 300, 700].map(delay => window.setTimeout(apply, delay));
    webApp.onEvent('safeAreaChanged', apply);
    webApp.onEvent('contentSafeAreaChanged', apply);
    webApp.onEvent('viewportChanged', apply);

    return () => {
      timers.forEach(window.clearTimeout);
      webApp.offEvent('safeAreaChanged', apply);
      webApp.offEvent('contentSafeAreaChanged', apply);
      webApp.offEvent('viewportChanged', apply);
    };
  }, []);

  return null;
}
