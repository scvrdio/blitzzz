export type TelegramUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
};

export type TelegramInsets = { top: number; bottom: number; left: number; right: number };
export type TelegramImpactStyle = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';
export type TelegramNotificationStyle = 'error' | 'success' | 'warning';
export type TelegramEvent = 'themeChanged' | 'viewportChanged' | 'safeAreaChanged' | 'contentSafeAreaChanged';

export type TelegramThemeParams = {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
};

type MainButton = {
  setText: (text: string) => void;
  show: () => void;
  hide: () => void;
  onClick: (callback: () => void) => void;
  offClick: (callback: () => void) => void;
};

export type TelegramWebApp = {
  initData: string;
  initDataUnsafe: { user?: TelegramUser; start_param?: string };
  themeParams: TelegramThemeParams;
  platform?: string;
  safeAreaInset?: TelegramInsets;
  contentSafeAreaInset?: TelegramInsets;
  ready: () => void;
  expand: () => void;
  requestFullscreen?: () => void;
  exitFullscreen?: () => void;
  close: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  disableVerticalSwipes?: () => void;
  enableVerticalSwipes?: () => void;
  MainButton: MainButton;
  HapticFeedback?: {
    impactOccurred: (style: TelegramImpactStyle) => void;
    selectionChanged?: () => void;
    notificationOccurred?: (style: TelegramNotificationStyle) => void;
  };
  onEvent: (event: TelegramEvent, callback: () => void) => void;
  offEvent: (event: TelegramEvent, callback: () => void) => void;
};

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp };
  }
}
