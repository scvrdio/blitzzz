'use client';

import { useEffect, useState } from 'react';
import { telegramProfile } from '../lib/telegram/client';

export type PlayerProfile = NonNullable<ReturnType<typeof telegramProfile>>;

export function useTelegramProfile() {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);

  useEffect(() => {
    const sync = () => setProfile(telegramProfile());
    sync();
    const timers = [120, 300, 700].map((delay) => window.setTimeout(sync, delay));
    return () => timers.forEach(window.clearTimeout);
  }, []);

  return profile;
}
