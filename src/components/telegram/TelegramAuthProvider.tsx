'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { telegram } from '../../lib/telegram/client';

type AuthState = {
  status: 'loading' | 'authenticated' | 'browser' | 'error';
  telegramId?: string;
};

const TelegramAuthContext = createContext<AuthState>({ status: 'loading' });

export function useTelegramAuth() {
  return useContext(TelegramAuthContext);
}

export function TelegramAuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() =>
    telegram.isAvailable && telegram.initData ? { status: 'loading' } : { status: 'browser' },
  );

  useEffect(() => {
    if (!telegram.isAvailable || !telegram.initData) return;

    void fetch('/api/auth/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ initData: telegram.initData }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Telegram authentication failed');
        const data = (await response.json()) as { telegramId: string };
        setState({ status: 'authenticated', telegramId: data.telegramId });
      })
      .catch(() => setState({ status: 'error' }));
  }, []);

  return <TelegramAuthContext.Provider value={state}>{children}</TelegramAuthContext.Provider>;
}
