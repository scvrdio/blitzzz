import type {
  TelegramImpactStyle,
  TelegramNotificationStyle,
  TelegramThemeParams,
  TelegramUser,
  TelegramWebApp,
} from './types';

const getWebApp = (): TelegramWebApp | undefined =>
  typeof window === 'undefined' ? undefined : window.Telegram?.WebApp;

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
  get startParam() {
    return getWebApp()?.initDataUnsafe.start_param;
  },
  get themeParams(): TelegramThemeParams {
    return getWebApp()?.themeParams ?? {};
  },
  impact(style: TelegramImpactStyle = 'light') {
    getWebApp()?.HapticFeedback?.impactOccurred?.(style);
  },
  selectionChanged() {
    getWebApp()?.HapticFeedback?.selectionChanged?.();
  },
  notify(style: TelegramNotificationStyle) {
    getWebApp()?.HapticFeedback?.notificationOccurred?.(style);
  },
  setVerticalSwipes(disabled: boolean) {
    const webApp = getWebApp();
    if (disabled) webApp?.disableVerticalSwipes?.();
    else webApp?.enableVerticalSwipes?.();
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

export function telegramProfile() {
  const user = telegram.user;
  if (!user) return null;
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || 'Игрок';
  return { name, photoUrl: user.photo_url };
}
