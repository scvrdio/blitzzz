import type { TelegramThemeParams, TelegramUser, TelegramWebApp } from './types';

const getWebApp = (): TelegramWebApp | undefined => window.Telegram?.WebApp;

export const telegram = {
  get isAvailable() {
    return Boolean(getWebApp());
  },
  get initData() {
    return getWebApp()?.initData ?? '';
  },
  get user(): TelegramUser | undefined {
    return getWebApp()?.initDataUnsafe.user;
  },
  get themeParams(): TelegramThemeParams {
    return getWebApp()?.themeParams ?? {};
  },
  init() {
    const webApp = getWebApp();
    if (!webApp) return;

    webApp.ready();
    webApp.expand();
    webApp.disableVerticalSwipes?.();
    webApp.setHeaderColor?.('bg_color');
    webApp.setBackgroundColor?.('bg_color');
  },
  requestFullscreen() {
    const webApp = getWebApp();
    if (webApp?.platform === 'ios' || webApp?.platform === 'android') {
      webApp.requestFullscreen?.();
    }
  },
  onThemeChange(callback: () => void) {
    const webApp = getWebApp();
    if (!webApp) return () => undefined;
    webApp.onEvent('themeChanged', callback);
    return () => webApp.offEvent('themeChanged', callback);
  },
  haptic(style: 'light' | 'medium' | 'heavy' = 'light') {
    getWebApp()?.HapticFeedback?.impactOccurred(style);
  },
  setMainButton(text: string, onClick: () => void) {
    const button = getWebApp()?.MainButton;
    if (!button) return () => undefined;

    button.setText(text);
    button.onClick(onClick);
    button.show();
    return () => {
      button.offClick(onClick);
      button.hide();
    };
  },
  close() {
    getWebApp()?.close();
  },
};
