'use client';

import { useEffect, useState } from 'react';
import { classNames } from '../../lib/class-names';
import { telegram } from '../../lib/telegram/client';

type Theme = 'light' | 'dark';

const storageKey = 'blitzzz-theme';

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  window.localStorage.setItem(storageKey, theme);
  window.dispatchEvent(new Event('blitzzz-theme-change'));
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    const next: Theme = saved === 'dark' ? 'dark' : 'light';
    setTheme(next);
    applyTheme(next);
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    applyTheme(next);
    telegram.impact('light');
  };

  return (
    <button
      type="button"
      className={classNames('theme-toggle', theme === 'dark' && 'is-dark')}
      aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}
      onClick={toggle}
    >
      <img className="theme-toggle__sun" src="/icons/theme-day.svg" width="16" height="16" alt="" />
      <img className="theme-toggle__moon" src="/icons/theme-night.svg" width="16" height="16" alt="" />
    </button>
  );
}
