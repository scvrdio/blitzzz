import type { Metadata } from 'next';
import Script from 'next/script';
import { Merriweather } from 'next/font/google';
import { TelegramBoot } from '../components/telegram/TelegramBoot';
import { TelegramAuthProvider } from '../components/telegram/TelegramAuthProvider';
import './globals.css';

const merriweather = Merriweather({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '700', '900'],
  variable: '--font-merriweather',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'blitzzz',
  description: 'Telegram Mini App',
};

const initialTelegramLayout = `
  (() => {
    const root = document.documentElement;
    const webApp = window.Telegram?.WebApp;
    let cachedInset = null;
    try { cachedInset = JSON.parse(window.sessionStorage.getItem('blitzzz-content-safe-inset') || 'null'); } catch {}
    const inset = cachedInset || webApp?.contentSafeAreaInset;
    if (inset) {
      for (const side of ['top', 'bottom', 'left', 'right']) {
        root.style.setProperty('--tg-content-safe-' + side, Math.max(0, Math.floor(inset[side] || 0)) + 'px');
      }
    }
    root.classList.add('tg-layout-ready');
  })();
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className={merriweather.variable}>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <Script id="telegram-initial-layout" strategy="beforeInteractive">{initialTelegramLayout}</Script>
        <TelegramBoot />
        <TelegramAuthProvider>{children}</TelegramAuthProvider>
      </body>
    </html>
  );
}
