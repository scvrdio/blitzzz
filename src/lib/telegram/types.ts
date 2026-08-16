export type TelegramUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
};

export type TelegramThemeParams = {
  bg_color?: string;
  secondary_bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
};

export type TelegramInsets = { top?: number; bottom?: number; left?: number; right?: number };

type MainButton = {
  setText: (text: string) => void;
  show: () => void;
  hide: () => void;
  showProgress: (leaveActive?: boolean) => void;
  hideProgress: () => void;
  onClick: (callback: () => void) => void;
  offClick: (callback: () => void) => void;
};

export type TelegramWebApp = {
  initData: string;
  initDataUnsafe: { user?: TelegramUser; start_param?: string };
  colorScheme: 'light' | 'dark';
  themeParams: TelegramThemeParams;
  platform: string;
  version: string;
  isFullscreen?: boolean;
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
  HapticFeedback?: { impactOccurred: (style: 'light' | 'medium' | 'heavy') => void; selectionChanged?: () => void };
  onEvent: (event: 'themeChanged' | 'viewportChanged' | 'safeAreaChanged' | 'contentSafeAreaChanged', callback: () => void) => void;
  offEvent: (event: 'themeChanged' | 'viewportChanged' | 'safeAreaChanged' | 'contentSafeAreaChanged', callback: () => void) => void;
};

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp };
  }
}
